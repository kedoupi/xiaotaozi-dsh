# Codex Sandbox Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Codex models from repeatedly requesting a bash sandbox mode equal to the current Harness mode.

**Architecture:** Keep Harness runtime validation and approval authoritative. Add a short Codex-only permissions instruction at Responses instruction priority when—and only when—the request exposes bash `sandbox_permissions`, following OpenAI Codex's official developer-instruction pattern rather than rewriting tool arguments or granting access.

**Tech Stack:** TypeScript, OpenAI Responses request translation, DeepSeek Harness `ToolSchema`, Vitest.

**Spec:** GitHub Issue #70 — https://github.com/kedoupi/xiaotaozi-dsh/issues/70

## Global Constraints

- Never bypass approval, silently grant a permission, rewrite a model tool call, weaken runtime validation, or parse credentials/payload bodies.
- Keep requests without the affected bash escalation schema byte-for-byte equivalent in their `instructions` field.
- Do not edit or vendor pinned `@deepseek-ai/dsh-tool-bash` / `dsh-sandbox` packages.
- Do not add a dependency, config knob, generic prompt framework, or provider-independent abstraction.
- Do not start or claim sandbox port 3081 in the topic worktree.

---

### Task 1: Add conditional Codex permissions guidance

**Files:**
- Modify: `plugins/providers/src/providers/codex.ts`
- Create: `plugins/providers/tests/codex.test.ts`

**Interfaces:**
- Consumes: assembled base instructions and `GenerateOptions.tools`.
- Produces: `codexInstructions(base: string | undefined, tools: readonly ToolSchema[] | undefined): string` (or an equivalently small pure helper) used by `CodexAdapter.request()`.

- [x] **Step 1: Write failing pure-helper tests**

Add tests with these fixtures:

```ts
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
};
```

Assert:

```ts
expect(codexInstructions("base", [bash])).toContain("omit `sandbox_permissions`");
expect(codexInstructions("base", [bash])).toContain("actual sandbox denial");
expect(codexInstructions("base", [bash])).toContain("strictly wider");
expect(codexInstructions("base", [])).toBe("base");
expect(codexInstructions("base", [{ ...bash, name: "other" }])).toBe("base");
```

Also assert a bash schema without a `sandbox_permissions` property is unchanged.

- [x] **Step 2: Run RED tests**

```bash
pnpm --filter dsh-providers exec vitest run tests/codex.test.ts
```

Expected: fail because the pure helper/guidance does not exist.

- [x] **Step 3: Implement the minimal conditional helper**

Add one constant containing only the compatibility contract:

```text
Harness bash sandbox contract: omit sandbox_permissions and justification by default. Include them only when retrying the exact command after an actual sandbox denial. The requested mode must be strictly wider than the Current DSH file policy stated in the conversation; under workspace-write, workspace-write is not an escalation.
```

Detect only `tool.name === "bash"` whose JSON Schema object has `properties.sandbox_permissions`. Return the original base instructions unchanged otherwise. When affected, append the contract once with a blank-line separator. If base is absent, use `DEFAULT_CODEX_INSTRUCTIONS` before appending.

Use the helper in `CodexAdapter.request()` after `toResponsesInput()` and before constructing the body. Do not mutate `options.tools` or `toResponsesTools()`.

- [x] **Step 4: Run GREEN focused tests and typecheck**

```bash
pnpm --filter dsh-providers exec vitest run tests/codex.test.ts tests/responses.test.ts
pnpm --filter dsh-providers typecheck
```

Expected: all pass.

### Task 2: Prove request behavior and preserve the Responses contract

**Files:**
- Modify: `plugins/providers/tests/codex.test.ts`
- Modify production only if the request-level test reveals a real seam not covered by Task 1.

**Interfaces:**
- Consumes: Task 1 helper and Codex request construction.
- Produces: regression coverage that the wire instructions are conditional while tool schemas and approval fields remain untouched.

- [x] **Step 1: Add request-body or exported-boundary assertions**

Using the narrowest existing test seam, assert the final Codex instructions include the compatibility contract with the affected bash schema and that `toResponsesTools([bash])` still contains the original `sandbox_permissions` enum. Assert no duplicate contract when the helper is called once through request construction.

- [x] **Step 2: Mutation-check the condition**

Temporarily remove the `properties.sandbox_permissions` guard, run `tests/codex.test.ts`, and confirm the non-affected bash-schema test fails. Restore the guard and confirm GREEN.

- [x] **Step 3: Run full provider tests**

```bash
pnpm --filter dsh-providers test
pnpm --filter dsh-providers typecheck
```

Expected: all pass.

### Task 3: Verify and publish the isolated fix

**Files:**
- Verify changed files only; no additional production files unless a failing gate proves necessity.

**Interfaces:**
- Consumes: completed Tasks 1–2.
- Produces: one reviewable commit and PR fixing Issue #70.

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

Review conditional detection, instruction priority, no argument/schema rewriting, no approval bypass, unchanged non-bash requests, wording consistency with OpenAI Codex and Harness semantics, and unnecessary complexity. Resolve every Critical/Important finding and rerun focused checks.

- [ ] **Step 4: Commit and open PR**

```bash
git add plugins/providers/src/providers/codex.ts plugins/providers/tests/codex.test.ts docs/superpowers/plans/2026-09-02-codex-sandbox-guidance.md
git commit -m "fix(providers): guide Codex sandbox escalation"
```

Create a PR with `Fixes #70`; do not merge before all required GitHub checks pass and explicit user authorization.
