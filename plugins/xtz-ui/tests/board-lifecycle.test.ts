import type { Context } from "@deepseek-ai/cordis";
import { mkdtempSync, rmSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import { apply } from "../src/index.ts";
import type { WebServer } from "../src/http.ts";
import { XTZ_UI_BOARD_PREFIX as BOARD, XTZ_UI_SETTINGS_ROUTE as SETTINGS } from "../src/names.ts";
import { loadBoard } from "../src/board/store.ts";
import * as boardStore from "../src/board/store.ts";
import type { TaskRecord } from "../src/board/types.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function ok<T>(value: T) { return { result: { ok: true as const, value } }; }
const homes: string[] = [];
afterEach(() => {
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks();
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function mount(hold: "create" | "prompt") {
  const home = mkdtempSync(join(tmpdir(), "xtz-board-lifecycle-")); homes.push(home);
  vi.stubEnv("DSH_HOME", home);
  const created = deferred<ReturnType<typeof ok<{sessionId:string}>>>();
  const prompted = deferred<ReturnType<typeof ok<{accepted:true}>>>();
  const cancelled = deferred<ReturnType<typeof ok<{accepted:true}>>>();
  const create = vi.fn(() => hold === "create" ? created.promise : Promise.resolve(ok({ sessionId: "s1" })));
  const prompt = vi.fn(() => prompted.promise);
  const cancel = vi.fn(() => cancelled.promise);
  const api = { sessions: { create, rename: async () => ok({}), prompt, cancel, list: async () => ok({ items: [{ sessionId: "s1", running: true }] }) } };
  const routes = new Map<string, Parameters<WebServer["register"]>[0]["handler"]>();
  const registrations: string[] = [];
  const web: WebServer = { register: route => {
    expect(routes.has(route.path)).toBe(false);
    registrations.push(route.path); routes.set(route.path, route.handler);
    return () => { routes.delete(route.path); };
  } };
  let dispose: () => void | Promise<void> = () => {};
  const ctx = {
    inject(deps: string[], callback: (host: unknown) => void) { if (deps.includes("webServer")) callback({ webServer: web }); },
    effect(callback: () => () => void | Promise<void>) { dispose = callback(); },
    get(name: string) { return name === "sessionController" ? {
      create: async () => (await api.sessions.create()).result.value,
      rename: async () => (await api.sessions.rename()).result.value,
      prompt: async () => (await api.sessions.prompt()).result.value,
      cancel: async () => (await api.sessions.cancel()).result.value,
      list: async () => (await api.sessions.list()).result.value,
      inspect: async () => ({ events: [] }),
    } : undefined; },
  } as unknown as Context;
  apply(ctx);
  async function request(path: string, method = "GET", body: unknown = {}) {
    const handler = routes.get(path);
    if (!handler) return { status: 404, body: {} as { tasks: TaskRecord[] } };
    const req = Object.assign(body instanceof Readable ? body : Readable.from([JSON.stringify(body)]), {
      method, headers: { host: "127.0.0.1:43210", origin: "http://127.0.0.1:43210", "content-type": "application/json" },
      socket: { remoteAddress: "127.0.0.1" },
    }) as IncomingMessage;
    let status = 0; let raw = "";
    const res = { writeHead(code: number) { status = code; }, end(value: string) { raw = value; } } as unknown as ServerResponse;
    await handler(req, res);
    return { status, body: JSON.parse(raw) as { tasks: TaskRecord[]; ok?: boolean; error?: string } };
  }
  return { home, create, prompt, cancel, created, prompted, cancelled, routes, registrations, request,
    dispose: () => dispose(),
    async cleanup() {
      created.resolve(ok({ sessionId: "s1" })); prompted.resolve(ok({ accepted: true })); cancelled.resolve(ok({ accepted: true }));
      await dispose();
    },
  };
}

it.each(["create", "prompt"] as const)("keeps the same board owner across unrelated settings while %s is held", async hold => {
  const f = mount(hold);
  try {
    const made = await f.request(`${BOARD}/tasks`, "POST", { title: "Task", prompt: "Work" });
    expect(made.status).toBe(200);
    const id = made.body.tasks[0]!.id;
    expect((await f.request(`${BOARD}/run`, "POST", { id })).status).toBe(200);
    await new Promise(resolve => setImmediate(resolve));
    expect(f.create).toHaveBeenCalledOnce();
    if (hold === "prompt") expect(f.prompt).toHaveBeenCalledOnce();
    const handler = f.routes.get(BOARD);
    for (const patch of [{ archive: false }, { gitGraph: false }, { announceToAgent: true }]) {
      expect((await f.request(SETTINGS, "POST", patch)).status).toBe(200);
      expect(f.routes.get(BOARD)).toBe(handler);
    }
    f.created.resolve(ok({ sessionId: "s1" })); f.prompted.resolve(ok({ accepted: true }));
    await new Promise(resolve => setImmediate(resolve));
    expect(f.prompt).toHaveBeenCalledOnce(); expect(f.cancel).not.toHaveBeenCalled();
    const snapshot = await f.request(BOARD);
    expect(snapshot.body.tasks[0]!.status).toBe("running");
    expect(snapshot.body.tasks[0]!.executions).toHaveLength(1);
    expect(loadBoard({ DSH_HOME: f.home })[0]!.executions[0]!.sessionId).toBe("s1");
    expect(f.registrations.filter(path => path === BOARD)).toHaveLength(1);
  } finally { await f.cleanup(); }
});

it.each(["acknowledged", "uncertain"] as const)("serializes disable/re-enable and observes %s drain on host disposal", async outcome => {
  const f = mount("prompt");
  try {
    const id = (await f.request(`${BOARD}/tasks`, "POST", { title: "Task", prompt: "Work" })).body.tasks[0]!.id;
    await f.request(`${BOARD}/run`, "POST", { id });
    await new Promise(resolve => setImmediate(resolve));
    expect(f.create).toHaveBeenCalledOnce(); expect(f.prompt).toHaveBeenCalledOnce();
    await f.request(SETTINGS, "POST", { board: false });
    await f.request(SETTINGS, "POST", { board: true });
    expect(f.routes.has(BOARD)).toBe(false);
    expect(f.registrations.filter(path => path === BOARD)).toHaveLength(1);
    expect(f.cancel).toHaveBeenCalledOnce();
    f.prompted.resolve(ok({ accepted: true }));
    await new Promise(resolve => setImmediate(resolve));
    expect(f.routes.has(BOARD)).toBe(false);
    if (outcome === "acknowledged") {
      f.cancelled.resolve(ok({ accepted: true }));
      await new Promise(resolve => setImmediate(resolve));
      expect(f.routes.has(BOARD)).toBe(true);
      expect(f.registrations.filter(path => path === BOARD)).toHaveLength(2);
      expect(loadBoard({ DSH_HOME: f.home })[0]!.executions[0]!.result).toBe("cancelled");
      await f.dispose();
    } else {
      f.cancelled.reject(new Error("synthetic cancel unavailable"));
      await new Promise(resolve => setImmediate(resolve));
      expect(f.routes.has(BOARD)).toBe(false);
      expect(loadBoard({ DSH_HOME: f.home })[0]!.status).toBe("running");
      await expect(Promise.resolve(f.dispose())).rejects.toThrow();
    }
  } finally { await f.cleanup().catch(() => undefined); }
});

it("host disposal waits for pending creation and cancellation acknowledgement", async () => {
  const f = mount("create");
  try {
    const id = (await f.request(`${BOARD}/tasks`, "POST", { title: "Task", prompt: "Work" })).body.tasks[0]!.id;
    await f.request(`${BOARD}/run`, "POST", { id });
    await new Promise(resolve => setImmediate(resolve));
    expect(f.create).toHaveBeenCalledOnce();
    let done = false;
    const disposing = Promise.resolve(f.dispose()).then(() => { done = true; });
    void disposing.catch(() => undefined);
    f.created.resolve(ok({ sessionId: "s1" }));
    await new Promise(resolve => setImmediate(resolve));
    expect(f.prompt).not.toHaveBeenCalled(); expect(f.cancel).toHaveBeenCalledOnce();
    expect(done).toBe(false);
    f.cancelled.resolve(ok({ accepted: true })); await disposing;
    expect(f.routes.size).toBe(0);
    expect(loadBoard({ DSH_HOME: f.home })[0]!.executions[0]!.sessionId).toBe("s1");
  } finally { await f.cleanup(); }
});

it.each([
  ["create", "/tasks", "POST"],
  ["update PUT", "/tasks", "PUT"],
  ["update PATCH", "/tasks", "PATCH"],
  ["move", "/move", "POST"],
  ["remove", "/delete", "POST"],
])("rejects a delayed %s body from the disposed owner without overwriting its successor", async (_operation, route, method) => {
  const f = mount("prompt");
  const reading = deferred<void>();
  const bodyGate = deferred<void>();
  let pending: ReturnType<typeof f.request> | undefined;
  try {
    const id = (await f.request(`${BOARD}/tasks`, "POST", { title: "Task", prompt: "Work" })).body.tasks[0]!.id;
    f.prompted.resolve(ok({ accepted: true }));
    f.cancelled.resolve(ok({ accepted: true }));
    await f.request(`${BOARD}/run`, "POST", { id });
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    expect(f.create).toHaveBeenCalledOnce(); expect(f.prompt).toHaveBeenCalledOnce();
    const e1 = loadBoard({ DSH_HOME: f.home })[0]!.executions[0]!.id;
    const oldHandler = f.routes.get(`${BOARD}${route}`);
    // The real registered handler has entered readJsonBody before routes vanish.
    const body = Readable.from((async function* () {
      reading.resolve();
      await bodyGate.promise;
      yield JSON.stringify({ id, title: "Stale write", prompt: "Old work", status: "backlog" });
    })());
    pending = f.request(`${BOARD}${route}`, method, body);
    await reading.promise;
    await f.request(SETTINGS, "POST", { board: false });
    await f.request(SETTINGS, "POST", { board: true });
    await new Promise(resolve => setImmediate(resolve));
    expect(f.routes.get(`${BOARD}${route}`)).not.toBe(oldHandler);
    expect(f.registrations.filter(path => path === BOARD)).toHaveLength(2);
    expect(f.cancel).toHaveBeenCalledOnce();
    expect(loadBoard({ DSH_HOME: f.home })[0]!.executions[0]).toMatchObject({ id: e1, result: "cancelled" });

    expect((await f.request(`${BOARD}/tasks`, "POST", { title: "New owner task", prompt: "New work" })).status).toBe(200);
    f.create.mockResolvedValueOnce(ok({ sessionId: "s2" }));
    expect((await f.request(`${BOARD}/run`, "POST", { id })).status).toBe(200);
    await new Promise(resolve => setImmediate(resolve));
    expect(f.create).toHaveBeenCalledTimes(2); expect(f.prompt).toHaveBeenCalledTimes(2);
    const before = loadBoard({ DSH_HOME: f.home });
    const running = before.find(task => task.id === id)!;
    expect(running.status).toBe("running");
    expect(running.executions).toHaveLength(2);
    expect(running.executions[1]!.id).not.toBe(e1);
    expect(running.executions[1]).toMatchObject({ sessionId: "s2", endedAt: undefined });
    const save = vi.spyOn(boardStore, "saveBoard");
    bodyGate.resolve();
    const response = await pending;
    expect.soft(response.status).toBe(500);
    expect.soft(response.body).toMatchObject({ ok: false, error: "board service disposed" });
    expect.soft(save).not.toHaveBeenCalled();
    expect.soft(loadBoard({ DSH_HOME: f.home })).toEqual(before);
    expect((await f.request(BOARD)).body.tasks).toEqual(JSON.parse(JSON.stringify(before)));
  } finally {
    bodyGate.resolve();
    await pending;
    await f.cleanup();
  }
});
