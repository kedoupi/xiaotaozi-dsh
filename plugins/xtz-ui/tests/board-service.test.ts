import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTask, openRun, ORPHANED_EXECUTION_ERROR } from "../src/board/ledger.ts";
import { BoardService } from "../src/board/service.ts";
import { loadBoard, saveBoard } from "../src/board/store.ts";
import * as boardStore from "../src/board/store.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const homes: string[] = [];
function env(): NodeJS.ProcessEnv { const home=mkdtempSync(join(tmpdir(),"xtz-board-service-")); homes.push(home); return {DSH_HOME:home}; }
function ok<T>(value:T){return {result:{ok:true as const,value}};}
afterEach(()=>{vi.restoreAllMocks(); vi.clearAllTimers(); vi.useRealTimers(); for(const home of homes.splice(0))rmSync(home,{recursive:true,force:true});});

describe("BoardService",()=>{
  it("persists create, move, update, and delete",()=>{
    let now=1000; const service=new BoardService({apiProxy:undefined,workspaceRegistry:{list:()=>[{id:"w",title:"W",path:"/w"}]}},env(),()=>++now);
    const id=service.create({title:"Task",prompt:"Prompt"})[0]!.id;
    expect(service.snapshot().workspaces).toEqual([{id:"w",title:"W",path:"/w"}]);
    expect(service.move(id,"todo")[0]!.status).toBe("todo");
    expect(service.update(id,{title:"Updated"})[0]!.title).toBe("Updated");
    expect(service.remove(id)).toEqual([]);
  });

  it("does not publish a mutation that failed to persist",()=>{
    const boardEnv=env();
    const service=new BoardService({apiProxy:undefined,workspaceRegistry:undefined},boardEnv,()=>1000);
    const blocked=join(boardEnv.DSH_HOME!,"not-a-directory");
    writeFileSync(blocked,"blocked");
    boardEnv.DSH_HOME=blocked;
    expect(()=>service.create({title:"Rejected",prompt:""})).toThrow();
    expect(service.snapshot().tasks).toEqual([]);
  });

  it("runs through create, attach, poll, and success",async()=>{
    vi.useFakeTimers(); let running=true;
    const api={sessions:{
      create:async()=>ok({sessionId:"s1"}), rename:async()=>ok({}), prompt:async()=>ok({accepted:true}),
      list:async()=>ok({items:[{sessionId:"s1",running}]})
    }};
    const service=new BoardService({apiProxy:api,workspaceRegistry:undefined},env(),()=>1000);
    const id=service.create({title:"Task",prompt:"Prompt"})[0]!.id;
    expect(service.run(id)[0]!.status).toBe("running");
    await vi.advanceTimersByTimeAsync(1);
    expect(service.snapshot().tasks[0]!.executions[0]!.sessionId).toBe("s1");
    running=false; service.start(); await vi.advanceTimersByTimeAsync(5000);
    expect(service.snapshot().tasks[0]!.status).toBe("done");
    expect(service.snapshot().tasks[0]!.executions[0]!.result).toBe("succeeded");
    await service.dispose();
  });

  it("does not prompt after disposal during session creation", async () => {
    const created = deferred<ReturnType<typeof ok<{sessionId:string}>>>();
    const create = vi.fn(() => created.promise);
    const prompt = vi.fn(async () => ok({ accepted: true }));
    const cancel = vi.fn(async () => ok({ accepted: true }));
    const api = { sessions: { create, rename: async () => ok({}), prompt,
      list: async () => ok({ items: [] }), cancel } };
    const home = env();
    const service = new BoardService({ apiProxy: api, workspaceRegistry: undefined }, home);
    try {
      const id = service.create({ title: "Task", prompt: "Work" })[0]!.id;
      service.run(id);
      expect(create).toHaveBeenCalledOnce();
      const disposing = service.dispose();
      created.resolve(ok({ sessionId: "late-session" }));
      await disposing;
      await new Promise(resolve => setImmediate(resolve));
      expect(prompt).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalledOnce();
      expect(loadBoard(home)[0]!.executions[0]!.sessionId).toBe("late-session");
      expect(() => service.run(id)).toThrow("disposed");
    } finally {
      created.resolve(ok({ sessionId: "late-session" }));
      await service.dispose();
    }
  });

  it("cancels an attached running execution",async()=>{
    vi.useFakeTimers(); let cancelled: string | undefined;
    const api={sessions:{ create:async()=>ok({sessionId:"s-cancel"}), rename:async()=>ok({}), prompt:async()=>ok({}), list:async()=>ok({items:[{sessionId:"s-cancel",running:true}]}), cancel:async(req:{payload:{sessionId:string}})=>{cancelled=req.payload.sessionId;return ok({accepted:true as const});} }};
    const service=new BoardService({apiProxy:api,workspaceRegistry:undefined},env(),()=>1000);
    const id=service.create({title:"Task",prompt:"Prompt"})[0]!.id; service.run(id); await vi.advanceTimersByTimeAsync(1);
    await expect(service.cancel(id)).resolves.toMatchObject([{status:"todo"}]);
    expect(cancelled).toBe("s-cancel");
    expect(service.snapshot().tasks[0]!.executions[0]).toMatchObject({result:"cancelled",error:"cancelled by user"});
  });

  it("settles launch failures and prevents deleting a running task",async()=>{
    vi.useFakeTimers();
    const service=new BoardService({apiProxy:undefined,workspaceRegistry:undefined},env(),()=>1000);
    const id=service.create({title:"Task",prompt:"Prompt"})[0]!.id;
    service.run(id); expect(()=>service.remove(id)).toThrow("task is running");
    await vi.advanceTimersByTimeAsync(1);
    expect(service.snapshot().tasks[0]!.status).toBe("failed");
    expect(service.snapshot().tasks[0]!.executions[0]!.error).toBe("session runner unavailable");
  });

  it("settles a persisted pre-session execution as failed on restart without replay",async()=>{
    vi.useFakeTimers();
    const boardEnv=env();
    const created=createTask([],{title:"Interrupted",prompt:"durable work"},1000);
    const opened=openRun(created,created[0]!.id,1100);
    saveBoard(opened.tasks,boardEnv);
    const create=vi.fn(async()=>ok({sessionId:"must-not-run"}));
    const service=new BoardService({apiProxy:{sessions:{create}},workspaceRegistry:undefined},boardEnv,()=>2000);

    expect(create).not.toHaveBeenCalled();
    expect(service.snapshot().tasks[0]).toMatchObject({status:"failed",updatedAt:2000});
    expect(service.snapshot().tasks[0]!.executions[0]).toMatchObject({
      endedAt:2000,
      result:"failed",
      error:ORPHANED_EXECUTION_ERROR,
    });
    expect(loadBoard(boardEnv)[0]).toMatchObject({status:"failed",updatedAt:2000});

    service.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(create).not.toHaveBeenCalled();
    await service.dispose();
  });
});

