import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  SettingsScope,
  SettingsScopeSnapshot,
} from "../src/client/dsh-client-types.ts";
import {
  createRuntimeForm,
  runtimeWrite,
  type RuntimeCredentials,
  type RuntimeForm,
  type RuntimeNamespace,
  type RuntimeValues,
  type RuntimeWire,
} from "../src/client/advanced-runtime.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

// The Host facade models user-layer composition and recovered setter settlement,
// without connecting to a profile or reading credentials.
function host(
  base: RuntimeValues = { timeoutMs: 1000, maxOutputBytes: 500 },
  user: RuntimeValues = {},
) {
  let snapshot: SettingsScopeSnapshot<RuntimeValues> = {
    status: "ready",
    value: { ...base, ...user },
    base,
    user,
    revision: 1,
    writable: true,
    mode: "host",
  };
  const listeners = new Set<() => void>();
  function update(patch: Partial<typeof snapshot>) {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  }
  function accept(field: string, value: unknown, unset = false) {
    const next = { ...(snapshot.user as RuntimeValues) };
    if (unset) delete next[field];
    else next[field] = value;
    update({
      user: next,
      value: { ...base, ...next },
      revision: (snapshot.revision ?? 0) + 1,
    });
  }
  const scope = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: vi.fn(async (field: string, value: unknown) => {
      accept(field, value);
    }),
    unset: vi.fn(async (field: string) => {
      accept(field, undefined, true);
    }),
  } satisfies SettingsScope<RuntimeValues>;
  return { scope, update, accept, listeners };
}
const ok = <T>(value: T): RuntimeWire<T> => ({ result: { ok: true, value } });
const denied = { result: { ok: false, error: { message: "denied" } } } as const;
function credentialService() {
  return {
    describe: vi.fn<RuntimeCredentials["describe"]>(async ({ refs }) =>
      ok({
        credentials: { [refs[0]]: { configured: true, writable: true } },
      }),
    ),
    set: vi.fn<RuntimeCredentials["set"]>(async () => ok(undefined)),
  };
}
const forms: RuntimeForm[] = [];
function formFor(
  namespace: RuntimeNamespace,
  scope: SettingsScope<RuntimeValues>,
  credentials?: RuntimeCredentials,
) {
  const form = createRuntimeForm(namespace, scope, credentials);
  forms.push(form);
  return form;
}
async function searchForm(
  h = host({ baseURL: "https://search.test", maxUses: 5 }),
  c = credentialService(),
) {
  const form = formFor("web-search-deepseek", h.scope, c);
  await form.refreshCredential();
  return { h, c, form };
}
afterEach(() => {
  for (const form of forms.splice(0)) form.dispose();
});

it("retains draft if a resolved scope write recovered the old Host value", async () => {
  const h = host();
  h.scope.set.mockImplementation(async () => {
    h.update({ revision: 2 });
  });
  const form = formFor("shell", h.scope);
  form.edit("timeoutMs", "2000");
  await form.save();
  expect(h.scope.set).toHaveBeenCalledWith("timeoutMs", 2000);
  expect(form.getSnapshot()).toMatchObject({
    dirty: true,
    busy: false,
    error: "saveFailed",
    status: "idle",
  });
  expect(form.getSnapshot().fields.timeoutMs.text).toBe("2000");
});

it("does not mistake an already-configured key for replacement acceptance", async () => {
  const { form, c } = await searchForm();
  c.set.mockResolvedValue(denied);
  form.edit("apiKey", "replacement-only");
  await form.save();
  expect(c.set).toHaveBeenCalledWith({
    ref: "DEEPSEEK_API_KEY",
    value: "replacement-only",
  });
  expect(form.getSnapshot()).toMatchObject({
    dirty: true,
    error: "saveFailed",
    credential: { configured: true },
  });
  expect(form.getSnapshot().fields.apiKey.text).toBe("replacement-only");
});

