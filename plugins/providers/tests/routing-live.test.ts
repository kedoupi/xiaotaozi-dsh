import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRoutingPublisher,
  createRoutingObserver,
  getRoutingSnapshot,
  loadRoutingContract,
  preloadRouting,
  publishRouting,
  resetRoutingLive,
  routingSessionIdentity,
  subscribeRouting,
} from "../src/client/routing-live.ts";
import type { RoutingContract } from "../src/router/contract.ts";
import type { Rpc, RpcResult } from "../src/client/workspace-shared.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const route = (sessionId?: string): RpcResult<unknown> => ({
  ok: true,
  value: {
    mode: "smart",
    candidateCount: 2,
    attribution: sessionId === undefined ? "historical" : "session",
    sessionId,
    lastSelected: {
      provider: "p",
      model: sessionId ?? "history",
      displayName: sessionId ?? "history",
    },
  },
});

afterEach(() => {
  vi.useRealTimers();
  resetRoutingLive();
});

describe("routing-live session lifecycle", () => {
  it("rejects delayed refresh after manual intent, overlapping reads and disposed save results", () => {
    const publisher = createRoutingPublisher();
    const oldRefresh = publisher.read();
    const save = publisher.intent();
    const duringSave = publisher.read();
    expect(oldRefresh({ mode: "smart", candidateCount: 2 })).toBe(false);
    expect(duringSave({ mode: "smart", candidateCount: 2 })).toBe(false);
    expect(save.publish({ mode: "manual", candidateCount: 2 })).toBe(true);
    save.finish();
    expect(oldRefresh({ mode: "smart", candidateCount: 2 })).toBe(false);
    const first = publisher.read();
    const second = publisher.read();
    expect(second({ mode: "manual", candidateCount: 3 })).toBe(true);
    expect(first({ mode: "smart", candidateCount: 2 })).toBe(false);
    const obsolete = publisher.intent();
    const newest = publisher.intent();
    expect(newest.publish({ mode: "manual", candidateCount: 3 })).toBe(true);
    expect(obsolete.publish({ mode: "smart", candidateCount: 2 })).toBe(false);
    obsolete.finish();
    newest.finish();
    const disposed = publisher.intent();
    publisher.dispose();
    expect(disposed.publish({ mode: "smart", candidateCount: 2 })).toBe(false);
    // Disposal releases only its own pending intent, not other subscribers/readers.
    const fresh = createRoutingPublisher();
    expect(fresh.read()({ mode: "manual", candidateCount: 4 })).toBe(true);
    fresh.dispose();
    expect(getRoutingSnapshot()).toEqual({ mode: "manual", candidateCount: 4 });
  });

  it("passes session identity without changing legacy RPC calls", async () => {
    const call = vi.fn(async () => route("A"));
    await loadRoutingContract({ call }, "A");
    expect(call).toHaveBeenLastCalledWith("/providers-auth", "routing", {
      sessionId: "A",
    });
    await loadRoutingContract({ call });
    expect(call).toHaveBeenLastCalledWith("/providers-auth", "routing", {});
  });

  it("recognizes absence only from ready/current undefined, never loading or empty session", () => {
    expect(
      routingSessionIdentity({ phase: "ready", current: undefined }),
    ).toEqual({ kind: "historical" });
    expect(
      routingSessionIdentity({ phase: "loading", current: undefined }),
    ).toEqual({ kind: "pending" });
    expect(routingSessionIdentity({ phase: "ready", current: "A" })).toEqual({
      kind: "session",
      sessionId: "A",
    });
    expect(routingSessionIdentity({ phase: "loading", current: "A" })).toEqual({
      kind: "pending",
    });
  });

  it("fences late startup preload against a user mode publication and disposal; preserves other subscribers", async () => {
    const pending = deferred<RpcResult<unknown>>();
    const seen = vi.fn();
    const off = subscribeRouting(seen);
    const dispose = preloadRouting({ call: () => pending.promise });
    publishRouting({ mode: "manual", candidateCount: 9 });
    dispose();
    pending.resolve(route());
    await pending.promise;
    await Promise.resolve();
    expect(getRoutingSnapshot()).toEqual({ mode: "manual", candidateCount: 9 });
    publishRouting({ mode: "smart", candidateCount: 1 });
    expect(seen).toHaveBeenLastCalledWith({ mode: "smart", candidateCount: 1 });
    off();
  });

  it("clears A immediately on B selection, rejects late A and keeps one RPC in flight", async () => {
    vi.useFakeTimers();
    const a = deferred<RpcResult<unknown>>();
    const call = vi
      .fn<Rpc["call"]>()
      .mockReturnValueOnce(a.promise)
      .mockResolvedValue(route("B"));
    const seen: RoutingContract[] = [];
    const observer = createRoutingObserver({ call }, (next) => seen.push(next));
    observer.update("A", true);
    observer.update("B", true);
    expect(seen.at(-1)?.lastSelected).toBeUndefined();
    expect(call).toHaveBeenCalledTimes(1);
    a.resolve(route("A"));
    await vi.advanceTimersByTimeAsync(0);
    expect(call).toHaveBeenCalledTimes(2);
    expect(seen.at(-1)).toMatchObject({
      sessionId: "B",
      lastSelected: { model: "B" },
    });
    expect(seen.some((next) => next.lastSelected?.model === "A")).toBe(false);
    observer.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["button", "Enter"])(
    "observes shared running lifecycle for %s beyond 2400ms then stops on idle",
    async () => {
      vi.useFakeTimers();
      const call = vi.fn(async () => route("A"));
      const seen = vi.fn();
      const observer = createRoutingObserver({ call }, seen);
      observer.update("A", true);
      await vi.advanceTimersByTimeAsync(3000);
      expect(call.mock.calls.length).toBeGreaterThan(5);
      observer.update("A", false);
      await vi.advanceTimersByTimeAsync(0);
      const count = call.mock.calls.length;
      await vi.advanceTimersByTimeAsync(5000);
      expect(call).toHaveBeenCalledTimes(count);
      expect(vi.getTimerCount()).toBe(0);
      observer.dispose();
    },
  );

  it.each([5, 1000])(
    "caps observation at total bound despite poll interval %s and a pending RPC",
    async (pollIntervalMs) => {
      vi.useFakeTimers();
      const pending = deferred<RpcResult<unknown>>();
      const call = vi.fn(() => pending.promise);
      const seen = vi.fn();
      const observer = createRoutingObserver({ call }, seen, {
        pollIntervalMs,
        totalTimeoutMs: 20,
      });
      observer.update("A", true);
      await vi.advanceTimersByTimeAsync(20);
      expect(vi.getTimerCount()).toBe(0);
      const count = seen.mock.calls.length;
      pending.resolve(route("A"));
      await vi.advanceTimersByTimeAsync(1000);
      expect(seen).toHaveBeenCalledTimes(count);
      expect(call).toHaveBeenCalledTimes(1);
      observer.dispose();
    },
  );

  it("starts a new bounded observation for a new request identity while still running", async () => {
    vi.useFakeTimers();
    const call = vi.fn(async () => route("A"));
    const observer = createRoutingObserver({ call }, () => {}, {
      pollIntervalMs: 5,
      totalTimeoutMs: 20,
    });
    observer.update("A", true, "first");
    await vi.advanceTimersByTimeAsync(25);
    const count = call.mock.calls.length;
    observer.update("A", true, "first");
    await vi.advanceTimersByTimeAsync(25);
    expect(call).toHaveBeenCalledTimes(count);
    observer.update("A", true, "second");
    await vi.advanceTimersByTimeAsync(0);
    expect(call).toHaveBeenCalledTimes(count + 1);
    observer.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rearms on admitted queue consumption without overlapping an expired RPC or accepting disposed results", async () => {
    vi.useFakeTimers();
    const old = deferred<RpcResult<unknown>>();
    const next = deferred<RpcResult<unknown>>();
    const call = vi
      .fn<Rpc["call"]>()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(next.promise);
    const seen = vi.fn();
    const observer = createRoutingObserver({ call }, seen, {
      pollIntervalMs: 5,
      totalTimeoutMs: 20,
    });
    observer.update("A", true, undefined, '[["message-B","queued"]]');
    await vi.advanceTimersByTimeAsync(25);
    expect(vi.getTimerCount()).toBe(0);
    observer.update("A", true, undefined, "[]");
    expect(call).toHaveBeenCalledTimes(1);
    const received = seen.mock.calls.length;
    old.resolve(route("A"));
    await vi.advanceTimersByTimeAsync(0);
    expect(call).toHaveBeenCalledTimes(2);
    expect(seen).toHaveBeenCalledTimes(received);
    observer.dispose();
    next.resolve(route("A"));
    await vi.advanceTimersByTimeAsync(50);
    expect(call).toHaveBeenCalledTimes(2);
    expect(seen).toHaveBeenCalledTimes(received);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["intent", "publication", "session", "dispose"])(
    "rechecks %s fences after synchronous shared-control publication",
    async (reason) => {
      vi.useFakeTimers();
      publishRouting({ mode: "smart", candidateCount: 1 });
      const pending = deferred<RpcResult<unknown>>();
      const next = deferred<RpcResult<unknown>>();
      const call = vi
        .fn<Rpc["call"]>()
        .mockReturnValueOnce(pending.promise)
        .mockReturnValue(next.promise);
      const seen = vi.fn();
      const observer = createRoutingObserver({ call }, seen);
      const publisher = createRoutingPublisher();
      let reconciliations = 0;
      const off = subscribeRouting((value) => {
        if (value.mode !== "manual") return;
        reconciliations += 1;
        if (reason === "intent") publisher.intent();
        if (reason === "publication")
          publishRouting({ mode: "smart", candidateCount: 7 });
        if (reason === "session") observer.update("B", true);
        if (reason === "dispose") observer.dispose();
      });
      observer.update("A", true);
      pending.resolve({
        ok: true,
        value: {
          ...(route("A").value as object),
          mode: "manual",
          candidateCount: 0,
        },
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(reconciliations).toBe(1);
      expect(
        seen.mock.calls.some(([value]) => value.lastSelected !== undefined),
      ).toBe(false);
      expect(getRoutingSnapshot()).toEqual(
        reason === "publication"
          ? { mode: "smart", candidateCount: 7 }
          : { mode: "manual", candidateCount: 0 },
      );
      expect(call.mock.calls.length).toBeLessThanOrEqual(2);
      observer.dispose();
      publisher.dispose();
      off();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("uses a Host timing override and clears a poll scheduled beyond the total bound", async () => {
    vi.useFakeTimers();
    const call = vi.fn(async () => ({
      ok: true,
      value: {
        ...(route("A").value as object),
        refreshTiming: { pollIntervalMs: 1000, totalTimeoutMs: 20 },
      },
    }));
    const observer = createRoutingObserver({ call }, () => {});
    observer.update("A", true);
    await vi.advanceTimersByTimeAsync(20);
    expect(call).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    observer.dispose();
  });

  it("handles rejection without unhandled work and fences disposed results", async () => {
    vi.useFakeTimers();
    const pending = deferred<RpcResult<unknown>>();
    const call = vi
      .fn<Rpc["call"]>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockReturnValue(pending.promise);
    const seen = vi.fn();
    const observer = createRoutingObserver({ call }, seen, {
      pollIntervalMs: 5,
      totalTimeoutMs: 20,
    });
    observer.update("A", true);
    await vi.advanceTimersByTimeAsync(5);
    expect(call).toHaveBeenCalledTimes(2);
    observer.dispose();
    const count = seen.mock.calls.length;
    pending.resolve(route("A"));
    await vi.advanceTimersByTimeAsync(100);
    expect(seen).toHaveBeenCalledTimes(count);
    expect(vi.getTimerCount()).toBe(0);
  });
});
