import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getSession, saveSession, updateSessionIfCurrent, type QwenSession } from "../src/auth/store.ts";
import { TokenManager } from "../src/providers/common.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const old: QwenSession = { accessToken: "synthetic-old", refreshToken: "synthetic-old-r", expiresAt: 1 };
const replacement: QwenSession = { accessToken: "synthetic-new", refreshToken: "synthetic-new-r", expiresAt: 9e15 };
const renewed: QwenSession = { accessToken: "synthetic-renewed", refreshToken: "synthetic-renewed-r", expiresAt: 9e15 };
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "providers-token-"));
  vi.stubEnv("DSH_HOME", dir);
  await saveSession("qwen", old);
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });

function setup(permanent = true) {
  const entered = deferred<void>();
  const result = deferred<QwenSession>();
  const onRemoved = vi.fn();
  const bothLoaded = deferred<void>();
  let loads = 0;
  const refresh = vi.fn(async () => { entered.resolve(); return result.promise; });
  const manager = new TokenManager<QwenSession>({
    displayName: "Test", preemptMs: 0,
    load: async () => { const call = ++loads; const s = await getSession("qwen"); if (call === 2) bothLoaded.resolve(); return s; },
    saveIfCurrent: (expected, next, current) => updateSessionIfCurrent("qwen", expected, next, current), removeIfCurrent: (expected, current) => updateSessionIfCurrent("qwen", expected, undefined, current),
    refresh, isPermanent: () => permanent, onRemoved,
  });
  return { manager, entered, result, onRemoved, refresh, bothLoaded };
}

it.each(["permanent", "success", "transient"])("fences delayed %s after abort/relogin", async outcome => {
  if (outcome === "transient") await saveSession("qwen", { ...old, expiresAt: Date.now() + 60_000 });
  const { manager, entered, result, onRemoved } = setup(outcome === "permanent");
  const pending = manager.session(true).catch(error => error);
  await entered.promise;
  manager.abort();
  await saveSession("qwen", replacement);
  if (outcome === "success") result.resolve(renewed);
  else result.reject(new Error(outcome === "permanent" ? "invalid_grant" : "offline"));
  const error = await pending;
  expect((await getSession("qwen"))?.accessToken === replacement.accessToken).toBe(true);
  expect(error).toMatchObject({ code: "MISSING_CREDENTIAL" });
  expect(onRemoved).not.toHaveBeenCalled();
});

it("coalesces current permanent failure and removes/notifies once", async () => {
  const { manager, entered, result, onRemoved, refresh, bothLoaded } = setup();
  const pending = [manager.session(), manager.session()].map(p => p.catch(error => error));
  await entered.promise;
  await bothLoaded.promise;
  result.reject(new Error("invalid_grant"));
  for (const error of await Promise.all(pending)) expect(error).toMatchObject({ code: "INVALID_CREDENTIAL" });
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(onRemoved).toHaveBeenCalledTimes(1);
  expect(await getSession("qwen")).toBeUndefined();
});

it.each([
  { force: false, redundant: "success" },
  { force: false, redundant: "permanent" },
  { force: true, redundant: "success" },
  { force: true, redundant: "permanent" },
])("reuses a completed rotation after a delayed first load ($force, $redundant)", async ({ force, redundant }) => {
  const staleRead = deferred<void>();
  const releaseRead = deferred<void>();
  let loads = 0;
  const refresh = vi.fn(async () => {
    await staleRead.promise;
    if (refresh.mock.calls.length > 1 && redundant === "permanent") throw new Error("invalid_grant");
    return renewed;
  });
  const removeIfCurrent = vi.fn((expected: QwenSession, current: () => boolean) =>
    updateSessionIfCurrent("qwen", expected, undefined, current));
  const onRemoved = vi.fn();
  const manager = new TokenManager<QwenSession>({
    displayName: "Test", preemptMs: 0,
    load: async () => {
      const call = ++loads;
      const snapshot = await getSession("qwen");
      if (call === 2) {
        expect(snapshot?.accessToken === old.accessToken).toBe(true);
        staleRead.resolve();
        await releaseRead.promise;
      }
      return snapshot;
    },
    saveIfCurrent: (expected, next, current) => updateSessionIfCurrent("qwen", expected, next, current),
    removeIfCurrent, refresh, isPermanent: () => true, onRemoved,
  });
  const a = manager.session(force).catch(error => error);
  const b = manager.session(force).catch(error => error);
  await staleRead.promise;
  expect((await a).accessToken === renewed.accessToken).toBe(true);
  expect((await getSession("qwen"))?.accessToken === renewed.accessToken).toBe(true);
  // A has persisted and released its inflight slot before B returns its old snapshot.
  releaseRead.resolve();
  const current = await b;
  expect(current instanceof Error).toBe(false);
  expect(current.accessToken === renewed.accessToken).toBe(true);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(removeIfCurrent).not.toHaveBeenCalled();
  expect(onRemoved).not.toHaveBeenCalled();
});

