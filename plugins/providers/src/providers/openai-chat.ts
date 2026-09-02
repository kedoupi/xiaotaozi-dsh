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

interface ChatCompletionEvent {
  text?: string;
  reasoning?: string;
  finishReason?: string;
}

type ChatBlock = {
  kind: "text" | "reasoning";
  index: number;
  text: string;
};

type ChatFinishReason = Extract<StreamChunk, { type: "finish" }>["reason"];

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Parse the content, reasoning, and finish metadata from one OpenAI-style SSE payload. */
function chatCompletionEvent(data: string): ChatCompletionEvent | undefined {
  if (data === "[DONE]") return undefined;
  try {
    const parsed = JSON.parse(data) as {
      choices?: Array<{
        delta?: {
          content?: unknown;
          reasoning_content?: unknown;
          reasoning_details?: unknown;
          reasoning?: unknown;
        };
        finish_reason?: unknown;
      }>;
    };
    const choice = parsed.choices?.[0];
    const delta = choice?.delta;
    const text = nonEmptyString(delta?.content);
    const reasoning = nonEmptyString(delta?.reasoning_content)
      ?? nonEmptyString(delta?.reasoning_details)
      ?? nonEmptyString(delta?.reasoning);
    const finishReason = nonEmptyString(choice?.finish_reason);
    if (text === undefined && reasoning === undefined && finishReason === undefined) return undefined;
    return {
      ...text === undefined ? {} : { text },
      ...reasoning === undefined ? {} : { reasoning },
      ...finishReason === undefined ? {} : { finishReason },
    };
  } catch {
    return undefined;
  }
}

/** Pull a text delta out of one OpenAI-style `data:` payload. `[DONE]` and junk are ignored. */
export function chatCompletionDelta(data: string): string | undefined {
  return chatCompletionEvent(data)?.text;
}

function closeChatBlock(block: ChatBlock): StreamChunk {
  return {
    type: "block-end",
    index: block.index,
    block: { type: block.kind, text: block.text },
  };
}

function chatFinishReason(reason: string | undefined): ChatFinishReason {
  if (reason === undefined || reason === "stop") return { kind: "stop" };
  if (reason === "length") return { kind: "max-tokens" };
  return {
    kind: "error",
    failure: {
      message: `model stopped: ${reason}`,
      code: reason.replaceAll(/[^a-z0-9]+/gi, "_").replaceAll(/^_|_$/g, "").toUpperCase() || "SERVER",
    },
  };
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
    let openBlock: ChatBlock | undefined;
    let nextIndex = 0;
    let finishReason: string | undefined;
    for await (const event of parseSse(response.body, () => {
      watchdog.pulse();
    })) {
      const parsed = chatCompletionEvent(event.data);
      if (parsed === undefined) continue;
      if (parsed.finishReason !== undefined) finishReason = parsed.finishReason;
      const deltas: readonly [ChatBlock["kind"], string | undefined][] = [
        ["reasoning", parsed.reasoning],
        ["text", parsed.text],
      ];
      for (const [kind, delta] of deltas) {
        if (delta === undefined) continue;
        if (openBlock?.kind !== kind) {
          if (openBlock !== undefined) yield closeChatBlock(openBlock);
          openBlock = { kind, index: nextIndex++, text: "" };
          yield { type: "block-start", index: openBlock.index, blockType: kind };
        }
        openBlock.text += delta;
        if (kind === "reasoning") {
          yield { type: "reasoning-delta", index: openBlock.index, text: delta };
        } else {
          yield { type: "text-delta", index: openBlock.index, text: delta };
        }
      }
    }
    if (openBlock !== undefined) yield closeChatBlock(openBlock);
    if (nextIndex === 0 && (finishReason === undefined || finishReason === "stop")) {
      throw new LlmError(`${input.label} returned no content`, EMPTY_RESPONSE_CODE);
    }
    yield { type: "finish", reason: chatFinishReason(finishReason) };
  } catch (error: unknown) {
    throw mapFetchFailure(input.label, error, watchdog, input.signal);
  } finally {
    watchdog.stop();
  }
}