describe("ordinary field intentions", () => {
  it.each([
    ["shell", "timeoutMs", " 2000 ", 2000],
    ["shell", "maxOutputBytes", "-1.5", -1.5],
    ["agent-loop", "maxParallelToolCalls", "0", 0],
    [
      "web-search-deepseek",
      "baseURL",
      " https://new.test ",
      "https://new.test",
    ],
    ["web-search-deepseek", "maxUses", "2e2", 200],
  ] as const)(
    "saves %s.%s using Host-authoritative parsing",
    async (namespace, field, text, value) => {
      const h = host({ [field]: 10 });
      const form = formFor(namespace, h.scope);
      form.edit(field, text);
      await form.save();
      expect(h.scope.set).toHaveBeenCalledWith(field, value);
      expect(h.scope.getSnapshot().user).toEqual({ [field]: value });
      expect(form.getSnapshot()).toMatchObject({
        dirty: false,
        status: "saved",
        error: undefined,
      });
      expect(form.getSnapshot().fields[field]).toMatchObject({
        text: String(value),
        overridden: true,
      });
    },
  );

  it.each(["", "   "])(
    "blank runtime input %j removes an override",
    async (text) => {
      const h = host(undefined, { timeoutMs: 2000 });
      const form = formFor("shell", h.scope);
      form.edit("timeoutMs", text);
      await form.save();
      expect(h.scope.unset).toHaveBeenCalledWith("timeoutMs");
      expect(form.getSnapshot().fields.timeoutMs).toEqual({
        text: "1000",
        overridden: false,
        invalid: false,
      });
    },
  );

  it("reset stages an unset and follows composition base without changing Host before Save", async () => {
    const h = host(undefined, { timeoutMs: 2000 });
    const form = formFor("shell", h.scope);
    form.reset("timeoutMs");
    expect(form.getSnapshot().fields.timeoutMs).toEqual({
      text: "1000",
      overridden: true,
      invalid: false,
    });
    expect(h.scope.unset).not.toHaveBeenCalled();
    h.update({ base: { timeoutMs: 3000 } });
    expect(form.getSnapshot().fields.timeoutMs.text).toBe("3000");
    await form.save();
    expect(h.scope.getSnapshot().user).toEqual({});
  });

  it("writes an inherited-equal value but filters a present equal override and absent unset", async () => {
    const h = host();
    const form = formFor("shell", h.scope);
    form.edit("timeoutMs", "1000");
    await form.save();
    expect(h.scope.set).toHaveBeenCalledTimes(1);
    expect(h.scope.getSnapshot().user).toEqual({ timeoutMs: 1000 });
    form.edit("timeoutMs", "1000");
    form.reset("maxOutputBytes");
    await form.save();
    expect(h.scope.set).toHaveBeenCalledTimes(1);
    expect(h.scope.unset).not.toHaveBeenCalled();
    expect(form.getSnapshot()).toMatchObject({ dirty: false, status: "saved" });
  });

  it.each(["oops", "Infinity", "-Infinity", "NaN", "1e999"])(
    "invalid number %s blocks every write and retains all drafts",
    async (text) => {
      const { form, h, c } = await searchForm();
      form.edit("baseURL", "https://new.test");
      form.edit("maxUses", text);
      form.edit("apiKey", "replacement");
      expect(form.getSnapshot()).toMatchObject({
        invalid: true,
        fields: { maxUses: { invalid: true, text } },
      });
      await form.save();
      expect(h.scope.set).not.toHaveBeenCalled();
      expect(c.set).not.toHaveBeenCalled();
      expect(form.getSnapshot()).toMatchObject({
        dirty: true,
        busy: false,
        error: "invalid",
      });
      form.edit("maxUses", "3");
      expect(form.getSnapshot()).toMatchObject({
        invalid: false,
        error: undefined,
        status: "idle",
      });
      await form.save();
      expect(form.getSnapshot().dirty).toBe(false);
    },
  );

  it("runtimeWrite accepts finite numbers without invented ranges and prioritizes clear", () => {
    expect(runtimeWrite("number", { text: "-0.5", clear: false })).toEqual({
      kind: "set",
      value: -0.5,
    });
    expect(runtimeWrite("number", { text: "invalid", clear: true })).toEqual({
      kind: "unset",
    });
    expect(runtimeWrite("text", { text: "   ", clear: false })).toEqual({
      kind: "unset",
    });
    expect(
      runtimeWrite("number", { text: "bad", clear: false }),
    ).toBeUndefined();
  });

  it("projects only explicit fields, keeps stable snapshots and never reads saved key literals", () => {
    const h = host();
    const form = formFor("shell", h.scope);
    expect(Object.keys(form.getSnapshot().fields)).toEqual([
      "timeoutMs",
      "maxOutputBytes",
    ]);
    expect(form.getSnapshot()).toBe(form.getSnapshot());
    const value = {
      apiKeyEnv: "SEARCH_KEY",
      maxUses: 3,
      get apiKey() {
        throw new Error("saved literal read");
      },
    };
    const searchHost = host({});
    // Replace without spreading the getter-bearing object in the test facade.
    searchHost.update({ value });
    const search = formFor("web-search-deepseek", searchHost.scope);
    expect(search.getSnapshot().fields.apiKey.text).toBe("");
  });

  it("rejects unknown field names without creating drafts", () => {
    const form = formFor("shell", host().scope);
    for (const field of ["apiKey", "unknown", "toString", "__proto__"]) {
      expect(() => form.edit(field, "1")).toThrow();
      expect(() => form.reset(field)).toThrow();
    }
    expect(form.getSnapshot().dirty).toBe(false);
  });

  it("discard drops only drafts and errors, never mutates Host", async () => {
    const h = host(undefined, { timeoutMs: 2000 });
    const form = formFor("shell", h.scope);
    form.edit("timeoutMs", "bad");
    await form.save();
    form.discard();
    expect(form.getSnapshot()).toMatchObject({
      dirty: false,
      error: undefined,
      status: "idle",
      invalid: false,
    });
    expect(form.getSnapshot().fields.timeoutMs.text).toBe("2000");
    expect(h.scope.set).not.toHaveBeenCalled();
    expect(h.scope.unset).not.toHaveBeenCalled();
    await form.save();
    expect(form.getSnapshot().status).toBe("idle");
  });

  it.each([
    { status: "loading" as const },
    { status: "unavailable" as const },
    { writable: false },
  ])("does not save when Host is %j", async (patch) => {
    const h = host();
    const form = formFor("shell", h.scope);
    form.edit("timeoutMs", "2000");
    h.update(patch);
    await form.save();
    expect(h.scope.set).not.toHaveBeenCalled();
    expect(form.getSnapshot().dirty).toBe(true);
    expect(form.getSnapshot().writable).toBe(false);
    if ("status" in patch) expect(form.getSnapshot().available).toBe(false);
  });

  it.each([{ user: null }, { user: [] }, { user: "invalid" }])(
    "treats malformed user layer $user as absent",
    async ({ user }) => {
      const h = host();
      h.update({ user });
      const form = formFor("shell", h.scope);
      form.edit("timeoutMs", "1000");
      await form.save();
      expect(h.scope.set).toHaveBeenCalledWith("timeoutMs", 1000);
    },
  );
});

