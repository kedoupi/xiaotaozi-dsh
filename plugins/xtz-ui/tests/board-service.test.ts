import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTask, openRun, ORPHANED_EXECUTION_ERROR } from "../src/board/ledger.ts";
import { BoardService } from "../src/board/service.ts";
import { loadBoard, saveBoard } from "../src/board/store.ts";

const homes: string[] = [];
function env(): NodeJS.ProcessEnv { const home=mkdtempSync(join(tmpdir(),"xtz-board-service-")); homes.push(home); return {DSH_HOME:home}; }
function ok<T>(value:T){return {result:{ok:true as const,value}};}
afterEach(()=>{vi.useRealTimers(); for(const home of homes.splice(0))rmSync(home,{recursive:true,force:true});});

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
    service.dispose();
  });

  it("does not publish a late launch result after disposal",async()=>{
    let release!: (value: ReturnType<typeof ok<{sessionId:string}>>) => void;
    const created = new Promise<ReturnType<typeof ok<{sessionId:string}>>>((resolve) => { release = resolve; });
    const api={sessions:{ create:async()=>await created, rename:async()=>ok({}), prompt:async()=>ok({accepted:true}) }};
    const service=new BoardService({apiProxy:api,workspaceRegistry:undefined},env(),()=>1000);
    const id=service.create({title:"Task",prompt:"Prompt"})[0]!.id;
    service.run(id);
    service.dispose();
    release(ok({sessionId:"late-session"}));
    await new Promise((resolve)=>setImmediate(resolve));
    expect(service.snapshot().tasks[0]!.executions[0]!.sessionId).toBeUndefined();
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
    service.dispose();
  });
});
