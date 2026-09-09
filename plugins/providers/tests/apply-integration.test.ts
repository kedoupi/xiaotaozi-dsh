import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import AgentRegistry, { installModelSelection } from "@deepseek-ai/dsh-agent";
import type { ModelSelectionRef } from "@deepseek-ai/dsh-agent";
import AgentLoop from "@deepseek-ai/dsh-agent-loop";
import {
  createUserMessage,
  LlmAdapter,
  LlmRuntime,
  type StreamChunk,
} from "@deepseek-ai/dsh-llm";
import SessionStore, { SessionId } from "@deepseek-ai/dsh-session";
import SessionProjectionRegistry from "@deepseek-ai/dsh-session-projection";
import SystemPrompt from "@deepseek-ai/dsh-system-prompt";
import ToolRuntime from "@deepseek-ai/dsh-tools";
import type { Context as CordisContext } from "@deepseek-ai/cordis";
import {
  saveSession,
  type ClaudeSession,
  type CodexSession,
  type GrokSession,
  type ProviderId,
  type SessionMap,
} from "../src/auth/store.ts";
import { apply, Config } from "../src/index.ts";
import { CODEX_API_URL, CODEX_TOKEN_URL } from "../src/providers/codex.ts";
import {
  loadRoutingPreference,
  saveRoutingPreference,
  updateRoutingPreference,
} from "../src/router/preferences.ts";
import { PROVIDERS_CHANNEL } from "../src/rpc.ts";
import * as traceModule from "../src/trace.ts";

type RpcHandler = (
  endpoint: string,
  payload: unknown,
  signal: AbortSignal,
) => Promise<
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string } }
>;

const previousHome = process.env.DSH_HOME;
const tempRoots: string[] = [];
const disposers: Array<() => void> = [];
const fiberDisposers: Array<() => Promise<void>> = [];

const defaultConfig: Config = {
  providers: ["codex"],
  streamIdleTimeoutMs: 300_000,
  routeQualityWeight: 0.7,
  routeSpeedWeight: 0.15,
  routeCostWeight: 0.05,
  routeSwitchMargin: 0.35,
  routeHealthCooldownMs: 900_000,
};

function codexSession(partial: Partial<CodexSession> = {}): CodexSession {
  return {
    accessToken: "codex-access",
    refreshToken: "codex-refresh",
    expiresAt: Date.now() + 3_600_000,
    accountId: "acct-codex",
    ...partial,
  };
}

function claudeSession(partial: Partial<ClaudeSession> = {}): ClaudeSession {
  return {
    accessToken: "claude-access",
    refreshToken: "claude-refresh",
    expiresAt: Date.now() + 3_600_000,
    scopes: "user:profile",
    ...partial,
  };
}

function grokSession(partial: Partial<GrokSession> = {}): GrokSession {
  return {
    accessToken: "grok-access",
    refreshToken: "grok-refresh",
    expiresAt: Date.now() + 3_600_000,
    tokenEndpoint: "https://auth.x.ai/token",
    ...partial,
  };
}

async function tempHome(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "dsh-providers-apply-"));
  tempRoots.push(root);
  process.env.DSH_HOME = root;
  return root;
}

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of stream) values.push(value);
  return values;
}

function codexStreamBody(text = "ok"): string {
  return [
    {
      type: "response.output_item.done",
      item: {
        type: "message",
        id: "message",
        content: [{ type: "output_text", text }],
      },
    },
    { type: "response.completed", response: { status: "completed" } },
  ]
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("");
}

function hostServicesPlugin(rpc: { handler: RpcHandler | null }) {
  return {
    name: "test-host-services",
    apply(ctx: CordisContext) {
      ctx.provide("settings", {
        describe: () => [],
        register: () => ({
          get: () => ({}),
          watch: () => () => {},
        }),
        update: async () => ({ value: undefined, revision: undefined }),
        mutate: async () => undefined,
      });
      ctx.provide("credentials", {
        describe: async () => ({ credentials: {} }),
        set: async () => undefined,
        unset: async () => undefined,
      });
      ctx.provide("connection", {
        rpc: {
          handle: (_channel: string, handler: RpcHandler) => {
            rpc.handler = handler;
            return () => undefined;
          },
        },
      });
    },
  };
}

interface ApplyHarness {
  ctx: Context;
  rpc: { handler: RpcHandler | null };
  registeredTools: string[];
  traces: string[];
  disposeApply: () => void;
}