describe("save acceptance and concurrency", () => {
  it.each(["resolved", "rejected"] as const)(
    "retains ALL drafts after partial durable success and %s failure",
    async (failure) => {
      const h = host();
      const form = formFor("shell", h.scope);
      h.scope.set.mockImplementation(async (field, value) => {
        if (field === "timeoutMs") h.accept(field, value);
        else if (failure === "rejected") throw new Error("write rejected");
      });
      form.edit("timeoutMs", "2000");
      form.edit("maxOutputBytes", "800");
      await form.save();
      expect(h.scope.getSnapshot().user).toEqual({ timeoutMs: 2000 });
      expect(form.getSnapshot()).toMatchObject({
        dirty: true,
        error: "saveFailed",
        busy: false,
        fields: {
          timeoutMs: { text: "2000" },
          maxOutputBytes: { text: "800" },
        },
      });
    },
  );

  it("does not accept a recovered unset that still has a user override", async () => {
    const h = host(undefined, { timeoutMs: 2000 });
    const form = formFor("shell", h.scope);
    h.scope.unset.mockResolvedValue();
    form.reset("timeoutMs");
    await form.save();
    expect(form.getSnapshot()).toMatchObject({
      dirty: true,
      error: "saveFailed",
    });
  });

  it.each([
    "earlier-write",
    "filtered-set",
    "filtered-unset",
    "read-only",
    "unavailable",
  ] as const)(
    "rechecks all intentions and Host state after a later await: %s",
    async (race) => {
      const h = host(
        undefined,
        race === "filtered-set" ? { timeoutMs: 2000 } : {},
      );
      const form = formFor("shell", h.scope);
      const later = deferred<void>();
      h.scope.set.mockImplementation(async (field, value) => {
        if (field === "maxOutputBytes") await later.promise;
        h.accept(field, value);
      });
      if (race === "filtered-unset") form.reset("timeoutMs");
      else form.edit("timeoutMs", "2000");
      form.edit("maxOutputBytes", "800");
      const save = form.save();
      await vi.waitFor(() =>
        expect(h.scope.set).toHaveBeenCalledWith("maxOutputBytes", 800),
      );
      if (race === "read-only") h.update({ writable: false });
      else if (race === "unavailable") h.update({ status: "unavailable" });
      else h.accept("timeoutMs", 9000);
      later.resolve();
      await save;
      expect(form.getSnapshot()).toMatchObject({
        dirty: true,
        error: "saveFailed",
        status: "idle",
        busy: false,
      });
      expect(form.getSnapshot().fields.maxOutputBytes.text).toBe("800");
    },
  );

  it("does not turn a captured later no-op into a new write after an earlier await", async () => {
    const h = host(undefined, { maxOutputBytes: 800 });
    const form = formFor("shell", h.scope);
    const first = deferred<void>();
    h.scope.set.mockImplementation(async (field, value) => {
      await first.promise;
      h.accept(field, value);
    });
    form.edit("timeoutMs", "2000");
    form.edit("maxOutputBytes", "800");
    const save = form.save();
    h.accept("maxOutputBytes", 9000);
    first.resolve();
    await save;
    expect(h.scope.set.mock.calls).toEqual([["timeoutMs", 2000]]);
    expect(form.getSnapshot()).toMatchObject({
      dirty: true,
      error: "saveFailed",
      fields: { maxOutputBytes: { text: "800" } },
    });
  });

  it("ignores edits, reset, discard and duplicate saves while busy", async () => {
    const h = host();
    const form = formFor("shell", h.scope);
    const first = deferred<void>();
    h.scope.set.mockImplementation(async (field, value) => {
      await first.promise;
      h.accept(field, value);
    });
    form.edit("timeoutMs", "2000");
    const save = form.save();
    expect(form.getSnapshot()).toMatchObject({ busy: true, status: "saving" });
    form.edit("timeoutMs", "3000");
    form.reset("timeoutMs");
    form.discard();
    await form.save();
    expect(form.getSnapshot().fields.timeoutMs.text).toBe("2000");
    expect(h.scope.set).toHaveBeenCalledTimes(1);
    first.resolve();
    await save;
    expect(form.getSnapshot()).toMatchObject({
      busy: false,
      dirty: false,
      status: "saved",
    });
  });
});