function pendingLaunchFixture(hold: 'rename' | 'prompt') {
  const renameGate = deferred<ReturnType<typeof ok<{}>>>();
  const promptGate = deferred<ReturnType<typeof ok<{ accepted: true }>>>();
  const firstCancel = deferred<ReturnType<typeof ok<{ accepted: true }>>>();
  const secondCancel = deferred<ReturnType<typeof ok<{ accepted: true }>>
    | { result: { ok: false; error: { message: string } } }>();
  let nextSession = 0;
  let idle = true;
  const create = vi.fn(async () => ok({ sessionId: `s${++nextSession}` }));
  const rename = vi.fn(async (req: { payload: { sessionId: string } }) => {
    if (req.payload.sessionId === 's1' && hold === 'rename') return renameGate.promise;
    return ok({});
  });
  const prompt = vi.fn(async (req: { payload: { sessionId: string } }) => {
    if (req.payload.sessionId === 's1') return promptGate.promise;
    return ok({ accepted: true as const });
  });
  const list = vi.fn(async () => ok({ items: [
    { sessionId: 's1', running: !idle }, { sessionId: 's2', running: true },
  ] }));
  let cancelCount = 0;
  const cancel = vi.fn(async (_req: { payload: { sessionId: string } }) => {
    cancelCount += 1;
    return cancelCount === 1 ? firstCancel.promise
      : cancelCount === 2 ? secondCancel.promise : ok({ accepted: true as const });
  });
  const home = env();
  const service = new BoardService({
    apiProxy: { sessions: { create, rename, prompt, list, cancel } },
    workspaceRegistry: undefined,
  }, home, () => 1000);
  const id = service.create({ title: 'Task', prompt: 'Work' })[0]!.id;
  return {
    service, home, id, create, rename, prompt, list, cancel,
    renameGate, promptGate, firstCancel, secondCancel,
    accepted: () => { idle = false; },
    async cleanup() {
      renameGate.resolve(ok({}));
      promptGate.resolve(ok({ accepted: true }));
      firstCancel.resolve(ok({ accepted: true }));
      secondCancel.resolve(ok({ accepted: true }));
      await service.dispose();
    },
  };
}

