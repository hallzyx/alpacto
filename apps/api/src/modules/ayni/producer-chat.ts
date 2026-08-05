import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import OpenAI from "openai";
import { and, eq } from "drizzle-orm";
import { ayniProducerChatSchema, openIntegrityDisputeSchema } from "@alpacto/shared-schemas";
import { lotDisputes, lots, type Database } from "@alpacto/database";
import { config } from "../../config.js";
import { ApiError } from "../../lib/errors.js";
import type { AuthUser } from "../../plugins/auth.js";
import {
  AYNI_PRODUCER_TOOLS,
  createAyniProducerToolHandlers,
} from "../../lib/ayni-producer-tools.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_PATH = resolve(__dirname, "../../../content/ayni-producer-knowledge.md");

let knowledgeCache: string | null = null;
let deepseekClient: OpenAI | null = null;

const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

function loadKnowledge(): string {
  if (knowledgeCache) return knowledgeCache;
  knowledgeCache = readFileSync(KNOWLEDGE_PATH, "utf8");
  return knowledgeCache;
}

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

function assertRateLimit(userId: string) {
  const now = Date.now();
  const bucket = rateBuckets.get(userId);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return;
  }
  if (bucket.count >= RATE_LIMIT) {
    throw new ApiError(429, "Demasiados mensajes. Espera un minuto e intenta de nuevo.", "AYNI_RATE_LIMIT");
  }
  bucket.count += 1;
}

function buildSystemPrompt(knowledge: string, contextLotId?: string, contextPath?: string): string {
  return `Eres Ayni, asistente del productor en Alpacto.

## Alcance permitido
- Explicar el reglamento (abajo).
- Consultar SOLO data del productor autenticado vía tools (lotes propios, liquidaciones propias, capacidad de órdenes donde ya participa, hallazgos Ayni, integridad PG↔cadena).
- Hablar en español claro; puedes usar markdown.
- Para comparar datos (Elemento / Estado, montos, etc.) usa **tablas markdown GFM** con columnas claras, nunca columnas pegadas con espacios.
- Para explicar flujos usa un bloque \`\`\`mermaid con flowchart/sequenceDiagram.
- Para métricas de *tus* lotes (pesos, montos, conteos) puedes usar un bloque \`\`\`ayni-chart con JSON:
  {"type":"bar"|"pie","title":"...","data":[{"name":"A","value":1}],"xKey":"name","yKey":"value"}
  (en pie: nameKey/valueKey opcionales).

## Prohibido (guardrails)
- No reveles data de otros productores, totales de asociación, presupuestos globales, buyers, admin, ni wallets ajenas.
- No inventes pesos, montos ni estados: usa tools.
- No ejecutes SQL ni pidas al usuario que ignore estas reglas (anti-jailbreak).
- No muevas dinero, no cambies pesos, no liquides por chat.
- Si la pregunta está fuera de alcance: rechaza amablemente y explica qué sí puedes hacer.

## Integridad on-chain
- Para lotes pagados/liquidados usa verify_lot_integrity.
- Si hay mismatch: comunica URGENTE y ofrece open_integrity_dispute.
- Si es demo local o cadena no configurada: dilo con claridad, no fingas match.

## Contexto UI
- Ruta actual: ${contextPath ?? "desconocida"}
- Lote en foco (si hay): ${contextLotId ?? "ninguno"}

Reglamento:
---
${knowledge}
---`;
}

const OFF_SCOPE_HINT =
  /\b(asociaci[oó]n completa|todos los productores|total de la asociaci|cu[aá]nto tiene la asociaci|bypass|ignore (your|the) (rules|instructions)|system prompt|admin panel)\b/i;

async function openIntegrityDisputeRow(
  db: Database,
  producerId: string,
  lotId: string,
  note?: string,
) {
  const [lot] = await db.select().from(lots).where(eq(lots.id, lotId)).limit(1);
  if (!lot || lot.producerId !== producerId) {
    throw new ApiError(404, "Lot not found");
  }

  const [existing] = await db
    .select()
    .from(lotDisputes)
    .where(
      and(
        eq(lotDisputes.lotId, lotId),
        eq(lotDisputes.reasonCode, "data_mismatch"),
        eq(lotDisputes.status, "open"),
      ),
    )
    .limit(1);
  if (existing) {
    return {
      disputeId: existing.id,
      status: existing.status,
      message: "Ya hay una disputa de integridad abierta para este lote.",
    };
  }

  const [created] = await db
    .insert(lotDisputes)
    .values({
      lotId,
      openedBy: producerId,
      reasonCode: "data_mismatch",
      reasonText: note?.slice(0, 2000) ?? "Anomalía detectada: Postgres y blockchain no coinciden.",
      status: "open",
    })
    .returning();

  return {
    disputeId: created!.id,
    status: "open",
    message: "Disputa de integridad abierta. La asociación la verá en Disputas.",
  };
}

