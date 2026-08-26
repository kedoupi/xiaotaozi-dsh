import { expect, it } from "vitest";
import { apply } from "../src/host/index";

type Unit = {
  key: string;
  init: () => any;
  apply: (state: any, event: any) => any;
  view: (state: any) => any;
  schema?: { parse: (v: any) => any; safeParse: (v: any) => { success: boolean } };
  stateSchema?: { parse: (v: any) => any };
  wire?: {
    viewSchema: { parse: (v: any) => any };
    view: (state: any) => any;
  };
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

function hasUndefined(value: unknown, seen = new Set<unknown>()): boolean {
  if (value === undefined) return true;
  if (value === null || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => hasUndefined(item, seen));
  return Object.values(value).some((item) => hasUndefined(item, seen));
}

const live = [
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

it("unregisters both projections when the host effect disposes", () => {
  const defs = new Map<string, Unit>();
  let dispose = (): void => undefined;
  apply({
    inject(_list: string[], cb: (ctx: unknown) => void) { cb(this); },
    effect(fn: () => (() => void) | void) {
      const off = fn();
      if (typeof off === "function") dispose = off;
      return () => undefined;
    },
    sessionProjections: {
      register(d: Unit) {
        defs.set(d.key, d);
        return () => { defs.delete(d.key); };
      },
    },
  } as any, {} as any);
  expect([...defs.keys()].sort()).toEqual(["contextHeaders", "contextTimeline"]);
  dispose();
  expect(defs.size).toBe(0);
});

it("registers both projection contracts so 0.1.1+ can deliver the Context tab", () => {
  const defs = mount();
  const timeline = defs.get("contextTimeline")!;
  const headers = defs.get("contextHeaders")!;
  expect(typeof timeline.stateSchema?.parse).toBe("function");
  expect(typeof timeline.wire?.viewSchema.parse).toBe("function");
  expect(typeof timeline.wire?.view).toBe("function");
  expect(timeline.wire?.view).toBe(timeline.view);
  expect(typeof timeline.schema?.safeParse).toBe("function");
  expect(typeof headers.stateSchema?.parse).toBe("function");
  expect(typeof headers.wire?.viewSchema.parse).toBe("function");
  expect(typeof headers.wire?.view).toBe("function");
  expect(headers.wire?.view).toBe(headers.view);
});

it("attributes inject and compaction events to surrounding requests", () => {
  const def = mount().get("contextTimeline")!;
  const v = drive(def, live);
  const injectEv = v.events.find((e: { kind: string }) => e.kind === "inject");
  expect(injectEv.turn).toBe(1);
  expect(injectEv.step).toBe(1);
  expect(injectEv.fromTurn).toBeUndefined();
  const compactEv = v.events.find((e: { kind: string; seq: number }) => e.kind === "compaction" && e.seq === 8);
  expect(compactEv.turn).toBeUndefined();
  expect(compactEv.fromTurn).toBe(1);
  expect(compactEv.fromStep).toBe(1);

  const after = drive(def, [
    ...live,
    { seq: 9, type: "assistant/message", time: 7000, data: { turn: 1, step: 2, message: { content: [{ type: "text", text: "more" }] } } },
  ]);
  const compactAfter = after.events.find((e: { kind: string; seq: number }) => e.kind === "compaction" && e.seq === 8);
  expect(compactAfter.turn).toBe(1);
  expect(compactAfter.step).toBe(2);

  const cross = drive(def, [
    ...live,
    { seq: 9, type: "assistant/message", time: 7000, data: { turn: 1, step: 2, message: { content: [{ type: "text", text: "more" }] } } },
    { seq: 10, type: "compaction/summary", time: 7500, data: { shadowedTokenCount: 3000, shadowedSeqs: [3, 4] } },
    { seq: 11, type: "assistant/message", time: 8000, data: { turn: 2, step: 1, message: { content: [{ type: "text", text: "more2" }] } } },
  ]);
  const compactCross = cross.events.find((e: { kind: string; seq: number }) => e.kind === "compaction" && e.seq === 10);
  expect(compactCross.turn).toBe(2);
  expect(compactCross.step).toBe(1);
  expect(compactCross.fromTurn).toBe(1);
  expect(compactCross.fromStep).toBe(2);
});

it("prices an empty assistant message at 0 tokens", () => {
  const def = mount().get("contextTimeline")!;
  const v = drive(def, [
    { seq: 12, type: "assistant/message", time: 9000, data: { turn: 2, step: 2, message: { content: [] } } },
  ]);
  expect(v.nodes.find((n: { seq: number }) => n.seq === 12).tokens).toBe(0);
});

it("pins live inject nodes outside the served tail", () => {
  const v = drive(mount({ maxNodes: 2 }).get("contextTimeline")!, [
    { seq: 1, type: "user/message", time: 1000, data: { source: { kind: "plugin", form: "context", plugin: "dsh-test" }, content: [{ type: "text", text: "injected context" }] } },
    { seq: 2, type: "user/message", time: 2000, data: { content: [{ type: "text", text: "x".repeat(20) }] } },
    { seq: 3, type: "user/message", time: 3000, data: { content: [{ type: "text", text: "x".repeat(20) }] } },
    { seq: 4, type: "user/message", time: 4000, data: { content: [{ type: "text", text: "x".repeat(20) }] } },
    { seq: 5, type: "user/message", time: 5000, data: { content: [{ type: "text", text: "x".repeat(20) }] } },
  ]);
  expect(v.nodes.map((n: { seq: number }) => n.seq)).toEqual([1, 4, 5]);
  expect(v.nodes[0].cat).toBe("inject");
  expect(v.droppedNodes).toBe(2);
  expect(v.surfaceFloor).toBe(3);
});

it("keeps header content epochs, dedupes, and caps at 50", () => {
  const def = mount().get("contextHeaders")!;
  const hlog = drive(def, [
    { seq: 1, type: "request/header", time: 1000, data: { reason: "initial", header: { system: "You are an agent.", tools: [{ name: "bash", description: "run a command", parameters: { type: "object" } }], config: { model: "m", provider: "p" } } } },
    { seq: 2, type: "user/message", time: 2000, data: { content: [{ type: "text", text: "hi" }] } },
    { seq: 3, type: "request/header", time: 3000, data: { reason: "change", header: { system: "You are another agent.", tools: [], config: { model: "m2", provider: "p" } } } },
  ]);
  expect(hlog.headers).toHaveLength(2);
  expect(hlog.headers[0].system).toBe("You are an agent.");
  expect(hlog.headers[0].tools[0].name).toBe("bash");
  expect(hlog.headers[0].tools[0].schema.parameters).toEqual({ type: "object" });
  expect(def.apply(def.init(), { type: "user/message", seq: 9, time: 0, data: {} }).headers).toHaveLength(0);

  const many = [];
  for (let i = 1; i <= 60; i += 1) {
    many.push({ seq: i, type: "request/header", time: i * 1000, data: { reason: "change", header: { system: `s${i}`, config: { model: `m${i}` } } } });
  }
  const capped = drive(def, many);
  expect(capped.headers).toHaveLength(50);
  expect(capped.headers[0].system).toBe("s11");
  expect(def.schema!.safeParse(hlog).success).toBe(true);
});

it("trims long sessions on whole-turn boundaries", () => {
  const events = [];
  let seq = 1000;
  for (let turn = 1; turn <= 400; turn += 1) {
    for (let step = 0; step < 4; step += 1) {
      events.push({
        seq: seq++,
        type: "assistant/message",
        time: seq * 1000,
        data: { turn, step, message: { content: [{ type: "text", text: "x" }] } },
      });
    }
  }
  const long = drive(mount().get("contextTimeline")!, events);
  expect(long.requests).toHaveLength(1200);
  expect(long.requests[0].turn).toBe(101);
  expect(long.requests[0].step).toBe(0);
  const keptTurns = new Set(long.requests.map((r: { turn: number }) => r.turn));
  expect(keptTurns.size).toBe(300);
  expect(long.requests.filter((r: { turn: number }) => r.turn === 101)).toHaveLength(4);
  expect(long.requests.filter((r: { turn: number }) => r.turn === 400)).toHaveLength(4);
});

it("records one model switch and maps billed usage into cost totals", () => {
  const def = mount().get("contextTimeline")!;
  const switchLog = drive(def, [
    { seq: 1, type: "request/header", time: 1000, data: { reason: "initial", header: { system: "s", config: { model: "model-a", provider: "deepseek" } } } },
    { seq: 2, type: "request/header", time: 2000, data: { reason: "change", header: { system: "s", config: { model: "model-b", provider: "deepseek" } } } },
    { seq: 3, type: "request/context", time: 2000, data: { model: "model-b", provider: "deepseek", contextWindow: 64000 } },
    { seq: 4, type: "request/header", time: 3000, data: { reason: "change", header: { system: "s", config: { model: "model-b", provider: "openai" } } } },
    { seq: 5, type: "request/header", time: 4000, data: { reason: "change", header: { system: "s", config: { model: "model-b", provider: "openai" } } } },
  ]);
  const switchEvents = switchLog.events.filter((e: { kind: string }) => e.kind === "model");
  expect(switchEvents).toHaveLength(1);
  expect(switchEvents[0].from).toBe("model-a");
  expect(switchEvents[0].to).toBe("model-b");
  expect(switchLog.model).toBe("model-b");
  expect(switchLog.provider).toBe("openai");
  expect(switchLog.contextWindow).toBe(64000);

  const usageLog = drive(def, [
    { seq: 1, type: "assistant/message", time: 1000, data: { turn: 1, step: 1, usage: { inputTokens: 800, cacheReadTokens: 150, cacheWriteTokens: 50, outputTokens: 30, reasoningTokens: 10 }, message: { content: [] } } },
  ]);
  expect(usageLog.requests[0].prompt).toBe(1000);
  expect(usageLog.requests[0].output).toBe(30);

  const peak = Date.UTC(2026, 0, 5, 2, 0, 0);
  const off = Date.UTC(2026, 0, 5, 12, 0, 0);
  const costLog = drive(def, [
    { seq: 1, type: "request/header", time: peak - 1000, data: { header: { config: { model: "deepseek/deepseek-v4-flash", provider: "openrouter" } } } },
    { seq: 2, type: "assistant/message", time: peak, data: { turn: 1, step: 1, usage: { inputTokens: 800, cacheReadTokens: 150, cacheWriteTokens: 50, outputTokens: 30 }, message: { content: [] } } },
    { seq: 3, type: "assistant/message", time: peak + 1000, data: { turn: 1, step: 2, usage: { inputTokens: 200, outputTokens: 10 }, message: { content: [] } } },
    { seq: 4, type: "assistant/message", time: off, data: { turn: 1, step: 3, usage: { inputTokens: 100, cacheReadTokens: 900 }, message: { content: [] } } },
  ]);
  expect(costLog.cost.flash.peak).toEqual({ uncached: 1000, cacheRead: 150, cacheWrite: 50, output: 40 });
  expect(costLog.cost.flash.off).toEqual({ uncached: 100, cacheRead: 900, cacheWrite: 0, output: 0 });
  expect(costLog.cost.pro).toBeUndefined();
});

it("keeps persisted fold state free of undefined properties", () => {
  const def = mount().get("contextTimeline")!;
  const jsonLog = [
    ...live,
    { seq: 99, type: "assistant/message", time: 9999, data: { message: { content: [{ type: "text", text: "no turn/step here" }] } } },
  ];
  let st = def.init();
  for (const ev of jsonLog) {
    st = def.apply(st, ev);
    expect(hasUndefined(st)).toBe(false);
    expect(def.stateSchema!.parse(st)).toEqual(st);
    expect(def.wire!.viewSchema.parse(def.wire!.view(st))).toEqual(def.view(st));
  }
  const armed = def.apply(def.init(), { seq: 1, type: "compaction/summary", time: 1000, data: { shadowedSeqs: [2], shadowedTokenCount: 10 } });
  expect(hasUndefined(armed)).toBe(false);
  expect(def.schema!.safeParse(def.view(st)).success).toBe(true);
});
