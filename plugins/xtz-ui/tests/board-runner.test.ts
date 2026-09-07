import { describe, expect, it, vi } from "vitest";
import { cancelSession, inspectSession, launchTask, listWorkspaces } from "../src/board/runner.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function ok<T>(value: T): { result: { ok: true; value: T } } { return { result: { ok: true, value } }; }

describe("board session runner", () => {
  it("publishes ownership before rename and rechecks intent immediately before prompt", async () => {
    const renameGate = deferred<ReturnType<typeof ok<{}>>>();
    const onCreated = vi.fn();
    const shouldPrompt = vi.fn(() => false);
    const rename = vi.fn(() => { expect(onCreated).toHaveBeenCalledWith("s1"); return renameGate.promise; });
    const prompt = vi.fn(async () => ok({ accepted: true }));
    const launch = launchTask({ sessions: {
      create: async () => ok({ sessionId: "s1" }), rename, prompt, list: async () => ok({ items: [] }),
    } }, { title: "T", prompt: "P" }, { onCreated, shouldPrompt });
    void launch.catch(() => undefined);
    try {
      await new Promise(resolve => setImmediate(resolve));
      expect(rename).toHaveBeenCalledOnce();
      expect(onCreated).toHaveBeenCalledWith("s1");
      expect(shouldPrompt).not.toHaveBeenCalled();
      renameGate.resolve(ok({}));
      await expect(launch).resolves.toBe("s1");
      expect(shouldPrompt).toHaveBeenCalledOnce();
      expect(prompt).not.toHaveBeenCalled();
    } finally {
      renameGate.resolve(ok({}));
      await launch.catch(() => undefined);
    }
  });

  it.each([{}, { accepted: false }])("rejects an unknown cancel acknowledgement %j", async value => {
    await expect(cancelSession({ sessions: { cancel: async () => ok(value) } }, "s1")).rejects.toThrow("cancellation");
  });

  it("creates, renames, and prompts a session", async () => {
    const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
    const api = { sessions: {
      create: async (req: { payload: Record<string, unknown> }) => { calls.push({method:"create",payload:req.payload}); return ok({sessionId:"s1"}); },
      rename: async (req: { payload: Record<string, unknown> }) => { calls.push({method:"rename",payload:req.payload}); return ok({}); },
      prompt: async (req: { payload: Record<string, unknown> }) => { calls.push({method:"prompt",payload:req.payload}); return ok({accepted:true}); },
      list: async () => ok({items:[]}),
    }};
    await expect(launchTask(api,{title:"Title",prompt:"Do it",workspaceId:"w1"})).resolves.toBe("s1");
    expect(calls).toEqual([
      {method:"create",payload:{workspaceId:"w1"}},
      {method:"rename",payload:{sessionId:"s1",title:"Title"}},
      {method:"prompt",payload:{sessionId:"s1",mode:"queue",content:[{type:"text",text:"Do it"}]}},
    ]);
  });

  it("preserves a created session id when prompting fails", async () => {
    const api = { sessions: {
      create: async () => ok({sessionId:"s2"}),
      rename: async () => ok({}),
      prompt: async () => ({result:{ok:false as const,error:{message:"prompt failed"}}}),
      list: async () => ok({items:[]}),
    }};
    await expect(launchTask(api,{title:"T",prompt:"P"})).rejects.toMatchObject({message:"prompt failed",sessionId:"s2"});
  });

  it("calls Host session cancellation and rejects an unavailable canceller", async () => {
    const calls: string[] = [];
    const api = { sessions: { cancel: async (req: { payload: { sessionId: string } }) => { calls.push(req.payload.sessionId); return ok({accepted:true as const}); } } };
    await expect(cancelSession(api, "s-cancel")).resolves.toBeUndefined();
    expect(calls).toEqual(["s-cancel"]);
    await expect(cancelSession({sessions:{}}, "s-cancel")).rejects.toThrow("session cancellation unavailable");
  });

  it("maps session listing to pending, success, and cancellation", async () => {
    const api = (items: unknown[]) => ({sessions:{create:async()=>ok({sessionId:"x"}),prompt:async()=>ok({}),list:async()=>ok({items})}});
    await expect(inspectSession(api([{sessionId:"s",running:true}]),"s")).resolves.toEqual({outcome:"pending"});
    await expect(inspectSession(api([{sessionId:"s",running:false}]),"s")).resolves.toEqual({outcome:"succeeded"});
    await expect(inspectSession(api([]),"s")).resolves.toEqual({outcome:"cancelled",error:"execution session no longer exists"});
  });

  it("lists valid workspaces and rejects an unavailable runner", async () => {
    expect(listWorkspaces({list:()=>[{id:"w",title:"Work",path:"/tmp/work"},{bad:true}]})).toEqual([{id:"w",title:"Work",path:"/tmp/work"}]);
    await expect(launchTask(undefined,{title:"T",prompt:"P"})).rejects.toThrow("session runner unavailable");
  });
});
