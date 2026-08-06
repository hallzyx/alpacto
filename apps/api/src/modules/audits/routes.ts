import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import OpenAI from "openai";
import { z } from "zod";
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
import { config } from "../../config.js";

const auditAskSchema = z.object({
  question: z.string().trim().min(1).max(2000),
});

function serializeAuditRun(row: typeof auditRuns.$inferSelect) {
  return {
    id: row.id,
    lotId: row.lotId,
    inspectionVersion: row.inspectionVersion,
    status: row.status,
    progressPhase: row.progressPhase,
    progressLabel: row.progressLabel,
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

let deepseekClient: OpenAI | null = null;

function getDeepSeekClient(): OpenAI {
  if (!config.deepseek.apiKey) {
    throw new ApiError(503, "Ayni chat is not configured (missing DEEPSEEK_API_KEY)", "AYNI_CHAT_UNAVAILABLE");
  }
  if (!deepseekClient) {
    deepseekClient = new OpenAI({
      apiKey: config.deepseek.apiKey,
      baseURL: config.deepseek.baseUrl,
    });
  }
  return deepseekClient;
}

function explorerTxUrl(txHash: string | null): string | null {
  if (!txHash || txHash.startsWith("local-")) return null;
  const base =
    process.env["NEXT_PUBLIC_ARBISCAN_URL"]?.replace(/\/$/, "") ||
    "https://sepolia.arbiscan.io";
  return `${base}/tx/${txHash}`;
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
        progressPhase: "queued",
        progressLabel: "En cola…",
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
      .orderBy(desc(auditRuns.inspectionVersion), desc(auditRuns.startedAt))
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
      explorerUrl: explorerTxUrl(run.onchainTxHash),
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

  /** Inspector Q&A about why this audit passed / failed. */
  app.post("/audits/:id/ask", { preHandler: authenticate }, async (request) => {
    const user = request.user as AuthUser;
    if (!["inspector", "association", "admin"].includes(user.role)) {
      throw new ApiError(403, "Forbidden");
    }
    const { id } = request.params as { id: string };
    const body = auditAskSchema.parse(request.body);

    const [run] = await db.select().from(auditRuns).where(eq(auditRuns.id, id)).limit(1);
    if (!run) throw new ApiError(404, "Audit run not found");
    if (!["completed", "attested", "failed"].includes(run.status) && run.progressPhase !== "done") {
      // allow ask once report exists (resultCode set) even if still attesting
      if (!run.resultCode) {
        throw new ApiError(400, "Audit still running — wait for the report");
      }
    }

    const findings = await db
      .select()
      .from(auditFindings)
      .where(eq(auditFindings.auditRunId, id));

    const findingsText =
      findings.length === 0
        ? "Sin hallazgos. La evidencia cuadró con lo declarado (o solo hubo avisos leves)."
        : findings
            .map(
              (f) =>
                `- [${f.severity}] ${f.code}: declarado=${f.declaredValue ?? "—"} observado=${f.observedValue ?? "—"} — ${f.explanation ?? ""}`,
            )
            .join("\n");

    const client = getDeepSeekClient();
    const response = await client.chat.completions.create({
      model: config.deepseek.model,
      messages: [
        {
          role: "system",
          content: `Eres Ayni Auditor. Explicas al INSPECTOR, en español claro y breve, por qué esta auditoría dio el resultado que dio.
No inventes pesos ni hallazgos. Solo usa el contexto.
No puedes cambiar el resultado ni la attestation on-chain.
Si piden corregir: indica que deben enviar una nueva inspección (nuevo pesaje) con evidencia correcta.
Resultado: ${run.resultCode ?? "pendiente"}
Estado pipeline: ${run.status}${run.progressLabel ? ` — ${run.progressLabel}` : ""}
Versión inspección: v${run.inspectionVersion}
Report hash: ${run.reportHash ?? "—"}
Tx on-chain: ${run.onchainTxHash ?? "no registrada / skip"}
Hallazgos:
${findingsText}`,
        },
        { role: "user", content: body.question },
      ],
      // @ts-expect-error DeepSeek thinking extension
      thinking: { type: "disabled" },
    });

    const answer = response.choices[0]?.message?.content?.trim() || "No pude generar una explicación ahora.";
    return { answer };
  });
}
