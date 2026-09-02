/**
 * RC lifecycle contract spike for authorized routing.
 * Test-local prepend overlay only — no production Router.
 */
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
  createUserMessage,
} from "@deepseek-ai/dsh-llm";
import type { GenerateOptions, StreamChunk } from "@deepseek-ai/dsh-llm";
import SessionStore, { SessionId } from "@deepseek-ai/dsh-session";
import SystemPrompt from "@deepseek-ai/dsh-system-prompt";
import ToolRuntime from "@deepseek-ai/dsh-tools";
import type { UserMessage } from "@deepseek-ai/dsh-llm";

const HOST = { provider: "host", model: "host-model" } as const;
const ROUTER = { provider: "router", model: "router-model" } as const;

type StreamScript = (request: GenerateOptions) => AsyncIterable<StreamChunk>;

class ScriptedAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = [];
  constructor(private readonly scripts: StreamScript[]) {
    super();
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

async function* errorReply(): AsyncIterable<StreamChunk> {
  yield {
    type: "finish",
    reason: {
      kind: "error",
      failure: { message: "transient", code: "SERVER" },
    },
  };
}

interface Harness {
  ctx: Context;
  adapter: ScriptedAdapter;
  hostSelection: ModelSelectionRef;
  timeline: string[];
  claimedUsers: UserMessage[];
  assembleSawClaimed: boolean[];
  assembleCount: number;
  requestModels: string[];
}

const harnesses: Harness[] = [];

async function boot(scripts: StreamScript[]): Promise<Harness> {
  const ctx = new Context();
  const adapter = new ScriptedAdapter(scripts);
  const timeline: string[] = [];
  const claimedUsers: UserMessage[] = [];
  const assembleSawClaimed: boolean[] = [];
  const requestModels: string[] = [];
  const hostSelection: ModelSelectionRef = {
    current: { ...HOST },
    assembled: undefined,
  };
  const overlay: ModelSelectionRef = {
    current: undefined,
    assembled: undefined,
  };
  let pendingHuman: UserMessage | undefined;
  let assembleCount = 0;

  await ctx.plugin(LlmRuntime);
  await ctx.plugin(AgentRegistry);
  await ctx.plugin(SessionStore);
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

  ctx.on("agent/inbox/claimed", (payload) => {
    timeline.push("claimed");
    if (payload.message.source.kind === "user") {
      claimedUsers.push(payload.message);
      pendingHuman = payload.message;
    }
  });
  ctx.on(
    "system-prompt/assemble",
    async (_assembly, _context, next) => {
      timeline.push("assemble");
      assembleSawClaimed.push(pendingHuman !== undefined);
      assembleCount += 1;
      if (pendingHuman !== undefined) {
        overlay.current = { ...ROUTER };
        pendingHuman = undefined;
      }
      const assembled = await next();
      overlay.assembled = overlay.current;
      const selected = overlay.assembled;
      if (selected === undefined) return assembled;
      return {
        ...assembled,
        variables: {
          ...assembled.variables,
          provider: selected.provider,
          model: selected.model,
        },
      };
    },
    { prepend: true, global: true },
  );
  ctx.on(
    "agent/request",
    async (_payload, next) => {
      timeline.push("request");
      const resolved = await next();
      const selected = overlay.assembled;
      if (selected === undefined) {
        requestModels.push(resolved.model);
        return resolved;
      }
      requestModels.push(selected.model);
      return {
        ...resolved,
        provider: selected.provider,
        model: selected.model,
      };
    },
    { prepend: true, global: true },
  );

  const handle = await ctx.agents.create({
    sessionId: SessionId(`router-contract-${randomUUID()}`),
    agentOptions: { ...HOST },
    setup: (agentCtx) => {
      installModelSelection(agentCtx, hostSelection);
    },
  });
  const harness: Harness = {
    ctx,
    adapter,
    hostSelection,
    timeline,
    claimedUsers,
    assembleSawClaimed,
    get assembleCount() {
      return assembleCount;
    },
    requestModels,
  };
  Object.assign(harness, { handle });
  harnesses.push(harness);
  await handle.agent.whenIdle();
  return Object.assign(harness, {
    agent: handle.agent,
    dispose: () => handle.dispose(),
  });
}

afterEach(async () => {
  await Promise.all(
    harnesses.splice(0).map(async (harness) => {
      await (harness as Harness & { dispose(): Promise<void> }).dispose();
      await harness.ctx.fiber.dispose();
    }),
  );
});

function human(text: string): UserMessage {
  return createUserMessage({
    content: [{ type: "text", text }],
    source: { kind: "user" },
  });
}

describe("RC routing lifecycle contract", () => {
  it("makes next-turn claimed human input visible before assemble", async () => {
    const harness = await boot([() => textReply("ok")]);
    const { agent } = harness as Harness & {
      agent: {
        followup(message: UserMessage): void;
        whenIdle(): Promise<void>;
      };
    };
    agent.followup(human("route me"));
    await agent.whenIdle();
    expect(harness.claimedUsers).toHaveLength(1);
    expect(harness.assembleSawClaimed[0]).toBe(true);
    expect(harness.timeline.indexOf("claimed")).toBeLessThan(
      harness.timeline.indexOf("assemble"),
    );
  });

  it("lets prepend overlay win Host installModelSelection for prompt and request", async () => {
    const harness = await boot([() => textReply("ok")]);
    const { agent } = harness as Harness & {
      agent: {
        followup(message: UserMessage): void;
        whenIdle(): Promise<void>;
      };
    };
    agent.followup(human("route me"));
    await agent.whenIdle();
    const request = harness.adapter.requests[0];
    expect(request?.provider).toBe(ROUTER.provider);
    expect(request?.model).toBe(ROUTER.model);
    expect(request?.system).toContain(`provider=${ROUTER.provider}`);
    expect(request?.system).toContain(`model=${ROUTER.model}`);
    expect(request?.system).not.toContain(HOST.model);
    expect(harness.requestModels).toEqual([ROUTER.model]);
  });

  it("does not emit a second next-turn human claim on tool continuation", async () => {
    const harness = await boot([() => toolReply(), () => textReply("done")]);
    const { agent } = harness as Harness & {
      agent: {
        followup(message: UserMessage): void;
        whenIdle(): Promise<void>;
      };
    };
    agent.followup(human("use the tool"));
    await agent.whenIdle();
    expect(harness.claimedUsers).toHaveLength(1);
    expect(harness.adapter.requests).toHaveLength(2);
    expect(harness.adapter.requests.map((request) => request.model)).toEqual([
      ROUTER.model,
      ROUTER.model,
    ]);
    expect(harness.assembleCount).toBe(2);
    expect(harness.assembleSawClaimed).toEqual([true, false]);
  });

  it("retries the same step without reassembling system", async () => {
    const harness = await boot([
      () => errorReply(),
      () => textReply("recovered"),
    ]);
    const { agent } = harness as Harness & {
      agent: {
        followup(message: UserMessage): void;
        whenIdle(): Promise<void>;
      };
    };
    harness.ctx.on("agent/request-error", () =>
      Promise.resolve({ kind: "retry" as const }),
    );
    agent.followup(human("retry me"));
    await agent.whenIdle();
    expect(harness.assembleCount).toBe(1);
    expect(harness.adapter.requests).toHaveLength(2);
    expect(harness.adapter.requests[0]?.system).toBe(
      harness.adapter.requests[1]?.system,
    );
    expect(harness.adapter.requests.map((request) => request.model)).toEqual([
      ROUTER.model,
      ROUTER.model,
    ]);
  });
});
