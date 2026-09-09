import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import {
  SmartComposerGuard,
  type SmartUxInjected,
} from "../src/client/SmartUx.tsx";
import {
  KeyPanel,
  ModelsList,
  VendorGroup,
} from "../src/client/workspace-panels.tsx";
import type { HostApi } from "../src/client/host-api.ts";
import { ModelsWorkspace } from "../src/client/ModelsWorkspace.tsx";
import { installSmartUx } from "../src/client/install-smart-ux.ts";
import { MODEL_SEAT_SLOT } from "../src/client/smart-ux.ts";
import { EMPTY_POOL_GUIDE } from "../src/router/empty-pool.ts";
import {
  createRoutingPublisher,
  getRoutingSnapshot,
  preloadRouting,
  publishRouting,
  resetRoutingLive,
  subscribeRouting,
} from "../src/client/routing-live.ts";
import type { Rpc, RpcResult } from "../src/client/workspace-shared.ts";

// Hook lifecycle fixture, not a browser renderer. Runs the actual component's
// effects and handlers without credentials, remote services or a DOM mount.
const hooks = vi.hoisted(() => {
  let cursor = 0;
  const cells: unknown[] = [];
  const effects: Array<() => void> = [];
  const cleanups = new Map<number, () => void>();
  let writes = 0;
  return {
    start() {
      cursor = 0;
    },
    flush() {
      for (const effect of effects.splice(0)) effect();
    },
    dispose() {
      for (const cleanup of cleanups.values()) cleanup();
      cleanups.clear();
    },
    reset() {
      cursor = 0;
      cells.length = 0;
      effects.length = 0;
      writes = 0;
    },
    writes: () => writes,
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in cells))
        cells[index] = typeof initial === "function" ? initial() : initial;
      return [
        cells[index],
        (next: unknown) => {
          writes += 1;
          cells[index] = typeof next === "function" ? next(cells[index]) : next;
        },
      ];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      if (!(index in cells)) cells[index] = { current: initial };
      return cells[index];
    },
    useMemo(compute: () => unknown) {
      cursor++;
      return compute();
    },
    useEffect(effect: () => void | (() => void), deps?: unknown[]) {
      const index = cursor++;
      const prior = cells[index] as unknown[] | undefined;
      if (
        deps &&
        prior &&
        deps.length === prior.length &&
        deps.every((value, i) => Object.is(value, prior[i]))
      )
        return;
      cells[index] = deps;
      effects.push(() => {
        cleanups.get(index)?.();
        const cleanup = effect();
        if (cleanup) cleanups.set(index, cleanup);
      });
    },
  };
});
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: hooks.useState,
  useRef: hooks.useRef,
  useMemo: hooks.useMemo,
  useEffect: hooks.useEffect,
  useLayoutEffect: hooks.useEffect,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const ok = (mode: "manual" | "smart"): RpcResult<unknown> => ({
  ok: true,
  value: { mode, candidateCount: 2, attribution: "historical" },
});
const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
function render(rpc: Rpc, api?: HostApi): ReactElement {
  hooks.start();
  const tree = ModelsWorkspace({ rpc, api, t: (key) => key });
  hooks.flush();
  return tree as ReactElement;
}
function checkbox(
  node: unknown,
): ReactElement<{ onChange(event: { target: { checked: boolean } }): void }> {
  const visit = (value: unknown): ReactElement | undefined => {
    if (Array.isArray(value)) return value.map(visit).find(Boolean);
    if (!value || typeof value !== "object" || !("props" in value)) return;
    const element = value as ReactElement;
    if (element.props.type === "checkbox") return element;
    return visit(element.props.children);
  };
  const result = visit(node);
  if (!result) throw new Error("Routing checkbox missing");
  return result;
}
function rpcFixture(
  route: () => Promise<RpcResult<unknown>>,
  save = async (): Promise<RpcResult<unknown>> => ({ ok: true }),
): Rpc {
  return {
    call: vi.fn(async (_channel, endpoint) => {
      if (endpoint === "routing") return route();
      if (endpoint === "setRouting") return save();
      if (endpoint === "status")
        return { ok: true, value: { providers: {}, enabled: [] } };
      if (endpoint === "catalog") return { ok: true, value: { vendors: [] } };
      throw new Error("Unexpected fixture endpoint");
    }),
  };
}
beforeEach(() => {
  hooks.reset();
  resetRoutingLive();
});
afterEach(() => {
  hooks.dispose();
  resetRoutingLive();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ModelsWorkspace routing lifecycle", () => {
  it.each([0, 3])(
    "reconciles the accepted startup preload while its initial refresh is pending (pool %s)",
    async (candidateCount) => {
      const preload = deferred<RpcResult<unknown>>();
      const workspace = deferred<RpcResult<unknown>>();
      let calls = 0;
      const rpc = rpcFixture(() =>
        ++calls === 1 ? preload.promise : workspace.promise,
      );
      const disposePreload = preloadRouting(rpc);
      const otherSubscriber = vi.fn();
      const unsubscribe = subscribeRouting(otherSubscriber);
      render(rpc);
      expect(calls).toBe(2);
      const accepted = {
        mode: "smart",
        candidateCount,
        attribution: "historical",
      } as const;
      preload.resolve({ ok: true, value: accepted });
      await settle();
      // This stale competing read must not replace the winning preload's mode/count.
      workspace.resolve({
        ok: true,
        value: { mode: "manual", candidateCount: candidateCount === 0 ? 3 : 0 },
      });
      await settle();
      const tree = render(rpc);
      expect(getRoutingSnapshot()).toEqual(accepted);
      expect(tree.props["aria-busy"]).not.toBe(true);
      expect(checkbox(tree).props).toMatchObject({ checked: true });
      expect(JSON.stringify(tree).includes('"routeEmpty"')).toBe(
        candidateCount === 0,
      );
      hooks.dispose();
      const writes = hooks.writes();
      publishRouting({ mode: "manual", candidateCount: 7 });
      expect(hooks.writes()).toBe(writes);
      expect(otherSubscriber).toHaveBeenLastCalledWith({
        mode: "manual",
        candidateCount: 7,
      });
      unsubscribe();
      disposePreload();
    },
  );

  it("does not let the initial delayed routing refresh overwrite a newer manual save", async () => {
    const pending = deferred<RpcResult<unknown>>();
    let calls = 0;
    const rpc = rpcFixture(() =>
      ++calls === 1 ? pending.promise : Promise.resolve(ok("manual")),
    );
    checkbox(render(rpc)).props.onChange({ target: { checked: false } });
    await settle();
    pending.resolve(ok("smart"));
    await settle();
    expect(getRoutingSnapshot().mode).toBe("manual");
    expect(checkbox(render(rpc)).props).toMatchObject({ checked: false });
  });

  it("contains a rejected initial refresh and presents the existing load failure", async () => {
    const rpc = rpcFixture(async () => {
      throw new Error("fixture offline");
    });
    render(rpc);
    await settle();
    const tree = render(rpc);
    expect(JSON.stringify(tree)).toContain("loadFailed");
    expect(tree.props["aria-busy"]).not.toBe(true);
  });

  it("ignores a rejected mode save after unmount without state writes or another refresh", async () => {
    const pending = deferred<RpcResult<unknown>>();
    const rpc = rpcFixture(
      async () => ok("smart"),
      () => pending.promise,
    );
    const tree = render(rpc);
    await settle();
    checkbox(tree).props.onChange({ target: { checked: false } });
    hooks.dispose();
    const writes = hooks.writes();
    const calls = vi.mocked(rpc.call).mock.calls.length;
    pending.reject(new Error("fixture save offline"));
    await settle();
    expect(hooks.writes()).toBe(writes);
    expect(rpc.call).toHaveBeenCalledTimes(calls);
    expect(getRoutingSnapshot().mode).toBe("smart");
  });
});

