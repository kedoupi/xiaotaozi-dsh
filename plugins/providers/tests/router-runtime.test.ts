import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import AgentRegistry, { installModelSelection } from "@deepseek-ai/dsh-agent";
import type { ModelSelectionRef } from "@deepseek-ai/dsh-agent";
import AgentLoop from "@deepseek-ai/dsh-agent-loop";
import {
  CallId,
  LlmAdapter,
  LlmRuntime,
  ReasoningEffortId,
  createUserMessage,
} from "@deepseek-ai/dsh-llm";
import type { GenerateOptions, StreamChunk, UserMessage } from "@deepseek-ai/dsh-llm";
import SessionStore, { SessionId } from "@deepseek-ai/dsh-session";
import SystemPrompt from "@deepseek-ai/dsh-system-prompt";
import ToolRuntime from "@deepseek-ai/dsh-tools";
import type { AuthorizedModelInventory } from "../src/router/inventory.ts";
import { installRouterRuntime } from "../src/router/runtime.ts";
import type { RoutingMode } from "../src/router/preferences.ts";

const HOST = { provider: "host", model: "host-model" } as const;
const ROUTER = { provider: "router", model: "router-model" } as const;
const OTHER = { provider: "router", model: "other-model" } as const;

type StreamScript = (request: GenerateOptions) => AsyncIterable<StreamChunk>;

class ScriptedAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = [];
  constructor(private readonly scripts: StreamScript[]) {
    super();
  }
  override resolveModel(provider: string, model: string) {
    return Promise.resolve({
      provider,
      id: model,
      name: model,
      reasoning: { efforts: [{ id: ReasoningEffortId("high"), name: "High" }] },
    });
  }
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options);
    const script = this.scripts.shift();
    if (script === undefined) throw new Error("unexpected model stream");
    yield* script(options);
  }
}

async function* textReply(text: string): AsyncIterable<StreamChunk> {
  yield { type: "block-start", index: 0, blockType: "text" };
  yield { type: "text-delta", index: 0, text };
  yield { type: "block-end", index: 0, block: { type: "text", text } };
  yield { type: "finish", reason: { kind: "stop" } };
}

async function* toolReply(): AsyncIterable<StreamChunk> {
  const id = CallId("call-ping");
  yield { type: "block-start", index: 0, blockType: "tool-call" };
  yield { type: "tool-call-delta", index: 0, id, name: "ping", argumentsDelta: "{}" };
  yield { type: "block-end", index: 0, block: { type: "tool-call", id, name: "ping", arguments: "{}" } };
  yield { type: "finish", reason: { kind: "tool-calls" } };
}

async function* errorReply(code = "SERVER"): AsyncIterable<StreamChunk> {
  yield {
    type: "finish",
    reason: {
      kind: "error",
      failure: { message: "transient", code },
    },
  };
}

function catalog(models: Array<{
  provider: string;
  model: string;
  quality: 1 | 2 | 3 | 4 | 5;
  contextWindow?: number;
}>, generation?: string): AuthorizedModelInventory {
  const candidates = models.map((model) => ({
    ref: `${model.provider}/${model.model}` as const,
    provider: model.provider,
    model: model.model,
    source: "api" as const,
    displayName: model.model,
    profile: { quality: model.quality, speed: 3 as const, cost: 3 as const },
    ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
  }));
  return {
    capturedAt: 1,
    generation: generation ?? candidates.map((candidate) => candidate.ref).join(","),
    candidates,
  };
}

interface RuntimeHarness {
  ctx: Context;
  adapter: ScriptedAdapter;
  hostSelection: ModelSelectionRef;
  agent: {
    followup(message: UserMessage): void;
    whenIdle(): Promise<void>;
  };
  inventoryCalls: number;
  errors: unknown[];
  dispose(): Promise<void>;
}

const harnesses: RuntimeHarness[] = [];

