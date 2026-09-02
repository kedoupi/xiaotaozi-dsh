import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToolSchema } from "@deepseek-ai/dsh-llm";
import type { CodexSession } from "../src/auth/store.ts";
import { CodexAdapter, codexInstructions } from "../src/providers/codex.ts";
import { TokenManager } from "../src/providers/common.ts";
import { toResponsesTools } from "../src/translate/responses.ts";

const bash = {
  name: "bash",
  description: "Execute bash",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string" },
      sandbox_permissions: { type: "string", enum: ["workspace-write", "danger-full-access"] },
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
    expect(instructions).toContain("omit `sandbox_permissions`");
    expect(instructions).toContain("actual sandbox denial");
    expect(instructions).toContain("strictly wider");
  });

  it("leaves unaffected tool sets unchanged", () => {
    expect(codexInstructions("base", [])).toBe("base");
    expect(codexInstructions("base", [{ ...bash, name: "other" }])).toBe("base");
    expect(codexInstructions("base", [{
      ...bash,
      parameters: {
        type: "object",
        properties: { command: { type: "string" } },
      },
    }])).toBe("base");
  });

  it("uses the default instructions when the request has no system prompt", () => {
    expect(codexInstructions(undefined, [])).toContain("You are Codex");
    expect(codexInstructions(undefined, [bash])).toContain("Harness bash sandbox contract");
  });
});

describe("CodexAdapter request", () => {
  it("adds the guidance once without changing the bash schema", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const streamBody = [
      { type: "response.output_item.done", item: { type: "message", id: "message", content: [{ type: "output_text", text: "ok" }] } },
      { type: "response.completed", response: { status: "completed" } },
    ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(streamBody, { status: 200, headers: { "content-type": "text/event-stream" } });
    }));
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
      save: async () => undefined,
      remove: async () => undefined,
      refresh: async (current) => current,
      isPermanent: () => false,
    });
    const adapter = new CodexAdapter({ models: [], streamIdleTimeoutMs: 1_000, tokens, discovery: false });

    await collect(adapter.stream({ provider: "codex", model: "gpt-5", system: "base", messages: [], tools: [bash] }));

    const instructions = String(requestBody?.instructions);
    expect(instructions.match(/Harness bash sandbox contract/g)).toHaveLength(1);
    expect(requestBody?.tools).toEqual(toResponsesTools([bash]));
    expect(((requestBody?.tools as { parameters: typeof bash.parameters }[])[0]?.parameters
      .properties.sandbox_permissions.enum)).toEqual(["workspace-write", "danger-full-access"]);
  });
});
