import { CONTEXT_WINDOW_EXCEEDED_CODE } from "@deepseek-ai/dsh-llm";
import { describe, expect, it } from "vitest";
import { httpLlmError } from "../src/providers/common.ts";

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

  it("keeps an unqualified 413 as a generic HTTP error", async () => {
    const error = await httpLlmError(
      new Response("payload too large", { status: 413 }),
      "compatible API",
    );

    expect(error.code).toBe("HTTP_413");
  });
});
