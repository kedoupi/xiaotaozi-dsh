import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chatCompletionDelta,
  streamChatCompletion,
  toChatMessages,
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
});
