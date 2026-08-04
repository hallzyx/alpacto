import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { createDb } from "@alpacto/database";
import { config } from "../config.js";
import { markFundOrderFailed, processFundOrderJob } from "./fund-order.js";

export const QUEUE_NAMES = {
  ping: "alpacto-ping",
  evidenceFinalize: "alpacto-evidence-finalize",
  fundOrder: "alpacto-fund-order",
  ayniAudit: "alpacto-ayni-audit",
} as const;

let connection: IORedis | null = null;

export function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
  }
  return connection;
}

export function createQueues() {
  const conn = getRedisConnection();
  return {
    ping: new Queue(QUEUE_NAMES.ping, { connection: conn }),
    evidenceFinalize: new Queue(QUEUE_NAMES.evidenceFinalize, { connection: conn }),
    fundOrder: new Queue(QUEUE_NAMES.fundOrder, { connection: conn }),
    ayniAudit: new Queue(QUEUE_NAMES.ayniAudit, { connection: conn }),
  };
}

export type Queues = ReturnType<typeof createQueues>;

export function startWorkers(onLog: (msg: string) => void) {
  const conn = getRedisConnection();
  const { db, pool } = createDb(config.databaseUrl);

  const pingWorker = new Worker(
    QUEUE_NAMES.ping,
    async (job) => {
      onLog(`ping job ${job.id} ok`);
      return { pong: true, at: new Date().toISOString() };
    },
    { connection: conn },
  );

  const evidenceWorker = new Worker(
    QUEUE_NAMES.evidenceFinalize,
    async (job) => {
      onLog(`evidence.finalize ${job.id} sha256=${String(job.data.sha256 ?? "")}`);
      return { finalized: true };
    },
    { connection: conn },
  );

  const fundOrderWorker = new Worker(
    QUEUE_NAMES.fundOrder,
    async (job) => {
      const fundingIntentId = String(job.data.fundingIntentId ?? "");
      onLog(`fund-order start intent=${fundingIntentId}`);
      try {
        const result = await processFundOrderJob(db, fundingIntentId, onLog);
        onLog(`fund-order done tx=${result.txHash}`);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onLog(`fund-order failed: ${message}`);
        if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
          await markFundOrderFailed(db, fundingIntentId, message);
        }
        throw err;
      }
    },
    { connection: conn },
  );

  fundOrderWorker.on("error", (err) => {
    onLog(`fund-order worker error: ${err.message}`);
  });

  const closeDb = async () => {
    await pool.end();
  };

  return { pingWorker, evidenceWorker, fundOrderWorker, closeDb };
}