it.each(['rename', 'prompt'] as const)('does not settle an idle session while %s is pending', async hold => {
  vi.useFakeTimers();
  const f = pendingLaunchFixture(hold);
  try {
    f.service.run(f.id);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.create).toHaveBeenCalledOnce();
    expect(f.rename).toHaveBeenCalledOnce();
    expect(f.prompt).toHaveBeenCalledTimes(hold === 'prompt' ? 1 : 0);
    expect(loadBoard(f.home)[0]!.executions[0]!.sessionId).toBe('s1');
    f.service.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.list).not.toHaveBeenCalled();
    expect(loadBoard(f.home)[0]!.status).toBe('running');
    expect(loadBoard(f.home)[0]!.executions[0]!.endedAt).toBeUndefined();
    f.renameGate.resolve(ok({}));
    await vi.advanceTimersByTimeAsync(0);
    expect(f.prompt).toHaveBeenCalledOnce();
    f.accepted();
    f.promptGate.resolve(ok({ accepted: true }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.list).toHaveBeenCalled();
    expect(loadBoard(f.home)[0]!.status).toBe('running');
  } finally {
    await f.cleanup();
  }
});

it('records cancel intent before awaiting RPC and never prompts E1 after rename', async () => {
  vi.useFakeTimers();
  const f = pendingLaunchFixture('rename');
  try {
    const e1 = f.service.run(f.id)[0]!.executions[0]!.id;
    await vi.advanceTimersByTimeAsync(0);
    expect(f.create).toHaveBeenCalledOnce();
    expect(f.rename).toHaveBeenCalledOnce();
    expect(loadBoard(f.home)[0]!.executions[0]!.sessionId).toBe('s1');
    let settled = false;
    const cancelling = f.service.cancel(f.id).then(value => { settled = true; return value; });
    void cancelling.catch(() => undefined); // Observe immediately; still await original below.
    await vi.advanceTimersByTimeAsync(0);
    expect(f.cancel).toHaveBeenCalledOnce();
    expect(f.cancel.mock.calls[0]![0].payload.sessionId).toBe('s1');
    f.renameGate.resolve(ok({})); // Cancel RPC is still pending here.
    await vi.advanceTimersByTimeAsync(0);
    expect(f.prompt).not.toHaveBeenCalled();
    expect(settled).toBe(false);
    expect(loadBoard(f.home)[0]!.executions[0]!.endedAt).toBeUndefined();
    expect(() => f.service.run(f.id)).toThrow('task is running');
    f.firstCancel.resolve(ok({ accepted: true }));
    await cancelling;
    expect(loadBoard(f.home)[0]!.executions[0]).toMatchObject({ id: e1, sessionId: 's1', result: 'cancelled' });
    f.service.run(f.id);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.prompt.mock.calls.map(([req]) => req.payload.sessionId)).toEqual(['s2']);
    f.service.start();
    await vi.advanceTimersByTimeAsync(5000);
    const task = loadBoard(f.home)[0]!;
    expect(task.status).toBe('running');
    expect(task.executions[0]).toMatchObject({ id: e1, result: 'cancelled' });
    expect(task.executions[1]).toMatchObject({ sessionId: 's2' });
    expect(task.executions[1]!.endedAt).toBeUndefined();
  } finally {
    await f.cleanup();
  }
});

