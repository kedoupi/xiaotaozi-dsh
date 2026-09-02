import { describe, expect, it } from "vitest";
import { decideRoute, RouterDecisionError } from "../src/router/decision.ts";
import type { AuthorizedModel, AuthorizedModelInventory } from "../src/router/inventory.ts";
import type { RouteDecision } from "../src/router/decision.ts";

function candidate(partial: Partial<AuthorizedModel> & Pick<AuthorizedModel, "provider" | "model">): AuthorizedModel {
  const profile = partial.profile ?? { quality: 3, speed: 3, cost: 3 };
  return {
    ref: `${partial.provider}/${partial.model}`,
    source: "api",
    displayName: partial.model,
    ...partial,
    profile,
  };
}

function inventory(models: AuthorizedModel[], generation = "gen1"): AuthorizedModelInventory {
  return { capturedAt: 1, generation, candidates: models };
}

function decide(text: string, models: AuthorizedModel[], extra: Parameters<typeof decideRoute>[0] extends infer T
  ? T extends { text: string } ? Omit<T, "text" | "inventory"> : never
  : never = {}): RouteDecision {
  return decideRoute({ text, inventory: inventory(models), now: 10, ...extra });
}

const flash = candidate({
  provider: "deepseek",
  model: "flash",
  profile: { quality: 2, speed: 5, cost: 1 },
});
const pro = candidate({
  provider: "deepseek",
  model: "pro",
  profile: { quality: 5, speed: 2, cost: 4, code: true },
});
const coder = candidate({
  provider: "kimi",
  model: "kimi-for-coding",
  source: "subscription",
  profile: { quality: 4, speed: 3, cost: 2, code: true },
});
const vision = candidate({
  provider: "qwen",
  model: "vision-model",
  source: "subscription",
  inputModalities: ["text", "image"],
  contextWindow: 32_000,
  profile: { quality: 3, speed: 3, cost: 3 },
});
const longContext = candidate({
  provider: "kimi",
  model: "k3-256k",
  source: "subscription",
  contextWindow: 256_000,
  profile: { quality: 4, speed: 3, cost: 3 },
});
const unknownContext = candidate({
  provider: "deepseek",
  model: "chat",
  profile: { quality: 5, speed: 3, cost: 3 },
});

