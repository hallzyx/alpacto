import OpenAI from "openai";
import { config } from "../config.js";

let client: OpenAI | null = null;

export function getDeepSeekClient(): OpenAI {
  if (!config.deepseek.apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured");
  }
  if (!client) {
    client = new OpenAI({
      apiKey: config.deepseek.apiKey,
      baseURL: config.deepseek.baseUrl,
    });
  }
  return client;
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

export async function runDeepSeekToolLoop(opts: {
  systemPrompt: string;
  userMessage: string;
  tools: OpenAI.Chat.Completions.ChatCompletionTool[];
  handlers: Record<string, ToolHandler>;
  maxRounds?: number;
}): Promise<string> {
  const openai = getDeepSeekClient();
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: opts.systemPrompt },
    { role: "user", content: opts.userMessage },
  ];
  const maxRounds = opts.maxRounds ?? 12;

  for (let round = 0; round < maxRounds; round++) {
    const response = await openai.chat.completions.create({
      model: config.deepseek.model,
      messages,
      tools: opts.tools,
      tool_choice: "auto",
      // @ts-expect-error DeepSeek thinking extension
      thinking: { type: "disabled" },
    });

    const choice = response.choices[0];
    if (!choice) throw new Error("No response from DeepSeek");

    const msg = choice.message;
    messages.push(msg);

    if (!msg.tool_calls?.length) {
      return msg.content ?? "";
    }

    for (const call of msg.tool_calls) {
      if (call.type !== "function") continue;
      const handler = opts.handlers[call.function.name];
      if (!handler) {
        throw new Error(`Unknown tool: ${call.function.name}`);
      }
      const args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
      const result = await handler(args);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  throw new Error("DeepSeek tool loop exceeded max rounds");
}