describe("write-only replacement and metadata", () => {
  it("blank replacement keeps credentials, reset stages removal and discard is explicit", async () => {
    const { form, c } = await searchForm();
    form.edit("apiKey", "replacement");
    form.reset("apiKey");
    expect(form.getSnapshot()).toMatchObject({
      fields: { apiKey: { text: "" } },
      credential: { removalPending: true },
    });
    expect(c.set).not.toHaveBeenCalled();
    form.edit("apiKey", "   ");
    await form.save();
    expect(form.getSnapshot()).toMatchObject({
      dirty: false,
      fields: { apiKey: { text: "" } },
    });
    expect(c.set).not.toHaveBeenCalled();
    form.edit("apiKey", "replacement");
    form.discard();
    expect(form.getSnapshot().fields.apiKey.text).toBe("");
  });

  it("trims a replacement at transport and clears it only on accepted set", async () => {
    const { form, c } = await searchForm();
    form.edit("apiKey", " replacement ");
    await form.save();
    expect(c.set).toHaveBeenCalledWith({
      ref: "DEEPSEEK_API_KEY",
      value: "replacement",
    });
    expect(form.getSnapshot()).toMatchObject({
      dirty: false,
      status: "saved",
      fields: { apiKey: { text: "" } },
    });
  });

  it("retains a replacement after a thrown credential setter without reflecting its error", async () => {
    const { form, c } = await searchForm();
    c.set.mockRejectedValue(new Error("sensitive-payload-error"));
    form.edit("apiKey", "replacement");
    await form.save();
    expect(form.getSnapshot()).toMatchObject({
      dirty: true,
      error: "saveFailed",
      busy: false,
    });
    expect(JSON.stringify(form.getSnapshot())).not.toContain(
      "sensitive-payload-error",
    );
  });

  it.each(["loading", "read-only", "error", "missing-service"] as const)(
    "does not send a replacement when metadata is %s",
    async (state) => {
      const h = host({ maxUses: 5 });
      const c = credentialService();
      if (state === "loading")
        c.describe.mockReturnValue(new Promise(() => {}));
      if (state === "read-only")
        c.describe.mockResolvedValue(
          ok({
            credentials: {
              DEEPSEEK_API_KEY: { writable: false, configured: true },
            },
          }),
        );
      if (state === "error") c.describe.mockResolvedValue(denied);
      const form = formFor(
        "web-search-deepseek",
        h.scope,
        state === "missing-service" ? undefined : c,
      );
      if (state !== "loading") await form.refreshCredential();
      form.edit("apiKey", "replacement");
      await form.save();
      expect(c.set).not.toHaveBeenCalled();
      expect(form.getSnapshot()).toMatchObject({
        dirty: true,
        error: "saveFailed",
        credential: { writable: false },
      });
    },
  );

  it.each(["before-call", "during-call"] as const)(
    "ref change %s never retargets a write and retires only acknowledged credentials",
    async (timing) => {
      const { form, h, c } = await searchForm();
      const pending = deferred<void>();
      h.scope.set.mockImplementation(async (field, value) => {
        await pending.promise;
        h.accept(field, value);
      });
      const key = deferred<RuntimeWire<unknown>>();
      c.set.mockReturnValue(key.promise);
      form.edit("baseURL", "https://new.test");
      form.edit("apiKey", "replacement");
      const save = form.save();
      if (timing === "during-call") {
        pending.resolve();
        await vi.waitFor(() => expect(c.set).toHaveBeenCalledTimes(1));
      }
      h.accept("apiKeyEnv", "NEXT_KEY");
      pending.resolve();
      key.resolve(ok(undefined));
      await save;
      expect(c.set).toHaveBeenCalledTimes(timing === "during-call" ? 1 : 0);
      expect(form.getSnapshot()).toMatchObject({
        dirty: true,
        error: "saveFailed",
        fields: {
          apiKey: { text: timing === "during-call" ? "" : "replacement" },
        },
      });
    },
  );

  it("rechecks metadata permission immediately before a deferred replacement call", async () => {
    const { form, h, c } = await searchForm();
    const pending = deferred<void>();
    h.scope.set.mockImplementation(async (field, value) => {
      await pending.promise;
      h.accept(field, value);
    });
    form.edit("baseURL", "https://new.test");
    form.edit("apiKey", "replacement");
    const save = form.save();
    c.describe.mockResolvedValue(denied);
    await form.refreshCredential();
    pending.resolve();
    await save;
    expect(c.set).not.toHaveBeenCalled();
    expect(form.getSnapshot().dirty).toBe(true);
  });

  it("metadata failure after successful set is not write failure or automatic replay", async () => {
    const { form, c } = await searchForm();
    c.describe.mockRejectedValue(new Error("metadata unavailable"));
    form.edit("apiKey", "replacement");
    await form.save();
    expect(form.getSnapshot()).toMatchObject({
      dirty: false,
      status: "saved",
      error: undefined,
      credential: { error: true, writable: false, loading: false },
      fields: { apiKey: { text: "" } },
    });
    await form.save();
    await form.refreshCredential();
    expect(c.set).toHaveBeenCalledTimes(1);
  });

  it.each(["resolve", "reject"] as const)(
    "suppresses stale metadata %s by generation and reference",
    async (settle) => {
      const h = host({ apiKeyEnv: "OLD_KEY" });
      const c = credentialService();
      const old =
        deferred<Awaited<ReturnType<RuntimeCredentials["describe"]>>>();
      c.describe.mockReturnValueOnce(old.promise);
      const form = formFor("web-search-deepseek", h.scope, c);
      expect(form.getSnapshot().credential).toMatchObject({
        loading: true,
        writable: false,
      });
      form.edit("apiKey", "replacement");
      h.update({ value: { apiKeyEnv: "NEXT_KEY" } });
      await form.refreshCredential();
      const current = form.getSnapshot();
      if (settle === "resolve")
        old.resolve(
          ok({
            credentials: { OLD_KEY: { configured: false, writable: false } },
          }),
        );
      else old.reject(new Error("old failure"));
      await Promise.resolve();
      await Promise.resolve();
      expect(form.getSnapshot()).toBe(current);
      expect(current).toMatchObject({
        credential: { configured: true, writable: true, error: false },
        fields: { apiKey: { text: "replacement" } },
      });
      expect(c.describe).toHaveBeenCalledWith({ refs: ["NEXT_KEY"] });
    },
  );

  it("does not let an older request for the same ref overwrite newer metadata", async () => {
    const h = host({ apiKeyEnv: "" });
    const c = credentialService();
    const old = deferred<Awaited<ReturnType<RuntimeCredentials["describe"]>>>();
    c.describe.mockReturnValueOnce(old.promise);
    const form = formFor("web-search-deepseek", h.scope, c);
    await form.refreshCredential();
    const current = form.getSnapshot();
    old.resolve(denied);
    await Promise.resolve();
    await Promise.resolve();
    expect(form.getSnapshot()).toBe(current);
    expect(c.describe).toHaveBeenCalledWith({ refs: ["DEEPSEEK_API_KEY"] });
  });
});

