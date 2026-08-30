# Sidebar Save Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent workspace-external overwrite through editor temp files and prevent an older save completion from clearing newer edits.

**Architecture:** Reuse the existing workspace path fence and unique sibling-temp pattern from `fs-operations.ts`. Keep save freshness as a pure current-document comparison used by `TextEditor` after `fsWrite` resolves.

**Tech Stack:** TypeScript, Node.js filesystem APIs, React, CodeMirror, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-29-plugin-observability-tests-design.md`

## Global Constraints

- No new dependencies or public API changes.
- Do not log paths, filenames, content, or full identifiers.
- Preserve current last-completed-write semantics for concurrent saves.
- Preserve an existing regular file's permission bits.
- Follow TDD and do not commit or push.

---

### Task 1: Exclusive atomic text replacement

**Files:**
- Modify: `plugins/sidebar/src/fs-operations.ts`
- Modify: `plugins/sidebar/src/index.ts`
- Test: `plugins/sidebar/tests/boundary-integration.test.ts`

**Interfaces:**
- Produces: `writeWorkspaceText(cwd: string, target: string, content: string): Promise<void>`.
- Consumes: `ensureWorkspaceWritePath`, unique `randomUUID()` sibling temp, exclusive `wx` creation, atomic `rename()`.

- [ ] Add a failing test that precreates the old deterministic temp path as a symlink to an outside sentinel, calls the new text-write helper, and asserts only the workspace target changes.
- [ ] Add a failing test with two overlapping writes and assert neither collides on a temp file and no temp remains.
- [ ] Add a failing test that replaces an executable regular file and preserves `mode & 0o777`.
- [ ] Run `pnpm --filter dsh-sidebar exec vitest run tests/boundary-integration.test.ts`; confirm RED because `writeWorkspaceText` does not exist.
- [ ] Implement `writeWorkspaceText`: fence the target, create its parent, read existing regular-file mode when present, write to `.${basename}.dsh-write-${randomUUID()}.tmp` with `flag: "wx"`, rename, and remove only that unique temp on failure.
- [ ] Replace the inline deterministic `fs.write` implementation in `src/index.ts` with `writeWorkspaceText` and retain existing safe wire error mapping.
- [ ] Re-run the focused test and confirm GREEN.

### Task 2: Save completion freshness

**Files:**
- Modify: `plugins/sidebar/src/client/editor-load.ts`
- Modify: `plugins/sidebar/src/client/TextEditor.tsx`
- Test: `plugins/sidebar/tests/editor-truncation.test.ts`

**Interfaces:**
- Produces: `savedDocumentIsCurrent(submitted: string, current: string | undefined): boolean`.

- [ ] Add a failing pure regression asserting a submitted document is stale when the current document differs and current when equal.
- [ ] Run the focused test and confirm RED because the helper does not exist.
- [ ] Capture the submitted document before `fsWrite`; on success clear `draft/dirty` only when the live CodeMirror document still equals the submitted string. Otherwise retain dirty state and reset save status to idle.
- [ ] Re-run focused tests and confirm GREEN.
- [ ] Run `pnpm --filter dsh-sidebar test`, `typecheck`, and `build` sequentially.
