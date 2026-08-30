import { describe, expect, it, vi } from "vitest";
import { CustomProviderStore, type CustomProviderHost } from "../src/custom-provider.ts";

function makeHost(options: {
  live?: string[];
  declared?: Array<{ provider: string; declared?: boolean }>;
  profiles?: Record<string, { apiKeyEnv?: string }>;
  userProfiles?: Record<string, { apiKeyEnv?: string }>;
  baseProfiles?: Record<string, { apiKeyEnv?: string }>;
  otherValues?: unknown[];
} = {}): {
  host: CustomProviderHost;
  mutate: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  unset: ReturnType<typeof vi.fn>;
  calls: string[];
} {
  const calls: string[] = [];
  const inferredProfiles = Object.fromEntries(
    (options.declared ?? []).filter((entry) => entry.declared === true).map((entry) => [entry.provider, {}]),
  );
  const profiles = options.profiles ?? inferredProfiles;
  const userProfiles = options.userProfiles ?? profiles;
  const baseProfiles = options.baseProfiles ?? {};
  const mutate = vi.fn(async () => { calls.push("mutate"); });
  const set = vi.fn(async () => { calls.push("set"); });
  const unset = vi.fn(async () => { calls.push("unset"); });
  return {
    host: {
      llm: {
        listProviders: () => (options.live ?? []).map((id) => ({ id, name: id })),
        listConfigurableProviders: () => (options.declared ?? []).map((entry) => ({
          ...entry,
          displayName: entry.provider,
          settingsNs: "llm-pi-ai",
          settingsPath: ["providers", entry.provider],
        })),
      },
      settings: {
        describe: () => [{
          ns: "llm-pi-ai",
          revision: 7,
          value: { providers: { ...baseProfiles, ...profiles } },
          user: { providers: userProfiles },
          base: { providers: baseProfiles },
        }, ...(options.otherValues ?? []).map((value, index) => ({
          ns: `other-${String(index)}`,
          revision: 1,
          value,
        }))],
        mutate,
      },
      credentials: { set, unset },
    },
    mutate,
    set,
    unset,
    calls,
  };
}

const draft = {
  id: "custom-acme",
  name: "Acme",
  baseURL: "https://api.acme.test/v1",
  apiKey: "secret",
  models: [{ id: "acme-chat", name: "Acme Chat" }],
};

