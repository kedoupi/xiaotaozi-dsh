# IM Bind Existing Project Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Use `superpowers:test-driven-development` for each task and `superpowers:verification-before-completion` before every completion claim.

**Goal:** Make every IM bot bind only to an existing Web-created Host project, identified by `workspaceId`, with no arbitrary-directory picker, cwd fallback, or IM-side `workspace.create` path.

**Architecture:** Treat `workspace.list().items` as the only project catalog. Persist each bot's stable `workspaceId` plus cached title/path metadata, reconcile it against the live catalog before exposing status or doing work, and keep an unbound bot pending. Browser UI, text commands, Feishu cards, session creation, and Web Session Follow all submit or compare `workspaceId`; `path` remains internal execution metadata and a one-time v1 migration key only.

**Tech Stack:** TypeScript/JavaScript, React 18, DSH Host RPC, Vitest, `react-test-renderer`, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-01-im-bind-existing-project-design.md`

## Global Constraints

- Work on one topic branch and open one PR into `main`; do not land implementation on a shared dirty `main` checkout.
- Before editing, use `superpowers:using-git-worktrees` if isolation is needed. Carry only this task's documentation into the task worktree; do not overwrite unrelated local changes.
- Preserve the command spellings `/workspace` and `/workspacelist`; change only their semantics and copy.
- Do not change official `~/.dsh`, port 3080, AI Office alias mappings, or filesystem-backed credential/file storage.
- Do not add dependencies, a second project registry, a custom directory scanner, or a Host project entity. The existing `workspace.list().items` array is the registry.
- Do not call `workspace.create` anywhere in IM session creation, bot binding, switching, card handling, or migration.
- New requests use `workspaceId` only. A path may participate only in v1 persisted-binding migration and internal session/file execution after the ID was validated.
- Preserve the first-action fence. A new, cancelled, missing, deleted, or stale binding remains pending and must not process inbound work.
- Keep one writer in the worktree. Do not start sandbox port 3081 until the final sandbox task and only after the ownership check required by `docs/workflow.md`.
- Use red-green-refactor: add the smallest failing behavior test, run it and observe the expected failure, implement the minimum change, rerun it, then run the task's regression set.
- Commit after each green task using the exact commit message shown. Do not bump package or product versions.

## Shared Data Contract

Use one project shape at Host boundaries:

```ts
export type HarnessProject = {
  workspaceId: string;
  title: string;
  path: string;
};
```

Persist schema v2 as:

```json
{
  "version": 2,
  "projects": {
    "bot-id": {
      "workspaceId": "host-workspace-id",
      "title": "Project title",
      "path": "/canonical/project/root"
    },
    "unbound-bot-id": null
  },
  "sessions": {},
  "agentPresets": {},
  "instructions": {},
  "displayNames": {}
}
```

The cached `title` and `path` are projections, never authority. On each successful catalog reconciliation:

1. replace cached metadata for IDs still present;
2. turn missing IDs into `null` and clear that bot's old session mapping;
3. migrate a v1 absolute path only when exactly one current project has the same normalized canonical path;
4. turn unmatched v1 paths into `null` and discard the legacy path after that successful reconciliation;
5. never match a v2 stale ID by path, so deleting and recreating the same path does not revive the old binding.

Decorated account status keeps compatibility while exposing stable identity:

```ts
{
  workspaceId: project?.workspaceId ?? null,
  workspaceTitle: project?.title ?? null,
  workspace: project?.path ?? null,
  workspacePending: project == null,
}
```

The public mutation payload is exactly:

```ts
{ botId: string, workspaceId: string }
```

Reject payloads containing `workspace`, `path`, extra keys, malformed IDs, unknown IDs, or deleted IDs.

---

## Task 1: Give the Harness client a project-ID-only session contract

**Files:**

- Modify: `plugins/im/tests/channels/dingtalk/harness-client.test.ts`
- Modify: `plugins/im/tests/channels/feishu/harness-client.test.ts`
- Modify: `plugins/im/tests/channels/weixin/harness-client.test.ts`
- Modify: `plugins/im/tests/workspace.test.ts`
- Modify: `plugins/im/src/channels/shared/harness-client.ts`
- Modify: `plugins/im/src/channels/shared/bot-workspace-store.ts` (session proxy only; schema migration stays in Task 2)

### Step 1: Write failing Harness catalog/session tests

Add focused tests proving:

- `HarnessClient.listProjects()` maps only valid `workspace.list().items` rows to `{ workspaceId, title, path }` and does not use `sessionIds` as identity;
- `HarnessClient.createSession({ workspaceId })` sends that ID directly to `session.create`;
- an absent or unknown ID throws `workspace-project-missing` or `workspace-project-not-found` before `session.create`;
- `createSession` never sends `cwd` or `workspace` and never omits `workspaceId`;
- the RPC call log contains zero `workspace.create` calls;
- the existing v1 scoped session proxy resolves its stored path only against `listProjects()`, passes the matched ID, and fails closed for an unregistered path without sending `cwd`.

Use a call-log assertion with this shape:

```ts
expect(calls).not.toContainEqual(expect.objectContaining({ method: 'workspace.create' }));
expect(calls).toContainEqual({
  method: 'session.create',
  payload: { workspaceId: 'project-a' },
});
```

Run:

```bash
pnpm --filter dsh-im test -- \
  tests/channels/dingtalk/harness-client.test.ts \
  tests/channels/feishu/harness-client.test.ts \
  tests/channels/weixin/harness-client.test.ts
