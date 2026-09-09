import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import AgentRegistry, { installModelSelection } from "@deepseek-ai/dsh-agent";
import type { ModelSelectionRef } from "@deepseek-ai/dsh-agent";
import AgentLoop from "@deepseek-ai/dsh-agent-loop";
import {
  QUOTA_EXCEEDED_CODE,
  ToolCallId,
  LlmAdapter,
  LlmRuntime,
  ReasoningEffortId,
  createUserMessage,
} from "@deepseek-ai/dsh-llm";
import type {
  GenerateOptions,
  StreamChunk,
  UserMessage,
} from "@deepseek-ai/dsh-llm";
import { AttachmentId } from "@deepseek-ai/dsh-attachment";
import SessionStore, { SessionId } from "@deepseek-ai/dsh-session";
import SessionProjectionRegistry from "@deepseek-ai/dsh-session-projection";
import SystemPrompt from "@deepseek-ai/dsh-system-prompt";
import ToolRuntime from "@deepseek-ai/dsh-tools";
import type { AuthorizedModelInventory } from "../src/router/inventory.ts";
import { buildAuthorizedInventory } from "../src/router/inventory.ts";
import { kimiModalities } from "../src/providers/kimi.ts";
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
  const id = ToolCallId("call-ping");
  yield { type: "block-start", index: 0, blockType: "tool-call" };
  yield {
    type: "tool-call-delta",
    index: 0,
    id,
    name: "ping",
    argumentsDelta: "{}",
  };
  yield {
    type: "block-end",
    index: 0,
    block: { type: "tool-call", id, name: "ping", arguments: "{}" },
  };
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

function catalog(
  models: Array<{
    provider: string;
    model: string;
    quality: 1 | 2 | 3 | 4 | 5;
    contextWindow?: number;
    vision?: boolean;
    inputModalities?: readonly ("text" | "image")[];
  }>,
  generation?: string,
): AuthorizedModelInventory {
  const candidates = models.map((model) => ({
    ref: `${model.provider}/${model.model}` as const,
    provider: model.provider,
    model: model.model,
    source: "api" as const,
    displayName: model.model,
    profile: {
      quality: model.quality,
      speed: 3 as const,
      cost: 3 as const,
      ...(model.vision === undefined ? {} : { vision: model.vision }),
    },
    ...(model.contextWindow === undefined
      ? {}
      : { contextWindow: model.contextWindow }),
    ...(model.inputModalities === undefined
      ? {}
      : { inputModalities: model.inputModalities }),
  }));
  return {
    capturedAt: 1,
    generation:
      generation ?? candidates.map((candidate) => candidate.ref).join(","),
    candidates,
  };
}

interface RuntimeHarness {
  disposeRouter(): void;
  ctx: Context;
  adapter: ScriptedAdapter;
  hostSelection: ModelSelectionRef;
  agent: {
    followup(message: UserMessage): void;
    whenIdle(): Promise<void>;
    session: { id: string };
  };
  inventoryCalls: number;
  errors: unknown[];
  dispose(): Promise<void>;
}

const harnesses: RuntimeHarness[] = [];