it.each(["success", "permanent", "transient"])("uses the revalidated credential for refresh and %s settlement", async outcome => {
  const current = { ...replacement, expiresAt: Date.now() + 60_000 };
  let loads = 0;
  const onRemoved = vi.fn();
  const refresh = vi.fn(async (session: QwenSession) => {
    expect(session.accessToken === current.accessToken).toBe(true);
    if (outcome !== "success") throw new Error(outcome === "permanent" ? "invalid_grant" : "offline");
    return renewed;
  });
  const manager = new TokenManager<QwenSession>({
    displayName: "Test", preemptMs: 120_000,
    load: async () => {
      const snapshot = await getSession("qwen");
      if (++loads === 1) await saveSession("qwen", current);
      return snapshot;
    },
    saveIfCurrent: (expected, next, active) => updateSessionIfCurrent("qwen", expected, next, active),
    removeIfCurrent: (expected, active) => updateSessionIfCurrent("qwen", expected, undefined, active),
    refresh, isPermanent: () => outcome === "permanent", onRemoved,
  });
  const result = await manager.session().catch(error => error);
  expect(refresh).toHaveBeenCalledTimes(1);
  if (outcome === "permanent") {
    expect(result).toMatchObject({ code: "INVALID_CREDENTIAL" });
    expect(await getSession("qwen")).toBeUndefined();
    expect(onRemoved).toHaveBeenCalledTimes(1);
  } else {
    const expected = outcome === "success" ? renewed : current;
    expect(result.accessToken === expected.accessToken).toBe(true);
    expect((await getSession("qwen"))?.accessToken === expected.accessToken).toBe(true);
    expect(onRemoved).not.toHaveBeenCalled();
  }
});

it("fences abort during the pre-refresh reread", async () => {
  const reread = deferred<void>();
  const release = deferred<void>();
  let loads = 0;
  const refresh = vi.fn(async () => renewed);
  const manager = new TokenManager<QwenSession>({
    displayName: "Test", preemptMs: 0,
    load: async () => {
      const snapshot = await getSession("qwen");
      if (++loads === 2) { reread.resolve(); await release.promise; }
      return snapshot;
    },
    saveIfCurrent: (expected, next, active) => updateSessionIfCurrent("qwen", expected, next, active),
    removeIfCurrent: (expected, active) => updateSessionIfCurrent("qwen", expected, undefined, active),
    refresh, isPermanent: () => false,
  });
  const pending = manager.session().catch(error => error);
  await reread.promise;
  manager.abort();
  await saveSession("qwen", replacement);
  release.resolve();
  expect(await pending).toMatchObject({ code: "MISSING_CREDENTIAL" });
  expect(refresh).not.toHaveBeenCalled();
  expect((await getSession("qwen"))?.accessToken === replacement.accessToken).toBe(true);
});

it("still forces a refresh for an unchanged valid credential", async () => {
  await saveSession("qwen", replacement);
  const { manager, entered, result, refresh } = setup();
  const pending = manager.session(true);
  await entered.promise;
  result.resolve(renewed);
  expect((await pending).accessToken === renewed.accessToken).toBe(true);
  expect(refresh).toHaveBeenCalledTimes(1);
});

it("never falls back to old credentials when permanent-failure cleanup rejects", async () => {
  const valid = { ...old, expiresAt: Date.now() + 60_000 };
  await saveSession("qwen", valid);
  const removeIfCurrent = vi.fn(async () => { throw new Error("fixture durable write failure"); });
  const onRemoved = vi.fn();
  const refresh = vi.fn(async () => { throw new Error("invalid_grant"); });
  const manager = new TokenManager<QwenSession>({
    displayName: "Test", preemptMs: 120_000, load: () => getSession("qwen"),
    saveIfCurrent: (expected, next, current) => updateSessionIfCurrent("qwen", expected, next, current),
    removeIfCurrent, refresh, isPermanent: () => true, onRemoved,
  });
  const result = await manager.session().catch(error => error);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(removeIfCurrent).toHaveBeenCalledTimes(1);
  expect(result instanceof Error).toBe(true);
  expect(onRemoved).not.toHaveBeenCalled();
  expect((await getSession("qwen"))?.accessToken === valid.accessToken).toBe(true);
});

it("does not return an already-loading session after abort", async () => {
  const entered = deferred<void>();
  const loaded = deferred<QwenSession>();
  const refresh = vi.fn(async (s: QwenSession) => s);
  const manager = new TokenManager<QwenSession>({
    displayName: "Test", preemptMs: 0,
    load: async () => { entered.resolve(); return loaded.promise; },
    saveIfCurrent: async () => true, removeIfCurrent: async () => true, refresh, isPermanent: () => false,
  });
  const pending = manager.session().catch(error => error);
  await entered.promise;
  manager.abort();
  loaded.resolve(replacement);
  expect((await pending) instanceof Error).toBe(true);
  expect(refresh).not.toHaveBeenCalled();
});