```

Expected: FAIL because the client still resolves a path and may call `workspace.create`.

### Step 2: Implement `HarnessClient.listProjects()` and remove create fallback

In `harness-client.ts`:

- normalize `workspace.list` once into the shared project shape;
- require a supplied `workspaceId` for `createSession`;
- verify that ID still exists in `listProjects()` immediately before `session.create`;
- delete the path-to-`workspace.create` fallback from `workspaceId()`; remove `workspaceId()` entirely if no caller remains;
- never pass `cwd`, `workspace`, or an empty target to Host `session.create`;
- keep `path` only for operations that genuinely need a project root after ID validation.

Add the same small coded-error shape already used by `harness-session-binding.ts`:

```ts
function projectError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
```

The session creation core should be equivalent to:

```ts
async createSession(options = {}) {
  const { agentPreset: requestedPreset, workspaceId, ...rpcOptions } = options;
  if (!workspaceId) throw projectError('workspace-project-missing', 'No project is selected');
  await this.ensureRunning(rpcOptions);
  const project = (await this.listProjects(rpcOptions))
    .find((item) => item.workspaceId === workspaceId);
  if (!project) throw projectError('workspace-project-not-found', 'The selected project no longer exists');
  const payload = { workspaceId };
  const agentPreset = requestedPreset !== undefined ? requestedPreset : this.#agentPreset;
  if (agentPreset != null) payload.agentPreset = agentPreset;
  const created = await this.rpc('session.create', payload, 30_000, rpcOptions);
  return created.sessionId;
}
```

Do not change `locateRegisteredWorkspaceSession()` in this task; Follow still expects its path result until Task 6 changes both sides atomically. Do not add a compatibility branch that creates or registers a path.

Update only the scoped `createSession` proxy in `bot-workspace-store.ts` so the still-v1 stored path has a fail-closed bridge until Task 2 migrates storage:

```ts
const workspace = await workspaces.whenWorkspaceReady(botId);
const project = (await target.listProjects())
  .find((item) => item.path === workspace);
if (!project) {
  const error = new Error('The selected project no longer exists');
  error.code = 'workspace-project-not-found';
  throw error;
}
return target.createSession({
  ...safeSessionOptions(options),
  workspaceId: project.workspaceId,
});
```

Use the file's existing canonical path helper for the comparison if stored values are canonicalized. `safeSessionOptions` may be an inline copy/delete block; it must remove `cwd`, `workspace`, and `workspaceId`. This bridge is deliberately deleted/simplified in Task 2 after `whenWorkspaceReady()` returns a project object.

### Step 3: Run focused tests and commit

```bash
pnpm --filter dsh-im test -- \
  tests/channels/dingtalk/harness-client.test.ts \
  tests/channels/feishu/harness-client.test.ts \
  tests/channels/weixin/harness-client.test.ts \
  tests/workspace.test.ts
pnpm --filter dsh-im typecheck

