import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isKimiPermanentRefreshError,
  kimiModalities,
  KimiAdapter,
} from "../src/providers/kimi.ts";
import { TokenManager } from "../src/providers/common.ts";
import type { KimiSession } from "../src/auth/store.ts";
import { buildAuthorizedInventory } from "../src/router/inventory.ts";
import { decideRoute, RouterDecisionError } from "../src/router/decision.ts";
import { routeProfile } from "../src/router/profiles.ts";

function kimiTokens(session?: KimiSession): TokenManager<KimiSession> {
  return new TokenManager<KimiSession>({
    displayName: "Test",
    preemptMs: 0,
    load: async () => session,
    saveIfCurrent: async () => true,
    removeIfCurrent: async () => true,
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
    expect(
      isKimiPermanentRefreshError(new Error("登录已失效，请重新点登录")),
    ).toBe(true);
    expect(isKimiPermanentRefreshError(new Error("invalid_grant"))).toBe(true);
    expect(
      isKimiPermanentRefreshError(new Error("授权服务暂时不可用，请稍后再试")),
    ).toBe(false);
    expect(
      isKimiPermanentRefreshError(new Error("授权没有完成，请再试一次")),
    ).toBe(false);
  });
});

describe("KimiAdapter.resolveModel", () => {
  it("keeps its logged-in advertised catalog text-only through production inventory", async () => {
    const fetchModels = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              { id: "k3", display_name: "Kimi K3" },
              {
                id: "vision-generate-attach",
                display_name: "Synthetic attach model",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchModels);
    const adapter = new KimiAdapter({
      tokens: kimiTokens({
        accessToken: "synthetic",
        refreshToken: "synthetic",
        expiresAt: Date.now() + 60_000,
      }),
      streamIdleTimeoutMs: 1,
    });
    const models = await adapter.listModels();
    expect(fetchModels).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      "https://api.kimi.com/coding/v1/models",
    );
    expect(models.map((model) => model.id)).toEqual([
      "k3",
      "vision-generate-attach",
    ]);
    expect(
      models.every((model) => model.inputModalities?.join() === "text"),
    ).toBe(true);
    const inventory = await buildAuthorizedInventory({
      subscriptions: [{ provider: "kimi", loggedIn: true, models }],
      apis: [],
      resolve: async (provider, model) => adapter.resolveModel(provider, model),
      profileFor: routeProfile,
    });
    expect(() =>
      decideRoute({ text: "look", hasImage: true, inventory }),
    ).toThrow(RouterDecisionError);
    expect(
      (await adapter.resolveModel("kimi", "vision-generate-attach"))
        .inputModalities,
    ).toEqual(["text"]);
    expect(fetchModels).toHaveBeenCalledTimes(1);
  });
  it("does not advertise inbound image; generate-attach is not vision", async () => {
    const adapter = new KimiAdapter({
      tokens: kimiTokens(),
      streamIdleTimeoutMs: 1,
    });
    expect(kimiModalities("k3")).toEqual(["text"]);
    expect((await adapter.resolveModel("kimi", "k3")).inputModalities).toEqual([
      "text",
    ]);
    expect(
      (await adapter.resolveModel("kimi", "kimi-for-coding")).inputModalities,
    ).toEqual(["text"]);
  });
});

describe("KimiAdapter.stream", () => {
  it("sends top-level tools only when non-empty", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(
          [
            'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}',
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
            "data: [DONE]",
            "",
          ].join("\n\n"),
          { status: 200, headers: { "content-type": "text/event-stream" } },
        );
      }),
    );
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

    await collect(
      adapter.stream({
        ...request,
        tools: [
          { name: "read", description: "Read", parameters: { type: "object" } },
        ],
      }),
    );
    await collect(adapter.stream(request));

    expect(bodies[0]?.tools).toEqual([
      {
        type: "function",
        function: {
          name: "read",
          description: "Read",
          parameters: { type: "object" },
        },
      },
    ]);
    expect(bodies[1]).not.toHaveProperty("tools");
  });
});
