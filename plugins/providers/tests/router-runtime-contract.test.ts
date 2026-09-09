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
  ToolCallId,
  LlmAdapter,
  LlmRuntime,
  createUserMessage,
} from "@deepseek-ai/dsh-llm";
import type { GenerateOptions, StreamChunk } from "@deepseek-ai/dsh-llm";
import SessionStore, { SessionId } from "@deepseek-ai/dsh-session";
import SessionProjectionRegistry from "@deepseek-ai/dsh-session-projection";
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
  toolExecutions: number;
}

const harnesses: Harness[] = [];

async function boot(
  scripts: StreamScript[],
  wrapAdapter: (adapter: ScriptedAdapter) => LlmAdapter = (adapter) => adapter,
): Promise<Harness> {
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
  let toolExecutions = 0;

  await ctx.plugin(LlmRuntime);
  await ctx.plugin(AgentRegistry);
  await ctx.plugin(SessionStore);
  await ctx.plugin(SessionProjectionRegistry);
  await ctx.plugin(SystemPrompt, {
    persona: "provider={{provider}} model={{model}}",
  });
  await ctx.plugin(ToolRuntime);
  await ctx.plugin(AgentLoop, { agents: [] });

  ctx.llm.registerAdapter(["host", "router"], wrapAdapter(adapter));
  ctx.tools.register({
    name: "ping",
    description: "ping",
    parameters: { type: "object", properties: {} },
    output: {
      schema: { type: "string" },
      render: () => [{ type: "text", text: "pong" }],
    },
    execute: async () => {
      toolExecutions += 1;
      return "pong";
    },
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
    get toolExecutions() {
      return toolExecutions;
    },
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

// R4 feasibility only: this wrapper is deliberately not production recovery.
// It owns the registered adapter; llm/stream middleware does not have this seam.
describe("RC stalled-turn cancellation feasibility", () => {
  it("can cancel at an owned registration and retry only after retirement in the same step", async () => {
    let cancelled = false;
    let alternate = false;
    let caller: AbortSignal | undefined;
    const attempts: { turn: number; step: number }[] = [];
    const harness = await boot(
      [
        async function* (request) {
          expect(request.signal).not.toBe(caller);
          try {
            await new Promise<void>((resolve) => {
              request.signal?.addEventListener("abort", () => resolve(), {
                once: true,
              });
            });
            // A cancelled source can still yield. The owner must fence this.
            yield* toolReply();
          } finally {
            cancelled = true;
          }
        },
        () => textReply("recovered"),
      ],
      (adapter) =>
        new (class extends LlmAdapter {
          override async *stream(
            request: GenerateOptions,
          ): AsyncIterable<StreamChunk> {
            caller = request.signal;
            expect(Object.isFrozen(request)).toBe(true);
            expect(Object.isFrozen(request.messages)).toBe(true);
            const child = new AbortController();
            const onAbort = () => child.abort(request.signal?.reason);
            request.signal?.addEventListener("abort", onAbort, { once: true });
            const timer = setTimeout(
              () => child.abort(new Error("synthetic deadline")),
              20,
            );
            try {
              for await (const chunk of adapter.stream({
                ...request,
                signal: child.signal,
              })) {
                if (child.signal.aborted) break;
                yield chunk;
              }
              if (child.signal.aborted) {
                yield {
                  type: "finish",
                  reason: {
                    kind: "error",
                    failure: {
                      code: "ROUTE_STALL",
                      message: "synthetic stall",
                    },
                  },
                };
              }
            } finally {
              clearTimeout(timer);
              request.signal?.removeEventListener("abort", onAbort);
            }
          }
        })(),
    );
    const chunks: StreamChunk[] = [];
    harness.ctx.on(
      "llm/stream",
      async function* (_request, next) {
        for await (const chunk of next()) {
          chunks.push(chunk);
          yield chunk;
        }
      },
      { global: true, prepend: true },
    );
    harness.ctx.on(
      "agent/request",
      async (payload, next) => {
        attempts.push({ turn: payload.turn, step: payload.step });
        const request = await next();
        return alternate ? { ...request, model: "alternate-model" } : request;
      },
      { global: true, prepend: true },
    );
    harness.ctx.on(
      "agent/request-error",
      async (payload) => {
        expect(payload.failure.code).toBe("ROUTE_STALL");
        expect(cancelled).toBe(true);
        expect(payload.signal.aborted).toBe(false);
        expect(alternate).toBe(false);
        alternate = true;
        return { kind: "retry" as const };
      },
      { global: true, prepend: true },
    );
    const { agent } = harness as Harness & {
      agent: {
        followup(message: UserMessage): void;
        whenIdle(): Promise<void>;
      };
    };
    agent.followup(human("synthetic stall"));
    await agent.whenIdle();
    expect(attempts).toEqual([
      { turn: 1, step: 1 },
      { turn: 1, step: 1 },
    ]);
    expect(harness.assembleCount).toBe(1);
    expect(harness.adapter.requests.map((request) => request.model)).toEqual([
      ROUTER.model,
      "alternate-model",
    ]);
    expect(chunks.some((chunk) => chunk.type === "tool-call-delta")).toBe(
      false,
    );
    expect(
      chunks.some(
        (chunk) => chunk.type === "text-delta" && chunk.text === "recovered",
      ),
    ).toBe(true);
    expect(harness.toolExecutions).toBe(0);
  });

  it("cannot replace the frozen Host signal through next or cancel a pending read with return", async () => {
    let release: () => void = () => {
      throw new Error("source not started");
    };
    let returned = false;
    let boundaryVerified = false;
    const harness = await boot([
      async function* () {
        yield { type: "block-start", index: 0, blockType: "text" };
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        yield { type: "text-delta", index: 0, text: "late" };
        yield {
          type: "block-end",
          index: 0,
          block: { type: "text", text: "late" },
        };
        yield { type: "finish", reason: { kind: "stop" } };
      },
    ]);
    harness.ctx.on(
      "llm/stream",
      async function* (request, next) {
        const child = new AbortController();
        expect(Object.isFrozen(request)).toBe(true);
        expect(Reflect.set(request, "signal", child.signal)).toBe(false);
        // JavaScript permits extra arguments, but RC1 next() closes over request.
        const stream: AsyncIterable<StreamChunk> = Reflect.apply(
          next,
          undefined,
          [{ ...request, signal: child.signal }],
        );
        const iterator = stream[Symbol.asyncIterator]();
        const first = await iterator.next();
        expect(first.value.type).toBe("block-start");
        const pending = iterator.next();
        await Promise.resolve();
        child.abort();
        const closing = iterator.return?.().then(() => {
          returned = true;
        });
        try {
          expect(harness.adapter.requests[0]?.signal).toBe(request.signal);
          expect(request.signal?.aborted).toBe(false);
          await Promise.resolve();
          expect(returned).toBe(false);
        } finally {
          release();
        }
        const late = await pending;
        expect(late.value).toEqual({
          type: "text-delta",
          index: 0,
          text: "late",
        });
        await closing;
        expect(returned).toBe(true);
        boundaryVerified = true;
        // Cleanup only: no claim that abandoning/returning aborted the source.
        yield* textReply("fixture complete");
      },
      { global: true, prepend: true },
    );
    const { agent } = harness as Harness & {
      agent: {
        followup(message: UserMessage): void;
        whenIdle(): Promise<void>;
      };
    };
    agent.followup(human("synthetic pending read"));
    await agent.whenIdle();
    expect(harness.adapter.requests).toHaveLength(1);
    // Host contains middleware errors; require the assertions above to finish.
    expect(boundaryVerified).toBe(true);
  });
});