async function boot(options: {
  scripts: StreamScript[];
  mode?: RoutingMode;
  inventory?: () => Promise<AuthorizedModelInventory> | AuthorizedModelInventory;
  attachAfterCreate?: boolean;
  reasoningEffort?: string;
  now?: () => number;
  healthCooldownMs?: number;
  switchMargin?: number;
}): Promise<RuntimeHarness> {
  const ctx = new Context();
  const adapter = new ScriptedAdapter(options.scripts);
  const hostSelection: ModelSelectionRef = {
    current: {
      ...HOST,
      ...options.reasoningEffort === undefined ? {} : { reasoningEffort: options.reasoningEffort as never },
    },
    assembled: undefined,
  };
  let mode: RoutingMode = options.mode ?? "smart";
  let inventoryCalls = 0;
  const errors: unknown[] = [];
  const both = catalog([
    { ...HOST, quality: 1 },
    { ...ROUTER, quality: 5 },
  ]);

  await ctx.plugin(LlmRuntime);
  await ctx.plugin(AgentRegistry);
  await ctx.plugin(SessionStore);
  await ctx.plugin(SystemPrompt, { persona: "provider={{provider}} model={{model}}" });
  await ctx.plugin(ToolRuntime);
  await ctx.plugin(AgentLoop, { agents: [] });
  ctx.llm.registerAdapter(["host", "router"], adapter);
  ctx.tools.register({
    name: "ping",
    description: "ping",
    parameters: { type: "object", properties: {} },
    output: { schema: { type: "string" }, render: () => [{ type: "text", text: "pong" }] },
    execute: async () => "pong",
  });
  ctx.on("agent/error", (payload) => {
    errors.push(payload.error);
  });

  const runtimeOptions = {
    getMode: () => mode,
    inventory: async () => {
      inventoryCalls += 1;
      return await (options.inventory ?? (() => both))();
    },
    switchMargin: options.switchMargin ?? 0,
    ...options.now === undefined ? {} : { now: options.now },
    ...options.healthCooldownMs === undefined ? {} : { healthCooldownMs: options.healthCooldownMs },
  };

  if (options.attachAfterCreate !== true) installRouterRuntime(ctx, runtimeOptions);

  const handle = await ctx.agents.create({
    sessionId: SessionId(`router-runtime-${randomUUID()}`),
    agentOptions: { ...HOST },
    setup: (agentCtx) => {
      installModelSelection(agentCtx, hostSelection);
    },
  });
  await handle.agent.whenIdle();
  if (options.attachAfterCreate === true) installRouterRuntime(ctx, runtimeOptions);

  const harness: RuntimeHarness = {
    ctx,
    adapter,
    hostSelection,
    agent: handle.agent,
    get inventoryCalls() {
      return inventoryCalls;
    },
    errors,
    dispose: async () => {
      await handle.dispose();
      await ctx.fiber.dispose();
    },
  };
  Object.assign(harness, {
    setMode(next: RoutingMode) {
      mode = next;
    },
  });
  harnesses.push(harness);
  return harness;
}

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.dispose()));
});

function human(text: string): UserMessage {
  return createUserMessage({
    content: [{ type: "text", text }],
    source: { kind: "user" },
  });
}

