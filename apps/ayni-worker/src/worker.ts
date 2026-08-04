import { Worker } from "bullmq";
import IORedis from "ioredis";
import { createDb } from "@alpacto/database";
import { config, QUEUE_NAME } from "./config.js";
import { markAuditFailed, processAuditJob } from "./pipeline/run-audit.js";

export function startAyniWorker(onLog: (msg: string) => void = console.log) {
  const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
  const { db, pool } = createDb(config.databaseUrl);

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const auditRunId = String(job.data.auditRunId ?? "");
      const lotId = String(job.data.lotId ?? "");
      const inspectionVersion = Number(job.data.inspectionVersion ?? 0);
      try {
        return await processAuditJob(
          db,
          { auditRunId, lotId, inspectionVersion },
          onLog,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onLog(`audit failed: ${message}`);
        if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
          await markAuditFailed(db, auditRunId, lotId, message);
        }
        throw err;
      }
    },
    { connection },
  );

  worker.on("error", (err) => onLog(`worker error: ${err.message}`));
  onLog(`Ayni worker listening on ${QUEUE_NAME}`);

  return {
    worker,
    close: async () => {
      await worker.close();
      await connection.quit();
      await pool.end();
    },
  };
}

startAyniWorker();
