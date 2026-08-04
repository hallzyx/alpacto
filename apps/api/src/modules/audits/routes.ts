import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import {
  auditFindings,
  auditRuns,
  lots,
  type Database,
} from "@alpacto/database";
import { createAuditSchema } from "@alpacto/shared-schemas";
import type { AuthUser } from "../../plugins/auth.js";
import { ApiError } from "../../lib/errors.js";
import type { Queues } from "../../jobs/queues.js";

function serializeAuditRun(row: typeof auditRuns.$inferSelect) {
  return {
    id: row.id,
    lotId: row.lotId,
    inspectionVersion: row.inspectionVersion,
    status: row.status,
    provider: row.provider,
    modelAlias: row.modelAlias,
    promptVersion: row.promptVersion,
    resultCode: row.resultCode,
    reportHash: row.reportHash,
    reportStorageKey: row.reportStorageKey,
    onchainTxHash: row.onchainTxHash,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

export async function registerAuditRoutes(
  app: FastifyInstance,
  db: Database,
  authenticate: (req: unknown, reply: unknown) => Promise<void>,
  queues: Queues,
) {
  app.post("/lots/:id/audits", { preHandler: authenticate }, async (request) => {
    const user = request.user as AuthUser;
    if (!["inspector", "association", "admin"].includes(user.role)) {
      throw new ApiError(403, "Forbidden");
    }
    const { id: lotId } = request.params as { id: string };
    const body = createAuditSchema.parse(request.body ?? {});

    const [lot] = await db.select().from(lots).where(eq(lots.id, lotId)).limit(1);
    if (!lot) throw new ApiError(404, "Lot not found");
    if (lot.currentInspectionVersion < 1) {
      throw new ApiError(400, "Lot has no submitted inspection");
    }

    const inspectionVersion = body.inspectionVersion ?? lot.currentInspectionVersion;

    const [row] = await db
      .insert(auditRuns)
      .values({
        lotId,
        inspectionVersion,
        status: "queued",
        provider: "deepseek",
      })
      .returning();
    if (!row) throw new ApiError(500, "Failed to create audit run");

    await db
      .update(lots)
      .set({ status: "auditing", updatedAt: new Date() })
      .where(eq(lots.id, lotId));

    await queues.ayniAudit.add(
      "audit",
      {
        auditRunId: row.id,
        lotId,
        inspectionVersion,
      },
      {
        jobId: `ayni-audit-${row.id}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      },
    );

    return serializeAuditRun(row);
  });

  app.get("/lots/:id/audits/latest", { preHandler: authenticate }, async (request) => {
    const { id: lotId } = request.params as { id: string };
    const [run] = await db
      .select()
      .from(auditRuns)
      .where(eq(auditRuns.lotId, lotId))
      .orderBy(desc(auditRuns.inspectionVersion))
      .limit(1);
    if (!run) throw new ApiError(404, "No audit run found");
    return serializeAuditRun(run);
  });

  app.get("/audits/:id", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const [run] = await db.select().from(auditRuns).where(eq(auditRuns.id, id)).limit(1);
    if (!run) throw new ApiError(404, "Audit run not found");

    const findings = await db
      .select()
      .from(auditFindings)
      .where(eq(auditFindings.auditRunId, id));

    return {
      ...serializeAuditRun(run),
      findings: findings.map((f) => ({
        id: f.id,
        code: f.code,
        severity: f.severity,
        declaredValue: f.declaredValue,
        observedValue: f.observedValue,
        explanation: f.explanation,
      })),
    };
  });
}
