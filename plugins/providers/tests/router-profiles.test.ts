import { describe, expect, it } from "vitest";
import { decideRoute } from "../src/router/decision.ts";
import {
  buildAuthorizedInventory,
  NEUTRAL_PROFILE,
} from "../src/router/inventory.ts";
import { PROFILE_VERSION, routeProfile } from "../src/router/profiles.ts";

describe("routeProfile", () => {
  it("is a versioned heuristic, not a benchmark claim", () => {
    expect(PROFILE_VERSION).toBe(1);
  });

  it("gives first-party subscription models distinct quality/speed/cost/code scores", () => {
    const k3 = routeProfile("kimi", "k3");
    const fastCode = routeProfile("kimi", "kimi-for-coding-highspeed");
    const opus = routeProfile("claude", "claude-opus-4-5");
    const haiku = routeProfile("claude", "claude-haiku-4-5");
    expect(k3.quality).toBeGreaterThan(fastCode.quality);
    expect(fastCode.speed).toBeGreaterThan(k3.speed);
    expect(fastCode.code).toBe(true);
    expect(opus.quality).toBeGreaterThan(haiku.quality);
    expect(haiku.speed).toBeGreaterThan(opus.speed);
  });

  it("applies conservative model-family rules to API ids and leaves unknowns neutral", () => {
    const reasoner = routeProfile("deepseek", "deepseek-reasoner");
    const flash = routeProfile("deepseek", "deepseek-v4-flash");
    const unknown = routeProfile("custom-foo", "totally-unknown-model");
    expect(reasoner.quality).toBeGreaterThan(flash.quality);
    expect(flash.speed).toBeGreaterThan(reasoner.speed);
    expect(unknown).toEqual(NEUTRAL_PROFILE);
    expect(routeProfile("other", "totally-unknown-model")).toEqual(
      NEUTRAL_PROFILE,
    );
  });

  it("does not rank by provider identity", () => {
    expect(routeProfile("kimi", "totally-unknown-model")).toEqual(
      routeProfile("claude", "totally-unknown-model"),
    );
  });

  it("matches fast/cheap tokens, not MiniMax or other substrings", () => {
    expect(routeProfile("minimax", "minimax-m2")).toEqual(NEUTRAL_PROFILE);
    expect(routeProfile("minimax", "MiniMax-Text-01")).toEqual(NEUTRAL_PROFILE);
    expect(routeProfile("openai", "gpt-4o-mini").speed).toBe(5);
    expect(routeProfile("google", "gemini-2.0-flash").speed).toBe(5);
    expect(routeProfile("anthropic", "claude-3-haiku").speed).toBe(5);
    expect(routeProfile("google", "gemini-2.0-nano").speed).toBe(5);
    expect(routeProfile("kimi", "coder-highspeed").speed).toBe(5);
  });
});

describe("production inventory profiles", () => {
  it("lets a known quality model beat a known fast/cheap model under quality", async () => {
    const inventory = await buildAuthorizedInventory({
      subscriptions: [
        {
          provider: "kimi",
          loggedIn: true,
          models: [{ id: "k3" }, { id: "kimi-for-coding-highspeed" }],
        },
      ],
      apis: [
        {
          provider: "deepseek",
          displayName: "DeepSeek",
          configured: true,
          registered: true,
          models: [
            { id: "deepseek-reasoner" },
            { id: "totally-unknown-model" },
          ],
        },
      ],
      profileFor: routeProfile,
      now: 1,
    });
    const byId = Object.fromEntries(
      inventory.candidates.map((model) => [model.model, model]),
    );
    expect(byId["totally-unknown-model"]?.profile).toEqual(NEUTRAL_PROFILE);
    expect(byId.k3?.profile.quality).toBeGreaterThan(
      byId["kimi-for-coding-highspeed"]?.profile.quality ?? 0,
    );
    const decision = decideRoute({
      text: "解释一下这个函数做什么",
      inventory,
      switchMargin: 0,
    });
    expect(decision.selected.model).toBe("k3");
    expect(decision.objective).toBe("quality");
  });
});
