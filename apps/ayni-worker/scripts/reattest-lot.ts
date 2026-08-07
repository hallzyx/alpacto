/**
 * One-shot recovery: submit missing Ayni attestation + patch audit_run row.
 * Usage: yarn workspace @alpacto/ayni-worker exec tsx scripts/reattest-lot.ts
 */
import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";
import { eq } from "drizzle-orm";
import { createDb, auditRuns, auditFindings } from "@alpacto/database";
import { auditResultCodeToOnchain } from "@alpacto/domain";
import {
  createAlpactoPublicClient,
  loadZeroDevConfigFromEnv,
  trySessionSponsoredThenSelfFunded,
} from "@alpacto/zero-dev";
import { parseAbi, type Address, type Hex } from "viem";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const RUN_ID = process.argv[2] ?? "fac91d47-b788-41ec-b0aa-985d250e68ab";

const abi = parseAbi([
  "function submitAuditAttestation(uint256 lotId, uint32 version, bytes32 reportHash, uint8 result)",
  "function getAuditAttestation(uint256 lotId, uint32 version) view returns (bytes32 reportHash, uint8 result, uint64 attestedAt, address attester)",
  "function lots(uint256 lotId) view returns (uint8 status, address producer, uint256 orderId, uint64 reservedWeightGrams, uint32 acceptedVersion, bytes32 quoteHash, uint256 producerUsdcUnits, uint256 associationUsdcUnits, uint256 platformUsdcUnits, bool exists)",
]);

async function main() {
  const { db, pool } = createDb(
    process.env["DATABASE_URL"] ?? "postgresql://alpacto:alpacto@localhost:5432/alpacto",
  );
  const [run] = await db.select().from(auditRuns).where(eq(auditRuns.id, RUN_ID)).limit(1);
  if (!run) throw new Error(`audit run ${RUN_ID} not found`);
  if (!run.reportHash) throw new Error("reportHash missing");
  if (!run.resultCode) throw new Error("resultCode missing");

  // Deduplicate findings
  const findings = await db.select().from(auditFindings).where(eq(auditFindings.auditRunId, RUN_ID));
  if (findings.length > 1) {
    const keep = findings[0]!;
    for (const f of findings.slice(1)) {
      await db.delete(auditFindings).where(eq(auditFindings.id, f.id));
    }
    console.log(`deduped findings: kept ${keep.id}, removed ${findings.length - 1}`);
  }

  const core = process.env["ALPACTO_CONTRACT_ADDRESS"] as Address;
  // Resolve onchain lot id from DB via raw query (lots table).
  const lotRes = await pool.query<{ onchain_lot_id: string | null }>(
    "select onchain_lot_id::text from lots where id = $1",
    [run.lotId],
  );
  const onchainLotId = BigInt(lotRes.rows[0]?.onchain_lot_id ?? "0");
  if (!onchainLotId) throw new Error("lot has no onchain_lot_id");

  const zd = loadZeroDevConfigFromEnv();
  const publicClient = createAlpactoPublicClient({
    ...zd,
    publicRpc: process.env["ARBITRUM_RPC_URL"],
  });

  const sessionKey = (
    process.env["AYNI_SESSION_KEY"]!.startsWith("0x")
      ? process.env["AYNI_SESSION_KEY"]
      : `0x${process.env["AYNI_SESSION_KEY"]}`
  ) as Hex;
  const serialized = process.env["AYNI_SERIALIZED_SESSION"]!;
  const resultU8 = auditResultCodeToOnchain(run.resultCode as "review_required");

  console.log({
    runId: RUN_ID,
    onchainLotId: onchainLotId.toString(),
    version: run.inspectionVersion,
    resultCode: run.resultCode,
    reportHash: run.reportHash,
  });

  const { receipt } = await trySessionSponsoredThenSelfFunded({
    publicClient,
    config: zd,
    serializedSession: serialized,
    sessionPrivateKey: sessionKey,
    to: core,
    abi,
    functionName: "submitAuditAttestation",
    args: [onchainLotId, run.inspectionVersion, run.reportHash as Hex, resultU8],
  });

  const txHash = receipt.receipt.transactionHash;
  console.log("attested tx", txHash);

  await db
    .update(auditRuns)
    .set({
      status: "attested",
      onchainTxHash: txHash,
      progressPhase: "done",
      progressLabel: "Auditoría completa",
      completedAt: new Date(),
    })
    .where(eq(auditRuns.id, RUN_ID));

  console.log("audit_run patched");
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
