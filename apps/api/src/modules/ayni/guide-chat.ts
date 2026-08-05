import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import OpenAI from "openai";
import { ayniGuideChatSchema } from "@alpacto/shared-schemas";
import type { Database } from "@alpacto/database";
import { config } from "../../config.js";
import { ApiError } from "../../lib/errors.js";
import type { AuthUser } from "../../plugins/auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_PATH = resolve(__dirname, "../../../content/ayni-producer-knowledge.md");

let knowledgeCache: string | null = null;
let deepseekClient: OpenAI | null = null;

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

function buildSystemPrompt(knowledge: string): string {
  return `Eres Ayni, el asistente de la Guía de Alpacto para productores de fibra de alpaca.

Tu rol en ESTE chat:
- Explicar el flujo, términos, FAQ y reglas del reglamento.
- Hablar en español claro y sencillo.
- Puedes usar markdown (listas, negritas, **tablas GFM**).
- Para flujos usa \`\`\`mermaid (flowchart).
- No inventes pesos, montos ni estados de un lote concreto.
- No puedes cambiar pesos, aprobar pagos, liquidar, ni corregir auditorías.
- Si piden una acción, indica el botón o pantalla correcta (Mis lotes, confirmar/declinar, nuevo pesaje, liquidación, Disputas en asociación).
- Si no sabes algo que no esté en el reglamento, dilo con honestidad.

Reglamento (fuente de verdad):
---
${knowledge}
---`;
}

export async function registerAyniGuideChatRoutes(
  app: FastifyInstance,
  _db: Database,
  authenticate: (req: unknown, reply: unknown) => Promise<void>,
) {
  app.post("/ayni/guide-chat", { preHandler: authenticate }, async (request) => {
    const user = request.user as AuthUser;
    if (user.role !== "producer" && user.role !== "admin") {
      throw new ApiError(403, "Forbidden");
    }

    const body = ayniGuideChatSchema.parse(request.body);
    const last = body.messages[body.messages.length - 1];
    if (!last || last.role !== "user") {
      throw new ApiError(400, "Last message must be from the user");
    }

    const knowledge = loadKnowledge();
    const client = getDeepSeekClient();

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: buildSystemPrompt(knowledge) },
      ...body.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    try {
      const response = await client.chat.completions.create({
        model: config.deepseek.model,
        messages,
        // @ts-expect-error DeepSeek thinking extension
        thinking: { type: "disabled" },
      });

      const reply = response.choices[0]?.message?.content?.trim();
      if (!reply) {
        throw new ApiError(502, "Ayni did not return a reply", "AYNI_CHAT_EMPTY");
      }

      return { reply };
    } catch (err) {
      if (err instanceof ApiError) throw err;
      request.log.error({ err }, "Ayni guide chat failed");
      throw new ApiError(502, "Ayni could not answer right now", "AYNI_CHAT_FAILED");
    }
  });
}
