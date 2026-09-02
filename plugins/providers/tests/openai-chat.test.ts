import { CallId } from "@deepseek-ai/dsh-llm";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chatCompletionDelta,
  streamChatCompletion,
  toChatMessages,
  toChatTools,
} from "../src/providers/openai-chat.ts";

function chatStream(events: readonly object[]) {
  const body = [...events.map((event) => JSON.stringify(event)), "[DONE]"]
    .map((event) => `data: ${event}\n\n`)
    .join("");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  })));
  return streamChatCompletion({
    label: "Kimi Code",
    url: "https://example.test/chat/completions",
    headers: {},
    body: {},
    signal: undefined,
    idleTimeoutMs: 1_000,
  });
}

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of stream) values.push(value);
  return values;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chatCompletionDelta", () => {
  it("reads a text delta and ignores junk", () => {
    expect(chatCompletionDelta('{"choices":[{"delta":{"content":"hi"}}]}')).toBe("hi");
    expect(chatCompletionDelta("[DONE]")).toBeUndefined();
    expect(chatCompletionDelta("not-json")).toBeUndefined();
    expect(chatCompletionDelta('{"choices":[{"delta":{}}]}')).toBeUndefined();
  });
});

describe("streamChatCompletion", () => {
  it.each(["reasoning_content", "reasoning_details", "reasoning"])(
    "preserves a reasoning-only Kimi response from %s",
    async (field) => {
      await expect(collect(chatStream([
        { choices: [{ delta: { [field]: "thinking" }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: "stop" }] },
      ]))).resolves.toEqual([
        { type: "block-start", index: 0, blockType: "reasoning" },
        { type: "reasoning-delta", index: 0, text: "thinking" },
        { type: "block-end", index: 0, block: { type: "reasoning", text: "thinking" } },
        { type: "finish", reason: { kind: "stop" } },
      ]);
    },
  );

  it("preserves reasoning followed by final text", async () => {
    await expect(collect(chatStream([
      { choices: [{ delta: { reasoning_content: "thinking" }, finish_reason: null }] },
      { choices: [{ delta: { content: "answer" }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: "stop" }] },
    ]))).resolves.toEqual([
      { type: "block-start", index: 0, blockType: "reasoning" },
      { type: "reasoning-delta", index: 0, text: "thinking" },
      { type: "block-end", index: 0, block: { type: "reasoning", text: "thinking" } },
      { type: "block-start", index: 1, blockType: "text" },
      { type: "text-delta", index: 1, text: "answer" },
      { type: "block-end", index: 1, block: { type: "text", text: "answer" } },
      { type: "finish", reason: { kind: "stop" } },
    ]);
  });

  it("reports a content filter instead of an empty response", async () => {
    await expect(collect(chatStream([
      { choices: [{ delta: {}, finish_reason: "content_filter" }] },
    ]))).resolves.toEqual([
      {
        type: "finish",
        reason: {
          kind: "error",
          failure: { message: "model stopped: content_filter", code: "CONTENT_FILTER" },
        },
      },
    ]);
  });

  it("reports an output length stop instead of an empty response", async () => {
    await expect(collect(chatStream([
      { choices: [{ delta: {}, finish_reason: "length" }] },
    ]))).resolves.toEqual([
      { type: "finish", reason: { kind: "max-tokens" } },
    ]);
  });

  it("keeps a truly empty stream as EMPTY_RESPONSE", async () => {
    await expect(collect(chatStream([]))).rejects.toMatchObject({ code: "EMPTY_RESPONSE" });
  });

  it("keeps a stop-only stream as EMPTY_RESPONSE", async () => {
    await expect(collect(chatStream([
      { choices: [{ delta: {}, finish_reason: "stop" }] },
    ]))).rejects.toMatchObject({ code: "EMPTY_RESPONSE" });
  });

  it("keeps the existing text stream shape", async () => {
    await expect(collect(chatStream([
      { choices: [{ delta: { content: "hello" }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: "stop" }] },
    ]))).resolves.toEqual([
      { type: "block-start", index: 0, blockType: "text" },
      { type: "text-delta", index: 0, text: "hello" },
      { type: "block-end", index: 0, block: { type: "text", text: "hello" } },
      { type: "finish", reason: { kind: "stop" } },
    ]);
  });

  it("preserves interleaved parallel tool calls", async () => {
    await expect(collect(chatStream([
      { choices: [{ delta: { tool_calls: [
        { index: 0, id: "call_a", function: { name: "read", arguments: '{"path":' } },
        { index: 1, id: "call_b", function: { name: "glob", arguments: '{"pattern":' } },
      ] }, finish_reason: null }] },
      { choices: [{ delta: { tool_calls: [
        { index: 0, function: { arguments: '"README.md"}' } },
        { index: 1, function: { arguments: '"*.ts"}' } },
      ] }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
    ]))).resolves.toEqual([
      { type: "block-start", index: 0, blockType: "tool-call" },
      { type: "tool-call-delta", index: 0, id: "call_a", name: "read", argumentsDelta: '{"path":' },
      { type: "block-start", index: 1, blockType: "tool-call" },
      { type: "tool-call-delta", index: 1, id: "call_b", name: "glob", argumentsDelta: '{"pattern":' },
      { type: "tool-call-delta", index: 0, id: "call_a", name: "read", argumentsDelta: '"README.md"}' },
      { type: "tool-call-delta", index: 1, id: "call_b", name: "glob", argumentsDelta: '"*.ts"}' },
      {
        type: "block-end",
        index: 0,
        block: { type: "tool-call", id: "call_a", name: "read", arguments: '{"path":"README.md"}' },
      },
      {
        type: "block-end",
        index: 1,
        block: { type: "tool-call", id: "call_b", name: "glob", arguments: '{"pattern":"*.ts"}' },
      },
      { type: "finish", reason: { kind: "tool-calls" } },
    ]);
  });

  it("uses a wire-index fallback only when a tool call omits its id", async () => {
    await expect(collect(chatStream([
      { choices: [{ delta: { tool_calls: [
        { index: 7, function: { name: "read", arguments: "{}" } },
      ] }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
    ]))).resolves.toEqual([
      { type: "block-start", index: 0, blockType: "tool-call" },
      {
        type: "tool-call-delta",
        index: 0,
        id: "chat-tool-call-7",
        name: "read",
        argumentsDelta: "{}",
      },
      {
        type: "block-end",
        index: 0,
        block: { type: "tool-call", id: "chat-tool-call-7", name: "read", arguments: "{}" },
      },
      { type: "finish", reason: { kind: "tool-calls" } },
    ]);
  });

  it("waits for a provider id before falling back", async () => {
    const chunks = await collect(chatStream([
      { choices: [{ delta: { tool_calls: [
        { index: 3, function: { name: "read", arguments: "{" } },
      ] }, finish_reason: null }] },
      { choices: [{ delta: { tool_calls: [
        { index: 3, id: "call_late", function: { arguments: "}" } },
      ] }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
    ]));

    expect(chunks.filter((chunk) => chunk.type === "tool-call-delta")).toEqual([
      { type: "tool-call-delta", index: 0, id: "call_late", name: "read", argumentsDelta: "{" },
      { type: "tool-call-delta", index: 0, id: "call_late", name: "read", argumentsDelta: "}" },
    ]);
    expect(chunks).not.toContainEqual(expect.objectContaining({ id: "chat-tool-call-3" }));
  });

  it("closes reasoning and text before opening a tool call", async () => {
    await expect(collect(chatStream([
      { choices: [{ delta: { reasoning_content: "inspect" }, finish_reason: null }] },
      { choices: [{ delta: { content: "checking" }, finish_reason: null }] },
      { choices: [{ delta: { tool_calls: [
        { index: 0, id: "call_1", function: { name: "read", arguments: "{}" } },
      ] }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
    ]))).resolves.toEqual([
      { type: "block-start", index: 0, blockType: "reasoning" },
      { type: "reasoning-delta", index: 0, text: "inspect" },
      { type: "block-end", index: 0, block: { type: "reasoning", text: "inspect" } },
      { type: "block-start", index: 1, blockType: "text" },
      { type: "text-delta", index: 1, text: "checking" },
      { type: "block-end", index: 1, block: { type: "text", text: "checking" } },
      { type: "block-start", index: 2, blockType: "tool-call" },
      { type: "tool-call-delta", index: 2, id: "call_1", name: "read", argumentsDelta: "{}" },
      {
        type: "block-end",
        index: 2,
        block: { type: "tool-call", id: "call_1", name: "read", arguments: "{}" },
      },
      { type: "finish", reason: { kind: "tool-calls" } },
    ]);
  });
});

describe("toChatMessages", () => {
  it("keeps text-only content as a string", () => {
    expect(toChatMessages("sys", [
      { role: "user", content: [{ type: "text", text: "hello" }] },
    ])).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "hello" },
    ]);
  });

  it("inlines images as data URLs", () => {
    expect(toChatMessages(undefined, [
      {
        role: "user",
        content: [
          { type: "text", text: "look" },
          { type: "image", mediaType: "image/png", dataBase64: "abc" },
        ],
      },
    ])).toEqual([{
      role: "user",
      content: [
        { type: "text", text: "look" },
        { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
      ],
    }]);
  });

  it("serializes assistant tool calls and user tool results at role boundaries", () => {
    expect(toChatMessages(undefined, [
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "inspect" },
          { type: "text", text: "checking" },
          { type: "tool-call", id: CallId("call_1"), name: "read", arguments: '{"path":"README.md"}' },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool-result", toolCallId: CallId("call_1"), content: [{ type: "text", text: "ok" }] },
        ],
      },
    ])).toEqual([
      {
        role: "assistant",
        content: "checking",
        reasoning_content: "inspect",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "read", arguments: '{"path":"README.md"}' },
          },
        ],
      },
      { role: "tool", tool_call_id: "call_1", content: "ok" },
    ]);
  });

  it("marks an empty tool result instead of dropping it", () => {
    expect(toChatMessages(undefined, [{
      role: "user",
      content: [{ type: "tool-result", toolCallId: CallId("call_1"), content: [] }],
    }])).toEqual([{ role: "tool", tool_call_id: "call_1", content: "(no output)" }]);
  });
});

describe("toChatTools", () => {
  it("serializes OpenAI function tools", () => {
    expect(toChatTools([{
      name: "read",
      description: "Read",
      parameters: { type: "object" },
    }])).toEqual([{
      type: "function",
      function: { name: "read", description: "Read", parameters: { type: "object" } },
    }]);
  });
});