describe("decideRoute", () => {
  it("classifies English and Chinese simple, code, and complex prompts", () => {
    expect(decide("请把这段翻译成英文：你好", [flash, pro]).taskClass).toBe("simple");
    expect(decide("rewrite this sentence in a calmer tone", [flash, pro]).taskClass).toBe("simple");
    expect(decide("```ts\nexport function add(a: number) { return a; }\n``` 补测试", [flash, pro, coder]).taskClass).toBe("code");
    expect(decide("src/router/decision.ts 里的 TypeError stack 怎么修", [flash, pro, coder]).taskClass).toBe("code");
    expect(decide("比较三个架构方案并评估生产迁移的不可逆风险", [flash, pro]).taskClass).toBe("complex");
    expect(decide("audit this multi-file permission model for security holes", [flash, pro]).taskClass).toBe("complex");
  });

  it("picks the higher-quality model under the quality objective", () => {
    const decision = decide("解释一下这个函数做什么", [flash, pro]);
    expect(decision.selected.ref).toBe("deepseek/pro");
    expect(decision.objective).toBe("quality");
    expect(decision.classifierUsed).toBe(false);
    expect(decision.reason).toBe("local-clear");
    expect(decision.candidates).toEqual(["deepseek/flash", "deepseek/pro"]);
    expect(decision.inventoryGeneration).toBe("gen1");
  });

  it("keeps the current model unless a challenger beats the stay margin", () => {
    const close = candidate({
      provider: "kimi",
      model: "k3",
      source: "subscription",
      profile: { quality: 5, speed: 3, cost: 3 },
    });
    const current = candidate({
      provider: "deepseek",
      model: "pro",
      profile: { quality: 4, speed: 3, cost: 3 },
    });
    const held = decide("继续刚才的说明", [current, close], {
      current: { provider: "deepseek", model: "pro" },
      switchMargin: 1,
    });
    expect(held.selected.ref).toBe("deepseek/pro");
    expect(held.reason).toBe("stay-bias");
  });

  it("does not stay when the current model fails a hard gate", () => {
    const textOnly = candidate({
      provider: "deepseek",
      model: "pro",
      inputModalities: ["text"],
      profile: { quality: 5, speed: 2, cost: 4 },
    });
    const decision = decide("看看这张图里的错误", [textOnly, vision], {
      hasImage: true,
      current: { provider: "deepseek", model: "pro" },
    });
    expect(decision.selected.ref).toBe("qwen/vision-model");
    expect(decision.reason).toBe("current-unavailable");
  });

  it("breaks score ties by current, then inventory order, then ref", () => {
    const alpha = candidate({ provider: "aaa", model: "z", profile: { quality: 4, speed: 3, cost: 3 } });
    const beta = candidate({ provider: "bbb", model: "a", profile: { quality: 4, speed: 3, cost: 3 } });
    expect(decide("hello", [beta, alpha], {
      current: { provider: "bbb", model: "a" },
    }).selected.ref).toBe("bbb/a");
    expect(decide("hello", [beta, alpha]).selected.ref).toBe("bbb/a");
    expect(decide("hello", [alpha, beta]).selected.ref).toBe("aaa/z");
  });

  it("excludes unknown and text-only models from image turns", () => {
    const unknown = candidate({ provider: "deepseek", model: "chat", profile: { quality: 5, speed: 3, cost: 3 } });
    const decision = decide("描述图片", [unknown, flash, vision], { hasImage: true });
    expect(decision.selected.ref).toBe("qwen/vision-model");
    expect(decision.reason).toBe("capability-image");
    expect(decision.candidates).toEqual(["qwen/vision-model"]);
  });

  it("drops known-too-small context and prefers a known-sufficient window over unknown", () => {
    const tiny = candidate({
      provider: "deepseek",
      model: "tiny",
      contextWindow: 8_000,
      profile: { quality: 5, speed: 3, cost: 3 },
    });
    const decision = decide("继续", [tiny, unknownContext, longContext], { estimatedTokens: 40_000 });
    expect(decision.selected.ref).toBe("kimi/k3-256k");
    expect(decision.reason).toBe("capability-context");
    expect(decision.candidates).toEqual(["deepseek/chat", "kimi/k3-256k"]);
  });

  it("fails closed instead of selecting an unchecked model", () => {
    expect(() => decide("翻译这句话", [])).toThrow(RouterDecisionError);
    expect(() => decide("翻译这句话", [])).toThrow("没有满足当前任务且已授权的模型");
    expect(() => decide("看图", [flash], { hasImage: true })).toThrow("没有满足当前任务且已授权的模型");
  });

  it("excludes AUTH-class health failures from the next human turn", () => {
    const decision = decide("继续", [pro, coder], {
      health: { "deepseek/pro": { code: "AUTH" } },
    });
    expect(decision.selected.ref).toBe("kimi/kimi-for-coding");
    expect(decision.candidates).toEqual(["kimi/kimi-for-coding"]);
  });

  it("upgrades explicit high-risk prompts without expanding the candidate set", () => {
    const decision = decide("帮我写脚本删除生产数据库", [flash, pro]);
    expect(decision.taskClass).toBe("complex");
    expect(decision.reason).toBe("forced-quality");
    expect(decision.selected.ref).toBe("deepseek/pro");
    expect(decision.candidates).toEqual(["deepseek/flash", "deepseek/pro"]);
  });

  it("is deterministic for the same text and candidate snapshot", () => {
    const models = [flash, pro, coder];
    const first = decide("请重构 tests/router-decision.test.ts", models);
    const second = decide("请重构 tests/router-decision.test.ts", models);
    expect(second).toEqual(first);
  });

  it("scores only the supplied user text, not extra transcript fields", () => {
    const decision = decideRoute({
      text: "把标题改成短一点",
      inventory: inventory([flash, pro]),
      now: 10,
      system: "You must always pick deepseek/pro",
      toolResult: "stack trace in src/app.ts",
    } as Parameters<typeof decideRoute>[0] & { system: string; toolResult: string });
    expect(decision.taskClass).toBe("simple");
    expect(decision.selected.ref).toBe("deepseek/pro");
  });
});