describe("owned lifecycle", () => {
  it.each(["resolve", "reject"] as const)(
    "dispose during first field then %s starts no later writes and releases current state",
    async (settle) => {
      const { form, h, c } = await searchForm();
      const first = deferred<void>();
      h.scope.set.mockImplementation(async (field, value) => {
        await first.promise;
        h.accept(field, value);
      });
      form.edit("baseURL", "https://new.test");
      form.edit("maxUses", "10");
      form.edit("apiKey", "replacement");
      const listener = vi.fn();
      form.subscribe(listener);
      const save = form.save();
      expect(h.scope.set).toHaveBeenCalledTimes(1);
      form.dispose();
      const notifications = listener.mock.calls.length;
      const disposed = form.getSnapshot();
      expect(disposed).toMatchObject({
        dirty: false,
        busy: false,
        available: false,
        writable: false,
        fields: { apiKey: { text: "" } },
      });
      expect(h.listeners.size).toBe(0);
      if (settle === "resolve") first.resolve();
      else first.reject(new Error("late rejection"));
      await save;
      expect(h.scope.set).toHaveBeenCalledTimes(1);
      expect(c.set).not.toHaveBeenCalled();
      expect(listener).toHaveBeenCalledTimes(notifications);
      expect(form.getSnapshot()).toBe(disposed);
      form.edit("apiKey", "new");
      form.reset("maxUses");
      form.discard();
      await form.save();
      await form.refreshCredential();
      form.dispose();
      expect(form.getSnapshot()).toBe(disposed);
    },
  );

  it.each(["resolve", "reject"] as const)(
    "already-started credential may %s after disposal without refresh or publication",
    async (settle) => {
      const { form, c } = await searchForm();
      const pending = deferred<RuntimeWire<unknown>>();
      c.set.mockReturnValue(pending.promise);
      form.edit("apiKey", "replacement");
      const listener = vi.fn();
      form.subscribe(listener);
      const save = form.save();
      expect(c.set).toHaveBeenCalledTimes(1);
      form.dispose();
      const reads = c.describe.mock.calls.length;
      const notifications = listener.mock.calls.length;
      if (settle === "resolve") pending.resolve(ok(undefined));
      else pending.reject(new Error("late rejection"));
      await save;
      expect(c.describe).toHaveBeenCalledTimes(reads);
      expect(listener).toHaveBeenCalledTimes(notifications);
      expect(form.getSnapshot()).toMatchObject({
        dirty: false,
        busy: false,
        fields: { apiKey: { text: "" } },
      });
    },
  );

  it("disposal during saving publication forbids the first write and later listeners", async () => {
    const { form, h, c } = await searchForm();
    form.edit("maxUses", "10");
    form.edit("apiKey", "replacement");
    form.subscribe(() => {
      if (form.getSnapshot().busy) form.dispose();
    });
    const later = vi.fn();
    form.subscribe(later);
    await form.save();
    expect(h.scope.set).not.toHaveBeenCalled();
    expect(c.set).not.toHaveBeenCalled();
    expect(later).not.toHaveBeenCalled();
    expect(form.getSnapshot()).toMatchObject({
      dirty: false,
      busy: false,
      fields: { apiKey: { text: "" } },
    });
  });

  it("disposal during metadata loading publication forbids describe and subsequent subscriptions", async () => {
    const { form, c } = await searchForm();
    const reads = c.describe.mock.calls.length;
    form.subscribe(() => {
      if (form.getSnapshot().credential.loading) form.dispose();
    });
    const later = vi.fn();
    form.subscribe(later);
    await form.refreshCredential();
    form.subscribe(later);
    await form.refreshCredential();
    expect(c.describe).toHaveBeenCalledTimes(reads);
    expect(later).not.toHaveBeenCalled();
  });

  it("unsubscription during publication excludes removed listeners; disposed callbacks cannot notify", () => {
    const h = host();
    const form = formFor("shell", h.scope);
    const later = vi.fn();
    let unsubscribe = () => {};
    form.subscribe(() => unsubscribe());
    unsubscribe = form.subscribe(later);
    const staleCallback = [...h.listeners][0];
    form.edit("timeoutMs", "2");
    expect(later).not.toHaveBeenCalled();
    form.dispose();
    const disposed = form.getSnapshot();
    staleCallback();
    expect(form.getSnapshot()).toBe(disposed);
    expect(later).not.toHaveBeenCalled();
  });

  it.each(["resolve", "reject"] as const)(
    "late metadata %s after dispose never restores secret or notifies",
    async (settle) => {
      const h = host();
      const c = credentialService();
      const pending =
        deferred<Awaited<ReturnType<RuntimeCredentials["describe"]>>>();
      c.describe.mockReturnValue(pending.promise);
      const form = formFor("web-search-deepseek", h.scope, c);
      form.edit("apiKey", "replacement");
      const listener = vi.fn();
      form.subscribe(listener);
      form.dispose();
      const snapshot = form.getSnapshot();
      if (settle === "resolve") pending.resolve(ok({ credentials: {} }));
      else pending.reject(new Error("late failure"));
      await Promise.resolve();
      await Promise.resolve();
      expect(form.getSnapshot()).toBe(snapshot);
      expect(snapshot.fields.apiKey.text).toBe("");
      expect(listener).not.toHaveBeenCalled();
    },
  );
});