async function boot(options: {
  scripts: StreamScript[];
  mode?: RoutingMode;
  inventory?: () =>
    | Promise<AuthorizedModelInventory>
    | AuthorizedModelInventory;
  onDecision?: (
    event: import("../src/router/events.ts").RouterDecisionEvent,
  ) => void;
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
      ...(options.reasoningEffort === undefined
        ? {}
        : { reasoningEffort: options.reasoningEffort as never }),
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
  await ctx.plugin(SessionProjectionRegistry);
  await ctx.plugin(SystemPrompt, {
    persona: "provider={{provider}} model={{model}}",
  });
  await ctx.plugin(ToolRuntime);
  await ctx.plugin(AgentLoop, { agents: [] });
  ctx.llm.registerAdapter(["host", "router"], adapter);
  ctx.tools.register({
    name: "ping",
    description: "ping",
    parameters: { type: "object", properties: {} },
    output: {
      schema: { type: "string" },
      render: () => [{ type: "text", text: "pong" }],
    },
    execute: async () => "pong",
  });
  ctx.on("agent/error", (payload) => {
    errors.push(payload.error);
  });

  const runtimeOptions = {
    onDecision: options.onDecision,
    getMode: () => mode,
    inventory: async () => {
      inventoryCalls += 1;
      return await (options.inventory ?? (() => both))();
    },
    switchMargin: options.switchMargin ?? 0,
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.healthCooldownMs === undefined
      ? {}
      : { healthCooldownMs: options.healthCooldownMs }),
  };

  let disposeRouter = () => {};
  if (options.attachAfterCreate !== true)
    disposeRouter = installRouterRuntime(ctx, runtimeOptions);

  const handle = await ctx.agents.create({
    sessionId: SessionId(`router-runtime-${randomUUID()}`),
    agentOptions: { ...HOST },
    setup: (agentCtx) => {
      installModelSelection(agentCtx, hostSelection);
    },
  });
  await handle.agent.whenIdle();
  if (options.attachAfterCreate === true)
    disposeRouter = installRouterRuntime(ctx, runtimeOptions);

  const harness: RuntimeHarness = {
    disposeRouter,
    ctx,
    adapter,
    hostSelection,
    agent: {
      followup: (message) => handle.agent.followup(message),
      whenIdle: () => handle.agent.whenIdle(),
      session: handle.agent.session,
    },
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

function humanWithImage(text: string): UserMessage {
  return createUserMessage({
    content: [
      { type: "text", text },
      {
        type: "image",
        attachment: {
          attachmentId: AttachmentId("att-image"),
          mediaType: "image/png",
          bytes: 4,
          width: 1,
          height: 1,
          name: "shot.png",
        },
      },
    ],
    source: { kind: "user" },
  });
}

function humanWithFile(text: string, name: string): UserMessage {
  return createUserMessage({
    content: [
      { type: "text", text },
      {
        type: "file",
        attachment: {
          attachmentId: `att-${name}`,
          name,
          bytes: 4,
        },
      },
    ],
    source: { kind: "user" },
  } as Parameters<typeof createUserMessage>[0]);
}

const VISION = { provider: "router", model: "vision-model" } as const;
const KIMI_K3 = { provider: "kimi", model: "k3" } as const;

describe("installRouterRuntime", () => {
  it("does not publish a decision from a request finishing after router disposal", async () => {
    const events: import("../src/router/events.ts").RouterDecisionEvent[] = [];
    const harness = await boot({
      scripts: [() => textReply("ok")],
      onDecision: (event) => events.push(event),
    });
    let release!: () => void;
    let reached!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      reached = resolve;
    });
    harness.ctx.on("agent/request", async (_payload, next) => {
      const base = await next();
      reached();
      await pending;
      return base;
    });
    harness.agent.followup(human("hello"));
    await entered;
    harness.disposeRouter();
    release();
    await harness.agent.whenIdle();
    expect(events).toEqual([]);
  });

  it("attributes decision events to the actual requesting session and step", async () => {
    const events: import("../src/router/events.ts").RouterDecisionEvent[] = [];
    const harness = await boot({
      scripts: [() => textReply("ok")],
      onDecision: (event) => events.push(event),
    });
    harness.agent.followup(human("hello"));
    await harness.agent.whenIdle();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      sessionId: harness.agent.session.id,
      turn: 1,
      step: 1,
    });
  });

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

  it("fails closed with Plugin Center guidance when the smart pool is empty", async () => {
    const harness = await boot({
      scripts: [() => textReply("should not run")],
      inventory: () => catalog([]),
    });
    harness.agent.followup(human("no models"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests).toHaveLength(0);
    expect(harness.errors.length).toBeGreaterThan(0);
    expect(String(harness.errors[0])).toMatch(/插件中心 → 已安装 → 模型/);
    expect(String(harness.errors[0])).toMatch(/勾选/);
  });

  it("delegates fully to Host in manual mode", async () => {
    const harness = await boot({
      scripts: [() => textReply("ok")],
      mode: "manual",
    });
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
      scripts: [() => toolReply(), () => textReply("done")],
    });
    harness.agent.followup(human("use the tool"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests).toHaveLength(2);
    expect(harness.adapter.requests.map((request) => request.model)).toEqual([
      ROUTER.model,
      ROUTER.model,
    ]);
    expect(harness.adapter.requests[0]?.system).toBe(
      harness.adapter.requests[1]?.system,
    );
  });

  it("pins same-step request-error retry to the assembled snapshot", async () => {
    const harness = await boot({
      scripts: [() => errorReply(), () => textReply("recovered")],
    });
    harness.ctx.on("agent/request-error", () =>
      Promise.resolve({ kind: "retry" as const }),
    );
    harness.agent.followup(human("retry me"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests).toHaveLength(2);
    expect(harness.adapter.requests.map((request) => request.model)).toEqual([
      ROUTER.model,
      ROUTER.model,
    ]);
    expect(harness.adapter.requests[0]?.system).toBe(
      harness.adapter.requests[1]?.system,
    );
    expect(harness.errors).toEqual([]);
  });

  it("clears quota after a successful same-step retry of that request", async () => {
    const harness = await boot({
      scripts: [
        () => errorReply(QUOTA_EXCEEDED_CODE),
        () => textReply("retry"),
        () => textReply("next"),
      ],
      inventory: () =>
        catalog([
          { ...HOST, quality: 5 },
          { ...ROUTER, quality: 1 },
        ]),
    });
    harness.ctx.on("agent/request-error", () =>
      Promise.resolve({ kind: "retry" as const }),
    );
    harness.agent.followup(human("retry"));
    await harness.agent.whenIdle();
    harness.agent.followup(human("next"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests.map((request) => request.model)).toEqual([
      HOST.model,
      HOST.model,
      HOST.model,
    ]);
    expect(harness.errors).toEqual([]);
  });

  it.each(["success", QUOTA_EXCEEDED_CODE, "RATE_LIMIT"])(
    "preserves another session's newer-generation quota after an older stream finishes with %s",
    async (lateResult) => {
      let generation = "old";
      let markStarted!: () => void;
      let releaseStream!: () => void;
      const started = new Promise<void>((resolve) => {
        markStarted = resolve;
      });
      const release = new Promise<void>((resolve) => {
        releaseStream = resolve;
      });
      const harness = await boot({
        scripts: [
          async function* () {
            markStarted();
            await release;
            if (lateResult === "success") yield* textReply("late");
            else yield* errorReply(lateResult);
          },
          () => errorReply(QUOTA_EXCEEDED_CODE),
          () => textReply("alternate"),
        ],
        inventory: () =>
          catalog(
            [
              { ...HOST, quality: 5 },
              { ...ROUTER, quality: 1 },
            ],
            generation,
          ),
      });
      const other = await harness.ctx.agents.create({
        sessionId: SessionId(`other-${randomUUID()}`),
        agentOptions: { ...HOST },
      });
      try {
        await other.agent.whenIdle();
        harness.agent.followup(human("slow"));
        await started;
        generation = "new";
        other.agent.followup(human("quota"));
        await other.agent.whenIdle();
        expect(harness.errors).toHaveLength(1);
        expect(harness.errors[0]).toMatchObject({ code: QUOTA_EXCEEDED_CODE });
        releaseStream();
        await harness.agent.whenIdle();
        other.agent.followup(human("next"));
        await other.agent.whenIdle();
        expect(
          harness.adapter.requests.map((request) => request.model),
        ).toEqual([HOST.model, HOST.model, ROUTER.model]);
      } finally {
        releaseStream();
        await other.dispose();
      }
    },
  );

  it("records a current-generation failure when authorization changes between selection and dispatch", async () => {
    let calls = 0;
    const harness = await boot({
      scripts: [
        () => errorReply(QUOTA_EXCEEDED_CODE),
        () => textReply("alternate"),
      ],
      inventory: () =>
        catalog(
          [
            { ...HOST, quality: 5 },
            { ...ROUTER, quality: 1 },
          ],
          ++calls === 1 ? "assembly" : "dispatch",
        ),
    });
    harness.agent.followup(human("quota"));
    await harness.agent.whenIdle();
    expect(harness.errors[0]).toMatchObject({ code: QUOTA_EXCEEDED_CODE });
    harness.agent.followup(human("next"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests.map((request) => request.model)).toEqual([
      HOST.model,
      ROUTER.model,
    ]);
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

  it("rechecks production-shaped picked authorization immediately before dispatch", async () => {
    const picked = [ROUTER.model];
    let calls = 0;
    const harness = await boot({
      scripts: [() => textReply("must not dispatch")],
      inventory: async () => {
        if (++calls === 2) picked.splice(0);
        return buildAuthorizedInventory({
          subscriptions: [],
          apis: [
            {
              provider: ROUTER.provider,
              displayName: "API",
              configured: true,
              registered: true,
              models: [{ id: ROUTER.model }],
              picked,
            },
          ],
          resolve: async () => ({ inputModalities: ["text", "image"] }),
        });
      },
    });
    harness.agent.followup(humanWithImage("look"));
    await harness.agent.whenIdle();
    expect(calls).toBe(2);
    expect(harness.adapter.requests).toHaveLength(0);
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
      inventory: () =>
        catalog([
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

  it.each(["AUTH", QUOTA_EXCEEDED_CODE])(
    "makes a switched-away %s failure eligible after cooldown without its own success",
    async (code) => {
      let now = 1_000;
      const harness = await boot({
        scripts: [
          () => errorReply(code),
          () => textReply("other"),
          () => textReply("back"),
        ],
        inventory: () =>
          catalog([
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
    },
  );

  it("keeps a quota failure after a late success from an obsolete inventory generation", async () => {
    let generation = "gen-a";
    const harness = await boot({
      scripts: [
        () => textReply("first"),
        () => errorReply(QUOTA_EXCEEDED_CODE),
        () => textReply("alternate"),
        () => textReply("after cooldown"),
      ],
      inventory: () =>
        catalog(
          [
            { ...HOST, quality: 5 },
            { ...ROUTER, quality: 1 },
          ],
          generation,
        ),
      now: () => (generation === "gen-a" ? 1_000 : 20_000),
      healthCooldownMs: 10_000,
    });
    const completed: Array<{ session: { id: string }; event: unknown }> = [];
    harness.ctx.on("session/event", (session, event) => {
      if (event.type === "assistant/message")
        completed.push({ session, event });
    });

    harness.agent.followup(human("first"));
    await harness.agent.whenIdle();
    generation = "gen-b";
    harness.agent.followup(human("quota"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests.map((request) => request.model)).toEqual([
      HOST.model,
      HOST.model,
    ]);

    const firstSuccess = completed[0];
    expect(firstSuccess).toBeDefined();
    harness.ctx.emit(
      "session/event",
      firstSuccess!.session as never,
      firstSuccess!.event as never,
    );
    harness.agent.followup(human("alternate"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests.map((request) => request.model)).toEqual([
      HOST.model,
      HOST.model,
      ROUTER.model,
    ]);

    generation = "gen-c";
    harness.agent.followup(human("after generation refresh"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests.at(-1)?.model).toBe(HOST.model);
  });

  it.each(["AUTH", QUOTA_EXCEEDED_CODE])(
    "drops %s health when inventory generation changes",
    async (code) => {
      let generation = "gen-a";
      const harness = await boot({
        scripts: [() => errorReply(code), () => textReply("recovered")],
        inventory: () =>
          catalog(
            [
              { ...HOST, quality: 5 },
              { ...ROUTER, quality: 1 },
            ],
            generation,
          ),
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
    },
  );

  it("attaches agents that already exist when the runtime is installed", async () => {
    const harness = await boot({
      scripts: [() => textReply("ok")],
      attachAfterCreate: true,
    });
    harness.agent.followup(human("late attach"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests[0]?.model).toBe(ROUTER.model);
  });

  it("routes image turns only to authorized models that advertise image input", async () => {
    const harness = await boot({
      scripts: [() => textReply("ok")],
      inventory: () =>
        catalog([
          { ...HOST, quality: 5, inputModalities: ["text"] },
          { ...VISION, quality: 1, inputModalities: ["text", "image"] },
        ]),
    });
    harness.agent.followup(humanWithImage("描述这张图"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests).toHaveLength(1);
    expect(harness.adapter.requests[0]?.provider).toBe(VISION.provider);
    expect(harness.adapter.requests[0]?.model).toBe(VISION.model);
  });

  it("routes raster file attachments through the same image gate", async () => {
    const harness = await boot({
      scripts: [() => textReply("ok")],
      inventory: () =>
        catalog([
          { ...HOST, quality: 5, inputModalities: ["text"] },
          { ...VISION, quality: 1, inputModalities: ["text", "image"] },
        ]),
    });
    harness.agent.followup(humanWithFile("看看这个文件", "shot.png"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests).toHaveLength(1);
    expect(harness.adapter.requests[0]?.model).toBe(VISION.model);
  });

  it("uses actual Kimi text-only input rather than a legacy generate-attach tag", async () => {
    const harness = await boot({
      scripts: [() => textReply("ok")],
      inventory: () =>
        catalog([
          {
            ...KIMI_K3,
            quality: 5,
            inputModalities: kimiModalities(KIMI_K3.model),
            vision: false,
          },
          {
            ...VISION,
            quality: 1,
            inputModalities: ["text", "image"],
            vision: true,
          },
        ]),
    });
    harness.agent.followup(humanWithImage("描述这张图"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests).toHaveLength(1);
    expect(harness.adapter.requests[0]?.provider).toBe(VISION.provider);
    expect(harness.adapter.requests[0]?.model).toBe(VISION.model);
  });

  it("fails closed when the only image advertisement is a generate-attach tag", async () => {
    const harness = await boot({
      scripts: [() => textReply("should not run")],
      inventory: () =>
        catalog([
          { ...HOST, quality: 5, inputModalities: ["text"] },
          {
            ...KIMI_K3,
            quality: 5,
            inputModalities: kimiModalities(KIMI_K3.model),
            vision: false,
          },
        ]),
    });
    harness.agent.followup(humanWithImage("看图"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests).toHaveLength(0);
    expect(harness.errors.length).toBeGreaterThan(0);
    expect(String(harness.errors[0])).toMatch(/支持图片输入/);
    expect(String(harness.errors[0])).toMatch(/插件中心 → 已安装 → 模型/);
  });

  it("fails closed when an image turn has no vision-capable authorized model", async () => {
    const harness = await boot({
      scripts: [() => textReply("should not run")],
      inventory: () =>
        catalog([
          { ...HOST, quality: 5, inputModalities: ["text"] },
          { ...ROUTER, quality: 4 },
        ]),
    });
    harness.agent.followup(humanWithImage("看图"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests).toHaveLength(0);
    expect(harness.errors.length).toBeGreaterThan(0);
    expect(String(harness.errors[0])).toMatch(/支持图片输入/);
    expect(String(harness.errors[0])).toMatch(/插件中心 → 已安装 → 模型/);
  });

  it("still allows text-only models on a text-only human turn", async () => {
    const harness = await boot({
      scripts: [() => textReply("ok")],
      inventory: () =>
        catalog([
          { ...HOST, quality: 5, inputModalities: ["text"] },
          { ...VISION, quality: 1, inputModalities: ["text", "image"] },
        ]),
    });
    harness.agent.followup(human("只要文字"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests[0]?.model).toBe(HOST.model);
  });

  it("does not treat a PDF file as a vision turn", async () => {
    const harness = await boot({
      scripts: [() => textReply("ok")],
      inventory: () =>
        catalog([
          { ...HOST, quality: 5, inputModalities: ["text"] },
          { ...VISION, quality: 1, inputModalities: ["text", "image"] },
        ]),
    });
    harness.agent.followup(humanWithFile("读一下这份材料", "notes.pdf"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests[0]?.model).toBe(HOST.model);
  });
});
