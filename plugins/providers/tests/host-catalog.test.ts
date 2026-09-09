import { describe, expect, it } from "vitest";
import { HOST_API_UNAVAILABLE, ensureCatalogRoutes, hostApiFromRemote, loadApiVendors, mergeModelCatalog, normalizeBaseUrl, pickedIds, removeApiKey, saveApiKey, saveHostModels, syncApiVendors } from "../src/client/host-api.ts";
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
  it("reports when the host API is missing instead of returning a silent empty list", async () => {
    expect(await loadApiVendors(undefined, new Set())).toEqual({
      vendors: [],
      error: HOST_API_UNAVAILABLE,
    });
  });

  it("unwraps nested ctx.remote.api host surfaces", () => {
    const llm = {
      providers: async () => ({ result: { ok: true as const, value: { providers: [] } } }),
      models: async () => ({ result: { ok: true as const, value: { groups: [] } } }),
      discoverModels: async () => ({ result: { ok: true as const, value: { models: [] } } }),
    };
    const settings = {
      describe: async () => ({ result: { ok: true as const, value: { namespaces: [] } } }),
      mutate: async () => ({ result: { ok: true as const, value: {} } }),
    };
    const credentials = {
      describe: async () => ({ result: { ok: true as const, value: { credentials: {} } } }),
      set: async () => ({ result: { ok: true as const, value: {} } }),
      unset: async () => ({ result: { ok: true as const, value: {} } }),
    };
    expect(hostApiFromRemote({ llm, settings, credentials })).toBeDefined();
    expect(hostApiFromRemote({ api: { llm, settings, credentials } })).toBeDefined();
    expect(hostApiFromRemote({ credentials })).toBeUndefined();
  });

  it("does not throw when remote llm/settings/credentials exist without the old method names", () => {
    expect(() => hostApiFromRemote({
      llm: {},
      settings: {},
      credentials: {},
    })).not.toThrow();
    expect(hostApiFromRemote({
      llm: {},
      settings: {},
      credentials: {},
    })).toBeUndefined();
  });

  it("adapts DSH 0.1.2 positional remote faces", async () => {
    const api = hostApiFromRemote({
      llm: {
        listConfigurableProviders: async () => ({
          ok: true as const,
          value: [{
            provider: "deepseek-official",
            displayName: "DeepSeek",
            settingsNs: "llm-pi-ai",
            settingsPath: ["providers", "deepseek-official"],
          }],
        }),
        discoverModels: async (settingsNs: string, request: { provider?: string }) => ({
          ok: true as const,
          value: [{ id: "deepseek-chat", name: "DeepSeek Chat" }],
          ...settingsNs === "llm-pi-ai" && request.provider === "deepseek-official" ? {} : {},
        }),
      },
      settings: {
        describe: async () => ({
          ok: true as const,
          value: { writable: true, hasDocument: true, namespaces: [] },
        }),
        mutate: async () => ({ ok: true as const, value: {} }),
      },
      credentials: {
        describe: async (refs: string[]) => ({
          ok: true as const,
          value: Object.fromEntries(refs.map((ref) => [ref, { configured: false, writable: true }])),
        }),
        set: async () => ({ ok: true as const, value: undefined }),
        unset: async () => ({ ok: true as const, value: undefined }),
      },
    });
    expect(api).toBeDefined();
    const loaded = await loadApiVendors(api, new Set());
    expect(loaded.error).toBeUndefined();
    expect(loaded.vendors).toEqual([expect.objectContaining({
      id: "deepseek-official",
      name: "DeepSeek",
      featured: true,
      configured: false,
    })]);
  });

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

function nvidiaVendor(overrides: Partial<ApiVendor> = {}): ApiVendor {
  return {
    id: "nvidia",
    name: "NVIDIA",
    ref: "NVIDIA_API_KEY",
    configured: false,
    declared: false,
    featured: true,
    settingsNs: "llm-pi-ai",
    settingsPath: ["providers", "nvidia"],
    ...overrides,
  };
}

