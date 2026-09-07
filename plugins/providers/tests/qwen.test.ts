import { CallId, MessageId } from "@deepseek-ai/dsh-llm";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { QwenSession } from "../src/auth/store.ts";
import { TokenManager } from "../src/providers/common.ts";
import { QwenAdapter, qwenModalities } from "../src/providers/qwen.ts";

afterEach(() => vi.unstubAllGlobals());

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const chunks: T[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

it("forwards tools and preserves a tool-result continuation", async () => {
  const tokens = new TokenManager<QwenSession>({
    displayName: "Test", preemptMs: 0,
    load: async () => ({ accessToken: "synthetic", refreshToken: "synthetic-r", expiresAt: 9e15 }),
    saveIfCurrent: async () => true, removeIfCurrent: async () => true,
    refresh: async current => current, isPermanent: () => false,
  });
  const adapter = new QwenAdapter({ tokens, streamIdleTimeoutMs: 1_000 });
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(bodies.length === 1
      ? 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_read","function":{"name":"read","arguments":"{}"}}]},"finish_reason":null}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'
      : 'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n');
  });
  const first = await collect(adapter.stream({ provider: "qwen", model: "coder-model", messages: [],
    tools: [{ name: "read", description: "Read", parameters: { type: "object" } }] }));
  const second = await collect(adapter.stream({ provider: "qwen", model: "coder-model", messages: [
    { id: MessageId("assistant"), source: { kind: "model", provider: "qwen", model: "coder-model" }, role: "assistant", content: [{ type: "tool-call", id: CallId("call_read"), name: "read", arguments: "{}" }] },
    { id: MessageId("result"), source: { kind: "tool", callId: CallId("call_read") }, role: "user", content: [{ type: "tool-result", toolCallId: CallId("call_read"), content: [{ type: "text", text: "result" }] }] },
  ] }));
  expect(first.at(-1)).toEqual({ type: "finish", reason: { kind: "tool-calls" } });
  expect(second.at(-1)).toEqual({ type: "finish", reason: { kind: "stop" } });
  expect(bodies[0]?.tools).toEqual([{ type: "function", function: { name: "read", description: "Read", parameters: { type: "object" } } }]);
  expect(bodies[1]).not.toHaveProperty("tools");
  expect(bodies[1]?.messages).toEqual([
    { role: "assistant", content: "", tool_calls: [{ id: "call_read", type: "function", function: { name: "read", arguments: "{}" } }] },
    { role: "tool", tool_call_id: "call_read", content: "result" },
  ]);
});

describe("qwenModalities", () => {
  it("marks vision models as image-capable and coder as text-only", () => {
    expect(qwenModalities("vision-model")).toEqual(["text", "image"]);
    expect(qwenModalities("coder-model")).toEqual(["text"]);
  });
});

describe("QwenAdapter.resolveModel", () => {
  it("exposes those modalities on the resolved route", async () => {
    const tokens = new TokenManager<QwenSession>({
      displayName: "Test",
      preemptMs: 0,
      load: async () => undefined,
      saveIfCurrent: async () => true,
      removeIfCurrent: async () => true,
      refresh: async (session) => session,
      isPermanent: () => false,
    });
    const adapter = new QwenAdapter({ tokens, streamIdleTimeoutMs: 1 });
    expect((await adapter.resolveModel("qwen", "vision-model")).inputModalities).toEqual(["text", "image"]);
    expect((await adapter.resolveModel("qwen", "coder-model")).inputModalities).toEqual(["text"]);
  });
});