git add plugins/im/src/channels/shared/harness-client.ts plugins/im/src/channels/shared/bot-workspace-store.ts plugins/im/tests/channels/*/harness-client.test.ts plugins/im/tests/workspace.test.ts
git commit -m "refactor(im): create sessions by host project id"
```

---

## Task 2: Persist, migrate, and reconcile bot project bindings

**Files:**

- Modify: `plugins/im/tests/workspace.test.ts`
- Modify: `plugins/im/src/channels/shared/bot-workspace-store.ts`
- Modify: `plugins/im/src/host/channels/shared/production.ts`
- Modify: `plugins/im/src/host/channels/dingtalk/production.ts`
- Modify: `plugins/im/src/host/channels/feishu/production.ts`
- Modify: `plugins/im/src/host/channels/qq/production.ts`
- Modify: `plugins/im/src/host/channels/slack/production.ts`
- Modify: `plugins/im/src/host/channels/wecom/production.ts`
- Modify: `plugins/im/src/host/channels/weixin/production.ts`
- Modify: `plugins/im/src/host/channels/whatsapp/production.ts`
- Modify: production regression tests named below

### Step 1: Write failing store migration and invalidation tests

In `plugins/im/tests/workspace.test.ts`, add cases for:

- a newly ensured bot persists `projects[botId] = null`, reports `workspacePending: true`, and leaves `whenWorkspaceReady()` unresolved;
- selecting a catalog project persists its ID/title/path and releases exactly the waiting bot;
- v1 path data migrates only after a successful project-list reconciliation;
- a unique canonical path match migrates to the matching `workspaceId`;
- an unmatched legacy path becomes pending;
- an existing v2 ID missing from the next catalog becomes pending and clears its old bot session mapping;
- deleting project ID `old`, then creating ID `new` at the same path, does not revive `old`;
- catalog fetch failure preserves the last known binding rather than destructively invalidating it;
- inbound/session creation stays blocked while pending;
- the scoped inbound `createSession` proxy passes exactly the reconciled `project.workspaceId`, never `workspace`, `cwd`, or no target.

Run:

```bash
pnpm --filter dsh-im test -- tests/workspace.test.ts
```

Expected: FAIL because schema v1 stores paths, `ensure()` confirms the default cwd, and the scoped proxy injects `workspace`.

### Step 2: Implement schema v2 and catalog reconciliation

In `bot-workspace-store.ts`:

- replace path-authoritative `#workspaces` state with `#projects`, where each configured bot owns a project object or `null`;
- keep transient v1 legacy paths only until the first successful catalog reconciliation;
- make `ensure()` create an unbound/pending entry instead of storing `defaultWorkspace`;
- add `projectFor(botId)`, retaining `workspaceFor(botId)` only as `projectFor(botId)?.path ?? null` for internal callers not yet migrated;
- add `setProjectCatalog(listProjects)` and `reconcileProjects()`;
- make `setProject(botId, workspaceId)` resolve the current catalog and persist only a matching row;
- make `whenWorkspaceReady()` resolve with the selected project object only after `setProject()` or successful v1 migration;
- clear session bindings when the selected project changes or becomes invalid;
- reconcile before decorating asynchronous controller results and before session/command operations.

Use these error codes:

```text
workspace-project-missing
workspace-project-not-found
workspace-catalog-unavailable
workspace-bot-not-found
workspace-session-mismatch
```

A transient catalog failure must not silently bind or unbind anything. A successfully fetched empty catalog is authoritative and invalidates every selected ID.

Change the scoped inbound proxy explicitly:

```ts
async createSession(options = {}) {
  const project = await workspaces.whenWorkspaceReady(botId);
  const safeOptions = { ...options };
  delete safeOptions.cwd;
  delete safeOptions.workspace;
  delete safeOptions.workspaceId;
  return harness.createSession({
    ...safeOptions,
    workspaceId: project.workspaceId,
  });
}
```

Strip any caller-supplied `cwd`, `workspace`, or `workspaceId` before adding the store-owned ID, so an inbound caller cannot override the binding. This explicit ID is required because Host `session.create` can otherwise fall back to Host cwd.

### Step 3: Attach the live catalog in every production factory

After each `HarnessClient` is created and before its workspace-aware controller is exposed, attach the same callback and perform initial migration:

```ts
workspaces.setProjectCatalog((options) => harness.listProjects(options));
await workspaces.reconcileProjects();
```

Use the existing Harness instance in each production file. Discord and Telegram are covered by `host/channels/shared/production.ts`; do not duplicate their factories. Do not create a second RPC client or duplicate catalog normalization per channel.

Remove `confirmWorkspace` and default-cwd confirmation calls from bot creation/restore paths. Keep any Harness process cwd setting required to launch Harness itself; it is not a bot binding.

### Step 4: Run focused and production regressions

```bash
pnpm --filter dsh-im test -- \
  tests/workspace.test.ts \
  tests/channels/dingtalk/production.test.ts \
  tests/channels/telegram/production.test.ts \
  tests/channels/weixin/plugin-host.test.ts \
  tests/channels/wecom/controller-and-rpc.test.ts
pnpm --filter dsh-im typecheck
```

Expected: PASS, pending remains Host-authoritative, and no session path omits `workspaceId`.

### Step 5: Commit

```bash
git add plugins/im/src/channels/shared/bot-workspace-store.ts plugins/im/src/host/channels plugins/im/tests
git commit -m "refactor(im): persist bot project bindings"
```

---

## Task 3: Enforce `workspaceId` at every Host mutation boundary

**Files:**

- Modify: `plugins/im/src/host/channels/shared/workspace-rpc.ts`
- Modify: `plugins/im/src/host/channels/shared/rpc.ts`
- Modify: `plugins/im/src/host/channels/dingtalk/rpc.ts`
- Modify: `plugins/im/src/host/channels/feishu/rpc.ts`
- Modify: `plugins/im/src/host/channels/qq/rpc.ts`
- Modify: `plugins/im/src/host/channels/slack/rpc.ts`
- Modify: `plugins/im/src/host/channels/wecom/rpc.ts`
- Modify: `plugins/im/src/host/channels/weixin/rpc.ts`
- Modify: `plugins/im/src/host/channels/whatsapp/rpc.ts`
- Modify: `plugins/im/src/channels/shared/bot-workspace-store.ts`
- Modify: `plugins/im/src/channels/shared/message-failure.ts`
- Modify: relevant RPC tests under `plugins/im/tests/channels/*/`
- Modify: `plugins/im/tests/message-failure.test.ts`
- Modify: `plugins/im/tests/workspace.test.ts`

### Step 1: Write failing shared payload tests

Add table-driven tests for all `BotWorkspaceStore`-backed RPC handlers. For each handler assert:

- `{ botId, workspaceId }` is accepted;
- `{ botId, workspace: '/tmp/project' }` is rejected as `invalid-payload`;
- `{ botId, workspaceId, path: '/tmp/project' }` is rejected because extra keys fail closed;
- an unknown or stale ID produces a safe project-not-found response through `publicWorkspaceError()` rather than a generic internal failure;
- `workspace-project-missing`, `workspace-project-not-found`, and `workspace-catalog-unavailable` are explicitly covered by the public error allowlist;
- a stale card/request does not mutate the old project, clear pending, or call `workspace.create`;
- returned account status exposes `workspaceId`, `workspaceTitle`, and `workspacePending`.

Prefer extending existing channel RPC suites rather than creating nine duplicate test files:

```text
plugins/im/tests/channels/dingtalk/rpc.test.ts
plugins/im/tests/channels/feishu/plugin-host.test.ts
plugins/im/tests/channels/qq/controller-and-rpc.test.ts
plugins/im/tests/channels/wecom/controller-and-rpc.test.ts
plugins/im/tests/channels/weixin/plugin-host.test.ts
plugins/im/tests/channels/whatsapp/whatsapp.test.ts
plugins/im/tests/channels/slack/slack.test.ts
plugins/im/tests/channels/telegram/production.test.ts
```

Run the changed suites and observe failure before editing production code.

### Step 2: Replace path payload validation

Change `validWorkspacePayload()` to exact-key validation:

```ts
export function validWorkspacePayload(payload) {
  return payload !== null
    && typeof payload === 'object'
    && !Array.isArray(payload)
    && Object.keys(payload).length === 2
    && Object.keys(payload).every((key) => ['botId', 'workspaceId'].includes(key))
    && /^[A-Za-z0-9_-]{1,128}$/.test(payload.botId)
    && typeof payload.workspaceId === 'string'
    && payload.workspaceId.length >= 1
    && payload.workspaceId.length <= 256;
}
```

Use the actual Host ID character contract if existing valid IDs prove broader than this test regex; do not accept slashes or absolute paths as a substitute.

Update all eight RPC handlers to call:

```ts
await controller.updateWorkspace(payload.botId, payload.workspaceId)
```

Keep the endpoint name `bot.workspace.set` for compatibility.

In the same shared file, extend `publicWorkspaceError()`'s safe-code allowlist with:

```text
workspace-project-missing
workspace-project-not-found
workspace-catalog-unavailable
workspace-project-ambiguous
```

Return the approved Chinese messages for these codes. Preserve `workspace-bot-not-found` and any still-used internal session mismatch code. Do not leave the new codes to fall through to a generic channel error.

### Step 3: Make controller updates resolve the live catalog

Change the workspace-aware controller wrapper so `updateWorkspace(botId, workspaceId)` calls `workspaces.setProject(botId, workspaceId)` and returns freshly decorated status.

Before each decorated status result, reconcile the live project catalog. This is the recovery path for a project deleted while DSH remains open. If the catalog request fails, return the last safe status plus the existing connection error policy; do not guess a cwd and do not erase a valid binding based on an unavailable catalog.

### Step 4: Update public errors and failure classification

Map project errors to concise user text:

```text
workspace-project-missing   -> 这个机器人尚未选择项目。请先选择 Web 中已创建的项目。
workspace-project-not-found -> 这个项目已不存在。请刷新后重新选择 Web 中已有项目。
workspace-catalog-unavailable -> 暂时无法读取项目列表。请稍后重试。
```

Keep generic `WORKSPACE_UNAVAILABLE` classification for delivery telemetry, but change its default Chinese message from “工作区” to “项目”. Do not expose paths or raw Host RPC details.

### Step 5: Run regression tests

```bash
pnpm --filter dsh-im test -- \
  tests/workspace.test.ts \
  tests/message-failure.test.ts \
  tests/channels/dingtalk/rpc.test.ts \
  tests/channels/feishu/plugin-host.test.ts \
  tests/channels/qq/controller-and-rpc.test.ts \
  tests/channels/wecom/controller-and-rpc.test.ts \
  tests/channels/weixin/plugin-host.test.ts \
  tests/channels/whatsapp/whatsapp.test.ts \
  tests/channels/slack/slack.test.ts \
  tests/channels/telegram/production.test.ts
