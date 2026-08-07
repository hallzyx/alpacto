import { eq } from "drizzle-orm";
import { keccak256, parseAbi, toBytes } from "viem";
import { lots, type Database } from "@alpacto/database";
import { config } from "../config.js";
import { deriveOnchainOrderId, getTreasuryClients } from "./treasury.js";

export { deriveOnchainOrderId };

/** Distinct namespace from order ids to avoid collisions. */
export function deriveOnchainLotId(lotUuid: string): bigint {
  const hash = keccak256(toBytes(`alpacto-lot:${lotUuid}`));
  const maxPgBigInt = (1n << 63n) - 1n;
  return BigInt(hash) % maxPgBigInt;
}

const lotAbi = parseAbi([
  "function getLot(uint256 lotId) view returns (uint256, address, uint8, uint32, uint32, bytes32, uint256, uint256, uint256, uint256, bool, uint64)",
  "function getAuditAttestation(uint256 lotId, uint32 version) view returns (bytes32, uint8, bool)",
]);

export async function lotExistsOnchain(onchainLotId: bigint): Promise<boolean> {
  const { core, publicClient } = getTreasuryClients();
  const result = await publicClient.readContract({
    address: core,
    abi: lotAbi,
    functionName: "getLot",
    args: [onchainLotId],
  });
  return result[10];
}

export async function readLotOnchain(onchainLotId: bigint) {
  const { core, publicClient } = getTreasuryClients();
  const result = await publicClient.readContract({
    address: core,
    abi: lotAbi,
    functionName: "getLot",
    args: [onchainLotId],
  });
  return {
    orderId: result[0],
    producer: result[1],
    status: Number(result[2]),
    currentVersion: Number(result[3]),
    acceptedVersion: Number(result[4]),
    quoteHash: result[5] as `0x${string}`,
    netPenMinor: result[6],
    producerUsdc: result[7],
    associationUsdc: result[8],
    platformUsdc: result[9],
    exists: result[10],
    reservedWeightGrams: result[11],
  };
}

/** On-chain lot status codes from AlpactoCore. */
export const ONCHAIN_LOT_STATUS = {
  Registered: 0,
  Inspected: 1,
  Attested: 2,
  ReadyForReview: 3,
  ReweighingRequested: 4,
  AuditFailed: 5,
  ProducerAccepted: 6,
  Settled: 7,
} as const;

export async function attestationExistsOnchain(
  onchainLotId: bigint,
  version: number,
): Promise<boolean> {
  const { core, publicClient } = getTreasuryClients();
  const result = await publicClient.readContract({
    address: core,
    abi: lotAbi,
    functionName: "getAuditAttestation",
    args: [onchainLotId, version],
  });
  return result[2];
}

export async function assignOnchainLotId(
  db: Database,
  lot: typeof lots.$inferSelect,
): Promise<bigint> {
  if (lot.onchainLotId != null) return lot.onchainLotId;
  const onchainLotId = deriveOnchainLotId(lot.id);
  await db
    .update(lots)
    .set({ onchainLotId, updatedAt: new Date() })
    .where(eq(lots.id, lot.id));
  return onchainLotId;
}

export function categoryCodeToOnchain(code: string): number {
  const map: Record<string, number> = {
    SUPERFINE: 0,
    FINE: 1,
    MEDIUM: 2,
    COARSE: 3,
  };
  return map[code.toUpperCase()] ?? 1;
}

export function isChainConfigured(): boolean {
  return Boolean(config.chain.alpactoContract);
}
