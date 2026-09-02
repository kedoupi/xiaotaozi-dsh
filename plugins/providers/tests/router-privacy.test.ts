import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import AgentRegistry, { installModelSelection } from "@deepseek-ai/dsh-agent";
import type { Agent, ModelSelectionRef } from "@deepseek-ai/dsh-agent";
import AgentLoop from "@deepseek-ai/dsh-agent-loop";
import { LlmAdapter, LlmRuntime, createUserMessage } from "@deepseek-ai/dsh-llm";
import type { GenerateOptions, StreamChunk, UserMessage } from "@deepseek-ai/dsh-llm";
import SessionStore, {
  KNOWN_SESSION_EVENT_TYPES,
  Session,
  SessionId,
} from "@deepseek-ai/dsh-session";
import SystemPrompt from "@deepseek-ai/dsh-system-prompt";
import ToolRuntime from "@deepseek-ai/dsh-tools";
import type { AuthorizedModelInventory } from "../src/router/inventory.ts";
import type { RouterDecisionEvent } from "../src/router/events.ts";
import { installRouterRuntime } from "../src/router/runtime.ts";
import type { RoutingMode } from "../src/router/preferences.ts";

const HOST = { provider: "host", model: "host-model" } as const;
const ROUTER = { provider: "router", model: "router-model" } as const;
const SECRET = "SECRET_PROMPT_DO_NOT_PERSIST";

class ScriptedAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = [];
  constructor(private readonly scripts: Array<() => AsyncIterable<StreamChunk>>) {
    super();
  }
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options);
    const script = this.scripts.shift();
    if (script === undefined) throw new Error("unexpected model stream");
    yield* script();
  }
}

async function* textReply(text: string): AsyncIterable<StreamChunk> {
  yield { type: "block-start", index: 0, blockType: "text" };
  yield { type: "text-delta", index: 0, text };
  yield { type: "block-end", index: 0, block: { type: "text", text } };
  yield { type: "finish", reason: { kind: "stop" } };
}

async function* errorReply(code: string): AsyncIterable<StreamChunk> {
  yield {
    type: "finish",
    reason: { kind: "error", failure: { message: "failed", code } },
  };
}

function catalog(models: Array<{ provider: string; model: string; quality: 1 | 2 | 3 | 4 | 5 }>): AuthorizedModelInventory {
  const candidates = models.map((model) => ({
    ref: `${model.provider}/${model.model}` as const,
    provider: model.provider,
    model: model.model,
    source: "api" as const,
    displayName: model.model,
    profile: { quality: model.quality, speed: 3 as const, cost: 3 as const },
  }));
  return {
    capturedAt: 1,
    generation: candidates.map((candidate) => candidate.ref).join(","),
    candidates,
  };
}

interface Harness {
  adapter: ScriptedAdapter;
  agent: Agent;
  decisions: RouterDecisionEvent[];
  dispose(): Promise<void>;
}

const harnesses: Harness[] = [];