pnpm --filter dsh-im typecheck
```

### Step 6: Commit

```bash
git add plugins/im/src/host/channels plugins/im/src/channels/shared plugins/im/tests
git commit -m "fix(im): reject non-project workspace targets"
```

---

## Task 4: Replace the browser directory picker with the live Web project list

**Files:**

- Rename: `plugins/im/src/client/workspace-directory-picker.ts` → `plugins/im/src/client/workspace-project-picker.ts`
- Modify: `plugins/im/src/client/workspace-editor.ts`
- Modify: `plugins/im/src/client/index.ts`
- Modify: `plugins/im/src/client/i18n.ts`
- Modify: `plugins/im/src/client/channels/shared/token-api.ts`
- Modify: `plugins/im/src/client/channels/shared/token-channel.ts`
- Modify: `plugins/im/src/client/channels/dingtalk/api.ts`
- Modify: `plugins/im/src/client/channels/dingtalk/index.ts`
- Modify: `plugins/im/src/client/channels/feishu/api.ts`
- Modify: `plugins/im/src/client/channels/feishu/index.ts`
- Modify: `plugins/im/src/client/channels/qq/api.ts`
- Modify: `plugins/im/src/client/channels/qq/index.ts`
- Modify: `plugins/im/src/client/channels/wecom/api.ts`
- Modify: `plugins/im/src/client/channels/wecom/index.ts`
- Modify: `plugins/im/src/client/channels/weixin/api.ts`
- Modify: `plugins/im/src/client/channels/weixin/index.ts`
- Modify: `plugins/im/src/client/channels/whatsapp/api.ts`
- Modify: `plugins/im/src/client/channels/whatsapp/index.ts`
- Modify: `plugins/im/tests/workspace-editor.test.ts`
- Modify: `plugins/im/tests/workspace-pending-client.test.ts`
- Modify: channel client API/UI tests that provide `WorkspaceDirectoryPickerContext`

### Step 1: Rewrite picker tests first

Delete obsolete expectations for:

- child-directory navigation;
- breadcrumb traversal;
- manual absolute path input;
- UNC/native file picker fallback;
- cancelling as confirmation of the current/default path.

Add failing tests proving:

1. only `ctx.workspaces.list.items` rows render;
2. selecting a row calls `onSave(workspaceId)` and closes only after the Promise resolves;
3. the selected row's main label is `title`, not `path`;
4. duplicate titles receive stable list numbers and a muted parent-directory hint;
5. empty list shows “还没有项目” plus guidance to create one in Web, with no save action;
6. cancellation closes the dialog without calling `onSave` and leaves `workspacePending` authoritative;
7. stale current IDs are shown as unselected/pending;
8. `state: 'loading'`, `phase: 'pending'`, or `baselinesReady: false` shows loading, never the “还没有项目” empty state;
9. only a ready baseline with `items: []` shows the true empty state;
10. Host-authoritative `workspacePending` still auto-opens on initial render/remount and while Weixin, WeCom, or Feishu is connecting, before channel `connected`;
11. one lost provisioning poll followed by status reconciliation still opens the picker, and pages with multiple pending bots open only the page-selected bot;
12. cancellation dismisses the current local modal without confirming; a remount or later authoritative recovery can open it again while Host remains pending;
13. dialog basics remain accessible: labelled dialog, focus enters the dialog, Escape cancels, 44 px target rows, visible busy/error feedback;
14. no test double implements `listDirectory` or `pickDirectory`.

Replace test providers with a small fake project source:

```ts
const projectSource = {
  list: {
    getSnapshot: () => ({
      items: [
        { workspaceId: 'p-a', title: '办公助手', path: '/work/a', sessionIds: [] },
        { workspaceId: 'p-b', title: '研发助手', path: '/work/b', sessionIds: [] },
      ],
      archivedSessionIds: [],
      state: 'idle',
      phase: 'ready',
      error: null,
      baselinesReady: true,
      recentWorkspaceId: 'p-a',
    }),
    subscribe: () => () => {},
  },
};
```

Run:

```bash
pnpm --filter dsh-im test -- \
  tests/workspace-editor.test.ts \
  tests/workspace-pending-client.test.ts