async function bootApply(options: {
  config?: Config;
  sessions?: Partial<SessionMap>;
  routingMode?: "manual" | "smart";
  withAgentStack?: boolean;
}): Promise<ApplyHarness> {
  await tempHome();
  if (options.routingMode !== undefined) {
    await saveRoutingPreference(options.routingMode);
  }
  for (const [provider, session] of Object.entries(options.sessions ?? {})) {
    if (session !== undefined) {
      await saveSession(provider as ProviderId, session as never);
    }
  }

  const rpc = { handler: null as RpcHandler | null };
  const registeredTools: string[] = [];
  const traces: string[] = [];
  vi.spyOn(traceModule, "pluginTrace").mockImplementation((message) => {
    if (typeof message === "string") traces.push(message);
  });

  const ctx = new Context();
  await ctx.plugin(LlmRuntime);
  await ctx.plugin(hostServicesPlugin(rpc));
  await ctx.plugin(SystemPrompt, {
    persona: "provider={{provider}} model={{model}}",
  });
  await ctx.plugin(ToolRuntime);

  const originalRegister = ctx.tools.register.bind(ctx.tools);
  ctx.tools.register = (definition: { name?: string }) => {
    if (typeof definition.name === "string")
      registeredTools.push(definition.name);
    return originalRegister(definition as never);
  };

  if (options.withAgentStack === true) {
    await ctx.plugin(AgentRegistry);
    await ctx.plugin(SessionStore);
    await ctx.plugin(SessionProjectionRegistry);
    await ctx.plugin(AgentLoop, { agents: [] });
  }

  const disposeApply = apply(ctx, options.config ?? defaultConfig);
  disposers.push(disposeApply);

  return { ctx, rpc, registeredTools, traces, disposeApply };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Unexpected external fetch in synthetic apply test");
    }),
  );
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const dispose of disposers.splice(0).reverse()) dispose();
  await Promise.all(fiberDisposers.splice(0).map((dispose) => dispose()));
  if (previousHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = previousHome;
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("providers apply() integration", () => {
  it("exports UI-only refresh defaults and RPC overrides without an R4 recovery Config", async () => {
    expect(Config()).toMatchObject({
      routeDecisionPollIntervalMs: 500,
      routeDecisionRefreshTimeoutMs: 90_000,
    });
    expect(Config()).not.toHaveProperty("routeRecoveryTotalTimeoutMs");
    const harness = await bootApply({
      config: {
        ...defaultConfig,
        providers: [],
        routeDecisionPollIntervalMs: 11,
        routeDecisionRefreshTimeoutMs: 37,
      },
    });
    const result = await harness.rpc.handler!(
      "routing",
      {},
      new AbortController().signal,
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        attribution: "historical",
        refreshTiming: { pollIntervalMs: 11, totalTimeoutMs: 37 },
      },
    });
    const invalid = await harness.rpc.handler!(
      "routing",
      { sessionId: 42 },
      new AbortController().signal,
    );
    expect(invalid.ok).toBe(false);
  });

  it("reads only the requested live session's durable header and retains historical state across remount", async () => {
    const config = { ...defaultConfig, providers: [] };
    const harness = await bootApply({
      config,
      withAgentStack: true,
      routingMode: "manual",
    });
    class HeaderAdapter extends LlmAdapter {
      override async resolveModel(provider: string, model: string) {
        return { provider, id: model, name: "Header model" };
      }
      override async *stream(): AsyncIterable<StreamChunk> {
        yield { type: "block-start", index: 0, blockType: "text" };
        yield { type: "text-delta", index: 0, text: "fixture" };
        yield {
          type: "block-end",
          index: 0,
          block: { type: "text", text: "fixture" },
        };
        yield { type: "finish", reason: { kind: "stop" } };
      }
    }
    harness.ctx.llm.registerAdapter(["synthetic"], new HeaderAdapter());
    const sessionId = SessionId(`r5-header-${randomUUID()}`);
    const handle = await harness.ctx.agents.create({
      sessionId,
      agentOptions: { provider: "synthetic", model: "header-model" },
    });
    fiberDisposers.push(handle.dispose);
    await handle.agent.whenIdle();
    handle.agent.followup(
      createUserMessage({
        content: [{ type: "text", text: "synthetic" }],
        source: { kind: "user" },
      }),
    );
    await handle.agent.whenIdle();
    expect(handle.agent.session.requestHeader()?.config.model).toBe(
      "header-model",
    );
    const lastSelected = {
      provider: "other",
      model: "A-model",
      sessionId: "A",
      turn: 8,
      step: 2,
    };
    await updateRoutingPreference({ lastSelected });
    const signal = new AbortController().signal;
    const current = await harness.rpc.handler!(
      "routing",
      { sessionId },
      signal,
    );
    expect(current).toMatchObject({
      ok: true,
      value: {
        attribution: "session",
        sessionId,
        lastSelected: { provider: "synthetic", model: "header-model" },
      },
    });
    const unknown = await harness.rpc.handler!(
      "routing",
      { sessionId: "unknown" },
      signal,
    );
    expect(unknown).toMatchObject({
      ok: true,
      value: { attribution: "session", sessionId: "unknown" },
    });
    if (unknown.ok) expect(unknown.value).not.toHaveProperty("lastSelected");
    harness.disposeApply();
    disposers.push(apply(harness.ctx, config));
    const historical = await harness.rpc.handler!("routing", {}, signal);
    expect(historical).toMatchObject({
      ok: true,
      value: { attribution: "historical", lastSelected: { model: "A-model" } },
    });
    expect(await loadRoutingPreference()).toEqual({
      mode: "manual",
      lastSelected,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("registers subscription adapters and dispose tears them down", async () => {
    const harness = await bootApply({
      config: { ...defaultConfig, providers: ["codex", "grok"] },
      sessions: { codex: codexSession(), grok: grokSession() },
    });

    expect(ctxProviders(harness.ctx)).toEqual(
      expect.arrayContaining(["codex", "grok"]),
    );
    harness.disposeApply();
    expect(harness.traces.some((line) => line.startsWith("unmounted"))).toBe(
      true,
    );
  });

  it("reports logged-out status over RPC when no session is stored", async () => {
    const harness = await bootApply({ config: defaultConfig });
    expect(harness.rpc.handler).not.toBeNull();

    const result = await harness.rpc.handler!(
      "status",
      {},
      new AbortController().signal,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const providers = (
      result.value as { providers: Record<string, { loggedIn: boolean }> }
    ).providers;
    expect(providers.codex.loggedIn).toBe(false);
  });

  it("refreshes an expired token before the first codex stream", async () => {
    const refreshCalls: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === CODEX_TOKEN_URL) {
          refreshCalls.push(init?.body);
          return Response.json({
            access_token: "codex-access-new",
            refresh_token: "codex-refresh-new",
            expires_in: 3_600,
          });
        }
        if (url === CODEX_API_URL) {
          return new Response(codexStreamBody(), {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const harness = await bootApply({
      config: defaultConfig,
      sessions: { codex: codexSession({ expiresAt: Date.now() + 1_000 }) },
    });
    await collect(
      harness.ctx.llm.stream({
        provider: "codex",
        model: "gpt-5.1-codex",
        messages: [],
      }),
    );

    expect(refreshCalls.length).toBeGreaterThan(0);
    const stored = JSON.parse(String(refreshCalls[0]));
    expect(stored.grant_type).toBe("refresh_token");
  });

  it("retries codex streaming once after a 401 by forcing refresh", async () => {
    let apiCalls = 0;
    let refreshCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === CODEX_TOKEN_URL) {
          refreshCalls += 1;
          return Response.json({
            access_token: `codex-access-${String(refreshCalls)}`,
            refresh_token: "codex-refresh-new",
            expires_in: 3_600,
          });
        }
        if (url === CODEX_API_URL) {
          apiCalls += 1;
          if (apiCalls === 1)
            return new Response("unauthorized", { status: 401 });
          return new Response(codexStreamBody(), {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const harness = await bootApply({
      config: defaultConfig,
      sessions: { codex: codexSession() },
    });
    const chunks = await collect<StreamChunk>(
      harness.ctx.llm.stream({
        provider: "codex",
        model: "gpt-5.1-codex",
        messages: [],
      }),
    );

    expect(apiCalls).toBe(2);
    expect(refreshCalls).toBe(1);
    expect(chunks.some((chunk) => chunk.type === "finish")).toBe(true);
  });

  it("surfaces MISSING_CREDENTIAL when codex has no stored session", async () => {
    const harness = await bootApply({ config: defaultConfig });
    const chunks = await collect(
      harness.ctx.llm.stream({
        provider: "codex",
        model: "gpt-5.1-codex",
        messages: [],
      }),
    );
    expect(chunks).toEqual([
      expect.objectContaining({
        type: "finish",
        reason: expect.objectContaining({
          kind: "error",
          failure: expect.objectContaining({ code: "MISSING_CREDENTIAL" }),
        }),
      }),
    ]);
  });

  it("routes ambiguous smart-mode turns through the local heuristic fallback", async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.includes("api.x.ai/v1/models")) {
          return Response.json({ data: [{ id: "grok-4", name: "Grok 4" }] });
        }
        if (url.includes("/oauth/token")) {
          return Response.json({
            access_token: "refreshed",
            refresh_token: "refreshed",
            expires_in: 3_600,
          });
        }
        if (url.includes("api.x.ai/v1/responses")) {
          return new Response(
            [
              {
                type: "response.completed",
                response: {
                  output: [
                    {
                      type: "message",
                      content: [{ type: "output_text", text: "ok" }],
                    },
                  ],
                },
              },
            ]
              .map((event) => `data: ${JSON.stringify(event)}\n\n`)
              .join(""),
            {
              status: 200,
              headers: { "content-type": "text/event-stream" },
            },
          );
        }
        if (url.includes("anthropic.com")) {
          return new Response(
            'event: message_start\ndata: {}\n\nevent: content_block_delta\ndata: {"delta":{"text":"ok"}}\n\nevent: message_stop\ndata: {}\n\n',
            {
              status: 200,
              headers: { "content-type": "text/event-stream" },
            },
          );
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const harness = await bootApply({
      config: { ...defaultConfig, providers: ["claude", "grok"] },
      sessions: { claude: claudeSession(), grok: grokSession() },
      routingMode: "smart",
      withAgentStack: true,
    });

    const hostSelection: ModelSelectionRef = {
      current: { provider: "claude", model: "claude-haiku-4-5" },
      assembled: undefined,
    };
    const handle = await harness.ctx.agents.create({
      sessionId: SessionId(`providers-apply-${randomUUID()}`),
      agentOptions: { provider: "claude", model: "claude-haiku-4-5" },
      setup: (agentCtx) => {
        installModelSelection(agentCtx, hostSelection);
      },
    });
    fiberDisposers.push(handle.dispose);

    handle.agent.followup(
      createUserMessage({
        content: [{ type: "text", text: "解释一下这个函数的作用" }],
        source: { kind: "user" },
      }),
    );
    await handle.agent.whenIdle();

    await saveRoutingPreference("manual"); // queued after the decision patch, never overwrites it
    expect((await loadRoutingPreference()).lastSelected).toMatchObject({
      sessionId: handle.agent.session.id,
      turn: 1,
      step: 1,
    });
    const routed = await harness.rpc.handler!(
      "routing",
      { sessionId: handle.agent.session.id },
      new AbortController().signal,
    );
    expect(routed).toMatchObject({
      ok: true,
      value: {
        mode: "manual",
        attribution: "session",
        sessionId: handle.agent.session.id,
      },
    });
    expect(
      requestedUrls.some((url) => url.includes("api.x.ai/v1/responses")),
    ).toBe(true);
    expect(
      harness.traces.some(
        (line) =>
          line.startsWith("route ") &&
          (line.includes("reason=local-clear") ||
            line.includes("reason=classifier-fallback")),
      ),
    ).toBe(true);
  });

  it("registers image and video tools when codex and grok adapters mount", async () => {
    const harness = await bootApply({
      config: { ...defaultConfig, providers: ["codex", "grok"] },
      sessions: { codex: codexSession(), grok: grokSession() },
    });

    expect(harness.registeredTools).toEqual(
      expect.arrayContaining(["image_generate", "video_generate"]),
    );
  });

  it("wires the providers auth RPC on the expected channel", async () => {
    const harness = await bootApply({
      config: defaultConfig,
      sessions: { codex: codexSession() },
    });
    expect(harness.rpc.handler).not.toBeNull();
    const result = await harness.rpc.handler!(
      "status",
      {},
      new AbortController().signal,
    );
    expect(result.ok).toBe(true);
    expect(PROVIDERS_CHANNEL).toBe("/providers-auth");
  });
});

function ctxProviders(ctx: Context): string[] {
  return ctx.llm.listProviders().map((provider) => provider.id);
}