describe("SmartComposerGuard shared published lifecycle", () => {
  it.each([
    { initialCount: 1, mode: "smart" as const, candidateCount: 0 },
    { initialCount: 0, mode: "smart" as const, candidateCount: 2 },
    { initialCount: 1, mode: "manual" as const, candidateCount: 0 },
  ])(
    "reconciles accepted $mode/$candidateCount with both send guards and picker registration from pool $initialCount",
    async ({ initialCount, mode, candidateCount }) => {
      vi.useFakeTimers();
      const document = new EventTarget();
      vi.stubGlobal("document", document);
      const historical = {
        mode: "smart" as const,
        candidateCount: initialCount,
        attribution: "historical" as const,
        lastSelected: {
          provider: "p",
          model: "history",
          displayName: "Historical model",
        },
        refreshTiming: { pollIntervalMs: 10, totalTimeoutMs: 50 },
      };
      publishRouting(historical);
      const pending = deferred<RpcResult<unknown>>();
      const accepted = {
        mode,
        candidateCount,
        attribution: "session",
        sessionId: "A",
        lastSelected: {
          provider: "p",
          model: "session-only",
          displayName: "Session model",
        },
        refreshTiming: historical.refreshTiming,
      };
      let sessionCalls = 0;
      const call = vi.fn<Rpc["call"]>(async (_channel, method, payload) => {
        if (method !== "routing")
          throw new Error("Unexpected fixture endpoint");
        if (!(payload as { sessionId?: string }).sessionId)
          return { ok: true, value: historical };
        sessionCalls += 1;
        if (sessionCalls > 10) throw new Error("Publication feedback loop");
        return sessionCalls === 1
          ? pending.promise
          : { ok: true, value: accepted };
      });
      const registrations = new Set<string>();
      const disposeInstall = installSmartUx({
        get: () => ({ rpc: { call } }),
        slots: {
          inject: (_name: string, install: () => () => void) => install(),
          register: (options: { name: string }) => {
            registrations.add(options.name);
            return () => {
              registrations.delete(options.name);
            };
          },
        },
      } as unknown as Parameters<typeof installSmartUx>[0]);
      await vi.advanceTimersByTimeAsync(0);
      expect(registrations.has(MODEL_SEAT_SLOT)).toBe(true);
      const published = vi.fn();
      const unsubscribe = subscribeRouting(published);
      const submit = vi.fn();
      const props: SmartUxInjected = {
        rpc: { call },
        sessionId: "A",
        inputActions: { submit },
        useSession: (select) =>
          select({ running: true, blank: false, pendingSubmissions: [], queue: [] }),
        useInput: (select) => select({ phase: "plain" }),
      };
      const renderComposer = () => {
        hooks.start();
        const tree = SmartComposerGuard(props);
        hooks.flush();
        return tree;
      };
      const enter = () => {
        const event = Object.assign(
          new Event("keydown", { cancelable: true }),
          {
            key: "Enter",
            shiftKey: false,
            isComposing: false,
            repeat: false,
          },
        );
        Object.defineProperty(event, "target", {
          value: {
            closest: (selector: string) =>
              selector.includes("contenteditable") ? {} : null,
          },
        });
        document.dispatchEvent(event);
        return event.defaultPrevented;
      };
      renderComposer();
      props.inputActions.submit();
      expect(submit).toHaveBeenCalledTimes(initialCount === 0 ? 0 : 1);
      expect(enter()).toBe(initialCount === 0);
      pending.resolve({ ok: true, value: accepted });
      await vi.advanceTimersByTimeAsync(0);
      const blocked = mode === "smart" && candidateCount === 0;
      expect(JSON.stringify(renderComposer()).includes(EMPTY_POOL_GUIDE)).toBe(
        blocked,
      );
      submit.mockClear();
      props.inputActions.submit();
      expect(submit).toHaveBeenCalledTimes(blocked ? 0 : 1);
      expect(enter()).toBe(blocked);
      expect(getRoutingSnapshot()).toEqual({
        ...historical,
        mode,
        candidateCount,
      });
      expect(registrations.has(MODEL_SEAT_SLOT)).toBe(mode === "smart");
      // Only changed controls publish. Repeated session decisions remain local.
      expect(published).toHaveBeenCalledTimes(2);
      expect(sessionCalls).toBeLessThanOrEqual(2);
      await vi.advanceTimersByTimeAsync(20);
      expect(published).toHaveBeenCalledTimes(2);
      expect(sessionCalls).toBeLessThanOrEqual(4);
      hooks.dispose();
      disposeInstall();
      unsubscribe();
      expect(props.inputActions.submit).toBe(submit);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(["intent", "publication", "session", "dispose"])(
    "does not reconcile a deferred response rejected by %s",
    async (reason) => {
      vi.useFakeTimers();
      vi.stubGlobal("document", new EventTarget());
      const initial = { mode: "smart", candidateCount: 1 } as const;
      publishRouting(initial);
      const pending = deferred<RpcResult<unknown>>();
      const next = deferred<RpcResult<unknown>>();
      const call = vi
        .fn<Rpc["call"]>()
        .mockReturnValueOnce(pending.promise)
        .mockReturnValue(next.promise);
      const submit = vi.fn();
      const props: SmartUxInjected = {
        rpc: { call },
        sessionId: "A",
        inputActions: { submit },
        useSession: (select) =>
          select({ running: true, blank: false, pendingSubmissions: [], queue: [] }),
        useInput: (select) => select({ phase: "plain" }),
      };
      const renderComposer = () => {
        hooks.start();
        const tree = SmartComposerGuard(props);
        hooks.flush();
        return tree;
      };
      renderComposer();
      const publisher = createRoutingPublisher();
      const newer = { mode: "manual", candidateCount: 3 } as const;
      if (reason === "intent") publisher.intent();
      if (reason === "publication") publishRouting(newer);
      if (reason === "session") {
        props.sessionId = "B";
        renderComposer();
      }
      if (reason === "dispose") hooks.dispose();
      const writes = hooks.writes();
      pending.resolve({
        ok: true,
        value: {
          mode: "smart",
          candidateCount: 0,
          attribution: "session",
          sessionId: "A",
          lastSelected: {
            provider: "p",
            model: "rejected",
            displayName: "Rejected model",
          },
        },
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(getRoutingSnapshot()).toEqual(
        reason === "publication" ? newer : initial,
      );
      if (reason === "dispose") expect(hooks.writes()).toBe(writes);
      else {
        const tree = JSON.stringify(renderComposer());
        expect(tree).not.toContain("Rejected model");
        expect(tree).not.toContain(EMPTY_POOL_GUIDE);
        props.inputActions.submit();
        expect(submit).toHaveBeenCalledTimes(1);
      }
      expect(call.mock.calls.length).toBeLessThanOrEqual(2);
      hooks.dispose();
      publisher.dispose();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("observes an admitted queued turn after echo retirement and timeout without becoming idle", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("document", new EventTarget());
    const refreshTiming = { pollIntervalMs: 5, totalTimeoutMs: 20 };
    publishRouting({ mode: "smart", candidateCount: 1, refreshTiming });
    let model = "turn-A";
    const call = vi.fn(async () => ({
      ok: true,
      value: {
        mode: "smart",
        candidateCount: 1,
        attribution: "session",
        sessionId: "A",
        refreshTiming,
        lastSelected: { provider: "p", model, displayName: model },
      },
    }));
    const session = {
      running: true,
      blank: false,
      pendingSubmissions: [] as { requestId: string }[],
      queue: [] as {
        id: string;
        placement: "queued" | "steering" | "context";
      }[],
    };
    const props: SmartUxInjected = {
      rpc: { call },
      sessionId: "A",
      inputActions: { submit() {} },
      useSession: (select) => select(session),
      useInput: (select) => select({ phase: "plain" }),
    };
    const renderComposer = () => {
      hooks.start();
      const tree = SmartComposerGuard(props);
      hooks.flush();
      return tree;
    };
    renderComposer();
    await vi.advanceTimersByTimeAsync(5);
    session.pendingSubmissions = [{ requestId: "request-B" }];
    renderComposer();
    await vi.advanceTimersByTimeAsync(0);
    // RC1 mirrors admission in queue, then retires the local echo one frame later.
    session.queue = [{ id: "message-B", placement: "queued" }];
    renderComposer();
    session.pendingSubmissions = [];
    renderComposer();
    await vi.advanceTimersByTimeAsync(25);
    expect(vi.getTimerCount()).toBe(0);
    const expiredCalls = call.mock.calls.length;
    session.queue = [{ id: "message-B", placement: "queued" }];
    renderComposer();
    await vi.advanceTimersByTimeAsync(25);
    expect(call).toHaveBeenCalledTimes(expiredCalls);
    // A ends and the same running driver claims B; there is no false running pulse.
    model = "turn-B";
    session.queue = [];
    renderComposer();
    await vi.advanceTimersByTimeAsync(0);
    expect(session.running).toBe(true);
    expect(session.pendingSubmissions).toEqual([]);
    expect(call).toHaveBeenCalledTimes(expiredCalls + 1);
    expect(call).toHaveBeenLastCalledWith("/providers-auth", "routing", {
      sessionId: "A",
    });
    expect(JSON.stringify(renderComposer())).toContain("turn-B");
    await vi.advanceTimersByTimeAsync(25);
    const boundedCalls = call.mock.calls.length;
    renderComposer();
    await vi.advanceTimersByTimeAsync(25);
    expect(call).toHaveBeenCalledTimes(boundedCalls);
    hooks.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["button", "Enter"])(
    "observes a delayed decision from %s and disposes its own work",
    async (gesture) => {
      vi.useFakeTimers();
      const document = new EventTarget();
      vi.stubGlobal("document", document);
      publishRouting({ mode: "smart", candidateCount: 1 });
      const started = Date.now();
      const call = vi.fn(async () => ({
        ok: true,
        value: {
          mode: "smart",
          candidateCount: 1,
          attribution: "session",
          sessionId: "A",
          ...(Date.now() - started < 3000
            ? {}
            : {
                lastSelected: {
                  provider: "p",
                  model: "late",
                  displayName: "Late model",
                },
              }),
        },
      }));
      const session = {
        running: false,
        blank: false,
        pendingSubmissions: [] as { requestId: string }[],
        queue: [],
      };
      const sink = (): void => {
        session.running = true;
        session.pendingSubmissions = [{ requestId: "request-1" }];
      };
      const original = vi.fn(sink);
      const props: SmartUxInjected = {
        rpc: { call },
        sessionId: "A",
        inputActions: { submit: original },
        useSession: (select) => select(session),
        useInput: (select) => select({ phase: "plain" }),
      };
      const renderComposer = () => {
        hooks.start();
        const tree = SmartComposerGuard(props);
        hooks.flush();
        return tree;
      };
      renderComposer();
      await vi.advanceTimersByTimeAsync(0);
      if (gesture === "button") props.inputActions.submit();
      else {
        // The Host Enter sink bypasses the public button callback but publishes
        // the same Session snapshot; no private keyboard prop is injected.
        document.addEventListener("keydown", sink, { once: true });
        document.dispatchEvent(
          Object.assign(new Event("keydown"), { key: "Enter" }),
        );
      }
      expect(original).toHaveBeenCalledTimes(gesture === "button" ? 1 : 0);
      renderComposer();
      await vi.advanceTimersByTimeAsync(3500);
      expect(JSON.stringify(renderComposer())).toContain("Late model");
      session.running = false;
      session.pendingSubmissions = [];
      renderComposer();
      await vi.advanceTimersByTimeAsync(0);
      const count = call.mock.calls.length;
      hooks.dispose();
      expect(props.inputActions.submit).toBe(original);
      await vi.advanceTimersByTimeAsync(5000);
      expect(call).toHaveBeenCalledTimes(count);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});

function elementWhere(
  root: unknown,
  predicate: (element: ReactElement) => boolean,
): ReactElement | undefined {
  if (Array.isArray(root))
    return root.map((node) => elementWhere(node, predicate)).find(Boolean);
  if (!root || typeof root !== "object" || !("props" in root)) return;
  const element = root as ReactElement;
  return predicate(element)
    ? element
    : elementWhere(element.props.children, predicate);
}
async function keyFixture(configured = true) {
  vi.useFakeTimers();
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  vi.stubGlobal(
    "document",
    Object.assign(new EventTarget(), { activeElement: null }),
  );
  vi.stubGlobal("HTMLElement", class {});
  const rpc = rpcFixture(async () => ok("manual"));
  const success = <T>(value: T) => ({ result: { ok: true as const, value } });
  const metadata = {
    OPENAI_API_KEY: { configured, writable: true },
    DEEPSEEK_API_KEY: { configured, writable: true },
  };
  const api: HostApi = {
    llm: {
      providers: async () =>
        success({
          providers: ["openai", "deepseek"].map((provider) => ({
            provider,
            displayName: provider,
            settingsNs: "llm-test",
            settingsPath: [provider],
          })),
        }),
      models: async () =>
        success({
          groups: ["openai", "deepseek"].map((id) => ({
            id,
            name: id,
            models: [
              { id: "a", name: "A" },
              { id: "b", name: "B" },
            ],
          })),
        }),
      discoverModels: async () => success({ models: [] }),
    },
    settings: {
      describe: async () =>
        success({ namespaces: [{ ns: "llm-test", value: {}, revision: 1 }] }),
      mutate: async () => success(undefined),
    },
    credentials: {
      describe: vi.fn(async () =>
        success({ credentials: structuredClone(metadata) }),
      ),
      set: vi.fn(async () => success(undefined)),
      unset: vi.fn(async () => success(undefined)),
    },
  };
  const view = () => render(rpc, api);
  const panel = () => {
    const element = elementWhere(view(), (el) => el.type === KeyPanel);
    if (!element) throw new Error("KeyPanel missing");
    return element.props as Parameters<typeof KeyPanel>[0];
  };
  view();
  await settle();
  view();
  await settle();
  view();
  await settle();
  return { rpc, api, panel, view, metadata, success };
}
describe("ModelsWorkspace credential operations", () => {
  it("retains failed draft and clears successful replacement without overlapping Enter saves", async () => {
    const f = await keyFixture();
    const pending =
      deferred<Awaited<ReturnType<HostApi["credentials"]["set"]>>>();
    vi.mocked(f.api.credentials.set).mockReturnValue(pending.promise);
    f.panel().onDraft("disposable-1");
    const submit = f.panel().onPersist;
    submit();
    submit();
    expect(f.api.credentials.set).toHaveBeenCalledTimes(1);
    pending.resolve({ result: { ok: false, error: { message: "Rejected" } } });
    await settle();
    expect(f.panel().keyDraft).toBe("disposable-1");
    vi.mocked(f.api.credentials.set).mockResolvedValue(f.success(undefined));
    f.panel().onPersist();
    await settle();
    expect(f.panel().keyDraft).toBe("");
    expect(f.panel().savedOk).toBe(true);
  });
  it("does not clear a newer draft when an older save completes", async () => {
    const f = await keyFixture();
    const pending =
      deferred<Awaited<ReturnType<HostApi["credentials"]["set"]>>>();
    vi.mocked(f.api.credentials.set).mockReturnValue(pending.promise);
    f.panel().onDraft("disposable-1");
    f.panel().onPersist();
    f.panel().onDraft("disposable-2");
    pending.resolve(f.success(undefined));
    await settle();
    expect(f.panel().keyDraft).toBe("disposable-2");
    expect(f.panel().savedOk).toBe(false);
  });
  it("invalidates a describe started before a save, including while the write is pending", async () => {
    const f = await keyFixture();
    const stale =
      deferred<Awaited<ReturnType<HostApi["credentials"]["describe"]>>>();
    vi.mocked(f.api.credentials.describe).mockReturnValueOnce(stale.promise);
    checkbox(f.view()).props.onChange({ target: { checked: false } });
    await settle();
    expect(f.api.credentials.describe).toHaveBeenCalledTimes(2);
    const pending =
      deferred<Awaited<ReturnType<HostApi["credentials"]["set"]>>>();
    vi.mocked(f.api.credentials.set).mockReturnValue(pending.promise);
    f.panel().onDraft("disposable-1");
    f.panel().onPersist();
    stale.resolve(
      f.success({
        credentials: {
          OPENAI_API_KEY: { configured: false, writable: false },
          DEEPSEEK_API_KEY: { configured: false, writable: false },
        },
      }),
    );
    await settle();
    expect(f.panel().vendor.configured).toBe(true);
    expect(f.panel().vendor.writable).not.toBe(false);
    pending.resolve(f.success(undefined));
    await settle();
    expect(f.panel().vendor.configured).toBe(true);
  });
  it("does not run key success setters or timers after disposal", async () => {
    const f = await keyFixture();
    const pending =
      deferred<Awaited<ReturnType<HostApi["credentials"]["set"]>>>();
    vi.mocked(f.api.credentials.set).mockReturnValue(pending.promise);
    f.panel().onDraft("disposable-1");
    f.panel().onPersist();
    hooks.dispose();
    const writes = hooks.writes();
    pending.resolve(f.success(undefined));
    await settle();
    expect(hooks.writes()).toBe(writes);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("rejects readonly credential handlers as well as disabling the actual input/Enter path", async () => {
    const f = await keyFixture();
    const props = f.panel();
    props.vendor.writable = false;
    props.onDraft("disposable-denied");
    f.panel().onPersist();
    props.onRemove();
    await settle();
    expect(f.api.credentials.set).not.toHaveBeenCalled();
    expect(f.api.credentials.unset).not.toHaveBeenCalled();
    const tree = KeyPanel({
      ...props,
      replacing: true,
      keyDraft: "disposable-denied",
    });
    const input = elementWhere(tree, (el) => el.type === "input");
    expect(input?.props.disabled).toBe(true);
    const persist = vi.fn();
    const readonly = KeyPanel({
      ...props,
      replacing: true,
      keyDraft: "disposable-denied",
      onPersist: persist,
    });
    elementWhere(readonly, (el) => el.type === "input")?.props.onKeyDown({
      key: "Enter",
      preventDefault: vi.fn(),
    });
    expect(persist).not.toHaveBeenCalled();
  });
});

it("a late rejected model selection cannot overwrite the newer accepted selection", async () => {
  const f = await keyFixture();
  const old = deferred<Awaited<ReturnType<HostApi["settings"]["mutate"]>>>();
  f.api.settings.mutate = vi
    .fn()
    .mockReturnValueOnce(old.promise)
    .mockResolvedValue(f.success(undefined));
  const list = () => {
    const found = elementWhere(f.view(), (el) => el.type === ModelsList);
    if (!found) throw new Error("ModelsList missing");
    return found.props as Parameters<typeof ModelsList>[0];
  };
  list().onSave(["a"]);
  await settle();
  list().onSave([]);
  await settle();
  expect(list().models.every((model) => !model.selected)).toBe(true);
  old.resolve({
    result: { ok: false, error: { message: "Older revision rejected" } },
  });
  await settle();
  expect(list().models.every((model) => !model.selected)).toBe(true);
});

it("disposal while model settings describe is pending prevents a later mutation", async () => {
  const f = await keyFixture();
  const pending =
    deferred<Awaited<ReturnType<HostApi["settings"]["describe"]>>>();
  f.api.settings.describe = vi.fn(() => pending.promise);
  f.api.settings.mutate = vi.fn(async () => f.success(undefined));
  const list = elementWhere(f.view(), (el) => el.type === ModelsList);
  expect(list).toBeTruthy();
  list!.props.onSave([]);
  hooks.dispose();
  const writes = hooks.writes();
  pending.resolve(
    f.success({ namespaces: [{ ns: "llm-test", value: {}, revision: 1 }] }),
  );
  await settle();
  expect(f.api.settings.mutate).not.toHaveBeenCalled();
  expect(hooks.writes()).toBe(writes);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["edit", "dispose"] as const)(
  "retires custom creation after %s while discovery is pending",
  async (action) => {
    const f = await keyFixture();
    elementWhere(
      f.view(),
      (el) => el.props.className === "dshM-add",
    )!.props.onClick();
    elementWhere(
      f.view(),
      (el) => el.props.className === "dshM-customLink",
    )!.props.onClick();
    const inputs = () => {
      const found: ReactElement[] = [];
      elementWhere(f.view(), (el) => {
        if (el.type === "input" && el.props.type !== "checkbox") found.push(el);
        return false;
      });
      return found;
    };
    const fields = inputs();
    expect(fields).toHaveLength(3);
    for (const [i, value] of [
      "Disposable",
      "https://invalid.test",
      "disposable-key",
    ].entries())
      fields[i].props.onChange({ target: { value } });
    const pending =
      deferred<Awaited<ReturnType<HostApi["llm"]["discoverModels"]>>>();
    f.api.llm.discoverModels = vi.fn(() => pending.promise);
    elementWhere(
      f.view(),
      (el) => el.type === "button" && el.props.children === "customCreate",
    )!.props.onClick();
    expect(f.api.llm.discoverModels).toHaveBeenCalledOnce();
    if (action === "edit")
      inputs()[2].props.onChange({ target: { value: "newer-disposable" } });
    else hooks.dispose();
    const writes = hooks.writes();
    pending.resolve(f.success({ models: [{ id: "a", name: "A" }] }));
    await settle();
    expect(
      vi
        .mocked(f.rpc.call)
        .mock.calls.some(([, endpoint]) => endpoint === "custom-create"),
    ).toBe(false);
    if (action === "edit")
      expect(inputs()[2].props.value).toBe("newer-disposable");
    else expect(hooks.writes()).toBe(writes);
  },
);

it.each(["accepted", "rejected", "disposed"] as const)(
  "Models removal is confirmed explicitly and handles %s completion",
  async (outcome) => {
    const f = await keyFixture();
    const ref = f.panel().vendor.ref;
    const pending =
      deferred<Awaited<ReturnType<HostApi["credentials"]["unset"]>>>();
    vi.mocked(f.api.credentials.unset).mockReturnValue(pending.promise);
    f.panel().onRemove();
    expect(f.api.credentials.unset).not.toHaveBeenCalled();
    const confirm = elementWhere(
      f.view(),
      (el) => el.type === "button" && el.props.children === "confirmDisconnect",
    );
    expect(confirm).toBeTruthy();
    confirm!.props.onClick();
    expect(f.api.credentials.unset).toHaveBeenCalledExactlyOnceWith({ ref });
    if (outcome === "disposed") hooks.dispose();
    const writes = hooks.writes();
    if (outcome === "accepted") {
      f.metadata[ref as keyof typeof f.metadata].configured = false;
      pending.resolve(f.success(undefined));
    } else
      pending.resolve({
        result: {
          ok: false,
          error: { message: "Environment-owned reference is read-only" },
        },
      });
    await settle();
    if (outcome === "disposed") expect(hooks.writes()).toBe(writes);
    else {
      f.view();
      await settle();
      const read = await f.api.credentials.describe({ refs: [ref] });
      expect(read.result.ok).toBe(true);
      if (read.result.ok)
        expect(read.result.value.credentials[ref].configured).toBe(
          outcome !== "accepted",
        );
      if (outcome === "rejected")
        expect(f.panel().vendor.configured).toBe(true);
    }
  },
);

it("keeps manual-mode intent usable while an independent credential write is in flight", async () => {
  const f = await keyFixture();
  const pending =
    deferred<Awaited<ReturnType<HostApi["credentials"]["set"]>>>();
  vi.mocked(f.api.credentials.set).mockReturnValue(pending.promise);
  f.panel().onDraft("disposable-1");
  f.panel().onPersist();
  checkbox(f.view()).props.onChange({ target: { checked: true } });
  await settle();
  expect(
    vi
      .mocked(f.rpc.call)
      .mock.calls.some(([, endpoint]) => endpoint === "setRouting"),
  ).toBe(true);
  expect(getRoutingSnapshot().mode).toBe("smart");
  const observer = createRoutingPublisher();
  expect(observer.read()(getRoutingSnapshot())).toBe(true);
  observer.dispose();
  pending.resolve(f.success(undefined));
  await settle();
});

it("distinguishes missing credential metadata from an environment-owned key in a retained staged row", async () => {
  const f = await keyFixture();
  const props = f.panel();
  const tree = KeyPanel({
    ...props,
    vendor: { ...props.vendor, ref: "", configured: false, writable: false },
  });
  expect(JSON.stringify(tree)).toContain("hostApiMissing");
  expect(JSON.stringify(tree)).not.toContain("envKeyLocked");
  expect(elementWhere(tree, (el) => el.type === "input")?.props.disabled).toBe(
    true,
  );
});

it.each([
  { operation: "set", rejection: "later" },
  { operation: "unset", rejection: "later" },
  { operation: "set", rejection: "earlier" },
  { operation: "unset", rejection: "earlier" },
] as const)(
  "refreshes acknowledged credential $operation with $rejection concurrent routing rejection without losing drafts or the error",
  async ({ operation, rejection }) => {
    const f = await keyFixture(false);
    elementWhere(
      f.view(),
      (el) => el.props.className === "dshM-add",
    )!.props.onClick();
    const group = elementWhere(
      f.view(),
      (el) =>
        el.type === VendorGroup &&
        el.props.vendors.some(
          (vendor: { id: string }) => vendor.id === "deepseek",
        ),
    );
    expect(group).toBeTruthy();
    const props = group!.props as Parameters<typeof VendorGroup>[0];
    props.onPick(props.vendors.find((vendor) => vendor.id === "deepseek")!);
    if (operation === "unset") {
      f.metadata.DEEPSEEK_API_KEY.configured = true;
      checkbox(f.view()).props.onChange({ target: { checked: false } });
      await settle();
    }
    expect(f.panel().vendor.configured).toBe(operation === "unset");
    const credential =
      deferred<Awaited<ReturnType<HostApi["credentials"]["set"]>>>();
    vi.mocked(f.api.credentials[operation]).mockReturnValue(credential.promise);
    if (operation === "set") {
      f.panel().onDraft("disposable-1");
      f.panel().onPersist();
    } else {
      f.panel().onRemove();
      elementWhere(
        f.view(),
        (el) =>
          el.type === "button" && el.props.children === "confirmDisconnect",
      )!.props.onClick();
    }
    const routing = deferred<RpcResult<unknown>>();
    const originalCall = f.rpc.call;
    f.rpc.call = vi.fn((channel, endpoint, payload) =>
      endpoint === "setRouting"
        ? routing.promise
        : originalCall(channel, endpoint, payload),
    );
    checkbox(f.view()).props.onChange({ target: { checked: true } });
    expect(f.rpc.call).toHaveBeenCalledWith("/providers-auth", "setRouting", {
      mode: "smart",
    });
    f.panel().onDraft("newer-disposable");
    const reads = vi.mocked(f.api.credentials.describe).mock.calls.length;
    if (rejection === "earlier") {
      routing.reject(new Error("Routing rejected"));
      await settle();
      const retry = elementWhere(
        f.view(),
        (el) => el.type === "button" && el.props.children === "retry",
      )!;
      retry.props.onClick();
      retry.props.onClick();
      expect(f.api.credentials.describe).toHaveBeenCalledTimes(reads);
    }
    f.metadata.DEEPSEEK_API_KEY.configured = operation === "set";
    credential.resolve(f.success(undefined));
    await settle();
    if (rejection === "later") {
      expect(f.api.credentials.describe).toHaveBeenCalledTimes(reads);
      routing.reject(new Error("Routing rejected"));
      await settle();
    }
    expect(f.api.credentials.describe).toHaveBeenCalledTimes(reads + 1);
    expect(f.panel().vendor.configured).toBe(operation === "set");
    expect(f.panel().keyDraft).toBe("newer-disposable");
    const alert = elementWhere(f.view(), (el) => el.props.role === "alert");
    expect(alert?.props.children).toBe("没能保存，请再试一次。");
    expect(
      Boolean(elementWhere(f.view(), (el) => el.type === ModelsList)),
    ).toBe(operation === "set");
    expect(f.view().props["aria-busy"]).not.toBe(true);
    expect(getRoutingSnapshot().mode).toBe("manual");
    expect(f.api.credentials[operation]).toHaveBeenCalledTimes(1);
    expect(
      f.api.credentials[operation === "set" ? "unset" : "set"],
    ).not.toHaveBeenCalled();
    expect(
      vi
        .mocked(f.rpc.call)
        .mock.calls.filter(([, endpoint]) => endpoint === "setRouting"),
    ).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.api.credentials.describe).toHaveBeenCalledTimes(reads + 1);
    elementWhere(
      f.view(),
      (el) => el.type === "button" && el.props.children === "retry",
    )!.props.onClick();
    await settle();
    expect(f.api.credentials.describe).toHaveBeenCalledTimes(reads + 2);
    expect(
      elementWhere(f.view(), (el) => el.props.role === "alert"),
    ).toBeUndefined();
    expect(f.panel().keyDraft).toBe("newer-disposable");
    expect(f.api.credentials[operation]).toHaveBeenCalledTimes(1);
    expect(
      vi
        .mocked(f.rpc.call)
        .mock.calls.filter(([, endpoint]) => endpoint === "setRouting"),
    ).toHaveLength(1);
  },
);

it("discards a queued metadata refresh when disposed before the final rejected operation settles", async () => {
  const f = await keyFixture();
  const credential =
    deferred<Awaited<ReturnType<HostApi["credentials"]["set"]>>>();
  const routing = deferred<RpcResult<unknown>>();
  vi.mocked(f.api.credentials.set).mockReturnValue(credential.promise);
  const originalCall = f.rpc.call;
  f.rpc.call = vi.fn((channel, endpoint, payload) =>
    endpoint === "setRouting"
      ? routing.promise
      : originalCall(channel, endpoint, payload),
  );
  f.panel().onDraft("disposable-1");
  f.panel().onPersist();
  checkbox(f.view()).props.onChange({ target: { checked: true } });
  const reads = vi.mocked(f.api.credentials.describe).mock.calls.length;
  credential.resolve(f.success(undefined));
  await settle();
  expect(f.api.credentials.describe).toHaveBeenCalledTimes(reads);
  hooks.dispose();
  const writes = hooks.writes();
  const calls = vi.mocked(f.rpc.call).mock.calls.length;
  routing.reject(new Error("Routing rejected"));
  await settle();
  expect(f.api.credentials.describe).toHaveBeenCalledTimes(reads);
  expect(hooks.writes()).toBe(writes);
  expect(f.rpc.call).toHaveBeenCalledTimes(calls);
  expect(f.api.credentials.set).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("flushes a successful routing refresh after custom discovery returns a failure string", async () => {
  const f = await keyFixture();
  elementWhere(
    f.view(),
    (el) => el.props.className === "dshM-add",
  )!.props.onClick();
  elementWhere(
    f.view(),
    (el) => el.props.className === "dshM-customLink",
  )!.props.onClick();
  const inputs: ReactElement[] = [];
  elementWhere(f.view(), (el) => {
    if (el.type === "input" && el.props.type !== "checkbox") inputs.push(el);
    return false;
  });
  expect(inputs).toHaveLength(3);
  for (const [i, value] of [
    "Disposable",
    "https://invalid.test",
    "disposable-key",
  ].entries())
    inputs[i].props.onChange({ target: { value } });
  const discovery =
    deferred<Awaited<ReturnType<HostApi["llm"]["discoverModels"]>>>();
  f.api.llm.discoverModels = vi.fn(() => discovery.promise);
  elementWhere(
    f.view(),
    (el) => el.type === "button" && el.props.children === "customCreate",
  )!.props.onClick();
  expect(f.api.llm.discoverModels).toHaveBeenCalledTimes(1);
  const reads = vi.mocked(f.api.credentials.describe).mock.calls.length;
  checkbox(f.view()).props.onChange({ target: { checked: true } });
  await settle();
  expect(f.api.credentials.describe).toHaveBeenCalledTimes(reads);
  discovery.resolve({
    result: { ok: false, error: { message: "Discovery rejected" } },
  });
  await settle();
  expect(f.api.credentials.describe).toHaveBeenCalledTimes(reads + 1);
  expect(
    elementWhere(f.view(), (el) => el.props.role === "alert")?.props.children,
  ).toBe("discoverFailed");
  expect(
    elementWhere(
      f.view(),
      (el) => el.type === "input" && el.props.type === "password",
    )?.props.value,
  ).toBe("disposable-key");
  expect(
    vi
      .mocked(f.rpc.call)
      .mock.calls.filter(([, endpoint]) => endpoint === "setRouting"),
  ).toHaveLength(1);
  expect(
    vi
      .mocked(f.rpc.call)
      .mock.calls.some(([, endpoint]) => endpoint === "custom-create"),
  ).toBe(false);
  expect(f.api.credentials.set).not.toHaveBeenCalled();
  expect(f.api.credentials.unset).not.toHaveBeenCalled();
});