```

Expected: FAIL because the editor still browses the filesystem and cancellation saves a path.

### Step 2: Implement the project-only picker

Rename the component and reduce it to one modal list. It must:

- subscribe to `ctx.workspaces.list` with `useSyncExternalStore`;
- preserve list order from the Host snapshot;
- render title as the primary label;
- show a parent-directory hint only for duplicate titles;
- emit only `workspaceId`;
- treat `state === 'loading'`, `phase === 'pending'`, or `baselinesReady !== true` as loading; render empty only after a ready baseline;
- render loading, error, empty, busy, and save-failure states;
- preserve the 2026-08-31 Host-pending recovery behavior: initial status, remount, connecting-state reconciliation, lost-poll recovery, and one-pending-bot-at-a-time coordination;
- have no text field, breadcrumb, folder-open control, `listDirectory`, `pickDirectory`, or path submission branch.

Use a native button per project row; no new component library or icon package is needed.

Rename the context:

```ts
export const WorkspaceProjectsContext = React.createContext(null);
```

`WorkspaceEditor` accepts:

```ts
{
  botId,
  workspaceId,
  workspaceTitle,
  workspacePending,
  onSave,
}
```

Its cancellation handler must only close local UI. It must not call `onSave`, clear Host pending state, or substitute the previous `workspace` path. Keep a local dismissed latch only to prevent an immediate reopen from the same unchanged snapshot; Host pending remains authoritative, so remount/status recovery can prompt again.

### Step 3: Inject the existing runtime project source

In `client/index.ts`, provide `ctx.workspaces` through `WorkspaceProjectsContext`. Delete the binding-target use of:

```ts
ctx.workspaces.listDirectory
ctx.workspaces.pickDirectory
```

Do not alter unrelated Host file/folder features elsewhere in DSH.

### Step 4: Preserve project identity in every account normalizer

For token channels and each dedicated client API, normalize:

```ts
workspaceId: typeof value.workspaceId === 'string' ? value.workspaceId : null,
workspaceTitle: typeof value.workspaceTitle === 'string' ? value.workspaceTitle : null,
workspace: typeof value.workspace === 'string' ? value.workspace : null,
workspacePending: value.workspacePending === true,
```

Change each `setWorkspace` client method to send:

```ts
{ botId, workspaceId }
```

Update every channel card to display `workspaceTitle ?? '未选择项目'`. Do not display an absolute path as the primary value.

### Step 5: Update copy and translation keys

Use “项目” in picker labels, success feedback, errors, and accessibility announcements. Remove obsolete directory/path picker strings only when no remaining caller uses them.

Required Chinese copy:

```text
选择项目
还没有项目
请先在左侧项目区创建项目，然后返回这里选择。
未选择项目
已切换到项目「{title}」。
这个项目已不存在，请刷新后重新选择。
```

Provide equivalent English entries in `client/i18n.ts`.

### Step 6: Run all client regressions

```bash
pnpm --filter dsh-im test -- \
  tests/workspace-editor.test.ts \
  tests/workspace-pending-client.test.ts \
  tests/client-ui.test.ts \
  tests/channels/dingtalk/client-api.test.ts \
  tests/channels/dingtalk/client-ui.test.ts \
  tests/channels/feishu/client-api.test.ts \
  tests/channels/feishu/connection-test-client.test.ts \
  tests/channels/qq/client-api.test.ts \
  tests/channels/qq/client-ui.test.ts \
  tests/channels/slack/client-ui.test.ts \
  tests/channels/telegram/client-ui.test.ts \
  tests/channels/wecom/client-api.test.ts \
  tests/channels/wecom/client-ui.test.ts \
  tests/channels/weixin/client-api.test.ts \
  tests/channels/whatsapp/client-ui.test.ts
