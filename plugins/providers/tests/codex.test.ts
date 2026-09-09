import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToolSchema } from "@deepseek-ai/dsh-llm";
import type { CodexSession } from "../src/auth/store.ts";
import { CodexAdapter, codexInstructions } from "../src/providers/codex.ts";
import { TokenManager } from "../src/providers/common.ts";
import { buildAuthorizedInventory } from "../src/router/inventory.ts";
import { decideRoute } from "../src/router/decision.ts";
import { routeProfile } from "../src/router/profiles.ts";

const bash = {
  name: "bash",
  description: "Execute bash",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string" },
      sandbox_permissions: {
        type: "string",
        enum: ["workspace-write", "danger-full-access"],
      },
      justification: { type: "string" },
    },
  },
} satisfies ToolSchema;

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of stream) values.push(value);
  return values;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("codexInstructions", () => {
  it("adds sandbox escalation guidance for the affected bash schema", () => {
    const instructions = codexInstructions("base", [bash]);
    expect(instructions).toContain('`sandbox_permissions` to `"use_default"`');
    expect(instructions).toContain("actual sandbox denial");
    expect(instructions).toContain("strictly wider");
  });

  it("leaves unaffected tool sets unchanged", () => {
    expect(codexInstructions("base", [])).toBe("base");
    expect(codexInstructions("base", [{ ...bash, name: "other" }])).toBe(
      "base",
    );
    expect(
      codexInstructions("base", [
        {
          ...bash,
          parameters: {
            type: "object",
            properties: { command: { type: "string" } },
          },
        },
      ]),
    ).toBe("base");
  });

  it("uses the default instructions when the request has no system prompt", () => {
    expect(codexInstructions(undefined, [])).toContain("You are Codex");
    expect(codexInstructions(undefined, [bash])).toContain(
      "Harness bash sandbox contract",
    );
  });
});

describe("CodexAdapter capabilities", () => {
  it("uses resolved default/configured input modalities, not coding or vision spelling", async () => {
    const unexpectedFetch = vi.fn(async () => {
      throw new Error("discovery is disabled");
    });
    vi.stubGlobal("fetch", unexpectedFetch);
    const tokens = new TokenManager<CodexSession>({
      displayName: "Codex",
      preemptMs: 0,
      load: async () => ({
        accessToken: "synthetic",
        refreshToken: "synthetic",
        expiresAt: Date.now() + 60_000,
        accountId: "synthetic",
      }),
      saveIfCurrent: async () => true,
      removeIfCurrent: async () => true,
      refresh: async (current) => current,
      isPermanent: () => false,
    });
    const adapter = new CodexAdapter({
      models: [
        { id: "gpt-5.1-codex" },
        { id: "vision-text-only", inputModalities: ["text"] },
      ],
      streamIdleTimeoutMs: 1_000,
      tokens,
      discovery: false,
    });
    const models = await adapter.listModels("codex");
    expect(models.map((entry) => entry.inputModalities)).toEqual([
      ["text", "image"],
      ["text"],
    ]);
    const inventory = await buildAuthorizedInventory({
      subscriptions: [{ provider: "codex", loggedIn: true, models }],
      apis: [],
      resolve: async (provider, model) => adapter.resolveModel(provider, model),
      profileFor: routeProfile,
    });
    expect(inventory.candidates[0]?.profile.vision).toBe(false);
    expect(inventory.candidates[1]?.profile.vision).toBe(true);
    const decision = decideRoute({
      text: "describe",
      hasImage: true,
      inventory,
    });
    expect(decision.selected.ref).toBe("codex/gpt-5.1-codex");
    expect(decision.candidates).toEqual(["codex/gpt-5.1-codex"]);
    expect(unexpectedFetch).not.toHaveBeenCalled();
  });
});