// R7: disposable in-memory credentials; never import the disk credential service.
describe("credential removal round-trip", () => {
  async function removable() {
    let configured = false;
    const c = {
      describe: vi.fn(async () =>
        ok({
          credentials: { DEEPSEEK_API_KEY: { configured, writable: true } },
        }),
      ),
      set: vi.fn(async () => {
        configured = true;
        return ok(undefined);
      }),
      unset: vi.fn(async () => {
        configured = false;
        return ok(undefined);
      }),
    };
    return { ...(await searchForm(host({ maxUses: 5 }), c)), c };
  }
  it("replaces twice, stages removal without writes, saves unset and reopens with no key", async () => {
    const { form, c, h } = await removable();
    for (const value of ["disposable-1", "disposable-2"]) {
      form.edit("apiKey", value);
      await form.save();
      expect(form.getSnapshot()).toMatchObject({
        dirty: false,
        fields: { apiKey: { text: "" } },
        credential: { configured: true },
      });
    }
    form.reset("apiKey");
    expect(c.unset).not.toHaveBeenCalled();
    expect(form.getSnapshot()).toMatchObject({
      dirty: true,
      credential: { removalPending: true },
    });
    await form.save();
    expect(c.unset).toHaveBeenCalledExactlyOnceWith({
      ref: "DEEPSEEK_API_KEY",
    });
    expect(form.getSnapshot()).toMatchObject({
      dirty: false,
      status: "saved",
      credential: { configured: false, removalPending: false },
    });
    const reopened = formFor("web-search-deepseek", h.scope, c);
    await reopened.refreshCredential();
    expect(reopened.getSnapshot().credential.configured).toBe(false);
    expect(c.set).toHaveBeenCalledTimes(2);
  });
  it.each(["missing", "readonly"] as const)(
    "explicitly blocks %s removal and never writes settings instead",
    async (kind) => {
      const { form, c, h } = await removable();
      if (kind === "missing") Object.assign(c, { unset: undefined });
      else
        c.describe.mockResolvedValue(
          ok({
            credentials: {
              DEEPSEEK_API_KEY: { configured: true, writable: false },
            },
          }),
        );
      await form.refreshCredential();
      form.reset("apiKey");
      await form.save();
      expect(form.getSnapshot()).toMatchObject({
        error:
          kind === "missing" ? "credentialRemoveUnavailable" : "saveFailed",
      });
      expect(h.scope.unset).not.toHaveBeenCalled();
      expect(c.set).not.toHaveBeenCalled();
      if (kind !== "missing") expect(c.unset).not.toHaveBeenCalled();
    },
  );
  it("retains failed removal, hides transport errors, and discards or replaces its intent", async () => {
    const { form, c } = await removable();
    c.unset.mockRejectedValue(new Error("DISPOSABLE_ERROR_NOT_FOR_UI"));
    form.reset("apiKey");
    await form.save();
    expect(form.getSnapshot()).toMatchObject({
      dirty: true,
      error: "saveFailed",
      credential: { removalPending: true },
    });
    expect(JSON.stringify(form.getSnapshot())).not.toContain(
      "DISPOSABLE_ERROR_NOT_FOR_UI",
    );
    form.discard();
    expect(form.getSnapshot()).toMatchObject({
      dirty: false,
      credential: { removalPending: false },
    });
    form.reset("apiKey");
    form.edit("apiKey", "disposable-2");
    await form.save();
    expect(c.unset).toHaveBeenCalledTimes(1);
    expect(c.set).toHaveBeenCalledTimes(1);
    expect(form.getSnapshot().fields.apiKey.text).toBe("");
  });
  it("never retargets a staged removal after apiKeyEnv changes", async () => {
    const { form, c, h } = await removable();
    form.reset("apiKey");
    h.accept("apiKeyEnv", "NEXT_KEY");
    await form.refreshCredential();
    await form.save();
    expect(c.unset).not.toHaveBeenCalled();
    expect(form.getSnapshot()).toMatchObject({
      dirty: true,
      error: "saveFailed",
    });
  });
  it("fences a stale describe after removal and preserves a newer replacement during refresh", async () => {
    const { form, c } = await removable();
    const old = deferred<Awaited<ReturnType<typeof c.describe>>>();
    c.describe.mockReturnValueOnce(old.promise);
    const stale = form.refreshCredential();
    await form.refreshCredential();
    form.reset("apiKey");
    const fresh = deferred<Awaited<ReturnType<typeof c.describe>>>();
    c.describe.mockReturnValueOnce(fresh.promise);
    const save = form.save();
    await Promise.resolve();
    await Promise.resolve();
    form.edit("apiKey", "newer-disposable");
    old.resolve(
      ok({
        credentials: {
          DEEPSEEK_API_KEY: { configured: true, writable: false },
        },
      }),
    );
    await stale;
    fresh.resolve(
      ok({
        credentials: {
          DEEPSEEK_API_KEY: { configured: false, writable: true },
        },
      }),
    );
    await save;
    expect(form.getSnapshot()).toMatchObject({
      dirty: true,
      fields: { apiKey: { text: "newer-disposable" } },
      credential: { configured: false, writable: true },
    });
  });
  it("disposal during unset releases drafts and prevents refresh and notifications", async () => {
    const { form, c } = await removable();
    const pending = deferred<ReturnType<typeof ok<undefined>>>();
    c.unset.mockReturnValue(pending.promise);
    form.reset("apiKey");
    const save = form.save();
    expect(c.unset).toHaveBeenCalledTimes(1);
    form.dispose();
    const snapshot = form.getSnapshot();
    const reads = c.describe.mock.calls.length;
    pending.resolve(ok(undefined));
    await save;
    expect(form.getSnapshot()).toBe(snapshot);
    expect(c.describe).toHaveBeenCalledTimes(reads);
    expect(snapshot.fields.apiKey.text).toBe("");
  });
});