pnpm --filter dsh-im typecheck
```

### Step 7: Commit

```bash
git add plugins/im/src/client plugins/im/tests
git commit -m "feat(im): choose existing projects in bot settings"
```

---

## Task 5: Change text commands and guides from paths to project selectors

**Files:**

- Modify: `plugins/im/src/channels/shared/workspace-command.ts`
- Modify: `plugins/im/src/channels/shared/harness-client.ts`
- Modify: `plugins/im/src/channels/shared/harness-session-binding.ts`
- Modify: `plugins/im/src/channels/shared/message-failure.ts`
- Modify: `plugins/im/src/usage-guide.ts`
- Modify: `plugins/im/src/client/usage-guide-card.ts`
- Modify: `plugins/im/src/client/i18n.ts`
- Modify: `plugins/im/tests/workspace.test.ts`
- Modify: `plugins/im/tests/session-bind-command.test.ts`
- Modify: `plugins/im/tests/usage-guide.test.ts`
- Modify: `plugins/im/tests/message-failure.test.ts`
- Modify: text bridge tests for affected channels under `plugins/im/tests/channels/*/`

### Step 1: Write failing command parser tests

Add tests for this exact behavior:

```text
/workspacelist          -> numbered project titles, marks current
/workspace              -> usage: list, then exact number or exact title
/workspace 3            -> selects catalog index 3 and persists its workspaceId
/workspace 办公助手      -> exact unique title match
/workspace 重名项目      -> asks for a number when title is ambiguous
/workspace /tmp/project -> rejected even when the directory exists
/sessionlist            -> sessions in the current selected project
/sessionlist 3          -> sessions in catalog project index 3
```

Also prove:

- an out-of-range number fails without mutation;
- deleted/stale IDs fail and leave the bot pending;
- successful output says `已切换到项目「办公助手」。`;
- list output does not print full paths unless duplicate-title disambiguation requires a muted parent hint;
- no command path calls `workspace.create`.

Run:

```bash
pnpm --filter dsh-im test -- \
  tests/workspace.test.ts \
  tests/session-bind-command.test.ts \
  tests/usage-guide.test.ts
```

Expected: FAIL because commands currently parse and validate absolute paths.

### Step 2: Implement one shared selector

In `workspace-command.ts`, resolve input against the current `listProjects()` snapshot:

```ts
function selectProject(projects, input) {
  const value = input.trim();
  if (/^[1-9]\d*$/.test(value)) return projects[Number(value) - 1] ?? null;
  const matches = projects.filter((project) => project.title === value);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const error = new Error('More than one project has that title; choose by number');
    error.code = 'workspace-project-ambiguous';
    throw error;
  }
  return null;
}
```

Reject path-like strings as ordinary not-found selectors; never inspect the filesystem. Use the same ordered catalog for `/workspacelist`, `/workspace N`, and `/sessionlist N` so numbers are deterministic within one command response.

Change scoped Harness helpers to expose:

```ts
currentProject()
listProjects()
switchProject(workspaceId)
listProjectSessions(workspaceId)
```

For `/session` adoption in this task, extend `adoptRegisteredWorkspaceSession()` to return the owning `{ workspaceId, title, path }` and make `bindWorkspaceSession` compare the adopted `workspaceId` with the bot's selected project ID before storing the session. Keep `locateRegisteredWorkspaceSession()` returning a path until Task 6, where the locator and every Follow consumer change atomically. Retain other path-returning helpers only where an internal file operation still requires a validated project root. Remove user-facing path selector methods when no caller remains.

### Step 3: Update usage and menu copy

Keep command spellings but describe projects:

```text
/workspacelist — 列出 Web 中已创建的项目
/workspace — 按列表序号或唯一项目名切换项目
/sessionlist — 列出当前项目的会话；可带项目序号
```

Remove examples that pass absolute paths. In `client/usage-guide-card.ts`, replace “工作区是项目目录 / 选择目录 / 留在该目录” with project-language and the selected project title semantics. Update its English translations in `client/i18n.ts`. Update Telegram and other text menu/help snapshots through the shared guide rather than per-channel copies where possible.

### Step 4: Run text-channel regressions

```bash
pnpm --filter dsh-im test -- \
  tests/workspace.test.ts \
  tests/session-bind-command.test.ts \
  tests/usage-guide.test.ts \
  tests/message-failure.test.ts \
  tests/client-ui.test.ts \
  tests/channels/shared/text-harness-bridge.test.ts \
  tests/channels/telegram/telegram.test.ts \
  tests/channels/discord/discord.test.ts \
  tests/channels/slack/slack.test.ts \
  tests/channels/qq/bridge.test.ts \
  tests/channels/wecom/bridge.test.ts \
  tests/channels/weixin/weixin-bridge.test.ts \
  tests/channels/dingtalk/dingtalk-bridge.test.ts
pnpm --filter dsh-im typecheck
```

### Step 5: Commit

```bash
git add plugins/im/src/channels/shared plugins/im/src/usage-guide.ts plugins/im/src/client/usage-guide-card.ts plugins/im/src/client/i18n.ts plugins/im/tests
git commit -m "feat(im): switch projects by name or number"
```

---

## Task 6: Make Feishu cards and Web Session Follow use project IDs

**Files:**

- Modify: `plugins/im/src/channels/feishu/bridge.ts`
- Modify: `plugins/im/src/channels/feishu/feishu-cards.ts`
- Modify: `plugins/im/src/channels/shared/session-follow.ts`
- Modify: `plugins/im/src/channels/shared/harness-session-binding.ts`
- Modify: `plugins/im/src/host/session-follow-rpc.ts`
- Modify: `plugins/im/src/client/session-follow.ts`
- Modify: `plugins/im/src/client/i18n.ts`
- Modify: `plugins/im/src/host/channels/*/production.ts` only where follow-source fields change
- Modify: `plugins/im/tests/channels/feishu/bridge.test.ts`
- Modify: `plugins/im/tests/channels/feishu/feishu-cards.test.ts`
- Modify: `plugins/im/tests/session-follow.test.ts`

### Step 1: Write failing Feishu card tests

Add assertions that:

- “切换项目” options show numbered project titles;
- duplicate titles include only the minimum parent hint needed to distinguish them;
- option values and button payloads contain `workspaceId`, not `path`;
- `/status` shows the current project title or “未选择项目”;
- selecting a valid card option switches by ID;
- selecting an option whose project was deleted returns project-not-found and refreshes the card/list;
- help and card copy contain no “绝对路径”, “选择目录”, or path-as-project wording.

The payload assertion should be explicit:

```ts
expect(option).toMatchObject({
  text: { content: '1. 办公助手' },
  value: 'project-a',
});
expect(JSON.stringify(card)).not.toContain('/work/a');
```

Run:

```bash
pnpm --filter dsh-im test -- \
  tests/channels/feishu/bridge.test.ts \
  tests/channels/feishu/feishu-cards.test.ts