it.each(['acknowledged', 'uncertain'] as const)('retains E1 through prompt acceptance and %s re-cancel', async outcome => {
  vi.useFakeTimers();
  const f = pendingLaunchFixture('prompt');
  try {
    const e1 = f.service.run(f.id)[0]!.executions[0]!.id;
    await vi.advanceTimersByTimeAsync(0);
    expect(f.create).toHaveBeenCalledOnce();
    expect(f.rename).toHaveBeenCalledOnce();
    expect(f.prompt).toHaveBeenCalledOnce();
    let settled = false;
    const cancelling = f.service.cancel(f.id).then(value => { settled = true; return value; });
    void cancelling.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.cancel).toHaveBeenCalledOnce();
    f.firstCancel.resolve(ok({ accepted: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    expect(() => f.service.run(f.id)).toThrow('task is running');
    f.accepted();
    f.promptGate.resolve(ok({ accepted: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(f.cancel).toHaveBeenCalledTimes(2);
    expect(f.cancel.mock.calls.map(([req]) => req.payload.sessionId)).toEqual(['s1', 's1']);
    expect(loadBoard(f.home)[0]!.executions[0]!.endedAt).toBeUndefined();
    expect(settled).toBe(false);
    if (outcome === 'uncertain') {
      f.secondCancel.reject(new Error('synthetic cancel unavailable'));
      await expect(cancelling).rejects.toThrow();
      f.service.start();
      await vi.advanceTimersByTimeAsync(5000);
      expect(f.list).not.toHaveBeenCalled();
      expect(loadBoard(f.home)[0]!.status).toBe('running');
      expect(loadBoard(f.home)[0]!.executions[0]).toMatchObject({ id: e1, sessionId: 's1' });
      expect(loadBoard(f.home)[0]!.executions[0]!.endedAt).toBeUndefined();
      expect(() => f.service.run(f.id)).toThrow('task is running');
      expect(f.create).toHaveBeenCalledOnce();
    } else {
      f.secondCancel.resolve(ok({ accepted: true }));
      await cancelling;
      expect(loadBoard(f.home)[0]!.executions[0]).toMatchObject({ id: e1, result: 'cancelled' });
      f.service.run(f.id);
      await vi.advanceTimersByTimeAsync(0);
      expect(loadBoard(f.home)[0]!.status).toBe('running');
      expect(loadBoard(f.home)[0]!.executions[1]).toMatchObject({ sessionId: 's2' });
      expect(f.cancel.mock.calls.map(([req]) => req.payload.sessionId)).toEqual(['s1', 's1']);
    }
  } finally {
    await f.cleanup().catch(() => undefined); // Only cleanup may observe uncertain drain failure.
  }
});

it('retains cancel intent when the first RPC fails during rename', async () => {
  vi.useFakeTimers();
  const f = pendingLaunchFixture('rename');
  try {
    f.service.run(f.id);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.create).toHaveBeenCalledOnce();
    expect(f.rename).toHaveBeenCalledOnce();
    const cancelling = f.service.cancel(f.id);
    void cancelling.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.cancel).toHaveBeenCalledOnce();
    f.firstCancel.reject(new Error('synthetic cancel unavailable'));
    f.renameGate.resolve(ok({}));
    await expect(cancelling).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.prompt).not.toHaveBeenCalled();
    f.service.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.list).not.toHaveBeenCalled();
    expect(loadBoard(f.home)[0]!.status).toBe('running');
    expect(loadBoard(f.home)[0]!.executions[0]).toMatchObject({ sessionId: 's1' });
    expect(loadBoard(f.home)[0]!.executions[0]!.endedAt).toBeUndefined();
    expect(() => f.service.run(f.id)).toThrow('task is running');
    expect(f.create).toHaveBeenCalledOnce();
  } finally {
    await f.cleanup().catch(() => undefined);
  }
});

it.each(['acknowledged', 'rejected', 'unavailable'] as const)('drains an entered prompt on disposal with %s cancellation', async outcome => {
  vi.useFakeTimers();
  const f = pendingLaunchFixture('prompt');
  try {
    f.service.run(f.id);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.create).toHaveBeenCalledOnce();
    expect(f.rename).toHaveBeenCalledOnce();
    expect(f.prompt).toHaveBeenCalledOnce();
    let drained = false;
    const disposing = Promise.resolve(f.service.dispose()).then(() => { drained = true; });
    void disposing.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.cancel).toHaveBeenCalledOnce();
    f.firstCancel.resolve(ok({ accepted: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(drained).toBe(false);
    f.promptGate.resolve(ok({ accepted: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(f.cancel.mock.calls.map(([req]) => req.payload.sessionId)).toEqual(['s1', 's1']);
    expect(drained).toBe(false);
    if (outcome === 'acknowledged') {
      f.secondCancel.resolve(ok({ accepted: true }));
      await disposing;
      expect(loadBoard(f.home)[0]!.executions[0]!.result).toBe('cancelled');
    } else {
      if (outcome === 'rejected') f.secondCancel.reject(new Error('synthetic unavailable'));
      else f.secondCancel.resolve({ result: { ok: false, error: { message: 'synthetic unavailable' } } });
      await expect(disposing).rejects.toThrow();
      expect(loadBoard(f.home)[0]!.status).toBe('running');
      expect(loadBoard(f.home)[0]!.executions[0]).toMatchObject({ sessionId: 's1' });
      expect(loadBoard(f.home)[0]!.executions[0]!.endedAt).toBeUndefined();
    }
  } finally {
    await f.cleanup().catch(() => undefined);
  }
});

it.each([1, 2])('ignores %i stale poll(s) across cancellation and E2, including a delayed duplicate cancel', async count => {
  vi.useFakeTimers();
  const polls = Array.from({ length: count }, () => deferred<ReturnType<typeof ok<{items: Array<{sessionId:string;running:boolean}>}>>>());
  const cancelGate = deferred<ReturnType<typeof ok<{accepted:true}>>>();
  let next = 0;
  let listed = 0;
  const create = vi.fn(async () => ok({ sessionId: `s${++next}` }));
  const prompt = vi.fn(async () => ok({ accepted: true }));
  const cancel = vi.fn(() => cancelGate.promise);
  const list = vi.fn(() => polls[listed++]?.promise ?? Promise.resolve(ok({ items: [{ sessionId: 's2', running: true }] })));
  const home = env();
  const service = new BoardService({ apiProxy: { sessions: { create, rename: async () => ok({}), prompt, list, cancel } }, workspaceRegistry: undefined }, home);
  try {
    const id = service.create({ title: 'T', prompt: 'P' })[0]!.id;
    const e1 = service.run(id)[0]!.executions[0]!.id;
    await vi.advanceTimersByTimeAsync(0);
    expect(prompt).toHaveBeenCalledOnce();
    service.start();
    await vi.advanceTimersByTimeAsync((count - 1) * 5000);
    expect(list).toHaveBeenCalledTimes(count);
    const cancelling = service.cancel(id);
    const duplicate = service.cancel(id);
    void cancelling.catch(() => undefined); void duplicate.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledOnce();
    expect(() => service.run(id)).toThrow('task is running');
    // With overlapping polls, return one during cancellation and the other
    // after E2. The single-poll case holds its original response until E2.
    if (count === 2) polls[0]!.resolve(ok({ items: [{ sessionId: 's1', running: false }] }));
    await vi.advanceTimersByTimeAsync(0);
    expect(loadBoard(home)[0]!.status).toBe('running');
    expect(loadBoard(home)[0]!.executions[0]!.endedAt).toBeUndefined();
    cancelGate.resolve(ok({ accepted: true }));
    await cancelling;
    service.run(id);
    await duplicate;
    await vi.advanceTimersByTimeAsync(0);
    const save = vi.spyOn(boardStore, 'saveBoard');
    for (const poll of polls) poll.resolve(ok({ items: [{ sessionId: 's1', running: false }] }));
    await vi.advanceTimersByTimeAsync(0);
    const task = loadBoard(home)[0]!;
    expect(task.status).toBe('running');
    expect(task.executions[0]).toMatchObject({ id: e1, result: 'cancelled' });
    expect(task.executions[1]).toMatchObject({ sessionId: 's2' });
    expect(task.executions[1]!.endedAt).toBeUndefined();
    expect(create).toHaveBeenCalledTimes(2);
    expect(cancel.mock.calls).toHaveLength(1);
    expect(save).not.toHaveBeenCalled();
  } finally {
    for (const poll of polls) poll.resolve(ok({ items: [] }));
    cancelGate.resolve(ok({ accepted: true }));
    await service.dispose();
  }
});

it('does not persist overlapping terminal polls after the first settlement', async () => {
  vi.useFakeTimers();
  const first = deferred<ReturnType<typeof ok<{ items: Array<{sessionId:string;running:boolean}>}>>>();
  const second = deferred<ReturnType<typeof ok<{ items: Array<{sessionId:string;running:boolean}>}>>>();
  const list = vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
  const prompt = vi.fn(async () => ok({ accepted: true }));
  const home = env();
  const service = new BoardService({ apiProxy: { sessions: {
    create: async () => ok({ sessionId: 's1' }), rename: async () => ok({}), prompt, list,
    cancel: async () => ok({ accepted: true }),
  } }, workspaceRegistry: undefined }, home);
  try {
    const id = service.create({ title: 'T', prompt: 'P' })[0]!.id;
    service.run(id);
    await vi.advanceTimersByTimeAsync(0);
    expect(prompt).toHaveBeenCalledOnce();
    service.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(list).toHaveBeenCalledTimes(2);
    const save = vi.spyOn(boardStore, 'saveBoard');
    first.resolve(ok({ items: [{ sessionId: 's1', running: false }] }));
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledOnce();
    const done = loadBoard(home)[0]!;
    expect(done.status).toBe('done');
    second.resolve(ok({ items: [] })); // Conflicting old cancellation must be a no-op.
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledOnce();
    expect(loadBoard(home)[0]).toEqual(done);
  } finally {
    first.resolve(ok({ items: [] })); second.resolve(ok({ items: [] }));
    await service.dispose();
  }
});
