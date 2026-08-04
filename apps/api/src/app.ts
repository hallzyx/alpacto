import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { checkDbHealth, createDb } from "@alpacto/database";
import { config } from "./config.js";
import { isApiError } from "./lib/errors.js";
import { ensureBucket } from "./lib/s3.js";
import { authPlugin } from "./plugins/auth.js";
import { createQueues, startWorkers } from "./jobs/queues.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import { registerCampaignRoutes } from "./modules/campaigns/routes.js";
import { registerOrderRoutes } from "./modules/orders/routes.js";
import { registerLotRoutes } from "./modules/lots/routes.js";
import { registerEvidenceRoutes } from "./modules/evidence/routes.js";

export type AppDeps = {
  startWorkers?: boolean;
  ensureS3?: boolean;
};

export async function buildApp(deps: AppDeps = {}) {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  const { db, pool } = createDb(config.databaseUrl);
  const authenticate = authPlugin(db);
  const queues = createQueues();

  if (deps.startWorkers !== false) {
    startWorkers((msg) => app.log.info(msg));
  }
  if (deps.ensureS3 !== false) {
    await ensureBucket().catch((err) => app.log.warn({ err }, "S3 bucket check failed"));
  }

  app.get("/health", async () => ({ status: "ok", service: "alpacto-api" }));

  app.get("/health/ready", async (_req, reply) => {
    const dbOk = await checkDbHealth(pool);
    if (!dbOk) {
      return reply.code(503).send({ status: "degraded", database: false });
    }
    return { status: "ready", database: true };
  });

  await registerAuthRoutes(app, db);
  await registerCampaignRoutes(app, db, authenticate);
  await registerOrderRoutes(app, db, authenticate);
  await registerLotRoutes(app, db, authenticate);
  await registerEvidenceRoutes(app, db, authenticate, queues);

  app.setErrorHandler((error, _request, reply) => {
    if (isApiError(error)) {
      return reply.code(error.statusCode).send({
        error: error.message,
        code: error.code,
      });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "Validation failed", details: error.flatten() });
    }
    app.log.error(error);
    return reply.code(500).send({ error: "Internal server error" });
  });

  app.addHook("onClose", async () => {
    await pool.end();
  });

  return { app, db, pool, queues };
}
