# Kimi Tool Calls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Kimi `k3` models execute Harness tools through the complete OpenAI-compatible Chat Completions tool protocol.

**Architecture:** Extend the existing shared Chat Completions translator rather than adding a Kimi-only fork. Mirror the pinned official DeepSeek adapter and Moonshot Kimi provider: serialize tool schemas and role-correct tool history, buffer indexed streamed tool-call deltas, and map the provider finish reason into Harness chunks.

**Tech Stack:** TypeScript, DeepSeek Harness `GenerateOptions` / `StreamChunk`, Vitest, native `fetch`/SSE.

**Spec:** GitHub Issue #69 — https://github.com/kedoupi/xiaotaozi-dsh/issues/69

## Global Constraints

- Do not add dependencies, synthetic tool results, session rewriting, payload logging, or provider-specific abstractions beyond the Kimi wire contract.
- Only assistant-role `tool-call` blocks become wire `tool_calls`; only user-role `tool-result` blocks become wire `role: tool` messages.
- Preserve #60 reasoning/text behavior and existing Kimi/Qwen text-only behavior.
- Keep `@deepseek-ai/*` external and import APIs as types unless a runtime value such as `CallId` is required.
- Do not start or claim sandbox port 3081 in the topic worktree.

---

### Task 1: Serialize Chat Completions tools and role-correct history

**Files:**
- Modify: `plugins/providers/src/providers/openai-chat.ts`
- Modify: `plugins/providers/src/providers/kimi.ts`
- Test: `plugins/providers/tests/openai-chat.test.ts`
- Test: `plugins/providers/tests/kimi.test.ts`

**Interfaces:**
- Consumes: `GenerateOptions.tools`, `TranslatableMessage`, existing `toChatMessages()`.
- Produces: `toChatTools(tools: readonly ToolSchema[]): Record<string, unknown>[]`; `ChatMessage` variants for assistant `tool_calls` and standalone tool results.

- [x] **Step 1: Write failing history and request tests**

Add fixtures asserting:

```ts
expect(toChatMessages(undefined, [
  { role: "assistant", content: [
    { type: "reasoning", text: "inspect" },
    { type: "text", text: "checking" },
    { type: "tool-call", id: CallId("call_1"), name: "read", arguments: '{"path":"README.md"}' },
  ] },
  { role: "user", content: [
    { type: "tool-result", toolCallId: CallId("call_1"), content: [{ type: "text", text: "ok" }] },
  ] },
])).toEqual([
  { role: "assistant", content: "checking", reasoning_content: "inspect", tool_calls: [
    { id: "call_1", type: "function", function: { name: "read", arguments: '{"path":"README.md"}' } },
  ] },
  { role: "tool", tool_call_id: "call_1", content: "ok" },
]);
```

Assert `toChatTools([{ name: "read", description: "Read", parameters: { type: "object" } }])` returns OpenAI function-tool shape. Capture Kimi's request body and assert `tools` is present only when non-empty.

- [x] **Step 2: Run RED tests**

Run:

```bash
pnpm --filter dsh-providers exec vitest run tests/openai-chat.test.ts tests/kimi.test.ts
```

Expected: failures because tool blocks are dropped and Kimi omits top-level tools.

- [x] **Step 3: Implement minimal serialization**

Implement `ChatMessage` as role-specific wire variants. In `toChatMessages()`:

```ts
if (message.role === "assistant") {
  // flatten text/reasoning; serialize only assistant tool-call blocks
} else {
  // emit user text/image content, then one role:tool message per user tool-result
}
```

Use `"(no output)"` for an empty tool result, matching the pinned official adapter. Add `toChatTools()`:

```ts
return tools.map(tool => ({
  type: "function",
  function: { name: tool.name, description: tool.description, parameters: tool.parameters },
}));
```

In `KimiAdapter.stream()`, conditionally add the non-empty `tools` array to the request body.

- [x] **Step 4: Run GREEN tests and typecheck**

```bash
pnpm --filter dsh-providers exec vitest run tests/openai-chat.test.ts tests/kimi.test.ts
pnpm --filter dsh-providers typecheck
```

Expected: all pass.

### Task 2: Translate streamed parallel tool calls

**Files:**
- Modify: `plugins/providers/src/providers/openai-chat.ts`
- Test: `plugins/providers/tests/openai-chat.test.ts`

**Interfaces:**
- Consumes: OpenAI-compatible `choices[0].delta.tool_calls[]` entries carrying `index`, optional `id`, optional function `name`, and argument fragments.
- Produces: monotonic Harness block indexes with `block-start`, `tool-call-delta`, `block-end`, and terminal `{ kind: "tool-calls" }`.

- [x] **Step 1: Write failing parallel stream fixtures**

Add a real SSE fixture with two interleaved calls:

```ts
{ index: 0, id: "call_a", function: { name: "read", arguments: "{\"path\":" } }
{ index: 1, id: "call_b", function: { name: "glob", arguments: "{\"pattern\":" } }
{ index: 0, function: { arguments: "\"README.md\"}" } }
{ index: 1, function: { arguments: "\"*.ts\"}" } }
```

Assert two tool blocks retain their own IDs, names, arguments, first-seen indexes, and finish with `{ kind: "tool-calls" }`. Add a reasoning→text→tool fixture to protect existing block order.

- [x] **Step 2: Run RED stream tests**

```bash
pnpm --filter dsh-providers exec vitest run tests/openai-chat.test.ts
```

Expected: tool deltas are ignored and `tool_calls` becomes an error finish.

- [x] **Step 3: Implement indexed tool buffering**

Extend `ChatCompletionEvent` with parsed tool deltas. Track tool blocks by wire `index`, allocate one Harness block index on first sight, preserve the first non-empty ID/name, append raw argument fragments, and emit `tool-call-delta` for every fragment. Close text/reasoning before entering tool output; close all remaining tool blocks before the terminal finish. Import and use `CallId` for branded IDs; generate only a deterministic fallback tied to the wire index if the provider omits an ID.

Update finish mapping:

```ts
if (reason === "tool_calls") return { kind: "tool-calls" };
```

- [x] **Step 4: Run GREEN focused and full provider tests**

```bash
pnpm --filter dsh-providers exec vitest run tests/openai-chat.test.ts tests/kimi.test.ts
pnpm --filter dsh-providers test
pnpm --filter dsh-providers typecheck
```

Expected: all pass.

### Task 3: Verify and publish the isolated fix

**Files:**
- Verify changed files only; no additional production files unless a failing gate proves necessity.

**Interfaces:**
- Consumes: completed Tasks 1–2.
- Produces: one reviewable commit and PR fixing Issue #69.

- [ ] **Step 1: Run repository gates**

```bash
pnpm check
pnpm check:build
pnpm check:path
git diff --check
```

- [ ] **Step 2: Run LSP/pi-lens diagnostics on changed files**

Expected: no errors or blocking warnings.

- [ ] **Step 3: Request independent read-only review**

Review role boundaries, parallel-call assembly, incomplete IDs/names, max-token handling, Kimi/Qwen regressions, privacy, and unnecessary complexity. Resolve every Critical/Important finding and rerun focused checks.

- [ ] **Step 4: Commit and open PR**

```bash
git add plugins/providers/src/providers/openai-chat.ts plugins/providers/src/providers/kimi.ts plugins/providers/tests/openai-chat.test.ts plugins/providers/tests/kimi.test.ts docs/superpowers/plans/2026-09-02-kimi-tool-calls.md
git commit -m "fix(providers): enable Kimi tool calls"
```

Create a PR with `Fixes #69`; do not merge before all required GitHub checks pass and explicit user authorization.