async function boot(options: {
  scripts: Array<() => AsyncIterable<StreamChunk>>;
  mode?: RoutingMode;
  models?: Array<{ provider: string; model: string; quality: 1 | 2 | 3 | 4 | 5 }>;
}): Promise<Harness> {
  const ctx = new Context();
  const adapter = new ScriptedAdapter(options.scripts);
  const hostSelection: ModelSelectionRef = { current: { ...HOST }, assembled: undefined };
  const models = options.models ?? [
    { ...HOST, quality: 5 },
    { ...ROUTER, quality: 5 },
  ];
  await ctx.plugin(LlmRuntime);
  await ctx.plugin(AgentRegistry);
  await ctx.plugin(SessionStore);
  await ctx.plugin(SystemPrompt, { persona: "provider={{provider}} model={{model}}" });
  await ctx.plugin(ToolRuntime);
  await ctx.plugin(AgentLoop, { agents: [] });
  ctx.llm.registerAdapter(["host", "router"], adapter);
  const decisions: RouterDecisionEvent[] = [];
  installRouterRuntime(ctx, {
    getMode: () => options.mode ?? "smart",
    inventory: async () => catalog(models),
    switchMargin: 0,
    onDecision: (event) => {
      decisions.push(event);
    },
  });
  const handle = await ctx.agents.create({
    sessionId: SessionId(`router-privacy-${randomUUID()}`),
    agentOptions: { ...HOST },
    setup: (agentCtx) => {
      installModelSelection(agentCtx, hostSelection);
    },
  });
  await handle.agent.whenIdle();
  const harness: Harness = {
    adapter,
    agent: handle.agent,
    decisions,
    dispose: async () => {
      await handle.dispose();
      await ctx.fiber.dispose();
    },
  };
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

function assertKnownOrIgnorable(agent: Agent): void {
  for (const event of agent.session.events) {
    expect(
      KNOWN_SESSION_EVENT_TYPES.has(event.type) || event.ignorable === true,
      event.type,
    ).toBe(true);
    expect(event.type).not.toBe("router/decision");
  }
}

describe("router decision observer", () => {
  it("notifies once per step without the prompt or credentials", async () => {
    const harness = await boot({ scripts: [() => textReply("ok")] });
    harness.agent.followup(human(SECRET));
    await harness.agent.whenIdle();
    expect(harness.decisions).toHaveLength(1);
    const data = harness.decisions[0];
    expect(data?.selected).toEqual({ provider: HOST.provider, model: HOST.model });
    expect(data?.candidates).toEqual(["host/host-model", "router/router-model"]);
    expect(data?.classifierUsed).toBe(false);
    expect(data?.objective).toBe("quality");
    expect(JSON.stringify(data)).not.toContain(SECRET);
    expect(JSON.stringify(data)).not.toMatch(/sk-|Bearer |prompt|classifier input/i);
  });

  it("does not notify a second time on same-step retry", async () => {
    const harness = await boot({
      scripts: [() => errorReply("SERVER"), () => textReply("recovered")],
    });
    harness.agent.ctx.on("agent/request-error", () => Promise.resolve({ kind: "retry" as const }));
    harness.agent.followup(human(SECRET));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests).toHaveLength(2);
    expect(harness.decisions).toHaveLength(1);
    expect(JSON.stringify(harness.decisions)).not.toContain(SECRET);
  });

  it("does not notify in manual mode", async () => {
    const harness = await boot({ scripts: [() => textReply("ok")], mode: "manual" });
    harness.agent.followup(human(SECRET));
    await harness.agent.whenIdle();
    expect(harness.decisions).toEqual([]);
  });

  it("writes no unknown required session event and restores from seed", async () => {
    const harness = await boot({ scripts: [() => textReply("ok")] });
    harness.agent.followup(human(SECRET));
    await harness.agent.whenIdle();
    assertKnownOrIgnorable(harness.agent);
    const restoreId = SessionId(`${String(harness.agent.id)}-restore`);
    const seed = structuredClone(harness.agent.session.events);
    const header = { ...structuredClone(harness.agent.session.header), id: restoreId };
    const restored = Session.fromRestore(restoreId, seed, header);
    expect(restored.events.slice(0, harness.agent.session.events.length).map((event) => event.type))
      .toEqual(harness.agent.session.events.map((event) => event.type));
  });
});

describe("in-memory health", () => {
  it("applies a SERVER penalty only on the next human turn", async () => {
    const harness = await boot({
      scripts: [() => errorReply("SERVER"), () => textReply("later")],
    });
    harness.agent.followup(human("first"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests).toHaveLength(1);
    expect(harness.adapter.requests[0]?.model).toBe(HOST.model);
    harness.agent.followup(human("second"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests.map((request) => request.model)).toEqual([
      HOST.model,
      ROUTER.model,
    ]);
  });

  it("excludes AUTH failures from the next human turn", async () => {
    const harness = await boot({
      scripts: [() => errorReply("AUTH"), () => textReply("fallback")],
      models: [
        { ...HOST, quality: 5 },
        { ...ROUTER, quality: 1 },
      ],
    });
    harness.agent.followup(human("first"));
    await harness.agent.whenIdle();
    harness.agent.followup(human("second"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests.map((request) => request.model)).toEqual([
      HOST.model,
      ROUTER.model,
    ]);
  });

  it("clears health after a successful retry so the next turn can stay", async () => {
    const harness = await boot({
      scripts: [() => errorReply("SERVER"), () => textReply("ok"), () => textReply("again")],
    });
    harness.agent.ctx.on("agent/request-error", () => Promise.resolve({ kind: "retry" as const }));
    harness.agent.followup(human("first"));
    await harness.agent.whenIdle();
    harness.agent.followup(human("second"));
    await harness.agent.whenIdle();
    expect(harness.adapter.requests.map((request) => request.model)).toEqual([
      HOST.model,
      HOST.model,
      HOST.model,
    ]);
  });
});
