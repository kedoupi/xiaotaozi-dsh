import { describe, expect, it } from "vitest";
import { loadApiVendors, mergeModelCatalog, normalizeBaseUrl, pickedIds, saveHostModels } from "../src/client/host-api.ts";
import type { ApiVendor, HostApi } from "../src/client/host-api.ts";

describe("mergeModelCatalog", () => {
  it("never drops a model once seen", () => {
    const merged = mergeModelCatalog(
      [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }],
      [{ id: "a", name: "A" }, { id: "c", name: "C" }],
    );
    expect(merged.map((model) => model.id)).toEqual(["a", "b", "c"]);
  });

  it("upgrades http and strips a trailing slash", () => {
    expect(normalizeBaseUrl("http://tzai.kdp.cool/")).toBe("https://tzai.kdp.cool");
  });

  it("keeps http on loopback", () => {
    expect(normalizeBaseUrl("http://127.0.0.1:11434/")).toBe("http://127.0.0.1:11434");
    expect(normalizeBaseUrl("http://localhost:1234")).toBe("http://localhost:1234");
  });

  it("prefers a real display name over a raw id", () => {
    const merged = mergeModelCatalog(
      [{ id: "k3", name: "k3" }],
      [{ id: "k3", name: "Kimi K3" }],
    );
    expect(merged).toEqual([{ id: "k3", name: "Kimi K3" }]);
  });
});

describe("pickedIds", () => {
  it("treats a missing models field as all-on", () => {
    expect(pickedIds({ baseURL: "https://example" })).toBeUndefined();
  });

  it("treats an empty models list as all-off", () => {
    expect(pickedIds({ models: [] })).toEqual([]);
  });

  it("keeps configured model ids", () => {
    expect(pickedIds({ models: [{ id: "k3" }, { id: "k3-256k", name: "256K" }] })).toEqual(["k3", "k3-256k"]);
  });
});

describe("saveHostModels", () => {
  it("writes an empty models list instead of no-op", async () => {
    const ops: unknown[] = [];
    const api = {
      llm: {
        providers: async () => ({ result: { ok: true as const, value: { providers: [] } } }),
        models: async () => ({ result: { ok: true as const, value: { groups: [] } } }),
        discoverModels: async () => ({ result: { ok: true as const, value: { models: [] } } }),
      },
      settings: {
        describe: async () => ({
          result: {
            ok: true as const,
            value: { namespaces: [{ ns: "llm-foo", value: { models: [{ id: "a" }] }, revision: 3 }] },
          },
        }),
        mutate: async (payload: unknown) => {
          ops.push(payload);
          return { result: { ok: true as const, value: {} } };
        },
      },
      credentials: {
        describe: async () => ({ result: { ok: true as const, value: { credentials: {} } } }),
        set: async () => ({ result: { ok: true as const, value: {} } }),
        unset: async () => ({ result: { ok: true as const, value: {} } }),
      },
    } satisfies HostApi;
    const vendor: ApiVendor = {
      id: "foo",
      name: "Foo",
      ref: "FOO_API_KEY",
      configured: true,
      declared: true,
      featured: true,
      settingsNs: "llm-foo",
      settingsPath: [],
    };
    expect(await saveHostModels(api, vendor, [], [{ id: "a", name: "A" }])).toBeUndefined();
    expect(ops).toEqual([{
      ns: "llm-foo",
      expectedRevision: 3,
      ops: [{ op: "set", path: ["models"], value: [] }],
    }]);
  });
});

describe("loadApiVendors", () => {
  it("marks a launch-environment key as not writable", async () => {
    const api = {
      llm: {
        providers: async () => ({
          result: {
            ok: true as const,
            value: {
              providers: [{
                provider: "tzai",
                displayName: "tzai",
                settingsNs: "llm-pi-ai",
                settingsPath: ["providers", "tzai"],
                declared: true,
              }],
            },
          },
        }),
        models: async () => ({ result: { ok: true as const, value: { groups: [] } } }),
        discoverModels: async () => ({ result: { ok: true as const, value: { models: [] } } }),
      },
      settings: {
        describe: async () => ({
          result: {
            ok: true as const,
            value: {
              namespaces: [{
                ns: "llm-pi-ai",
                value: { providers: { tzai: { apiKeyEnv: "TZAI_API_KEY", baseURL: "https://tzai.kdp.cool" } } },
              }],
            },
          },
        }),
        mutate: async () => ({ result: { ok: true as const, value: {} } }),
      },
      credentials: {
        describe: async () => ({
          result: {
            ok: true as const,
            value: { credentials: { TZAI_API_KEY: { configured: true, writable: false, source: "env" } } },
          },
        }),
        set: async () => ({ result: { ok: true as const, value: {} } }),
        unset: async () => ({ result: { ok: true as const, value: {} } }),
      },
    } satisfies HostApi;
    const loaded = await loadApiVendors(api, new Set());
    expect(loaded.vendors).toEqual([expect.objectContaining({
      id: "tzai",
      configured: true,
      writable: false,
    })]);
  });
});
