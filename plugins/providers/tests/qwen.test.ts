import { describe, expect, it } from "vitest";
import type { QwenSession } from "../src/auth/store.ts";
import { TokenManager } from "../src/providers/common.ts";
import { QwenAdapter, qwenModalities } from "../src/providers/qwen.ts";

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
      save: async () => undefined,
      remove: async () => undefined,
      refresh: async (session) => session,
      isPermanent: () => false,
    });
    const adapter = new QwenAdapter({ tokens, streamIdleTimeoutMs: 1 });
    expect((await adapter.resolveModel("qwen", "vision-model")).inputModalities).toEqual(["text", "image"]);
    expect((await adapter.resolveModel("qwen", "coder-model")).inputModalities).toEqual(["text"]);
  });
});
