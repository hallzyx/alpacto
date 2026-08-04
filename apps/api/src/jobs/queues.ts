import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config.js";

export const QUEUE_NAMES = {
  ping: "alpacto-ping",
  evidenceFinalize: "alpacto-evidence-finalize",
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
  };
}

export type Queues = ReturnType<typeof createQueues>;

export function startWorkers(onLog: (msg: string) => void) {
  const conn = getRedisConnection();
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
  return { pingWorker, evidenceWorker };
}