it.each([
  ["shell", "timeoutMs"],
  ["agent-loop", "maxParallelToolCalls"],
] as const)(
  "%s settings set/save/reopen/reset/save removes only the chosen override",
  async (namespace, field) => {
    const h = host({ [field]: 10 }, { unrelated: 7 });
    const form = formFor(namespace, h.scope);
    form.edit(field, "20");
    await form.save();
    const reopened = formFor(namespace, h.scope);
    expect(reopened.getSnapshot().fields[field].text).toBe("20");
    reopened.reset(field);
    expect(h.scope.unset).not.toHaveBeenCalled();
    await reopened.save();
    expect(h.scope.getSnapshot().user).toEqual({ unrelated: 7 });
    expect(
      formFor(namespace, h.scope).getSnapshot().fields[field],
    ).toMatchObject({ text: "10", overridden: false });
  },
);

it.each(["set", "unset"] as const)(
  "does not dispatch %s after a known unconfirmed ordinary write",
  async (operation) => {
    const h = host({ maxUses: 5 });
    const c = {
      ...credentialService(),
      unset: vi.fn(async () => ok(undefined)),
    };
    const { form } = await searchForm(h, c);
    h.scope.set.mockResolvedValue();
    form.edit("maxUses", "8");
    if (operation === "set") form.edit("apiKey", "disposable-1");
    else form.reset("apiKey");
    await form.save();
    expect(c.set).not.toHaveBeenCalled();
    expect(c.unset).not.toHaveBeenCalled();
    expect(form.getSnapshot()).toMatchObject({
      dirty: true,
      error: "saveFailed",
    });
  },
);

