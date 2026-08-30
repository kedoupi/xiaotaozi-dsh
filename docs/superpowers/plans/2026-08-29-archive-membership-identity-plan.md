# Archive Membership and Workspace Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permanently delete only currently archived Sessions and keep bulk actions separated by workspace identity rather than display title.

**Architecture:** `deleteSessions` takes an authoritative archived-ID snapshot before any teardown and treats safe nonmembers as not found. Archive query/group/filter options use a stable workspace key (`workspaceId`, with legacy path/session fallback) while titles remain display-only.

**Tech Stack:** TypeScript, React, Vitest, existing archive stores/live seam.

**Spec:** `docs/superpowers/specs/2026-08-29-plugin-observability-tests-design.md`

## Global Constraints

- Never delete a safe ID absent from the authoritative archived set.
- Workspace titles are presentation only and must not determine filter/group/delete identity.
- Preserve legacy records without workspace IDs using a non-merging fallback key.
- No public route shape, dependency, version, or logging changes; do not commit or push.

---

### Task 1: Delete membership fence

**Files:**
- Modify: `plugins/xtz-ui/src/archive/ledger.ts`
- Test: `plugins/xtz-ui/tests/archive.test.ts`

**Interfaces:**
- Consumes: `readArchivedIds(home, live)`.
- Produces: existing `MutateResult`; safe nonmembers appear in `notFound` and cause no detach, projection, workspace, or filesystem mutation.

- [ ] Add a failing test with a real Session directory and workspace/projection membership but an empty archived set; delete must return no `done`, include the ID in `notFound`, and preserve all files/metadata/live callbacks.
- [ ] Add a stale-panel regression: archive then unarchive, then delete the stale ID; the Session remains.
- [ ] Run the focused archive test and confirm RED.
- [ ] Deduplicate safe requested IDs, split them by current archived membership before the mutation loop, and process only members.
- [ ] Re-run focused tests and confirm GREEN.

### Task 2: Identity-keyed grouping and filtering

**Files:**
- Modify: `plugins/xtz-ui/src/archive/query.ts`
- Modify: `plugins/xtz-ui/src/client/ArchivePanel.tsx`
- Test: `plugins/xtz-ui/tests/archive.test.ts`

**Interfaces:**
- Produces: `archiveWorkspaceKey(item)`, groups shaped `{ key, title, items }`, and workspace options shaped `{ key, label }`.
- `ArchiveQuery.workspace` stores the key or `ALL`.

- [ ] Add failing tests with two workspace IDs sharing one title; expect two groups, disjoint filtering, and two distinct options.
- [ ] Add legacy tests: identical legacy workspace paths group together; records without ID/path do not merge across Sessions.
- [ ] Run the focused test and confirm RED.
- [ ] Implement identity keys and duplicate-title labels without exposing workspace paths.
- [ ] Update React option/group keys and values to use identity keys; bulk delete continues to derive IDs only from that identity group.
- [ ] Re-run focused tests and confirm GREEN.
- [ ] Run `pnpm --filter dsh-xtz-ui test`, `typecheck`, and `build` sequentially.
