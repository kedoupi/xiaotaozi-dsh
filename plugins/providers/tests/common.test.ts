import { CONTEXT_WINDOW_EXCEEDED_CODE, QUOTA_EXCEEDED_CODE } from "@deepseek-ai/dsh-llm";
import { describe, expect, it } from "vitest";
import { httpLlmError } from "../src/providers/common.ts";
import { QUOTA_GUIDE } from "../src/router/empty-pool.ts";

describe("httpLlmError", () => {
  it("classifies Grok's 413 length limit as context overflow", async () => {
    const error = await httpLlmError(
      new Response("length limit exceeded", { status: 413 }),
      "grok API",
    );

    expect(error.code).toBe(CONTEXT_WINDOW_EXCEEDED_CODE);
  });

  it("classifies explicit 413 context-window wording as context overflow", async () => {
    const error = await httpLlmError(
      new Response("context length exceeded", { status: 413 }),
      "compatible API",
    );

    expect(error.code).toBe(CONTEXT_WINDOW_EXCEEDED_CODE);
  });

  it("keeps the existing 400 context-overflow classification", async () => {
    const error = await httpLlmError(
      new Response("maximum context length exceeded", { status: 400 }),
      "compatible API",
    );

    expect(error.code).toBe(CONTEXT_WINDOW_EXCEEDED_CODE);
  });

  it("classifies DeepSeek 402 Insufficient Balance as quota with Chinese copy", async () => {
    const error = await httpLlmError(
      new Response(JSON.stringify({
        error: { message: "Insufficient Balance", type: "unknown_error" },
      }), { status: 402 }),
      "deepseek API",
    );

    expect(error.code).toBe(QUOTA_EXCEEDED_CODE);
    expect(error.message).toBe(QUOTA_GUIDE);
    expect(error.message).not.toMatch(/Insufficient|HTTP 402/i);
  });

  it("classifies HTTP 402 without quota wording as quota", async () => {
    const error = await httpLlmError(
      new Response("payment required", { status: 402 }),
      "compatible API",
    );

    expect(error.code).toBe(QUOTA_EXCEEDED_CODE);
    expect(error.message).toBe(QUOTA_GUIDE);
  });

  it("keeps an unqualified 413 as a generic HTTP error", async () => {
    const error = await httpLlmError(
      new Response("payload too large", { status: 413 }),
      "compatible API",
    );

    expect(error.code).toBe("HTTP_413");
  });

  it("redacts Authorization-bearing upstream error bodies from the message", async () => {
    const bearer = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret-session-value";
    const body = JSON.stringify({
      error: "invalid_token",
      Authorization: `Bearer ${bearer}`,
    });
    const error = await httpLlmError(new Response(body, { status: 401 }), "test API");

    expect(error.code).toBe("AUTH");
    expect(error.message).toContain("HTTP 401");
    expect(error.message).not.toContain(bearer);
    expect(error.message).not.toContain("Bearer");
  });
});