function catalogHost(options?: {
  profile?: Record<string, unknown>;
  configured?: boolean;
  mutateError?: string;
  extraProviders?: Array<{
    provider: string;
    displayName: string;
    settingsPath: string[];
    profile?: Record<string, unknown>;
    configured?: boolean;
    declared?: boolean;
  }>;
}): {
  api: HostApi;
  mutates: unknown[];
  credentialOps: string[];
  describes: { count: number };
} {
  const mutates: unknown[] = [];
  const credentialOps: string[] = [];
  const describes = { count: 0 };
  const nvidiaProfile = options?.profile;
  const extra = options?.extraProviders ?? [];
  const providers = [{
    provider: "nvidia",
    displayName: "NVIDIA",
    settingsNs: "llm-pi-ai",
    settingsPath: ["providers", "nvidia"],
  }, ...extra.map((entry) => ({
    provider: entry.provider,
    displayName: entry.displayName,
    settingsNs: "llm-pi-ai",
    settingsPath: entry.settingsPath,
    ...entry.declared === true ? { declared: true } : {},
  }))];
  const profiles: Record<string, Record<string, unknown>> = {};
  if (nvidiaProfile !== undefined) profiles.nvidia = nvidiaProfile;
  for (const entry of extra) {
    if (entry.profile !== undefined) profiles[entry.provider] = entry.profile;
  }
  const api: HostApi = {
    llm: {
      providers: async () => ({ result: { ok: true as const, value: { providers } } }),
      models: async () => ({ result: { ok: true as const, value: { groups: [] } } }),
      discoverModels: async () => ({ result: { ok: true as const, value: { models: [] } } }),
    },
    settings: {
      describe: async () => {
        describes.count += 1;
        return {
          result: {
            ok: true as const,
            value: {
              namespaces: [{
                ns: "llm-pi-ai",
                value: { providers: profiles },
                revision: 4,
              }],
            },
          },
        };
      },
      mutate: async (payload) => {
        mutates.push(payload);
        if (options?.mutateError !== undefined) {
          return { result: { ok: false as const, error: { message: options.mutateError } } };
        }
        return { result: { ok: true as const, value: {} } };
      },
    },
    credentials: {
      describe: async () => ({
        result: {
          ok: true as const,
          value: {
            credentials: {
              NVIDIA_API_KEY: { configured: options?.configured === true, writable: true },
              ...Object.fromEntries(extra.map((entry) => [
                `${entry.provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`,
                { configured: entry.configured === true, writable: true },
              ])),
            },
          },
        },
      }),
      set: async () => {
        credentialOps.push("set");
        return { result: { ok: true as const, value: {} } };
      },
      unset: async () => {
        credentialOps.push("unset");
        return { result: { ok: true as const, value: {} } };
      },
    },
  };
  return { api, mutates, credentialOps, describes };
}