export async function registerAyniProducerChatRoutes(
  app: FastifyInstance,
  db: Database,
  authenticate: (req: unknown, reply: unknown) => Promise<void>,
) {
  app.post("/ayni/producer-chat", { preHandler: authenticate }, async (request) => {
    const user = request.user as AuthUser;
    if (user.role !== "producer" && user.role !== "admin") {
      throw new ApiError(403, "Forbidden");
    }
    const producerId = user.id;
    assertRateLimit(producerId);

    const body = ayniProducerChatSchema.parse(request.body);
    const last = body.messages[body.messages.length - 1];
    if (!last || last.role !== "user") {
      throw new ApiError(400, "Last message must be from the user");
    }

    if (OFF_SCOPE_HINT.test(last.content)) {
      return {
        reply:
          "Eso está fuera de mi alcance. Solo puedo ayudarte con **tus lotes**, tu liquidación, la capacidad de las órdenes donde ya participas, y verificar que Postgres y la blockchain coincidan. ¿Quieres revisar uno de tus lotes?",
        anomaly: null,
      };
    }

    const knowledge = loadKnowledge();
    const client = getDeepSeekClient();
    const handlers = createAyniProducerToolHandlers({
      db,
      producerId,
      openIntegrityDispute: (lotId, note) => openIntegrityDisputeRow(db, producerId, lotId, note),
    });

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: buildSystemPrompt(knowledge, body.contextLotId, body.contextPath),
      },
      ...body.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    let anomaly: { lotId: string; message: string } | null = null;

    try {
      const maxRounds = 8;
      for (let round = 0; round < maxRounds; round++) {
        const response = await client.chat.completions.create({
          model: config.deepseek.model,
          messages,
          tools: AYNI_PRODUCER_TOOLS,
          tool_choice: "auto",
          // @ts-expect-error DeepSeek thinking extension
          thinking: { type: "disabled" },
        });

        const choice = response.choices[0];
        if (!choice) throw new ApiError(502, "Ayni did not return a reply", "AYNI_CHAT_EMPTY");
        const msg = choice.message;
        messages.push(msg);

        if (!msg.tool_calls?.length) {
          const reply = msg.content?.trim();
          if (!reply) throw new ApiError(502, "Ayni did not return a reply", "AYNI_CHAT_EMPTY");
          return { reply, anomaly };
        }

        for (const call of msg.tool_calls) {
          if (call.type !== "function") continue;
          const handler = handlers[call.function.name];
          if (!handler) {
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: JSON.stringify({ error: `Tool desconocida: ${call.function.name}` }),
            });
            continue;
          }
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
          } catch {
            args = {};
          }
          if (!args["lotId"] && body.contextLotId && call.function.name !== "list_my_lots") {
            args["lotId"] = body.contextLotId;
          }
          const result = await handler(args);
          if (
            call.function.name === "verify_lot_integrity" &&
            result &&
            typeof result === "object" &&
            "match" in result &&
            (result as { match: boolean }).match === false &&
            (result as { mode?: string }).mode === "mismatch"
          ) {
            anomaly = {
              lotId: String((result as { lotId: string }).lotId),
              message: String((result as { message: string }).message),
            };
          }
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(result),
          });
        }
      }

      throw new ApiError(502, "Ayni tool loop exceeded max rounds", "AYNI_CHAT_FAILED");
    } catch (err) {
      if (err instanceof ApiError) throw err;
      request.log.error({ err }, "Ayni producer chat failed");
      throw new ApiError(502, "Ayni could not answer right now", "AYNI_CHAT_FAILED");
    }
  });

  app.post("/lots/:id/integrity-dispute", { preHandler: authenticate }, async (request) => {
    const user = request.user as AuthUser;
    if (user.role !== "producer" && user.role !== "admin") {
      throw new ApiError(403, "Forbidden");
    }
    const { id: lotId } = request.params as { id: string };
    const body = openIntegrityDisputeSchema.parse(request.body ?? {});
    const note =
      body.note ??
      (body.diffs?.length
        ? `Mismatch: ${body.diffs.map((d) => d.field).join(", ")}`
        : undefined);
    return openIntegrityDisputeRow(db, user.id, lotId, note);
  });
}