```

Expected: FAIL because current card options use paths as labels and values.

### Step 2: Implement Feishu project cards

Reuse `workspace-command.ts` project ordering/label logic where the Host bundle boundary permits it. Do not create a Feishu-only project registry.

For card actions:

1. read the current project catalog;
2. find the submitted `workspaceId`;
3. fail safely if absent;
4. call `switchProject(workspaceId)`;
5. render a fresh list/status card.

Never retain the old path in hidden card payloads as a fallback.

### Step 3: Write failing Follow identity tests

In `session-follow.test.ts`, cover:

- a bot and Web session with the same `workspaceId` are compatible;
- equal paths with different IDs are incompatible;
- different paths with the same ID use the current catalog metadata and remain compatible;
- a deleted project makes the source unavailable/pending;
- clearing or switching Follow preserves the existing “current explicit Follow wins” badge behavior;
- public Follow RPC results do not expose an absolute path;
- the Web Follow dialog says “当前项目 / 切换到这个项目”, never “当前工作区 / 切到这个目录”;
- the client continues to show only compatible bots and preserves the explicit-Follow badge/selection behavior.

Run:

```bash
pnpm --filter dsh-im test -- tests/session-follow.test.ts
```

Expected: FAIL because Follow readiness currently compares paths.

### Step 4: Change Follow source and session locator contracts

Change `locateRegisteredWorkspaceSession()` and its Harness wrapper to return the owning project object in this task, at the same time as all Follow consumers stop expecting a string path:

```ts
return {
  workspaceId: workspace.workspaceId,
  title: workspace.title,
  path: workspace.path,
};
```

Register each source with stable project access:

```ts
registerFollowSource({
  ...,
  project: () => workspaces.projectFor(botId),
  locateSession: (sessionId) => harness.locateProjectSession(sessionId),
});
```

Change the shared readiness comparison from path equality to:

```ts
sourceProject.workspaceId === sessionProject.workspaceId
```

Rename internal `sessionWorkspace` values to `sessionProject` where touched so future code cannot accidentally compare paths again. Keep public response compatibility only if the Web client requires a field; if it does, expose `sessionWorkspaceId`, not a path.

In `client/session-follow.ts`, update empty-state and description copy to “当前项目” and “切换到这个项目”; add/update English translations in `client/i18n.ts`. Do not loosen the Host-side ID filter merely to keep a stale client row visible.

### Step 5: Run focused and cross-channel regressions

```bash
pnpm --filter dsh-im test -- \
  tests/session-follow.test.ts \
  tests/channels/feishu/bridge.test.ts \
  tests/channels/feishu/feishu-cards.test.ts \
  tests/channels/dingtalk/production.test.ts \
  tests/channels/telegram/production.test.ts \
  tests/channels/weixin/plugin-host.test.ts \
  tests/channels/wecom/controller-and-rpc.test.ts
pnpm --filter dsh-im typecheck
```

### Step 6: Commit

```bash
git add plugins/im/src/channels/feishu plugins/im/src/channels/shared plugins/im/src/host plugins/im/src/client/session-follow.ts plugins/im/src/client/i18n.ts plugins/im/tests
git commit -m "fix(im): match cards and follows by project id"
```

---

## Task 7: Synchronize public docs and prove the complete user journey

**Files:**

- Modify: `plugins/im/README.md`
- Modify: `plugins/im/README.zh.md`
- Modify: `plugins/im/docs/prd.zh.md`
- Modify: `plugins/im/docs/technical.zh.md`
- Modify: `docs/conventions.md`
- Modify: `docs/conventions.zh.md`
- Modify: `docs/workflow.md`
- Modify: `docs/workflow.zh.md`
- Verify: `docs/superpowers/specs/2026-09-01-im-bind-existing-project-design.md`
- Verify: `docs/superpowers/specs/2026-08-31-im-workspace-onboarding-design.md`
- Verify: `docs/superpowers/plans/2026-08-31-im-workspace-onboarding-plan.md`
- Verify: `docs/superpowers/plans/2026-09-01-im-bind-existing-project-plan.md`

### Step 1: Add a failing documentation contract test

Extend `plugins/im/tests/usage-guide.test.ts` or the repository's existing documentation check so public IM docs fail if they instruct users to:

- select/browse an arbitrary directory for a bot;
- submit `/workspace /absolute/path`;
- treat cancellation as confirmation of cwd;
- create a Host project from IM.

Also assert that English and Chinese READMEs mention selecting an existing Web project and that command names remain unchanged.

Run the focused test and observe failure before editing READMEs.

### Step 2: Update user-facing docs

Synchronize all listed docs to the approved contract:

- user term is “project / 项目”;
- Web-created Host projects are the only choices;
- binding identity is `workspaceId`;
- old path data migrates once only on a unique match;
- cancelling stays pending;
- deleted/recreated same-path projects require a fresh selection;
- `/workspace` and `/workspacelist` keep their names but use number/title selectors;
- sandbox acceptance is FR-13's implemented flow, not a future or contradictory path-picker flow.

Keep the superseded note at the top of the 2026-08-31 design and plan. Do not rewrite those historical documents line by line.

### Step 3: Search for stale product copy

Run:

```bash
rg -n '(/workspace\s+/|/sessionlist\s+/).*(绝对|/Users/|/tmp/|path|路径)' \
  plugins/im docs README.md README.zh.md
rg -n '取消.*(确认|默认|cwd)|confirm.*provisional|WorkspaceDirectoryPicker|listDirectory|pickDirectory' \
  plugins/im/src plugins/im/tests plugins/im/docs docs/superpowers docs/conventions* docs/workflow*