describe("installRouterRuntime", () => {
  it("routes a next-turn human claim before assemble and keeps prompt equal to request", async () => {
    const harness = await boot({ scripts: [() => textReply("ok")] });
    harness.agent.followup(human("route me"));
    await harness.agent.whenIdle();
    const request = harness.adapter.requests[0];
    expect(request?.provider).toBe(ROUTER.provider);
    expect(request?.model).toBe(ROUTER.model);
    expect(request?.system).toContain(`provider=${ROUTER.provider}`);
    expect(request?.system).toContain(`model=${ROUTER.model}`);
    expect(request?.system).not.toContain(HOST.model);
    expect(harness.inventoryCalls).toBeGreaterThan(0);
  });

  it("delegates fully to Host in manual mode", async () => {
    const harness = await boot({ scripts: [() => textReply("ok")], mode: "manual" });
    harness.agent.followup(human("leave it"));
    await harness.agent.whenIdle();
    const request = harness.adapter.requests[0];
    expect(request?.provider).toBe(HOST.provider);
    expect(request?.model).toBe(HOST.model);
    expect(request?.system).toContain(`model=${HOST.model}`);
    expect(harness.inventoryCalls).toBe(0);
  });

  it("pins tool continuation to the assembled snapshot", async () => {
    const harness = await boot({
      scripts: [
        () => toolReply(),
        () => textReply("done"),
      ],
    });
    harness.agent.followup(human("use the tool"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests).toHaveLength(2);
    expect(harness.adapter.requests.map((request) => request.model)).toEqual([
      ROUTER.model,
      ROUTER.model,
    ]);
    expect(harness.adapter.requests[0]?.system).toBe(harness.adapter.requests[1]?.system);
  });

  it("pins same-step request-error retry to the assembled snapshot", async () => {
    const harness = await boot({
      scripts: [() => errorReply(), () => textReply("recovered")],
    });
    harness.ctx.on("agent/request-error", () => Promise.resolve({ kind: "retry" as const }));
    harness.agent.followup(human("retry me"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests).toHaveLength(2);
    expect(harness.adapter.requests.map((request) => request.model)).toEqual([
      ROUTER.model,
      ROUTER.model,
    ]);
    expect(harness.adapter.requests[0]?.system).toBe(harness.adapter.requests[1]?.system);
    expect(harness.errors).toEqual([]);
  });

  it("can choose a different authorized model on the next human turn", async () => {
    let turn = 0;
    const harness = await boot({
      scripts: [() => textReply("one"), () => textReply("two")],
      inventory: () => {
        turn += 1;
        if (turn <= 2) return catalog([{ ...ROUTER, quality: 5 }]);
        return catalog([{ ...OTHER, quality: 5 }]);
      },
    });
    harness.agent.followup(human("first"));
    await harness.agent.whenIdle();
    harness.agent.followup(human("second"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests.map((request) => request.model)).toEqual([
      ROUTER.model,
      OTHER.model,
    ]);
  });

  it("fails closed at request time when the assembled model is no longer authorized", async () => {
    let calls = 0;
    const harness = await boot({
      scripts: [() => textReply("should not run")],
      inventory: () => {
        calls += 1;
        if (calls === 1) return catalog([{ ...ROUTER, quality: 5 }]);
        return catalog([{ ...HOST, quality: 1 }]);
      },
    });
    harness.agent.followup(human("revoke me"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests).toHaveLength(0);
    expect(harness.errors.length).toBeGreaterThan(0);
    expect(String(harness.errors[0])).toMatch(/不再授权/);
  });

  it("clears inherited reasoning effort when routing to a different model", async () => {
    const harness = await boot({
      scripts: [() => textReply("ok")],
      reasoningEffort: "high",
    });
    harness.agent.followup(human("no effort"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests[0]?.reasoningEffort).toBeUndefined();
    expect(harness.adapter.requests[0]?.model).toBe(ROUTER.model);
  });

  it("preserves Host reasoning effort when staying on the Host model", async () => {
    const harness = await boot({
      scripts: [() => textReply("ok")],
      reasoningEffort: "high",
      inventory: () => catalog([{ ...HOST, quality: 5 }]),
    });
    harness.agent.followup(human("keep effort"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests[0]?.model).toBe(HOST.model);
    expect(harness.adapter.requests[0]?.reasoningEffort).toBe("high");
  });

  it("excludes a known-too-small context candidate at production runtime", async () => {
    const harness = await boot({
      scripts: [() => textReply("ok")],
      inventory: () => catalog([
        { ...HOST, quality: 5, contextWindow: 16 },
        { ...ROUTER, quality: 1, contextWindow: 100_000 },
      ]),
    });
    harness.agent.followup(human(`continue ${"token ".repeat(80)}`));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests[0]?.model).toBe(ROUTER.model);
  });

  it("uses a changed Host picker as the next human turn stay baseline", async () => {
    const equal = catalog([
      { ...HOST, quality: 5 },
      { ...ROUTER, quality: 5 },
      { ...OTHER, quality: 5 },
    ]);
    const harness = await boot({
      scripts: [() => textReply("one"), () => textReply("two")],
      inventory: () => equal,
    });
    harness.agent.followup(human("first"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests[0]?.model).toBe(HOST.model);
    harness.hostSelection.current = { ...OTHER };
    harness.agent.followup(human("second"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests.map((request) => request.model)).toEqual([
      HOST.model,
      OTHER.model,
    ]);
  });

  it("makes a switched-away failure eligible after cooldown without its own success", async () => {
    let now = 1_000;
    const harness = await boot({
      scripts: [() => errorReply("AUTH"), () => textReply("other"), () => textReply("back")],
      inventory: () => catalog([
        { ...HOST, quality: 5 },
        { ...ROUTER, quality: 1 },
      ]),
      now: () => now,
      healthCooldownMs: 10_000,
    });
    harness.agent.followup(human("fail host"));
    await harness.agent.whenIdle();
    harness.agent.followup(human("use other"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests.map((request) => request.model)).toEqual([
      HOST.model,
      ROUTER.model,
    ]);
    now = 20_000;
    harness.agent.followup(human("host again"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests.map((request) => request.model)).toEqual([
      HOST.model,
      ROUTER.model,
      HOST.model,
    ]);
  });

  it("drops health when inventory generation changes", async () => {
    let generation = "gen-a";
    const harness = await boot({
      scripts: [() => errorReply("AUTH"), () => textReply("recovered")],
      inventory: () => catalog([
        { ...HOST, quality: 5 },
        { ...ROUTER, quality: 1 },
      ], generation),
    });
    harness.agent.followup(human("fail host"));
    await harness.agent.whenIdle();
    generation = "gen-b";
    harness.agent.followup(human("eligible again"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests.map((request) => request.model)).toEqual([
      HOST.model,
      HOST.model,
    ]);
  });

  it("attaches agents that already exist when the runtime is installed", async () => {
    const harness = await boot({
      scripts: [() => textReply("ok")],
      attachAfterCreate: true,
    });
    harness.agent.followup(human("late attach"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests[0]?.model).toBe(ROUTER.model);
  });
});
