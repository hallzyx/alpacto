import { eq } from "drizzle-orm";
import { inspections, lots, users, type Database } from "@alpacto/database";
import {
  createAlpactoPublicClient,
  createEcdsaKernelAccount,
  deriveDemoOwnerKey,
  loadZeroDevConfigFromEnv,
  trySponsoredThenSelfFunded,
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
import {
  categoryCodeToOnchain,
  isChainConfigured,
  readLotOnchain,
} from "./onchain-ids.js";
import { ensureLotRegisteredOnchain } from "./register-lot-onchain.js";
import { getTreasuryClients } from "./treasury.js";

const inspectionAbi = parseAbi([
  "function submitInspectionReference(uint256 lotId, uint32 version, uint64 weightGrams, uint32 categoryCode, bytes32 evidenceHash)",
  "function getInspection(uint256 lotId, uint32 version) view returns (uint64, uint32, bytes32, bool)",
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

export function inspectionEvidenceHash(inspectionId: string, stored: string | null): Hex {
  if (stored?.startsWith("0x") && stored.length === 66) return stored as Hex;
  return keccak256(toBytes(`inspection-evidence:${inspectionId}`));
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

async function inspectionExistsOnchain(onchainLotId: bigint, version: number): Promise<boolean> {
  const { core, publicClient } = getTreasuryClients();
  const result = await publicClient.readContract({
    address: core,
    abi: inspectionAbi,
    functionName: "getInspection",
    args: [onchainLotId, version],
  });
  return result[3];
}

/**
 * Push inspection reference to AlpactoCore so the lot enters AUDITING and Ayni
 * can submitAuditAttestation immediately (not only at settle backfill).
 */
export async function ensureInspectionReferenceOnchain(
  db: Database,
  inspectionId: string,
  onLog: (msg: string) => void = () => {},
): Promise<{ onchainLotId: bigint; alreadyOnchain: boolean; txHash?: Hex }> {
  if (!isChainConfigured()) {
    throw new Error("ALPACTO_CONTRACT_ADDRESS is not configured");
  }

  const [inspection] = await db
    .select()
    .from(inspections)
    .where(eq(inspections.id, inspectionId))
    .limit(1);
  if (!inspection) throw new Error("Inspection not found");

  const [lot] = await db.select().from(lots).where(eq(lots.id, inspection.lotId)).limit(1);
  if (!lot) throw new Error("Lot not found");

  const { onchainLotId } = await ensureLotRegisteredOnchain(db, lot.id, onLog);

  if (await inspectionExistsOnchain(onchainLotId, inspection.version)) {
    onLog(`inspection v${inspection.version} already on-chain for lot=${onchainLotId.toString()}`);
    return { onchainLotId, alreadyOnchain: true };
  }

  const chainLot = await readLotOnchain(onchainLotId);
  if (!chainLot.exists) {
    throw new Error("Lot missing on-chain after registerLot");
  }

  const [inspector] = await db
    .select()
    .from(users)
    .where(eq(users.id, inspection.inspectorId))
    .limit(1);
  if (!inspector?.smartAccountAddress || !inspector.email) {
    throw new Error(
      `Inspector ${inspection.inspectorId} smart account missing — run yarn seed:wallets`,
    );
  }

  const core = config.chain.alpactoContract as Address;
  const evidenceHash = inspectionEvidenceHash(inspection.id, inspection.evidenceBundleHash);

  onLog(
    `submitInspectionReference lot=${onchainLotId.toString()} v${inspection.version} weight=${inspection.weightGrams.toString()}g inspector=${inspector.email}`,
  );
  const { zd, publicClient, account } = await demoKernelForEmail(
    inspector.email,
    inspector.smartAccountAddress as Address,
  );
  const { receipt } = await trySponsoredThenSelfFunded({
    publicClient,
    account,
    config: zd,
    fundEth: fundEthFromTreasury,
    to: core,
    abi: inspectionAbi,
    functionName: "submitInspectionReference",
    args: [
      onchainLotId,
      inspection.version,
      inspection.weightGrams,
      categoryCodeToOnchain(inspection.categoryCode),
      evidenceHash,
    ],
  });

  const txHash = receipt.receipt.transactionHash as Hex;
  await db
    .update(inspections)
    .set({ onchainTxHash: txHash })
    .where(eq(inspections.id, inspection.id));

  onLog(`submitInspectionReference tx=${txHash}`);
  return { onchainLotId, alreadyOnchain: false, txHash };
}