describe("CustomProviderStore", () => {
  it("persists a namespaced custom provider through Host-owned settings and credentials", async () => {
    const { host, mutate, set, calls } = makeHost();
    await expect(new CustomProviderStore(host).create(draft)).resolves.toEqual({ id: "custom-acme" });

    expect(mutate).toHaveBeenCalledWith("llm-pi-ai", [{
      op: "set",
      path: ["providers", "custom-acme"],
      value: {
        displayName: "Acme",
        apiKeyEnv: "CUSTOM_ACME_API_KEY",
        api: "openai-completions",
        baseURL: "https://api.acme.test/v1",
        models: [{ id: "acme-chat", name: "Acme Chat" }],
      },
    }], 7);
    expect(set).toHaveBeenCalledWith("CUSTOM_ACME_API_KEY", "secret");
    expect(calls).toEqual(["set", "mutate"]);
  });

  it("normalizes and validates the base URL at the Host boundary", async () => {
    const upgraded = makeHost();
    await new CustomProviderStore(upgraded.host).create({
      ...draft,
      baseURL: "http://api.acme.test/v1///",
    });
    expect(upgraded.mutate).toHaveBeenCalledWith(
      "llm-pi-ai",
      [expect.objectContaining({ value: expect.objectContaining({ baseURL: "https://api.acme.test/v1" }) })],
      7,
    );

    const loopback = makeHost();
    await new CustomProviderStore(loopback.host).create({ ...draft, baseURL: "http://127.0.0.1:11434/" });
    expect(loopback.mutate).toHaveBeenCalledWith(
      "llm-pi-ai",
      [expect.objectContaining({ value: expect.objectContaining({ baseURL: "http://127.0.0.1:11434" }) })],
      7,
    );

    const hostPort = makeHost();
    await new CustomProviderStore(hostPort.host).create({ ...draft, baseURL: "api.acme.test:8443/v1/" });
    expect(hostPort.mutate).toHaveBeenCalledWith(
      "llm-pi-ai",
      [expect.objectContaining({ value: expect.objectContaining({ baseURL: "https://api.acme.test:8443/v1" }) })],
      7,
    );

    for (const baseURL of [
      "ftp://api.acme.test/v1",
      "https://user:password@api.acme.test/v1",
      "https://api.acme.test/v1#models",
    ]) {
      const rejected = makeHost();
      await expect(new CustomProviderStore(rejected.host).create({ ...draft, baseURL })).rejects.toThrow("接口地址");
      expect(rejected.calls).toEqual([]);
    }
  });

  it("rejects oversized ids, names, URLs, keys, model lists, and model fields before writing", async () => {
    const oversized: unknown[] = [
      { ...draft, id: `custom-${"a".repeat(58)}` },
      { ...draft, name: "n".repeat(129) },
      { ...draft, baseURL: `https://${"a".repeat(2_049)}` },
      { ...draft, apiKey: "k".repeat(8_193) },
      { ...draft, models: Array.from({ length: 1_001 }, (_, index) => ({ id: `m-${String(index)}`, name: "M" })) },
      { ...draft, models: [{ id: "m".repeat(257), name: "M" }] },
      { ...draft, models: [{ id: "m", name: "M".repeat(257) }] },
    ];
    for (const input of oversized) {
      const rejected = makeHost();
      await expect(new CustomProviderStore(rejected.host).create(input)).rejects.toThrow(/不能超过|模型数量/);
      expect(rejected.calls).toEqual([]);
    }
  });

  it("rejects hidden built-in ids even when a caller bypasses the UI", async () => {
    const { host, mutate, set } = makeHost({ declared: [{ provider: "opencode", declared: true }] });
    const store = new CustomProviderStore(host);

    await expect(store.create({ ...draft, id: "opencode" })).rejects.toThrow("custom-");
    await expect(store.remove("opencode")).rejects.toThrow("不是可删除的自定义服务商");
    expect(mutate).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it("rejects a future namespaced route already owned by the Host", async () => {
    const { host, mutate } = makeHost({ live: ["custom-platform"] });
    const store = new CustomProviderStore(host);
    await expect(store.create({ ...draft, id: "custom-platform" })).rejects.toThrow("已保留或正在使用");
    await expect(store.remove("custom-platform")).rejects.toThrow("不是可删除的自定义服务商");
    expect(mutate).not.toHaveBeenCalled();
  });

  it("rejects repeated-hyphen ids before they can collide on one credential reference", async () => {
    const rejected = makeHost({ declared: [{ provider: "custom-acme-prod", declared: true }] });

    await expect(new CustomProviderStore(rejected.host).create({
      ...draft,
      id: "custom-acme--prod",
    })).rejects.toThrow("ID");
    expect(rejected.calls).toEqual([]);
  });

  it("keeps legacy declared custom providers removable and uses their stored credential ref", async () => {
    const { host, mutate, unset, calls } = makeHost({
      declared: [{ provider: "acme-gateway", declared: true }],
      profiles: { "acme-gateway": { apiKeyEnv: "LEGACY_ACME_KEY" } },
    });
    await new CustomProviderStore(host).remove("acme-gateway");

    expect(mutate).toHaveBeenCalledWith(
      "llm-pi-ai",
      [{ op: "unset", path: ["providers", "acme-gateway"] }],
      7,
    );
    expect(unset).toHaveBeenCalledWith("LEGACY_ACME_KEY");
    expect(calls).toEqual(["mutate", "unset"]);
  });

  it("rejects a new canonical id that collides with a legacy provider credential", async () => {
    const rejected = makeHost({ declared: [{ provider: "custom-acme--prod", declared: true }] });

    await expect(new CustomProviderStore(rejected.host).create({
      ...draft,
      id: "custom-acme-prod",
    })).rejects.toThrow("已保留或正在使用");
    expect(rejected.calls).toEqual([]);
  });

  it("rejects a new id that collides with a stored explicit credential ref", async () => {
    const rejected = makeHost({
      declared: [{ provider: "custom-old", declared: true }],
      profiles: { "custom-old": { apiKeyEnv: "CUSTOM_ACME_API_KEY" } },
    });

    await expect(new CustomProviderStore(rejected.host).create(draft)).rejects.toThrow("已保留或正在使用");
    expect(rejected.calls).toEqual([]);
  });

  it("rejects a credential ref already used by another settings namespace", async () => {
    const rejected = makeHost({ otherValues: [{ credentialRef: "CUSTOM_ACME_API_KEY" }] });

    await expect(new CustomProviderStore(rejected.host).create(draft)).rejects.toThrow("已保留或正在使用");
    expect(rejected.calls).toEqual([]);
  });

  it("does not treat an ordinary settings string as a credential reference", async () => {
    const configured = makeHost({
      otherValues: [{ models: [{ name: "CUSTOM_ACME_API_KEY", modelRef: "CUSTOM_ACME_API_KEY" }] }],
    });

    await expect(new CustomProviderStore(configured.host).create(draft)).resolves.toEqual({ id: "custom-acme" });
    expect(configured.calls).toEqual(["set", "mutate"]);
  });

  it("keeps legacy repeated-hyphen providers removable when declared by the Host", async () => {
    const id = "custom-acme--prod";
    const { host, mutate, unset, calls } = makeHost({ declared: [{ provider: id, declared: true }] });

    await new CustomProviderStore(host).remove(id);

    expect(mutate).toHaveBeenCalledWith(
      "llm-pi-ai",
      [{ op: "unset", path: ["providers", id] }],
      7,
    );
    expect(unset).toHaveBeenCalledWith("CUSTOM_ACME_PROD_API_KEY");
    expect(calls).toEqual(["mutate", "unset"]);
  });

  it("preserves a credential still referenced by either sibling in a legacy collision", async () => {
    const ids = ["custom-acme-prod", "custom-acme--prod"];
    for (const id of ids) {
      const configured = makeHost({
        declared: ids.map((provider) => ({ provider, declared: true })),
        profiles: Object.fromEntries(ids.map((provider) => [provider, { apiKeyEnv: "CUSTOM_ACME_PROD_API_KEY" }])),
      });

      await new CustomProviderStore(configured.host).remove(id);

      expect(configured.mutate).toHaveBeenCalledWith(
        "llm-pi-ai",
        [{ op: "unset", path: ["providers", id] }],
        7,
      );
      expect(configured.unset).not.toHaveBeenCalled();
      expect(configured.calls).toEqual(["mutate"]);
    }
  });

  it("preserves a credential referenced by another settings namespace", async () => {
    const configured = makeHost({
      declared: [{ provider: "custom-acme", declared: true }],
      otherValues: [{ credentialRef: "CUSTOM_ACME_API_KEY" }],
    });

    await new CustomProviderStore(configured.host).remove("custom-acme");

    expect(configured.mutate).toHaveBeenCalledOnce();
    expect(configured.unset).not.toHaveBeenCalled();
  });

  it("preserves a credential hidden by a sibling user override", async () => {
    const configured = makeHost({
      declared: ["custom-a", "custom-b"].map((provider) => ({ provider, declared: true })),
      profiles: {
        "custom-a": { apiKeyEnv: "SHARED_BASE_KEY" },
        "custom-b": { apiKeyEnv: "CUSTOM_B_OVERRIDE_KEY" },
      },
      userProfiles: {
        "custom-a": { apiKeyEnv: "SHARED_BASE_KEY" },
        "custom-b": { apiKeyEnv: "CUSTOM_B_OVERRIDE_KEY" },
      },
      baseProfiles: { "custom-b": { apiKeyEnv: "SHARED_BASE_KEY" } },
    });

    await new CustomProviderStore(configured.host).remove("custom-a");

    expect(configured.mutate).toHaveBeenCalledOnce();
    expect(configured.unset).not.toHaveBeenCalled();
  });

  it("refuses to remove a profile inherited from composition base", async () => {
    const profile = { apiKeyEnv: "CUSTOM_ACME_API_KEY" };
    const configured = makeHost({
      declared: [{ provider: "custom-acme", declared: true }],
      profiles: { "custom-acme": profile },
      userProfiles: {},
      baseProfiles: { "custom-acme": profile },
    });

    await expect(new CustomProviderStore(configured.host).remove("custom-acme")).rejects.toThrow("不是可删除");
    expect(configured.calls).toEqual([]);
  });

  it("serializes mutations so compensation cannot delete a concurrent winner", async () => {
    let releaseFirst!: () => void;
    const firstPending = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const configured = makeHost();
    configured.mutate.mockImplementationOnce(async () => {
      configured.calls.push("mutate:first");
      await firstPending;
    });
    const store = new CustomProviderStore(configured.host);

    const first = store.create(draft);
    await vi.waitFor(() => { expect(configured.mutate).toHaveBeenCalledTimes(1); });
    const second = store.create({ ...draft, id: "custom-second" });
    await Promise.resolve();
    expect(configured.set).toHaveBeenCalledTimes(1);

    releaseFirst();
    await Promise.all([first, second]);
    expect(configured.set).toHaveBeenCalledTimes(2);
  });

  it("does not write settings when credential creation fails", async () => {
    const { host, mutate, set, unset, calls } = makeHost();
    const failure = new Error("credential set failed");
    set.mockImplementationOnce(async () => {
      calls.push("set");
      throw failure;
    });

    await expect(new CustomProviderStore(host).create(draft)).rejects.toBe(failure);
    expect(calls).toEqual(["set"]);
    expect(mutate).not.toHaveBeenCalled();
    expect(unset).not.toHaveBeenCalled();
  });

  it("removes the new credential when settings creation fails", async () => {
    const { host, mutate, unset, calls } = makeHost();
    const failure = new Error("settings mutate failed");
    mutate.mockImplementationOnce(async () => {
      calls.push("mutate");
      throw failure;
    });

    await expect(new CustomProviderStore(host).create(draft)).rejects.toBe(failure);
    expect(calls).toEqual(["set", "mutate", "unset"]);
    expect(unset).toHaveBeenCalledWith("CUSTOM_ACME_API_KEY");
  });

  it("reports both the settings failure and a failed credential compensation", async () => {
    const { host, mutate, unset, calls } = makeHost();
    const mutationFailure = new Error("settings mutate failed");
    const cleanupFailure = new Error("credential cleanup failed");
    mutate.mockImplementationOnce(async () => {
      calls.push("mutate");
      throw mutationFailure;
    });
    unset.mockImplementationOnce(async () => {
      calls.push("unset");
      throw cleanupFailure;
    });

    const reason = await new CustomProviderStore(host).create(draft).catch((error: unknown) => error);
    expect(reason).toBeInstanceOf(AggregateError);
    expect((reason as AggregateError).errors).toEqual([mutationFailure, cleanupFailure]);
    expect(calls).toEqual(["set", "mutate", "unset"]);
  });

  it("keeps the credential when settings removal fails", async () => {
    const { host, mutate, unset, calls } = makeHost({ declared: [{ provider: "custom-acme", declared: true }] });
    const failure = new Error("settings removal failed");
    mutate.mockImplementationOnce(async () => {
      calls.push("mutate");
      throw failure;
    });

    await expect(new CustomProviderStore(host).remove("custom-acme")).rejects.toBe(failure);
    expect(calls).toEqual(["mutate"]);
    expect(unset).not.toHaveBeenCalled();
  });

  it("reports credential cleanup failure only after settings are unreachable", async () => {
    const { host, unset, calls } = makeHost({ declared: [{ provider: "custom-acme", declared: true }] });
    const failure = new Error("credential unset failed");
    unset.mockImplementationOnce(async () => {
      calls.push("unset");
      throw failure;
    });

    await expect(new CustomProviderStore(host).remove("custom-acme")).rejects.toBe(failure);
    expect(calls).toEqual(["mutate", "unset"]);
  });
});
