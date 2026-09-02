import { afterEach, describe, expect, it, vi } from "vitest";
import { isKimiPermanentRefreshError, KimiAdapter } from "../src/providers/kimi.ts";
import { TokenManager } from "../src/providers/common.ts";
import type { KimiSession } from "../src/auth/store.ts";

function kimiTokens(session?: KimiSession): TokenManager<KimiSession> {
  return new TokenManager<KimiSession>({
    displayName: "Test",
    preemptMs: 0,
    load: async () => session,
    save: async () => undefined,
    remove: async () => undefined,
    refresh: async (current) => current,
    isPermanent: () => false,
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

describe("isKimiPermanentRefreshError", () => {
  it("treats expired grants as logout and rate limits as transient", () => {
    expect(isKimiPermanentRefreshError(new Error("登录已失效，请重新点登录"))).toBe(true);
    expect(isKimiPermanentRefreshError(new Error("invalid_grant"))).toBe(true);
    expect(isKimiPermanentRefreshError(new Error("授权服务暂时不可用，请稍后再试"))).toBe(false);
    expect(isKimiPermanentRefreshError(new Error("授权没有完成，请再试一次"))).toBe(false);
  });
});

describe("KimiAdapter.resolveModel", () => {
  it("declares image input so generated pictures can attach", async () => {
    const adapter = new KimiAdapter({ tokens: kimiTokens(), streamIdleTimeoutMs: 1 });
    expect((await adapter.resolveModel("kimi", "k3")).inputModalities).toEqual(["text", "image"]);
  });
});

describe("KimiAdapter.stream", () => {
  it("sends top-level tools only when non-empty", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response([
        'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
        "data: [DONE]",
        "",
      ].join("\n\n"), { status: 200, headers: { "content-type": "text/event-stream" } });
    }));
    const adapter = new KimiAdapter({
      tokens: kimiTokens({
        accessToken: "token",
        refreshToken: "refresh",
        expiresAt: Date.now() + 60_000,
      }),
      streamIdleTimeoutMs: 1_000,
    });
    const request = {
      provider: "kimi",
      model: "k3",
      messages: [],
    };

    await collect(adapter.stream({
      ...request,
      tools: [{ name: "read", description: "Read", parameters: { type: "object" } }],
    }));
    await collect(adapter.stream(request));

    expect(bodies[0]?.tools).toEqual([{
      type: "function",
      function: { name: "read", description: "Read", parameters: { type: "object" } },
    }]);
    expect(bodies[1]).not.toHaveProperty("tools");
  });
});
