import { describe, expect, it } from "vitest";
import { isKimiPermanentRefreshError, KimiAdapter } from "../src/providers/kimi.ts";
import { TokenManager } from "../src/providers/common.ts";
import type { KimiSession } from "../src/auth/store.ts";

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
    const tokens = new TokenManager<KimiSession>({
      displayName: "Test",
      preemptMs: 0,
      load: async () => undefined,
      save: async () => undefined,
      remove: async () => undefined,
      refresh: async (session) => session,
      isPermanent: () => false,
    });
    const adapter = new KimiAdapter({ tokens, streamIdleTimeoutMs: 1 });
    expect((await adapter.resolveModel("kimi", "k3")).inputModalities).toEqual(["text", "image"]);
  });
});
