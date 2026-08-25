import { expect, it } from "vitest";
import { apply } from "../src/host/index";

type Unit = {
  key: string;
  init: () => any;
  apply: (state: any, event: any) => any;
  view: (state: any) => any;
};

function mount(config?: Record<string, number>): Map<string, Unit> {
  const defs = new Map<string, Unit>();
  apply({
    inject(_list: string[], cb: (ctx: unknown) => void) { cb(this); },
    effect(fn: () => () => void) { fn(); return () => undefined; },
    sessionProjections: {
      register(d: Unit) { defs.set(d.key, d); return () => undefined; },
    },
  } as any, config as any);
  return defs;
}

function drive(def: Unit, events: unknown[]) {
  let st = def.init();
  for (const ev of events) st = def.apply(st, ev);
  return def.view(st);
}

it("registers the timeline and headers projection units", () => {
  const defs = mount();
  expect(defs.get("contextTimeline")?.key).toBe("contextTimeline");
  expect(defs.get("contextHeaders")?.key).toBe("contextHeaders");
});

it("folds a synthetic session into composition, events, and surface nodes", () => {
  const def = mount().get("contextTimeline")!;
  const events = [
    { seq: 1, type: "request/header", time: 1000, data: {
      header: { system: "You are a harness agent.", tools: [{ name: "bash", description: "run a command" }], config: { model: "deepseek-v4", provider: "deepseek" } },
    } },
    { seq: 2, type: "request/context", time: 1000, data: { contextWindow: 128000 } },
    { seq: 3, type: "user/message", time: 2000, data: { content: [{ type: "text", text: "Hello there, a fairly long user message that should cost more than one token!" }] } },
    { seq: 4, type: "user/message", time: 3000, data: { source: { kind: "plugin", form: "notice", plugin: "dsh-agent-presets", summary: "Skill injected (code-review)" }, content: [{ type: "text", text: "injected text" }] } },
    { seq: 5, type: "tool/call", time: 4000, data: { callId: "c1", name: "bash", arguments: "{}" } },
    { seq: 6, type: "tool/result", time: 4100, data: { callId: "c1", message: { source: { kind: "tool", callId: "c1" }, content: [{ type: "tool-result", toolCallId: "c1", content: [{ type: "text", text: "ok" }] }] } } },
    { seq: 7, type: "assistant/message", time: 5000, data: { turn: 1, step: 1, usage: { inputTokens: 900, outputTokens: 40 }, message: { content: [{ type: "text", text: "Hi!" }] } } },
    { seq: 8, type: "compaction/summary", time: 6000, data: { shadowedTokenCount: 5000, shadowedSeqs: [3, 4, 5, 6] } },
  ];
  const v = drive(def, events);
  expect(v.ok).toBe(true);
  expect(v.model).toBe("deepseek-v4");
  expect(v.provider).toBe("deepseek");
  expect(v.contextWindow).toBe(128000);
  expect(v.current.system).toBeGreaterThan(0);
  expect(v.current.tools).toBeGreaterThan(0);
  expect(v.current.user).toBeGreaterThan(0);
  expect(v.current.inject).toBeGreaterThan(0);
  expect(v.current.tool).toBeGreaterThan(0);
  expect(v.current.assistant).toBeGreaterThan(0);
  expect(v.requests).toHaveLength(1);
  expect(v.requests[0].prompt).toBe(900);
  expect(v.events.some((e: { kind: string; form?: string }) => e.kind === "inject" && e.form === "notice")).toBe(true);
  expect(v.events.some((e: { kind: string }) => e.kind === "compaction")).toBe(true);
  expect(v.nodes.length).toBeGreaterThanOrEqual(4);
  const asst = v.nodes.find((n: { seq: number }) => n.seq === 7);
  expect(asst.tokens).toBe(9);
  expect(asst.text).toBe("Hi!");
  const tool = v.nodes.find((n: { seq: number }) => n.seq === 6);
  expect(tool.tokens).toBe(13);
  expect(tool.tool).toBe("bash");
  expect(v.occupancy).toBeUndefined();
});

it("ignores unrelated events by returning the same state reference", () => {
  const def = mount().get("contextTimeline")!;
  let base = def.init();
  base = def.apply(base, { seq: 1, type: "user/message", time: 1000, data: { content: [{ type: "text", text: "hi" }] } });
  expect(def.apply(base, { type: "todo/write", seq: 99, time: 0, data: { todos: [] } })).toBe(base);
  expect(def.apply(base, { type: "totally/unknown", seq: 100, time: 0, data: {} })).toBe(base);
});

it("archives shadowed seqs even when they sit past the declared range end", () => {
  const def = mount().get("contextTimeline")!;
  const shadow = drive(def, [
    { seq: 1, type: "user/message", time: 1000, data: { content: [{ type: "text", text: "a".repeat(40) }] } },
    { seq: 2, type: "tool/result", time: 2000, data: { message: { source: { kind: "tool", callId: "c1" }, content: [{ type: "tool-result", toolCallId: "c1", content: [{ type: "text", text: "b".repeat(80) }] }] } } },
    { seq: 3, type: "tool/result", time: 3000, data: { message: { source: { kind: "tool", callId: "c2" }, content: [{ type: "tool-result", toolCallId: "c2", content: [{ type: "text", text: "c".repeat(80) }] }] } } },
    { seq: 4, type: "compaction/prune", time: 4000, data: { shadowedRange: { start: 2, end: 2 }, shadowedSeqs: [2, 3], shadowedTokenCount: 64 } },
    { seq: 5, type: "tool/result", time: 5000, surfaceOp: { op: "replace", start: 2, end: 2 }, data: { message: { source: { kind: "tool", callId: "c3" }, content: [{ type: "tool-result", toolCallId: "c3", content: [{ type: "text", text: "d" }] }] } } },
  ]);
  expect(shadow.current.tool).toBe(13);
  expect(shadow.archive.map((n: { seq: number }) => n.seq)).toEqual([2, 3]);
  expect(shadow.archive.every((n: { gone?: number }) => n.gone === 5)).toBe(true);
});

it("caps the archive and the live node slice from Config", () => {
  const capped = drive(mount({ maxArchiveNodes: 1 }).get("contextTimeline")!, [
    { seq: 1, type: "user/message", time: 1000, data: { content: [{ type: "text", text: "a".repeat(40) }] } },
    { seq: 2, type: "compaction/prune", time: 2000, data: { shadowedSeqs: [1], shadowedTokenCount: 18 } },
    { seq: 3, type: "user/message", time: 3000, surfaceOp: { op: "replace", start: 1, end: 1 }, data: { content: [{ type: "text", text: "b" }] } },
    { seq: 4, type: "user/message", time: 4000, data: { content: [{ type: "text", text: "c".repeat(40) }] } },
    { seq: 5, type: "compaction/prune", time: 5000, data: { shadowedSeqs: [4], shadowedTokenCount: 18 } },
    { seq: 6, type: "user/message", time: 6000, surfaceOp: { op: "replace", start: 4, end: 4 }, data: { content: [{ type: "text", text: "d" }] } },
  ]);
  expect(capped.archive.map((n: { seq: number }) => n.seq)).toEqual([4]);

  const def = mount({ maxNodes: 2 }).get("contextTimeline")!;
  const events = [];
  for (let s = 1; s <= 4; s += 1) {
    events.push({ seq: s, type: "user/message", time: s * 1000, data: { content: [{ type: "text", text: "x".repeat(20) }] } });
  }
  const floored = drive(def, events);
  expect(floored.droppedNodes).toBe(2);
  expect(floored.surfaceFloor).toBe(2);
});
