import { CallId, EMPTY_RESPONSE_CODE, LlmError } from "@deepseek-ai/dsh-llm";
import type { StreamChunk, ToolSchema } from "@deepseek-ai/dsh-llm";
import { parseSse } from "../translate/sse.ts";
import type { TranslatableMessage } from "../translate/resolved.ts";
import { httpLlmError, idleWatchdog, mapFetchFailure } from "./common.ts";

type ChatPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type ChatToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage =
  | { role: "system" | "user"; content: string | ChatPart[] }
  | { role: "assistant"; content: string; reasoning_content?: string; tool_calls?: ChatToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface ChatToolDelta {
  index: number;
  id?: string;
  name?: string;
  arguments: string;
}

interface ChatCompletionEvent {
  text?: string;
  reasoning?: string;
  toolCalls?: ChatToolDelta[];
  finishReason?: string;
}

type ChatBlock = {
  kind: "text" | "reasoning";
  index: number;
  text: string;
};

type ChatToolBlock = {
  kind: "tool-call";
  index: number;
  wireIndex: number;
  text: string;
  callId?: string;
  name?: string;
  pendingArguments: string[];
};

type ChatFinishReason = Extract<StreamChunk, { type: "finish" }>["reason"];

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Parse the content, reasoning, tool calls, and finish metadata from one OpenAI-style SSE payload. */
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
          tool_calls?: unknown;
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
    const toolCalls: ChatToolDelta[] = [];
    if (Array.isArray(delta?.tool_calls)) {
      for (const value of delta.tool_calls) {
        if (typeof value !== "object" || value === null) continue;
        const call = value as { index?: unknown; id?: unknown; function?: unknown };
        if (typeof call.index !== "number") continue;
        const fn = typeof call.function === "object" && call.function !== null
          ? call.function as { name?: unknown; arguments?: unknown }
          : undefined;
        toolCalls.push({
          index: call.index,
          ...nonEmptyString(call.id) === undefined ? {} : { id: nonEmptyString(call.id) },
          ...nonEmptyString(fn?.name) === undefined ? {} : { name: nonEmptyString(fn?.name) },
          arguments: typeof fn?.arguments === "string" ? fn.arguments : "",
        });
      }
    }
    const finishReason = nonEmptyString(choice?.finish_reason);
    if (
      text === undefined
      && reasoning === undefined
      && toolCalls.length === 0
      && finishReason === undefined
    ) return undefined;
    return {
      ...text === undefined ? {} : { text },
      ...reasoning === undefined ? {} : { reasoning },
      ...toolCalls.length === 0 ? {} : { toolCalls },
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

function toolCallId(block: ChatToolBlock): string {
  return block.callId ?? `chat-tool-call-${block.wireIndex}`;
}

function closeToolBlock(block: ChatToolBlock): StreamChunk {
  return {
    type: "block-end",
    index: block.index,
    block: {
      type: "tool-call",
      id: CallId(toolCallId(block)),
      name: block.name ?? "",
      arguments: block.text,
    },
  };
}

function chatFinishReason(reason: string | undefined): ChatFinishReason {
  if (reason === undefined || reason === "stop") return { kind: "stop" };
  if (reason === "tool_calls") return { kind: "tool-calls" };
  if (reason === "length") return { kind: "max-tokens" };
  return {
    kind: "error",
    failure: {
      message: `model stopped: ${reason}`,
      code: reason.replaceAll(/[^a-z0-9]+/gi, "_").replaceAll(/^_|_$/g, "").toUpperCase() || "SERVER",
    },
  };
}

function chatParts(blocks: TranslatableMessage["content"]): ChatPart[] {
  const parts: ChatPart[] = [];
  for (const block of blocks) {
    if (block.type === "text" && block.text.length > 0) {
      parts.push({ type: "text", text: block.text });
    } else if (block.type === "image" && "dataBase64" in block) {
      parts.push({
        type: "image_url",
        image_url: { url: `data:${block.mediaType};base64,${block.dataBase64}` },
      });
    }
  }
  return parts;
}

function chatContent(parts: readonly ChatPart[]): string | ChatPart[] {
  return parts.every((part) => part.type === "text")
    ? parts.map((part) => part.type === "text" ? part.text : "").join("")
    : [...parts];
}

/** Flatten resolved harness messages into role-correct chat.completions messages. */
export function toChatMessages(
  system: string | undefined,
  messages: readonly TranslatableMessage[],
): ChatMessage[] {
  const out: ChatMessage[] = [];
  if (system !== undefined && system.length > 0) out.push({ role: "system", content: system });
  for (const message of messages) {
    if (message.role === "assistant") {
      const content = message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
      const reasoning = message.content
        .filter((block) => block.type === "reasoning")
        .map((block) => block.text)
        .join("");
      const toolCalls = message.content
        .filter((block) => block.type === "tool-call")
        .map((block): ChatToolCall => ({
          id: block.id,
          type: "function",
          function: { name: block.name, arguments: block.arguments },
        }));
      if (content.length > 0 || reasoning.length > 0 || toolCalls.length > 0) {
        out.push({
          role: "assistant",
          content,
          ...reasoning.length === 0 ? {} : { reasoning_content: reasoning },
          ...toolCalls.length === 0 ? {} : { tool_calls: toolCalls },
        });
      }
      continue;
    }

    const toolResults = message.role === "user"
      ? message.content.filter((block) => block.type === "tool-result")
      : [];
    const parts = chatParts(message.content.filter((block) => block.type !== "tool-result"));
    if (parts.length > 0) out.push({ role: message.role, content: chatContent(parts) });
    for (const result of toolResults) {
      const content = result.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
      out.push({
        role: "tool",
        tool_call_id: result.toolCallId,
        content: content || "(no output)",
      });
    }
  }
  return out;
}

/** Serialize harness tool schemas into OpenAI-compatible function tools. */
export function toChatTools(tools: readonly ToolSchema[]): Record<string, unknown>[] {
  return tools.map((tool) => ({
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
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
    const toolBlocks = new Map<number, ChatToolBlock>();
    const toolOrder: ChatToolBlock[] = [];
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
      if (parsed.toolCalls !== undefined) {
        if (openBlock !== undefined) {
          yield closeChatBlock(openBlock);
          openBlock = undefined;
        }
        for (const call of parsed.toolCalls) {
          let block = toolBlocks.get(call.index);
          if (block === undefined) {
            block = {
              kind: "tool-call",
              index: nextIndex++,
              wireIndex: call.index,
              text: "",
              pendingArguments: [],
            };
            toolBlocks.set(call.index, block);
            toolOrder.push(block);
            yield { type: "block-start", index: block.index, blockType: "tool-call" };
          }
          if (block.callId === undefined && call.id !== undefined) block.callId = call.id;
          if (block.name === undefined && call.name !== undefined) block.name = call.name;
          block.text += call.arguments;
          block.pendingArguments.push(call.arguments);
          if (block.callId !== undefined) {
            for (const argumentsDelta of block.pendingArguments) {
              yield {
                type: "tool-call-delta",
                index: block.index,
                id: CallId(block.callId),
                ...block.name === undefined ? {} : { name: block.name },
                argumentsDelta,
              };
            }
            block.pendingArguments.length = 0;
          }
        }
      }
    }
    if (openBlock !== undefined) yield closeChatBlock(openBlock);
    for (const block of toolOrder) {
      for (const argumentsDelta of block.pendingArguments) {
        yield {
          type: "tool-call-delta",
          index: block.index,
          id: CallId(toolCallId(block)),
          ...block.name === undefined ? {} : { name: block.name },
          argumentsDelta,
        };
      }
      yield closeToolBlock(block);
    }
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
