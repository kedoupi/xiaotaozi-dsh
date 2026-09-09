import { describe, expect, it } from "vitest";
import { getPath, keyRef, pickedIds } from "../src/provider-profile.ts";
import {
  assertSelectedAuthorized,
  buildAuthorizedInventory,
  NEUTRAL_PROFILE,
  RouterAuthorizationError,
} from "../src/router/inventory.ts";
import type {
  AuthorizedModel,
  InventoryInput,
} from "../src/router/inventory.ts";

function model(id: string, name = id): { id: string; name: string } {
  return { id, name };
}

function snapshot(overrides: Partial<InventoryInput> = {}): InventoryInput {
  return {
    subscriptions: [
      {
        provider: "kimi",
        loggedIn: true,
        models: [model("k3", "Kimi K3"), model("k3-256k", "Kimi K3 256K")],
      },
    ],
    apis: [
      {
        provider: "deepseek",
        displayName: "DeepSeek",
        configured: true,
        registered: true,
        models: [model("deepseek-chat"), model("deepseek-reasoner")],
      },
    ],
    now: 1_700_000_000_000,
    ...overrides,
  };
}

function refs(inventory: { candidates: readonly AuthorizedModel[] }): string[] {
  return inventory.candidates.map((candidate) => candidate.ref);
}

describe("provider-profile", () => {
  it("walks a nested settings path and stops on missing keys", () => {
    expect(
      getPath({ providers: { deepseek: { models: [] } } }, [
        "providers",
        "deepseek",
      ]),
    ).toEqual({ models: [] });
    expect(
      getPath({ providers: {} }, ["providers", "deepseek", "models"]),
    ).toBeUndefined();
  });

  it("builds a credential ref from apiKeyEnv or the provider id", () => {
    expect(keyRef("deepseek", { apiKeyEnv: "MY_KEY" })).toBe("MY_KEY");
    expect(keyRef("open-router", {})).toBe("OPEN_ROUTER_API_KEY");
  });

  it("keeps the host pickedIds contract", () => {
    expect(pickedIds({ baseURL: "https://example" })).toBeUndefined();
    expect(pickedIds({ models: [] })).toEqual([]);
    expect(
      pickedIds({ models: [{ id: "k3" }, { id: "k3-256k", name: "256K" }] }),
    ).toEqual(["k3", "k3-256k"]);
  });
});