describe("CodexAdapter request", () => {
  it("uses the neutral Codex sandbox dialect without changing the Harness schema", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const streamBody = [
      {
        type: "response.output_item.done",
        item: {
          type: "message",
          id: "message",
          content: [{ type: "output_text", text: "ok" }],
        },
      },
      { type: "response.completed", response: { status: "completed" } },
    ]
      .map((event) => `data: ${JSON.stringify(event)}\n\n`)
      .join("");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(streamBody, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      }),
    );
    const session: CodexSession = {
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: Date.now() + 60_000,
      accountId: "account",
    };
    const tokens = new TokenManager<CodexSession>({
      displayName: "Codex",
      preemptMs: 0,
      load: async () => session,
      saveIfCurrent: async () => true,
      removeIfCurrent: async () => true,
      refresh: async (current) => current,
      isPermanent: () => false,
    });
    const adapter = new CodexAdapter({
      models: [],
      streamIdleTimeoutMs: 1_000,
      tokens,
      discovery: false,
    });

    await collect(
      adapter.stream({
        provider: "codex",
        model: "gpt-5",
        system: "base",
        messages: [],
        tools: [bash],
      }),
    );

    const instructions = String(requestBody?.instructions);
    const wireBash = (
      requestBody?.tools as Array<{
        strict?: boolean;
        parameters: typeof bash.parameters;
      }>
    )[0];
    expect(instructions.match(/Harness bash sandbox contract/g)).toHaveLength(
      1,
    );
    expect(wireBash?.strict).toBe(false);
    expect(wireBash?.parameters.properties.sandbox_permissions.enum).toEqual([
      "use_default",
      "workspace-write",
      "danger-full-access",
    ]);
    expect(bash.parameters.properties.sandbox_permissions.enum).toEqual([
      "workspace-write",
      "danger-full-access",
    ]);
  });

  it("normalizes the neutral Codex sandbox dialect and preserves real escalation", async () => {
    const defaultArguments = JSON.stringify({
      command: "pwd",
      sandbox_permissions: "use_default",
      justification: "No escalation needed.",
    });
    const escalationArguments = JSON.stringify({
      command: "npm install",
      sandbox_permissions: "danger-full-access",
      justification: "Allow dependency installation?",
    });
    const unrelatedArguments = JSON.stringify({
      sandbox_permissions: "use_default",
      justification: "Keep me.",
    });
    const streamBody = [
      {
        type: "response.output_item.added",
        item: {
          type: "function_call",
          id: "default",
          call_id: "call-default",
          name: "bash",
        },
      },
      {
        type: "response.output_item.added",
        item: {
          type: "function_call",
          id: "escalation",
          call_id: "call-escalation",
          name: "bash",
        },
      },
      {
        type: "response.output_item.added",
        item: {
          type: "function_call",
          id: "unrelated",
          call_id: "call-unrelated",
          name: "other",
        },
      },
      {
        type: "response.output_item.done",
        item: {
          type: "function_call",
          id: "default",
          call_id: "call-default",
          name: "bash",
          arguments: defaultArguments,
        },
      },
      {
        type: "response.output_item.done",
        item: {
          type: "function_call",
          id: "escalation",
          call_id: "call-escalation",
          name: "bash",
          arguments: escalationArguments,
        },
      },
      {
        type: "response.output_item.done",
        item: {
          type: "function_call",
          id: "unrelated",
          call_id: "call-unrelated",
          name: "other",
          arguments: unrelatedArguments,
        },
      },
      { type: "response.completed", response: { status: "completed" } },
    ]
      .map((event) => `data: ${JSON.stringify(event)}\n\n`)
      .join("");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(streamBody, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
      ),
    );
    const session: CodexSession = {
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: Date.now() + 60_000,
      accountId: "account",
    };
    const tokens = new TokenManager<CodexSession>({
      displayName: "Codex",
      preemptMs: 0,
      load: async () => session,
      saveIfCurrent: async () => true,
      removeIfCurrent: async () => true,
      refresh: async (current) => current,
      isPermanent: () => false,
    });
    const adapter = new CodexAdapter({
      models: [],
      streamIdleTimeoutMs: 1_000,
      tokens,
      discovery: false,
    });

    const chunks = await collect(
      adapter.stream({
        provider: "codex",
        model: "gpt-5",
        messages: [],
        tools: [bash],
      }),
    );
    const toolCalls = chunks.filter(
      (chunk) => chunk.type === "block-end" && chunk.block.type === "tool-call",
    );

    expect(toolCalls).toMatchObject([
      {
        block: { name: "bash", arguments: JSON.stringify({ command: "pwd" }) },
      },
      { block: { name: "bash", arguments: escalationArguments } },
      { block: { name: "other", arguments: unrelatedArguments } },
    ]);
  });
});
