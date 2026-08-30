# Archive Delete Containment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure archive deletion can recursively remove only one Session directory at the exact `$DSH_HOME/sessions/<workspace>/<session>` depth.

**Architecture:** Reject `.` at the input boundary and add an independent lexical depth guard immediately before `rmSync`. The second guard prevents future callers from turning the recursive remover into a workspace/root deletion primitive.

**Tech Stack:** TypeScript, Node.js `node:path`/`node:fs`, Vitest.

**Spec:** Approved Critical-fix design in the 2026-08-29 conversation; finding in `docs/reviews/2026-08-29-plugin-observability-cr.md`.

## Global Constraints

- Keep valid archive deletion behavior unchanged.
- Refuse broad deletion rather than attempting repair.
- Do not touch a real `DSH_HOME`; tests use temporary homes.
- Do not add dependencies or commit/push.

---

### Task 1: Reject dot IDs and broad recursive targets

**Files:**
- Modify: `plugins/xtz-ui/tests/archive.test.ts:52-118`
- Modify: `plugins/xtz-ui/tests/store.test.ts`
- Modify: `plugins/xtz-ui/src/archive/encode.ts:2-4`
- Modify: `plugins/xtz-ui/src/archive/store.ts:2,164-173`

**Interfaces:**
- Consumes: user-supplied Session IDs and resolved Session directory paths.
- Produces: deletion only at exact Session-directory depth.

- [ ] **Step 1: Write failing input and end-to-end deletion tests**

Extend `archive ids`:

```ts
expect(isSafeSessionId('.')).toBe(false)
```

Add an archive ledger test that creates two Sessions in one workspace bucket, calls `deleteSessions(home, ['.'])`, and asserts `done` is empty and both Session files still exist.

- [ ] **Step 2: Write the failing recursive-remover defense test**

Import `removeSessionDir` in `store.test.ts`. Create `$home/sessions/bucket/session-a`, call `removeSessionDir(home, $home/sessions/bucket)`, and assert it throws while the Session file remains.

- [ ] **Step 3: Verify RED**

Run:

```bash
pnpm --filter dsh-xtz-ui exec vitest run tests/archive.test.ts tests/store.test.ts
```

Expected: FAIL because `.` is accepted and the broad remover deletes the bucket.

- [ ] **Step 4: Implement both containment guards**

In `encode.ts`, add `id !== "."` to `isSafeSessionId()`.

In `store.ts`, import `resolve`. Before `rmSync`:

```ts
const root = resolve(sessionsDir(home));
const target = resolve(sessionDirPath);
const parent = dirname(target);
if (parent === root || dirname(parent) !== root) {
  throw new Error('refusing to remove a non-Session directory');
}
```

Use `target` for deletion and parent cleanup after the guard.

- [ ] **Step 5: Verify GREEN and plugin gates**

Run:

```bash
pnpm --filter dsh-xtz-ui exec vitest run tests/archive.test.ts tests/store.test.ts
pnpm --filter dsh-xtz-ui test
pnpm --filter dsh-xtz-ui typecheck
pnpm --filter dsh-xtz-ui build
```

Expected: all pass; valid Session deletion still removes files, metadata, and empty workspace buckets.

---

### Task 2: Verify the integrated Critical fixes

**Files:**
- Read: all four Critical-fix diffs

**Interfaces:**
- Consumes: completed `im`, `sidebar`, `providers`, and `xtz-ui` fixes.
- Produces: repository-wide evidence that the four independent fixes integrate cleanly.

- [ ] **Step 1: Run all repository gates**

```bash
pnpm check
pnpm check:build
pnpm check:path
pnpm check:cli
```

Expected: all pass. Record the existing non-fatal CLI Node engine warning separately if the runtime remains Node `24.18.0`.

- [ ] **Step 2: Inspect the final scope**

```bash
git diff --check
git status --short --branch
git diff -- plugins/im plugins/sidebar plugins/providers plugins/xtz-ui
```

Expected: no plugin outside the four approved fixes changed; no generated `lib/`, dependency, version, home, or credential file appears.
