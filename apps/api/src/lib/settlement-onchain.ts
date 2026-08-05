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
  createEcdsaKernelAccount,
  createSessionKernelClient,
  deriveDemoOwnerKey,
  loadZeroDevConfigFromEnv,
  sendSponsoredCall,
  trySponsoredThenSelfFunded,
  trySponsoredThenSelfFundedBatch,
} from "@alpacto/zero-dev";
import {
  createWalletClient,
  http,
  keccak256,
  parseAbi,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import { config } from "../config.js";
import { resolveOrderAddresses } from "./funding-helpers.js";
import {
  assignOnchainLotId,
  attestationExistsOnchain,
  categoryCodeToOnchain,
  isChainConfigured,
  readLotOnchain,
} from "./onchain-ids.js";
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
  "function registerLot(uint256 orderId, uint256 lotId, address producerAccount)",
  "function submitInspectionReference(uint256 lotId, uint32 version, uint64 weightGrams, uint32 categoryCode, bytes32 evidenceHash)",
  "function submitAuditAttestation(uint256 lotId, uint32 version, bytes32 reportHash, uint8 result)",
  "function acceptSettlement(uint256 lotId, uint32 version, bytes32 quoteHash, uint256 netPenMinor, uint256 producerUsdcUnits, uint256 associationUsdcUnits, uint256 platformUsdcUnits)",
  "function settleLot(uint256 lotId)",
]);

function normalizePrivateKey(key: string): Hex {
  const trimmed = key.trim();
  return (trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`) as Hex;
}

function resolveDemoOwnerKey(email: string): Hex {
  const masterSeed =
    process.env["DEMO_WALLET_SEED"]?.trim() || "alpacto-local-demo-wallet-seed-v1";
  return deriveDemoOwnerKey(masterSeed, email);
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
    transport: http(config.chain.rpcUrl),
  });
  const hash = await wallet.sendTransaction({ to, value: 10n ** 16n });
  await publicClient.waitForTransactionReceipt({ hash });
}

async function demoKernelForEmail(email: string, expectedAddress: Address) {
  const zd = loadZeroDevConfigFromEnv();
  const publicClient = createAlpactoPublicClient({
    ...zd,
    publicRpc: config.chain.rpcUrl,
  });
  const ownerKey = resolveDemoOwnerKey(email);
  const account = await createEcdsaKernelAccount(publicClient, ownerKey);
  if (account.address.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error(
      `Kernel mismatch for ${email}: derived ${account.address} vs expected ${expectedAddress}`,
    );
  }
  return { zd, publicClient, account };
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

function inspectionEvidenceHash(inspectionId: string, stored: string | null): Hex {
  if (stored?.startsWith("0x") && stored.length === 66) return stored as Hex;
  return keccak256(toBytes(`inspection-evidence:${inspectionId}`));
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

  const { associationAddress } = await resolveOrderAddresses(db, order);
  const associationEmail = "alpasur@demo.alpacto";
  const inspectorEmail = "carlos@demo.alpacto";

  const onchainLotId = await assignOnchainLotId(db, lot);
  const version = settlement.inspectionVersion;
  const quoteHash = settlement.quoteHash as Hex;
  const reportHash = audit.reportHash as Hex;

  let chainLot = await readLotOnchain(onchainLotId);

  if (!chainLot.exists) {
    onLog(`registerLot lotId=${onchainLotId.toString()}`);
    const { zd, publicClient, account } = await demoKernelForEmail(
      associationEmail,
      associationAddress as Address,
    );
    await trySponsoredThenSelfFunded({
      publicClient,
      account,
      config: zd,
      fundEth: fundEthFromTreasury,
      to: core,
      abi: settlementAbi,
      functionName: "registerLot",
      args: [order.onchainOrderId, onchainLotId, producer.smartAccountAddress as Address],
    });
    chainLot = await readLotOnchain(onchainLotId);
  }

  if (chainLot.currentVersion < version) {
    onLog(`submitInspectionReference v${version} weight=${inspection.weightGrams.toString()}g`);
    const { zd, publicClient, account } = await demoKernelForEmail(
      inspectorEmail,
      (
        await db
          .select()
          .from(users)
          .where(eq(users.email, inspectorEmail))
          .limit(1)
      )[0]!.smartAccountAddress! as Address,
    );
    await trySponsoredThenSelfFunded({
      publicClient,
      account,
      config: zd,
      fundEth: fundEthFromTreasury,
      to: core,
      abi: settlementAbi,
      functionName: "submitInspectionReference",
      args: [
        onchainLotId,
        version,
        inspection.weightGrams,
        categoryCodeToOnchain(inspection.categoryCode),
        inspectionEvidenceHash(inspection.id, inspection.evidenceBundleHash),
      ],
    });
    chainLot = await readLotOnchain(onchainLotId);
  }

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

  const { zd, publicClient, account: producerAccount } = await demoKernelForEmail(
    producer.email,
    producer.smartAccountAddress as Address,
  );

  let txHash: Hex;

  if (chainLot.status === LOT_STATUS.SETTLED) {
    throw new Error("Lot already settled on-chain");
  }

  if (chainLot.status === LOT_STATUS.PRODUCER_ACCEPTED) {
    onLog("settleLot (accept already on-chain)");
    const { receipt } = await trySponsoredThenSelfFunded({
      publicClient,
      account: producerAccount,
      config: zd,
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
    const { receipt } = await trySponsoredThenSelfFundedBatch({
      publicClient,
      account: producerAccount,
      config: zd,
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
