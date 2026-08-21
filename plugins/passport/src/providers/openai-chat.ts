import { EMPTY_RESPONSE_CODE, LlmError } from "@deepseek-ai/dsh-llm";
import type { StreamChunk } from "@deepseek-ai/dsh-llm";
import { parseSse } from "../translate/sse.ts";
import type { TranslatableMessage } from "../translate/resolved.ts";
import { httpLlmError, idleWatchdog, mapFetchFailure } from "./common.ts";

type ChatPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  role: string;
  content: string | ChatPart[];
};

/** Pull a text delta out of one OpenAI-style `data:` payload. `[DONE]` and junk are ignored. */
export function chatCompletionDelta(data: string): string | undefined {
  if (data === "[DONE]") return undefined;
  try {
    const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: unknown } }> };
    const delta = parsed.choices?.[0]?.delta?.content;
    return typeof delta === "string" && delta.length > 0 ? delta : undefined;
  } catch {
    return undefined;
  }
}

/** Flatten resolved harness messages into chat.completions content. */
export function toChatMessages(
  system: string | undefined,
  messages: readonly TranslatableMessage[],
): ChatMessage[] {
  const out: ChatMessage[] = [];
  if (system !== undefined && system.length > 0) out.push({ role: "system", content: system });
  for (const message of messages) {
    const parts: ChatPart[] = [];
    for (const block of message.content) {
      if (block.type === "text" && "text" in block && block.text.length > 0) {
        parts.push({ type: "text", text: block.text });
      } else if (block.type === "image" && "dataBase64" in block) {
        parts.push({
          type: "image_url",
          image_url: { url: `data:${block.mediaType};base64,${block.dataBase64}` },
        });
      }
    }
    if (parts.length === 0) continue;
    const textOnly = parts.every((part) => part.type === "text");
    out.push({
      role: message.role,
      content: textOnly ? parts.map((part) => part.type === "text" ? part.text : "").join("") : parts,
    });
  }
  return out;
}

export async function* streamChatCompletion(input: {
  label: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  signal: AbortSignal | undefined;
  idleTimeoutMs: number;
  onUnauthorized?: () => Promise<Record<string, string>>;
}): AsyncIterable<StreamChunk> {
  const watchdog = idleWatchdog(input.signal, input.idleTimeoutMs);
  const post = (headers: Record<string, string>): Promise<Response> => fetch(input.url, {
    method: "POST",
    headers: {
      ...headers,
      "content-type": "application/json",
      accept: "text/event-stream",
    },
    body: JSON.stringify(input.body),
    signal: watchdog.signal,
  });
  try {
    let headers = input.headers;
    let response = await post(headers);
    if (response.status === 401 && input.onUnauthorized !== undefined) {
      await response.arrayBuffer();
      headers = await input.onUnauthorized();
      response = await post(headers);
    }
    if (!response.ok) throw await httpLlmError(response, input.label);
    if (response.body === null) {
      throw new LlmError(`${input.label} returned an empty body`, EMPTY_RESPONSE_CODE);
    }
    let started = false;
    let text = "";
    for await (const event of parseSse(response.body, () => {
      watchdog.pulse();
    })) {
      const delta = chatCompletionDelta(event.data);
      if (delta === undefined) continue;
      if (!started) {
        yield { type: "block-start", index: 0, blockType: "text" };
        started = true;
      }
      text += delta;
      yield { type: "text-delta", index: 0, text: delta };
    }
    if (!started || text.length === 0) {
      throw new LlmError(`${input.label} returned no text`, EMPTY_RESPONSE_CODE);
    }
    yield { type: "block-end", index: 0, block: { type: "text", text } };
    yield { type: "finish", reason: { kind: "stop" } };
  } catch (error: unknown) {
    throw mapFetchFailure(input.label, error, watchdog, input.signal);
  } finally {
    watchdog.stop();
  }
}
