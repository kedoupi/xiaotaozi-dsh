import { describe, expect, it } from "vitest";
import { toAnthropicMessages } from "../src/translate/anthropic.ts";
import { toResponsesInput } from "../src/translate/responses.ts";

const contextualBlocks = [
  {
    role: "user" as const,
    content: [
      { type: "text" as const, text: "Its closing message:" },
      { type: "tool-call" as const, id: "child-call", name: "read", arguments: '{"path":"child.txt"}' },
    ],
  },
  {
    role: "assistant" as const,
    content: [
      { type: "text" as const, text: "Continue." },
      {
        type: "tool-result" as const,
        toolCallId: "quoted-result",
        content: [{ type: "text" as const, text: "quoted" }],
      },
    ],
  },
];

const pairedBlocks = [
  {
    role: "assistant" as const,
    content: [
      { type: "tool-call" as const, id: "call-1", name: "read", arguments: '{"path":"a"}' },
      { type: "tool-call" as const, id: "call-2", name: "read", arguments: '{"path":"b"}' },
    ],
  },
  {
    role: "user" as const,
    content: [
      {
        type: "tool-result" as const,
        toolCallId: "call-1",
        content: [{ type: "text" as const, text: "A" }],
      },
      {
        type: "tool-result" as const,
        toolCallId: "call-2",
        content: [{ type: "text" as const, text: "B" }],
      },
    ],
  },
];

describe("role-aware tool translation", () => {
  it("does not replay contextual tool blocks as Responses protocol items", () => {
    expect(toResponsesInput(contextualBlocks).input).toEqual([
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Its closing message:" }],
      },
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Continue." }],
      },
    ]);
  });

  it("preserves paired parallel Responses calls", () => {
    expect(toResponsesInput(pairedBlocks).input).toEqual([
      { type: "function_call", call_id: "call-1", name: "read", arguments: '{"path":"a"}' },
      { type: "function_call", call_id: "call-2", name: "read", arguments: '{"path":"b"}' },
      { type: "function_call_output", call_id: "call-1", output: "A" },
      { type: "function_call_output", call_id: "call-2", output: "B" },
    ]);
  });

  it("does not replay contextual tool blocks as Anthropic protocol items", () => {
    expect(toAnthropicMessages(contextualBlocks)).toEqual([
      { role: "user", content: [{ type: "text", text: "Its closing message:" }] },
      { role: "assistant", content: [{ type: "text", text: "Continue." }] },
    ]);
  });

  it("preserves paired parallel Anthropic calls", () => {
    expect(toAnthropicMessages(pairedBlocks)).toEqual([
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "call-1", name: "read", input: { path: "a" } },
          { type: "tool_use", id: "call-2", name: "read", input: { path: "b" } },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "call-1", content: "A" },
          { type: "tool_result", tool_use_id: "call-2", content: "B" },
        ],
      },
    ]);
  });
});
