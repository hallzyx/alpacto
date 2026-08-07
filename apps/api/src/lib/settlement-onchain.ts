import { and, desc, eq } from "drizzle-orm";
import {
  auditRuns,
  inspections,
  lots,
  orders,
  settlements,
  users,
  type Database,
} from "@alpacto/database";
import { auditResultCodeToOnchain } from "@alpacto/domain";
import {
  createAlpactoPublicClient,
  createPublicRpcTransport,
  createSessionKernelClient,
  loadZeroDevConfigFromEnv,
  sendSponsoredCall,
} from "@alpacto/zero-dev";
import {
  createWalletClient,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import { config } from "../config.js";
import {
  attestationExistsOnchain,
  isChainConfigured,
  readLotOnchain,
} from "./onchain-ids.js";
import { ensureLotRegisteredOnchain } from "./register-lot-onchain.js";
import {
  ProducerSessionRequiredError,
  resolveProducerSigner,
  sendProducerBatch,
  sendProducerCall,
} from "./producer-signer.js";
import { ensureInspectionReferenceOnchain } from "./submit-inspection-onchain.js";
import { getTreasuryClients } from "./treasury.js";

const LOT_STATUS = {
  REGISTERED: 0,
  READY_FOR_REVIEW: 3,
  PRODUCER_ACCEPTED: 6,
  SETTLED: 7,
} as const;

const settlementAbi = parseAbi([
  "function grantRole(bytes32 role, address account)",
  "function auditorAgentRole() view returns (bytes32)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function submitAuditAttestation(uint256 lotId, uint32 version, bytes32 reportHash, uint8 result)",
  "function acceptSettlement(uint256 lotId, uint32 version, bytes32 quoteHash, uint256 netPenMinor, uint256 producerUsdcUnits, uint256 associationUsdcUnits, uint256 platformUsdcUnits)",
  "function settleLot(uint256 lotId)",
]);

function normalizePrivateKey(key: string): Hex {
  const trimmed = key.trim();
  return (trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`) as Hex;
}

async function fundEthFromTreasury(to: Address): Promise<void> {
  if (!config.chain.treasuryPrivateKey) {
    throw new Error("TREASURY_PRIVATE_KEY required to top-up Kernel gas");
  }
  const { publicClient } = getTreasuryClients();
  const bal = await publicClient.getBalance({ address: to });
  if (bal >= 10n ** 15n) return;

  const account = privateKeyToAccount(normalizePrivateKey(config.chain.treasuryPrivateKey));
  const wallet = createWalletClient({
    account,
    chain: arbitrumSepolia,
    transport: createPublicRpcTransport(config.chain.rpcUrl),
  });
  const hash = await wallet.sendTransaction({ to, value: 10n ** 16n });
  await publicClient.waitForTransactionReceipt({ hash });
}

async function ensureAyniAuditorRole(onLog: (msg: string) => void): Promise<void> {
  const ayniSa = process.env["AYNI_SMART_ACCOUNT"]?.trim();
  if (!ayniSa) return;

  const { core, publicClient, walletClient } = getTreasuryClients();
  const auditorRole = await publicClient.readContract({
    address: core,
    abi: settlementAbi,
    functionName: "auditorAgentRole",
  });
  const hasRole = await publicClient.readContract({
    address: core,
    abi: settlementAbi,
    functionName: "hasRole",
    args: [auditorRole, ayniSa as Address],
  });
  if (hasRole) return;

  onLog(`grant AUDITOR_AGENT_ROLE to Ayni SA ${ayniSa}`);
  const hash = await walletClient.writeContract({
    address: core,
    abi: settlementAbi,
    functionName: "grantRole",
    args: [auditorRole, ayniSa as Address],
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

/**
 * Backfill on-chain lot pipeline (register → inspect → attest → accept → settle)
 * and transfer USDC from escrow to producer + association Kernel wallets.
 */
export async function executeSettlementOnchain(
  db: Database,
  lotId: string,
  onLog: (msg: string) => void = () => {},
): Promise<Hex> {
  if (!isChainConfigured()) {
    throw new Error("ALPACTO_CONTRACT_ADDRESS is not configured");
  }

  const core = config.chain.alpactoContract as Address;

  const [lot] = await db.select().from(lots).where(eq(lots.id, lotId)).limit(1);
  if (!lot) throw new Error("Lot not found");

  const [settlement] = await db
    .select()
    .from(settlements)
    .where(eq(settlements.lotId, lotId))
    .orderBy(desc(settlements.acceptedAt))
    .limit(1);
  if (!settlement) {
    throw new Error("Settlement not accepted — accept settlement in the app first");
  }
  if (settlement.settlementTxHash) {
    onLog(`already settled on-chain: ${settlement.settlementTxHash}`);
    return settlement.settlementTxHash as Hex;
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, lot.orderId)).limit(1);
  if (!order?.onchainOrderId) {
    throw new Error("Order has no onchain_order_id — fund the order on-chain first");
  }

  const [inspection] = await db
    .select()
    .from(inspections)
    .where(
      and(eq(inspections.lotId, lotId), eq(inspections.version, settlement.inspectionVersion)),
    )
    .limit(1);
  if (!inspection) throw new Error("Inspection not found for settlement version");

  const [audit] = await db
    .select()
    .from(auditRuns)
    .where(
      and(
        eq(auditRuns.lotId, lotId),
        eq(auditRuns.inspectionVersion, settlement.inspectionVersion),
      ),
    )
    .orderBy(desc(auditRuns.completedAt))
    .limit(1);
  if (!audit?.reportHash) {
    throw new Error("Audit report missing — wait for Ayni to complete");
  }

  const [producer] = await db
    .select()
    .from(users)
    .where(eq(users.id, lot.producerId))
    .limit(1);
  if (!producer?.smartAccountAddress || !producer.email) {
    throw new Error("Producer smart account address missing — run yarn seed:wallets");
  }

  const { onchainLotId } = await ensureLotRegisteredOnchain(db, lotId, onLog);
  const version = settlement.inspectionVersion;
  const quoteHash = settlement.quoteHash as Hex;
  const reportHash = audit.reportHash as Hex;

  // Idempotent: no-op if inspection already pushed at create time.
  await ensureInspectionReferenceOnchain(db, inspection.id, onLog);
  let chainLot = await readLotOnchain(onchainLotId);

  const hasAttestation = await attestationExistsOnchain(onchainLotId, version);
  if (!hasAttestation) {
    await ensureAyniAuditorRole(onLog);
    onLog(`submitAuditAttestation v${version} result=${audit.resultCode}`);
    const sessionKey = process.env["AYNI_SESSION_KEY"]?.trim();
    const serialized = process.env["AYNI_SERIALIZED_SESSION"]?.trim();
    if (!sessionKey || !serialized) {
      throw new Error("AYNI_SESSION_KEY and AYNI_SERIALIZED_SESSION required for on-chain attestation");
    }
    const zd = loadZeroDevConfigFromEnv();
    const publicClient = createAlpactoPublicClient({ ...zd, publicRpc: config.chain.rpcUrl });
    const client = await createSessionKernelClient({
      publicClient,
      config: zd,
      serializedSession: serialized,
      sessionPrivateKey: (sessionKey.startsWith("0x") ? sessionKey : `0x${sessionKey}`) as Hex,
    });
    const { receipt } = await sendSponsoredCall({
      client,
      to: core,
      abi: settlementAbi,
      functionName: "submitAuditAttestation",
      args: [
        onchainLotId,
        version,
        reportHash,
        auditResultCodeToOnchain(audit.resultCode as "pass" | "warning" | "review_required" | "unreadable"),
      ],
    });
    onLog(`attestation tx: ${receipt.receipt.transactionHash}`);
    chainLot = await readLotOnchain(onchainLotId);
  }

  let signer;
  try {
    signer = await resolveProducerSigner(db, {
      id: producer.id,
      email: producer.email!,
      smartAccountAddress: producer.smartAccountAddress!,
    });
  } catch (err) {
    if (err instanceof ProducerSessionRequiredError) throw err;
    throw err;
  }
  onLog(`producer signer kind=${signer.kind} address=${signer.address}`);

  let txHash: Hex;

  if (chainLot.status === LOT_STATUS.SETTLED) {
    throw new Error("Lot already settled on-chain");
  }

  if (chainLot.status === LOT_STATUS.PRODUCER_ACCEPTED) {
    onLog("settleLot (accept already on-chain)");
    const { receipt } = await sendProducerCall({
      signer,
      fundEth: fundEthFromTreasury,
      to: core,
      abi: settlementAbi,
      functionName: "settleLot",
      args: [onchainLotId],
    });
    txHash = receipt.receipt.transactionHash as Hex;
  } else {
    onLog(
      `acceptSettlement + settleLot producer=${settlement.producerUsdcUnits.toString()} assoc=${settlement.associationUsdcUnits.toString()} platform=${settlement.platformUsdcUnits.toString()} USDC units`,
    );
    const { receipt } = await sendProducerBatch({
      signer,
      fundEth: fundEthFromTreasury,
      calls: [
        {
          to: core,
          abi: settlementAbi,
          functionName: "acceptSettlement",
          args: [
            onchainLotId,
            version,
            quoteHash,
            settlement.netPenMinor,
            settlement.producerUsdcUnits,
            settlement.associationUsdcUnits,
            settlement.platformUsdcUnits,
          ],
        },
        {
          to: core,
          abi: settlementAbi,
          functionName: "settleLot",
          args: [onchainLotId],
        },
      ],
    });
    txHash = receipt.receipt.transactionHash as Hex;
  }

  const totalReleased =
    settlement.producerUsdcUnits +
    settlement.associationUsdcUnits +
    settlement.platformUsdcUnits;
  const newRemaining =
    order.remainingUsdcUnits >= totalReleased
      ? order.remainingUsdcUnits - totalReleased
      : 0n;

  await db
    .update(settlements)
    .set({
      status: "settled",
      settledAt: new Date(),
      settlementTxHash: txHash,
    })
    .where(eq(settlements.id, settlement.id));

  await db
    .update(lots)
    .set({ status: "settled", onchainLotId, updatedAt: new Date() })
    .where(eq(lots.id, lotId));

  await db
    .update(orders)
    .set({
      remainingUsdcUnits: newRemaining,
      status: newRemaining === 0n ? "completed" : "partially_settled",
      updatedAt: new Date(),
    })
    .where(eq(orders.id, order.id));

  onLog(`settlement complete tx=${txHash}`);
  return txHash;
}