it("does not publish when abort/relogin happens while save callback is pending", async () => {
  const saving = deferred<void>();
  const release = deferred<void>();
  const manager = new TokenManager<QwenSession>({
    displayName: "Test", preemptMs: 0, load: () => getSession("qwen"),
    saveIfCurrent: async (expected, next, current) => { saving.resolve(); await release.promise; return updateSessionIfCurrent("qwen", expected, next, current); },
    removeIfCurrent: (expected, current) => updateSessionIfCurrent("qwen", expected, undefined, current), refresh: async () => renewed, isPermanent: () => false,
  });
  const pending = manager.session().catch(error => error);
  await saving.promise;
  manager.abort();
  await saveSession("qwen", replacement);
  release.resolve();
  const error = await pending;
  expect((await getSession("qwen"))?.accessToken === replacement.accessToken).toBe(true);
  expect(error).toMatchObject({ code: "MISSING_CREDENTIAL" });
});

it("starts a new refresh after abort and old finally cannot clear its slot", async () => {
  const first = deferred<QwenSession>();
  const second = deferred<QwenSession>();
  const firstEntered = deferred<void>();
  const secondEntered = deferred<void>();
  const thirdLoaded = deferred<void>();
  let loadingThirdCaller = false;
  const refresh = vi.fn(async () => {
    if (refresh.mock.calls.length === 1) { firstEntered.resolve(); return first.promise; }
    secondEntered.resolve(); return second.promise;
  });
  const manager = new TokenManager<QwenSession>({
    displayName: "Test", preemptMs: 0,
    load: async () => { const s = await getSession("qwen"); if (loadingThirdCaller) thirdLoaded.resolve(); return s; },
    saveIfCurrent: (expected, next, current) => updateSessionIfCurrent("qwen", expected, next, current),
    removeIfCurrent: (expected, current) => updateSessionIfCurrent("qwen", expected, undefined, current),
    refresh, isPermanent: () => false,
  });
  const a = manager.session().catch(error => error);
  await firstEntered.promise;
  manager.abort();
  const b = manager.session().catch(error => error);
  await secondEntered.promise;
  first.resolve(renewed);
  expect(await a).toMatchObject({ code: "MISSING_CREDENTIAL" });
  loadingThirdCaller = true;
  const c = manager.session().catch(error => error);
  await thirdLoaded.promise;
  second.resolve(renewed);
  expect((await b).accessToken === renewed.accessToken).toBe(true);
  expect((await c).accessToken === renewed.accessToken).toBe(true);
  expect(refresh).toHaveBeenCalledTimes(2);
});

it("does not coalesce refreshes for different credentials in the same generation", async () => {
  const first = deferred<QwenSession>();
  const second = deferred<QwenSession>();
  const firstEntered = deferred<void>();
  const secondEntered = deferred<void>();
  const refresh = vi.fn(async (s: QwenSession) => {
    if (s.accessToken === old.accessToken) { firstEntered.resolve(); return first.promise; }
    secondEntered.resolve(); return second.promise;
  });
  const manager = new TokenManager<QwenSession>({
    displayName: "Test", preemptMs: 0, load: () => getSession("qwen"),
    saveIfCurrent: (expected, next, current) => updateSessionIfCurrent("qwen", expected, next, current),
    removeIfCurrent: (expected, current) => updateSessionIfCurrent("qwen", expected, undefined, current),
    refresh, isPermanent: () => false,
  });
  const a = manager.session().catch(error => error);
  await firstEntered.promise;
  await saveSession("qwen", replacement);
  const b = manager.session(true).catch(error => error);
  await secondEntered.promise;
  first.resolve(renewed);
  expect(await a).toMatchObject({ code: "MISSING_CREDENTIAL" });
  second.resolve(renewed);
  expect((await b).accessToken === renewed.accessToken).toBe(true);
  expect(refresh).toHaveBeenCalledTimes(2);
});

it.each([false, true])("transient fallback requires a current operation (abort=%s)", async abort => {
  const valid = { ...old, expiresAt: Date.now() + 60_000 };
  await saveSession("qwen", valid);
  const entered = deferred<void>();
  const result = deferred<QwenSession>();
  const manager = new TokenManager<QwenSession>({
    displayName: "Test", preemptMs: 120_000, load: () => getSession("qwen"),
    saveIfCurrent: (expected, next, current) => updateSessionIfCurrent("qwen", expected, next, current),
    removeIfCurrent: (expected, current) => updateSessionIfCurrent("qwen", expected, undefined, current),
    refresh: async () => { entered.resolve(); return result.promise; }, isPermanent: () => false,
  });
  const pending = manager.session().catch(error => error);
  await entered.promise;
  if (abort) manager.abort();
  result.reject(new Error("offline"));
  const value = await pending;
  if (abort) expect(value).toMatchObject({ code: "MISSING_CREDENTIAL" });
  else expect(value.accessToken === valid.accessToken).toBe(true);
});

it.each(["success", "permanent"])("preserves replaced credentials without abort on %s", async outcome => {
  const { manager, entered, result, onRemoved } = setup();
  const pending = manager.session().catch(error => error);
  await entered.promise;
  await saveSession("qwen", replacement);
  if (outcome === "success") result.resolve(renewed);
  else result.reject(new Error("invalid_grant"));
  await pending;
  expect((await getSession("qwen"))?.accessToken === replacement.accessToken).toBe(true);
  expect(onRemoved).not.toHaveBeenCalled();
});