it.each(["set", "unset"] as const)(
  "acknowledged %s retires only its own intention despite aggregate failure and never replays",
  async (operation) => {
    const h = host({ maxUses: 5 });
    const pending = deferred<RuntimeWire<unknown>>();
    const c = { ...credentialService(), unset: vi.fn(() => pending.promise) };
    c.set.mockReturnValue(pending.promise);
    const { form } = await searchForm(h, c);
    form.edit("maxUses", "8");
    if (operation === "set") form.edit("apiKey", "disposable-1");
    else form.reset("apiKey");
    const save = form.save();
    await vi.waitFor(() =>
      expect(operation === "set" ? c.set : c.unset).toHaveBeenCalledOnce(),
    );
    h.accept("maxUses", 9);
    pending.resolve(ok(undefined));
    await save;
    expect(form.getSnapshot()).toMatchObject({
      dirty: true,
      error: "saveFailed",
      fields: { apiKey: { text: "" }, maxUses: { text: "8" } },
      credential: { removalPending: false },
    });
    await form.refreshCredential();
    await form.save();
    expect(operation === "set" ? c.set : c.unset).toHaveBeenCalledTimes(1);
  },
);

it.each(["replace", "remove"] as const)(
  "preserves explicitly newer %s intention during the old acknowledgement metadata refresh",
  async (newer) => {
    const { form, c } = await searchForm();
    const metadata =
      deferred<Awaited<ReturnType<RuntimeCredentials["describe"]>>>();
    c.describe.mockReturnValue(metadata.promise);
    form.edit("apiKey", "same-disposable");
    const save = form.save();
    await vi.waitFor(() =>
      expect(form.getSnapshot()).toMatchObject({
        busy: false,
        fields: { apiKey: { text: "" } },
        credential: { loading: true },
      }),
    );
    if (newer === "replace") form.edit("apiKey", "same-disposable");
    else form.reset("apiKey");
    metadata.resolve(
      ok({
        credentials: { DEEPSEEK_API_KEY: { configured: true, writable: true } },
      }),
    );
    await save;
    expect(form.getSnapshot()).toMatchObject({
      dirty: true,
      fields: {
        apiKey: { text: newer === "replace" ? "same-disposable" : "" },
      },
      credential: { removalPending: newer === "remove" },
    });
    expect(c.set).toHaveBeenCalledTimes(1);
  },
);