rg -n "workspace\.create" plugins/im/src plugins/im/tests
```

Expected:

- no active docs or UI copy instruct path binding;
- old historical text appears only below an explicit superseded notice;
- no production IM source calls `workspace.create`;
- `listDirectory`/`pickDirectory` no longer appear in the bot-binding client path.

Review each match; do not globally replace unrelated filesystem concepts such as inbound files, credentials, AI Office alias paths, or internal validated project roots.

### Step 4: Run proactive diagnostics before builds

```bash
pnpm --filter dsh-im typecheck
```

Then run Pi diagnostics on changed source files with `lsp_diagnostics`, followed by `lens_diagnostics mode=all`. Fix every blocking finding introduced by this task before continuing.

### Step 5: Run the full plugin and repository gates

```bash
pnpm --filter dsh-im test
pnpm --filter dsh-im typecheck
pnpm --filter dsh-im build
pnpm check
pnpm check:build
pnpm check:path

git diff --check
git status --short
```

Record exact totals and outputs. A green focused suite is not completion.

### Step 6: Run an independent code review

Use `superpowers:requesting-code-review` with a fresh reviewer. Give it:

- the approved design;
- this implementation plan;
- the full diff from the topic branch base;
- the test/gate evidence;
- explicit review questions for unauthorized path fallback, `workspace.create`, stale-ID resurrection, pending-state bypass, card payloads, and Follow path comparison.

Fix blocking or important findings with red-green tests, rerun the affected suites, then rerun the full gates above.

### Step 7: Perform sandbox acceptance without touching official 3080

Follow `docs/workflow.md` exactly.

1. Confirm whether port 3081 is free or already belongs to this checkout. Do not start if it belongs to another checkout.
2. Start this checkout's `pnpm dev` and required journey-break watch as one kept-alive pair.
3. Confirm 3081 LISTENs and the watch targets the current log.
4. In Web, create or identify two registered projects A and B with distinct IDs. Include two same-title projects if practical.
5. Bind one available IM test bot through the normal user UI.
6. Verify the picker appears from Host-authoritative pending state and lists only current Web projects.
7. Cancel. Send an inbound message and verify no session/file/work appears in repository cwd or another default directory.
8. Select project A. Send the first real inbound message and verify its session appears only under A.
9. Run `/workspacelist`, `/workspace 2`, `/workspace <unique title>`, `/workspace /tmp/not-a-project`, `/sessionlist`, and `/sessionlist 1`; verify number/title behavior and path rejection.
10. Switch to B from the settings card. Verify new work goes to B while A's old session remains.
11. Delete the selected project from Web. Refresh/reconcile and verify the bot becomes pending and blocks inbound work.
12. Recreate the same path as a new Web project. Verify the old binding does not revive; select the new project explicitly.
13. For Feishu if credentials are available, verify dropdown labels are project names, stale card actions fail safely, and `/status` shows the project title. If unavailable, retain automated card evidence and state the manual gap.
14. In a Web Session, verify Follow eligibility matches `workspaceId`, not coincidentally equal paths, and the existing explicit-Follow badge behavior remains intact.
15. Keep sandbox monitoring alive after the acceptance run as required by repository policy; do not stop or restart official 3080.

A journey break is a defect: classify it, add a failing test, fix it in this sandbox, rerun the relevant checks, and repeat the journey. Merely reporting the log is not acceptance.

### Step 8: Commit documentation and final fixes

```bash
git add \
  plugins/im/README.md \
  plugins/im/README.zh.md \
  plugins/im/docs \
  docs/conventions.md \
  docs/conventions.zh.md \
  docs/workflow.md \
  docs/workflow.zh.md \
  docs/superpowers
git commit -m "docs(im): document existing-project binding"
```

If review or sandbox fixes changed production files, commit them separately with a focused `fix(im): ...` message before this docs commit.

### Step 9: Finish the branch through PR

Use `superpowers:finishing-a-development-branch`.

- Push the topic branch and open a PR into `main`.
- Wait for all required CI checks; do not merge on partial evidence.
- After merge, follow repository cleanup rules: update the hub checkout with `git pull --ff-only`, confirm topic commits are contained in `origin/main`, remove only clean task worktrees, and delete merged local/remote topic branches without force.
- Keep the sandbox/watch pair alive if dogfood monitoring was started; merging does not stop it.

## Final Acceptance Checklist

- [ ] New bot has `workspaceId = null`, `workspacePending = true`, and no default cwd binding.
- [ ] Browser picker lists exactly `ctx.workspaces.list.items` and has no directory/path fallback.
- [ ] Cancel does not save, confirm, or release the first-action fence.
- [ ] Every `bot.workspace.set` caller sends `{ botId, workspaceId }` only.
- [ ] Unknown/deleted/stale IDs fail closed and do not call `workspace.create`.
- [ ] `session.create` receives a currently validated `workspaceId` directly.
- [ ] v1 path data migrates only on one exact current match; v2 IDs never revive by path.
- [ ] `/workspace` and `/sessionlist` use list numbers or project titles, not paths.
- [ ] Feishu labels show project titles and hidden payloads carry IDs.
- [ ] Session Follow compares project IDs.
- [ ] Project deletion returns the bot to pending and blocks inbound work.
- [ ] English/Chinese public docs, PRD, technical contract, conventions, workflow, and help copy agree.
- [ ] Focused tests, full `dsh-im` tests, typecheck, build, `pnpm check`, `check:build`, `check:path`, diagnostics, review, and sandbox first-action evidence are green.
- [ ] Official `~/.dsh` and port 3080 were untouched.