describe("buildAuthorizedInventory", () => {
  it("drops a logged-out subscription even when a static catalog is supplied", async () => {
    const inventory = await buildAuthorizedInventory(
      snapshot({
        subscriptions: [
          {
            provider: "kimi",
            loggedIn: false,
            models: [model("k3"), model("kimi-for-coding")],
          },
        ],
        apis: [],
      }),
    );
    expect(inventory.candidates).toEqual([]);
  });

  it("treats a missing subscription pick as all advertised models", async () => {
    const inventory = await buildAuthorizedInventory(snapshot({ apis: [] }));
    expect(refs(inventory)).toEqual(["kimi/k3", "kimi/k3-256k"]);
    expect(
      inventory.candidates.every(
        (candidate) => candidate.source === "subscription",
      ),
    ).toBe(true);
  });

  it("treats an empty subscription pick as all-off", async () => {
    const inventory = await buildAuthorizedInventory(
      snapshot({
        subscriptions: [
          {
            provider: "kimi",
            loggedIn: true,
            models: [model("k3"), model("k3-256k")],
            picked: [],
          },
        ],
        apis: [],
      }),
    );
    expect(inventory.candidates).toEqual([]);
  });

  it("keeps only checked subscription models", async () => {
    const inventory = await buildAuthorizedInventory(
      snapshot({
        subscriptions: [
          {
            provider: "kimi",
            loggedIn: true,
            models: [model("k3"), model("k3-256k")],
            picked: ["k3-256k"],
          },
        ],
        apis: [],
      }),
    );
    expect(refs(inventory)).toEqual(["kimi/k3-256k"]);
  });

  it("drops an API provider without a configured credential", async () => {
    const inventory = await buildAuthorizedInventory(
      snapshot({
        subscriptions: [],
        apis: [
          {
            provider: "deepseek",
            displayName: "DeepSeek",
            configured: false,
            registered: true,
            models: [model("deepseek-chat")],
          },
        ],
      }),
    );
    expect(inventory.candidates).toEqual([]);
  });

  it("drops an unregistered API route even when a key is configured", async () => {
    const inventory = await buildAuthorizedInventory(
      snapshot({
        subscriptions: [],
        apis: [
          {
            provider: "deepseek",
            displayName: "DeepSeek",
            configured: true,
            registered: false,
            models: [model("deepseek-chat")],
          },
        ],
      }),
    );
    expect(inventory.candidates).toEqual([]);
  });

  it("keeps only checked API models from the proactive listModels catalog", async () => {
    const inventory = await buildAuthorizedInventory(
      snapshot({
        subscriptions: [],
        apis: [
          {
            provider: "deepseek",
            displayName: "DeepSeek",
            configured: true,
            registered: true,
            models: [model("deepseek-chat"), model("deepseek-reasoner")],
            picked: ["deepseek-reasoner", "unlisted-pro"],
          },
        ],
      }),
    );
    expect(refs(inventory)).toEqual(["deepseek/deepseek-reasoner"]);
  });

  it("does not invent image or context capability when resolve omits them", async () => {
    const inventory = await buildAuthorizedInventory(
      snapshot({
        apis: [],
        resolve: async () => ({}),
      }),
    );
    expect(inventory.candidates[0]?.inputModalities).toBeUndefined();
    expect(inventory.candidates[0]?.contextWindow).toBeUndefined();
    expect(inventory.candidates[0]?.profile).toEqual({
      quality: 3,
      speed: 3,
      cost: 3,
    });
  });

  it("records known image and context facts without guessing the rest", async () => {
    const inventory = await buildAuthorizedInventory(
      snapshot({
        subscriptions: [
          {
            provider: "kimi",
            loggedIn: true,
            models: [model("vision-model", "Qwen Vision")],
          },
        ],
        apis: [],
        resolve: async () => ({
          inputModalities: ["text", "image"],
          contextWindow: 128_000,
          reasoningEfforts: ["low"],
        }),
      }),
    );
    expect(inventory.candidates).toEqual([
      expect.objectContaining({
        ref: "kimi/vision-model",
        inputModalities: ["text", "image"],
        contextWindow: 128_000,
        reasoningEfforts: ["low"],
      }),
    ]);
  });

  it("excludes hidden API routes from the proactive catalog", async () => {
    const inventory = await buildAuthorizedInventory(
      snapshot({
        subscriptions: [],
        apis: [
          {
            provider: "openai-codex",
            displayName: "OpenAI Codex",
            configured: true,
            registered: true,
            models: [model("gpt-5.1-codex")],
            hidden: true,
          },
        ],
      }),
    );
    expect(inventory.candidates).toEqual([]);
  });

  it("preserves only authorized production-shaped sources and adapter capabilities", async () => {
    const inventory = await buildAuthorizedInventory({
      subscriptions: [
        {
          provider: "kimi",
          loggedIn: true,
          models: [model("k3"), model("vision-model")],
          picked: ["k3", "vision-model"],
        },
        {
          provider: "logged-out",
          loggedIn: false,
          models: [model("should-not-appear")],
        },
      ],
      apis: [
        {
          provider: "disabled",
          displayName: "Disabled",
          configured: false,
          registered: true,
          models: [model("not-configured")],
        },
        {
          provider: "picked-off",
          displayName: "Picked off",
          configured: true,
          registered: true,
          models: [model("not-picked")],
          picked: [],
        },
        {
          provider: "custom",
          displayName: "Custom",
          configured: true,
          registered: true,
          models: [model("working"), model("resolver-rejects")],
        },
      ],
      profileFor: (provider, modelId) =>
        provider === "custom" && modelId === "working"
          ? { quality: 5, speed: 3, cost: 2 }
          : NEUTRAL_PROFILE,
      resolve: async (_provider, modelId) => {
        if (modelId === "resolver-rejects") throw new Error("unavailable");
        if (modelId === "vision-model")
          return { inputModalities: ["text", "image"] };
        return {};
      },
      now: 1,
    });

    expect(refs(inventory)).toEqual([
      "kimi/k3",
      "kimi/vision-model",
      "custom/working",
      "custom/resolver-rejects",
    ]);
    expect(
      inventory.candidates.find(
        (candidate) => candidate.ref === "custom/working",
      )?.source,
    ).toBe("api");
    expect(
      inventory.candidates.find(
        (candidate) => candidate.ref === "custom/working",
      )?.profile.quality,
    ).toBe(5);
    expect(
      inventory.candidates.find(
        (candidate) => candidate.ref === "custom/resolver-rejects",
      )?.inputModalities,
    ).toBeUndefined();
    expect(
      assertSelectedAuthorized(
        { provider: "custom", model: "working" },
        inventory,
      ).ref,
    ).toBe("custom/working");
    expect(() =>
      assertSelectedAuthorized(
        { provider: "disabled", model: "not-configured" },
        inventory,
      ),
    ).toThrow(RouterAuthorizationError);
  });

  it("captures source model identity and rebuilds authorization after source mutation", async () => {
    const models = [model("before")];
    const source = {
      provider: "custom",
      displayName: "Custom",
      configured: true,
      registered: true,
      models,
    };
    const first = await buildAuthorizedInventory({
      subscriptions: [],
      apis: [source],
    });
    models[0]!.id = "after";
    const second = await buildAuthorizedInventory({
      subscriptions: [],
      apis: [source],
    });
    expect(refs(first)).toEqual(["custom/before"]);
    expect(refs(second)).toEqual(["custom/after"]);
    expect(first.generation).not.toBe(second.generation);
    expect(() =>
      assertSelectedAuthorized({ provider: "custom", model: "before" }, second),
    ).toThrow(RouterAuthorizationError);
    source.configured = false;
    expect(
      (await buildAuthorizedInventory({ subscriptions: [], apis: [source] }))
        .candidates,
    ).toEqual([]);
  });

  it("keeps a stable generation that changes with pick and credential state, not names", async () => {
    const first = await buildAuthorizedInventory(snapshot());
    const renamed = await buildAuthorizedInventory(
      snapshot({
        subscriptions: [
          {
            provider: "kimi",
            loggedIn: true,
            models: [model("k3", "Other Name"), model("k3-256k", "Other 256K")],
          },
        ],
      }),
    );
    const picked = await buildAuthorizedInventory(
      snapshot({
        subscriptions: [
          {
            provider: "kimi",
            loggedIn: true,
            models: [model("k3"), model("k3-256k")],
            picked: ["k3"],
          },
        ],
      }),
    );
    expect(first.generation).toBe(renamed.generation);
    expect(first.generation).not.toBe(picked.generation);
    expect(first.generation).toMatch(/^[0-9a-f]{16}$/);
    expect(first.capturedAt).toBe(1_700_000_000_000);
  });
});

describe("assertSelectedAuthorized", () => {
  it("returns the candidate when the selection is still in the snapshot", async () => {
    const inventory = await buildAuthorizedInventory(snapshot({ apis: [] }));
    expect(
      assertSelectedAuthorized({ provider: "kimi", model: "k3" }, inventory)
        .ref,
    ).toBe("kimi/k3");
  });

  it("fails closed when the selection left the authorized set", async () => {
    const inventory = await buildAuthorizedInventory(
      snapshot({
        subscriptions: [
          {
            provider: "kimi",
            loggedIn: true,
            models: [model("k3")],
            picked: [],
          },
        ],
        apis: [],
      }),
    );
    expect(() =>
      assertSelectedAuthorized({ provider: "kimi", model: "k3" }, inventory),
    ).toThrow(RouterAuthorizationError);
    expect(() =>
      assertSelectedAuthorized({ provider: "kimi", model: "k3" }, inventory),
    ).toThrow("当前模型已不再授权");
  });
});