describe("catalog API routes", () => {
  it("writes apiKeyEnv when saving a catalog vendor key", async () => {
    const { api, mutates, credentialOps } = catalogHost();
    expect(await saveApiKey(api, nvidiaVendor(), "nvapi-test")).toBeUndefined();
    expect(credentialOps).toEqual(["set"]);
    expect(mutates).toEqual([{
      ns: "llm-pi-ai",
      expectedRevision: 4,
      ops: [{ op: "set", path: ["providers", "nvidia"], value: { apiKeyEnv: "NVIDIA_API_KEY" } }],
    }]);
  });

  it("keeps existing model picks when wiring apiKeyEnv", async () => {
    const { api, mutates } = catalogHost({
      profile: { models: [{ id: "google/gemma-3-12b-it", name: "Gemma 3 12B IT" }] },
    });
    expect(await saveApiKey(api, nvidiaVendor(), "nvapi-test")).toBeUndefined();
    expect(mutates).toEqual([{
      ns: "llm-pi-ai",
      expectedRevision: 4,
      ops: [{
        op: "set",
        path: ["providers", "nvidia"],
        value: {
          models: [{ id: "google/gemma-3-12b-it", name: "Gemma 3 12B IT" }],
          apiKeyEnv: "NVIDIA_API_KEY",
        },
      }],
    }]);
  });

  it("does not rewrite a catalog route that already has apiKeyEnv", async () => {
    const { api, mutates } = catalogHost({ profile: { apiKeyEnv: "NVIDIA_API_KEY" } });
    expect(await saveApiKey(api, nvidiaVendor({ configured: true }), "nvapi-test")).toBeUndefined();
    expect(mutates).toEqual([]);
  });

  it("does not write a catalog route for a declared custom vendor", async () => {
    const { api, mutates, credentialOps } = catalogHost();
    expect(await saveApiKey(api, nvidiaVendor({ declared: true, settingsPath: ["providers", "custom-acme"] }), "k")).toBeUndefined();
    expect(credentialOps).toEqual(["set"]);
    expect(mutates).toEqual([]);
  });

  it("rolls back a first-time key when the catalog route cannot be written", async () => {
    const { api, credentialOps } = catalogHost({ mutateError: "设置写入失败" });
    expect(await saveApiKey(api, nvidiaVendor(), "nvapi-test")).toBe("设置写入失败");
    expect(credentialOps).toEqual(["set", "unset"]);
  });

  it("keeps a replacement key when the catalog route cannot be written", async () => {
    const { api, credentialOps } = catalogHost({ mutateError: "设置写入失败" });
    expect(await saveApiKey(api, nvidiaVendor({ configured: true }), "nvapi-test")).toBe("设置写入失败");
    expect(credentialOps).toEqual(["set"]);
  });

  it("heals configured catalog vendors that have a key but no route", async () => {
    const { api, mutates } = catalogHost({ configured: true });
    expect(await ensureCatalogRoutes(api, [nvidiaVendor({ configured: true })])).toEqual({ wrote: true });
    expect(mutates).toEqual([{
      ns: "llm-pi-ai",
      expectedRevision: 4,
      ops: [{ op: "set", path: ["providers", "nvidia"], value: { apiKeyEnv: "NVIDIA_API_KEY" } }],
    }]);
  });

  it("writes one mutate for every unwired catalog vendor in the namespace", async () => {
    const { api, mutates } = catalogHost({
      configured: true,
      extraProviders: [{
        provider: "minimax",
        displayName: "MiniMax",
        settingsPath: ["providers", "minimax"],
        configured: true,
      }],
    });
    expect(await ensureCatalogRoutes(api, [
      nvidiaVendor({ configured: true }),
      nvidiaVendor({
        id: "minimax",
        name: "MiniMax",
        ref: "MINIMAX_API_KEY",
        configured: true,
        settingsPath: ["providers", "minimax"],
      }),
    ])).toEqual({ wrote: true });
    expect(mutates).toEqual([{
      ns: "llm-pi-ai",
      expectedRevision: 4,
      ops: [
        { op: "set", path: ["providers", "nvidia"], value: { apiKeyEnv: "NVIDIA_API_KEY" } },
        { op: "set", path: ["providers", "minimax"], value: { apiKeyEnv: "MINIMAX_API_KEY" } },
      ],
    }]);
  });

  it("skips unconfigured catalog vendors when healing", async () => {
    const { api, mutates } = catalogHost({ configured: false });
    expect(await ensureCatalogRoutes(api, [nvidiaVendor({ configured: false })])).toEqual({ wrote: false });
    expect(mutates).toEqual([]);
  });

  it("reloads vendors after healing missing catalog routes", async () => {
    const { api, mutates, describes } = catalogHost({ configured: true });
    const loaded = await syncApiVendors(api, new Set());
    expect(loaded.error).toBeUndefined();
    expect(mutates).toHaveLength(1);
    expect(describes.count).toBe(3);
  });

  it("does not reload when catalog routes are already wired", async () => {
    const { api, mutates, describes } = catalogHost({
      configured: true,
      profile: { apiKeyEnv: "NVIDIA_API_KEY" },
    });
    const loaded = await syncApiVendors(api, new Set());
    expect(loaded.error).toBeUndefined();
    expect(mutates).toEqual([]);
    expect(describes.count).toBe(2);
  });

  it("drops the catalog profile before clearing the key", async () => {
    const { api, mutates, credentialOps } = catalogHost({
      configured: true,
      profile: { apiKeyEnv: "NVIDIA_API_KEY" },
    });
    expect(await removeApiKey(api, nvidiaVendor({ configured: true }))).toBeUndefined();
    expect(mutates).toEqual([{
      ns: "llm-pi-ai",
      expectedRevision: 4,
      ops: [{ op: "unset", path: ["providers", "nvidia"] }],
    }]);
    expect(credentialOps).toEqual(["unset"]);
  });

  it("keeps the key when dropping the catalog profile fails", async () => {
    const { api, credentialOps } = catalogHost({
      configured: true,
      profile: { apiKeyEnv: "NVIDIA_API_KEY" },
      mutateError: "设置写入失败",
    });
    expect(await removeApiKey(api, nvidiaVendor({ configured: true }))).toBe("设置写入失败");
    expect(credentialOps).toEqual([]);
  });
});
