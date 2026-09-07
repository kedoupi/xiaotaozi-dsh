# CR Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for ledger, serial task execution and review requirements. This planning worker must not launch subagents. The parent owns later delegation/review. User prohibitions override skill commit, execution-choice and cleanup templates.

**Goal:** Correct the seventeen approved sidebar, board, CLI, provider and Office defects in six independently reviewable subsystem tasks.

**Architecture:** Retain the pinned Harness wrapper, self-contained Git-path plugins and existing trust boundaries. Extend local dirty-state, lifecycle ownership and serialized-write seams; do not introduce a cross-plugin state/transaction framework. Each subsystem owns its same-subsystem P2 fixes.

**Tech Stack:** TypeScript, React 18, CodeMirror, Node, pnpm, Vitest, node:test, GitHub Actions YAML.

**Spec:** `docs/superpowers/specs/2026-09-05-cr-hardening.md` (including supervisor test-isolation amendments).

## Global Constraints

- Only `/Users/codepi/Coding/dsh-plugins/.worktrees/cr-hardening`, branch `fix/cr-hardening`, baseline `77c20c7a767c4360e7b90461dc89c091179078d6`. Preserve earlier task changes and the existing approved spec. No main-hub or other-worktree work.
- No staging, commits, push, merge, rebase, branch changes, publish/deploy, real credentials/home access, real login, service operations or listeners on 3080/3081. No `pnpm dev`, `smoke:sandbox`, alternate CLI execution or nested subagents. Fake subprocesses/temporary fixtures only. No real wecom-cli or provider requests.
- Exactly two product homes remain unchanged: official `~/.dsh` / 3080; sandbox checkout `.dsh-home` / 3081. Test homes below are fixtures, not a third product home. Official commands must not probe sandbox.
- Versions remain normative in `versions.json`: DSH `0.1.1-rc.2`, Node floor `22.19.0` with supported range `^22.19.0 || >=24.0.0`, pnpm `11.22.0`, Python `3.12.14`, CLI `0.5.0`. Actual planning runtime: Node `v24.18.0`, pnpm `11.22.0`. Do not bump versions, add/upgrade dependencies, change manifests/lockfiles or increment the IM ts-nocheck budget.
- Existing lockfile installs are allowed separately in root and `apps/cli`. For root/CLI bootstrap reinstalls use explicit `pnpm install --frozen-lockfile --ignore-scripts`, then source typecheck before explicit build. This suppression is bootstrap-only: `pnpm check:path` must execute real prepare scripts; never suppress its lifecycle scripts. The initial environment-variable attempt did **not** suppress pnpm prepare; do not repeat that assumption.
- Preserve Harness APIs, self-contained package prepare/external dependencies, actor/route/workspace approval fences, first-work confirmation, raw-document download safety, CSP sandbox and nosniff. No sibling-plugin imports, packages/shared, global transaction framework, blanket refactors or website edits.
- Excluded: Market non-web profile mismatch, child-repository worktree discovery, broad IM type migration. Changes to a touched IM boundary may lower the existing ratchet only when warranted.
- Read AGENTS.md, conventions/workflow, affected domain skills and relevant external audit. Audit findings are hypotheses until RED; record disproved findings instead of forcing fixes. Do not repair baseline failures; classify and escalate actual infrastructure/authority blockers.
- All subsequent installs/tests/checks/builds require the complete isolation prefix below, even when suites claim fake-home coverage. Do not copy user configuration/credentials. Original non-isolated baseline success is **not safe acceptance evidence**; possible real-home effects are unknown and must not be inspected or undone.
- Supervisor approved one exclusively owned `/private/tmp/dsh-cr-hardening-tests.*` fixture root because production Git intentionally strips GIT_* environment variables. Only TMPDIR/TMP/TEMP live there; HOME/DSH_HOME/XDG/npm configuration stay in ignored plan workspace. Never modify Git sanitization or weaken tests for this environment issue. Cleanup only exact paths created by this run; preserve reports and uncommitted work.
- TDD: add one behavioral regression, run and observe the intended assertion failure, implement the minimum, rerun GREEN, then refactor. Do not confuse compilation/fixture rejection with reproduction. No product/test edits were made in this planning step; snippets below are future tests, not executed RED evidence.
- No commits overrides all skill templates. Review uncommitted tracked **and untracked** files using captured diffs; never HEAD..HEAD. Parent requests a fresh task-scoped spec/quality reviewer after each task, then whole-change review. Do not continue past unresolved load-bearing findings. Live/rendered/official-home acceptance remains pending.

## Isolation prefix (repeat before every command group)

The identical executable block is included in every brief. It preserves the existing executable PATH. The fixture-root file records `/private/tmp/dsh-cr-hardening-tests.6gd7qh`, created by this run with `mktemp -d` (0700). If that owned directory is gone, stop and create a new exclusive root with the same approved prefix, update the ignored ownership record, and repeat the nonrepo/initialized-repo environment selfcheck; never adopt an unknown directory.

```bash
cd /Users/codepi/Coding/dsh-plugins/.worktrees/cr-hardening || exit 1
# Source only from the authorized worktree root. Never copy user config/credentials.
[ "$PWD" = /Users/codepi/Coding/dsh-plugins/.worktrees/cr-hardening ] || exit 1
SAFE_ROOT="$PWD/.superpowers/sdd/2026-09-05-cr-hardening-plan/isolated"
mkdir -p "$SAFE_ROOT"/{home,dsh,config,cache,data,state,runtime,tmp,npm-cache,pnpm-store}
export HOME="$SAFE_ROOT/home" DSH_HOME="$SAFE_ROOT/dsh"
export XDG_CONFIG_HOME="$SAFE_ROOT/config" XDG_CACHE_HOME="$SAFE_ROOT/cache"
export XDG_DATA_HOME="$SAFE_ROOT/data" XDG_STATE_HOME="$SAFE_ROOT/state"
export XDG_RUNTIME_DIR="$SAFE_ROOT/runtime"
export npm_config_userconfig="$SAFE_ROOT/npmrc" NPM_CONFIG_USERCONFIG="$SAFE_ROOT/npmrc"
export npm_config_globalconfig="$SAFE_ROOT/global-npmrc" NPM_CONFIG_GLOBALCONFIG="$SAFE_ROOT/global-npmrc"
export npm_config_cache="$SAFE_ROOT/npm-cache" npm_config_store_dir="$SAFE_ROOT/pnpm-store"
touch "$SAFE_ROOT/npmrc" "$SAFE_ROOT/global-npmrc"

# Approved exclusive external fixture root preserves non-repository semantics.
FIXTURE_ROOT=$(cat "$PWD/.superpowers/sdd/2026-09-05-cr-hardening-plan/fixture-root.txt")
case "$FIXTURE_ROOT" in /private/tmp/dsh-cr-hardening-tests.*) ;; *) exit 1 ;; esac
[ -d "$FIXTURE_ROOT" ] || exit 1
export TMPDIR="$FIXTURE_ROOT" TMP="$FIXTURE_ROOT" TEMP="$FIXTURE_ROOT"
export GIT_CEILING_DIRECTORIES="$FIXTURE_ROOT"
```

## Baseline and evidence workspace

Workspace: `.superpowers/sdd/2026-09-05-cr-hardening-plan/`; ledger: `progress.md`; task brief/report pairs: `task-1-brief.md`/`task-1-report.md` through `task-6-brief.md`/`task-6-report.md`. SDD `sdd-workspace` and `task-brief` scripts were inspected before execution. Its `review-package` script only supports committed ranges and is deliberately **not** used for this uncommitted task.

Safe baseline logs: `baseline-check-isolated-final.log`, `baseline-check-cli-isolated-final.log`. Root policy/type/tests passed: 219 plugin files / 1843 plugin tests plus 65 script tests; CLI typecheck → build → 125 tests passed. Native/package-build acceptance beyond these commands is not established. Initial install logs: `install-root.log`, `install-cli.log`; manifest checksums: `manifests-before.sha256`, `manifests-after-install.txt`. Initial unsafe success logs and both environment-failure logs remain retained. Details and costs are in the ledger.

### Capturing a real review package (run after each task and each fix)

Use a new artifact on every review; scope paths to that task and include shared files changed by prior tasks in the cumulative package. Capture the task's before-state files before edits so a fix-round delta can be compared to the previous reviewed snapshot, not a commit. Never stage an intent-to-add to obtain new-file diffs.

```bash
W="$PWD/.superpowers/sdd/2026-09-05-cr-hardening-plan"
OUT=$(mktemp "$W/review-working-tree.XXXXXX")
{
  git status --short
  git diff --stat
  git diff --binary -U10
  while IFS= read -r -d '' path; do
    git diff --no-index --binary -U10 -- /dev/null "$path"
    code=$?; [ "$code" -le 1 ] || exit "$code"
  done < <(git ls-files --others --exclude-standard -z)
} > "$OUT"
git diff --cached --quiet || { echo 'STOP: unexpected staged files'; exit 1; }
printf '%s\n' "$OUT"
```

Run this block in bash without `set -e` around expected `git diff --no-index` exit 1. Reports list actual paths, RED/GREEN commands/logs, source typecheck/build evidence, spec/quality review verdicts, unresolved risks, and rulings with costs. Report status begins `not-started` until actual execution; do not mark tasks complete during planning. Parent alone performs review fanout.

### Task 1: Sidebar data safety and preview assets (S1, S2)

**Mandatory isolation before this task’s commands**

```bash
cd /Users/codepi/Coding/dsh-plugins/.worktrees/cr-hardening || exit 1
# Source only from the authorized worktree root. Never copy user config/credentials.
[ "$PWD" = /Users/codepi/Coding/dsh-plugins/.worktrees/cr-hardening ] || exit 1
SAFE_ROOT="$PWD/.superpowers/sdd/2026-09-05-cr-hardening-plan/isolated"
mkdir -p "$SAFE_ROOT"/{home,dsh,config,cache,data,state,runtime,tmp,npm-cache,pnpm-store}
export HOME="$SAFE_ROOT/home" DSH_HOME="$SAFE_ROOT/dsh"
export XDG_CONFIG_HOME="$SAFE_ROOT/config" XDG_CACHE_HOME="$SAFE_ROOT/cache"
export XDG_DATA_HOME="$SAFE_ROOT/data" XDG_STATE_HOME="$SAFE_ROOT/state"
export XDG_RUNTIME_DIR="$SAFE_ROOT/runtime"
export npm_config_userconfig="$SAFE_ROOT/npmrc" NPM_CONFIG_USERCONFIG="$SAFE_ROOT/npmrc"
export npm_config_globalconfig="$SAFE_ROOT/global-npmrc" NPM_CONFIG_GLOBALCONFIG="$SAFE_ROOT/global-npmrc"
export npm_config_cache="$SAFE_ROOT/npm-cache" npm_config_store_dir="$SAFE_ROOT/pnpm-store"
touch "$SAFE_ROOT/npmrc" "$SAFE_ROOT/global-npmrc"

# Approved exclusive external fixture root preserves non-repository semantics.
FIXTURE_ROOT=$(cat "$PWD/.superpowers/sdd/2026-09-05-cr-hardening-plan/fixture-root.txt")
case "$FIXTURE_ROOT" in /private/tmp/dsh-cr-hardening-tests.*) ;; *) exit 1 ;; esac
[ -d "$FIXTURE_ROOT" ] || exit 1
export TMPDIR="$FIXTURE_ROOT" TMP="$FIXTURE_ROOT" TEMP="$FIXTURE_ROOT"
export GIT_CEILING_DIRECTORIES="$FIXTURE_ROOT"
```

**Task safety:** Single writer; no nested subagents, staging/commits, service operations, real home/login/credentials, dependency changes or 3080/3081 listeners. Preserve prior uncommitted tracked and untracked changes; capture actual diffs for review, never HEAD..HEAD. Tests are fake/temporary only; live acceptance pending. Full Global Constraints apply.

**Files and ownership**

- Modify `plugins/sidebar/src/client/state.ts:1324–1490`: transient editor guard registration and enforcement at actual store publication, covering `update`, `reduce`, `reduceFor`.
- Modify `plugins/sidebar/src/client/EditorHost.tsx:121–140,243–253,298–310`: bridge editor toolbar dirty/save state to guard and use existing unsaved Modal for blocked-action explanation/discard. Read `TextEditor.tsx:65–67,133–148,206–210,350–360` before wiring; keep document/undo ownership in CodeMirror, not a new global buffer.
- Modify `plugins/sidebar/src/client/service.ts:744–770` only to prevent close lifecycle callbacks when guarded close did not occur. Keep `closeTab(...): void` public API.
- Read/verify every caller in `Sidebar.tsx:791–801,1109–1170,1588–1589`, `split-pane.tsx:185–213`, `TabBar.tsx:170–203,326`; change caller wiring only if publication guard does not cover it. Also inspect `migrateBottomTabs` and tree-collapse remounts affecting **other** dirty tabs.
- Modify `plugins/sidebar/src/index.ts:119–155,877–935`: preview-only MIME/header helper used by registered HTML route, not media download policy.
- Add `plugins/sidebar/tests/editor-movement.test.ts`; extend `tests/media-security.test.ts` and `tests/boundary-integration.test.ts`. Existing `tests/editor-truncation.test.ts` remains green. Old comments referring to `state.spec.ts` do not identify an existing test file.
- If new blocked-move copy is needed, modify `src/client/locales.ts` and `unsaved-refresh.ts` alongside the Modal, not a new dialog system.

**Interfaces**

Consumes `SidebarStore`, `SidebarState`, `EditorToolbarState {dirty,saveState,...}`, pure layout reducers and existing discard/refresh controls. Produces internal `SidebarStore.registerEditorGuard(sessionId: string, tabId: string, guard: { isDirty(): boolean; onBlocked(): void }): () => void`. Guard registry is transient, scoped by session + tab and registration identity; it is never serialized. Add local `editorMountKey(state: SidebarState, tabId: string): string | undefined` to describe the actual React parent chain (tree root, ancestor split IDs, leaf or float ID, file path). No other task imports these.

**Approved containment:** block dirty destructive close/reparent operations before state publication. Show save/discard-and-retry guidance through the existing unsaved Modal; cancellation performs no mutation. Explicit discard reloads current editor, and the user retries the move. A saved editor moves normally. Same-parent reorder and float geometry changes must not spuriously clear a draft. Conservative blocking when a sibling change would remount a dirty pane is intentional; undo preservation across clean remounts is not required.

- [ ] **Step 1: Add RED movement tests against the real store.** Import `SidebarStore`, `firstLeaf`, `floatTab`, `dockFloat`, `moveTab`, `moveTabToEdge`, `closeTab` and `makeDefaultState` from `state.ts`. Use direct store reductions used by the menu/drag callers. Add this first regression (optional registration call allows the pre-fix store to reach an assertion rather than fail on a missing method):

Install these **test-local** browser globals in `tests/editor-movement.test.ts` before constructing any store, calling setSession or reducing state. Plain Vitest uses Node; `schedulePersist` calls window timers and state loading reads location/localStorage. Use fake timers and in-memory Storage, not a DOM dependency or a production shim:

```ts
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.useFakeTimers();
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() { return values.size; },
    clear: () => { values.clear(); },
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', {
    innerWidth: 1280, innerHeight: 800,
    location: { search: '', href: 'http://sidebar.fixture.invalid/' },
    localStorage: storage,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  });
});

afterEach(() => {
  vi.clearAllTimers(); // Cancel store persistence before removing its globals.
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('blocks a dirty editor float before its pane is destroyed', () => {
  const store = new SidebarStore() as SidebarStore & {
    registerEditorGuard?: (session: string, tab: string, guard: {
      isDirty(): boolean; onBlocked(): void;
    }) => () => void;
  };
  store.setSession('session-a');
  store.reduce(s => ({ ...s, splits: {
    kind: 'leaf', id: 'pane-a', active: 'editor:a',
    tabs: [{ id: 'editor:a', type: 'editor', title: 'a.txt', path: '/fixture/a.txt' }],
  } }));
  // Setup must reach a valid persisted store before testing movement.
  vi.advanceTimersByTime(200);
  expect(localStorage.getItem('dsh-sidebar:v1:session-a')).not.toBeNull();
  let dirty = true;
  let blocked = 0;
  store.registerEditorGuard?.('session-a', 'editor:a', {
    isDirty: () => dirty, onBlocked: () => { blocked += 1; },
  });
  const before = store.getSnapshot().state;
  store.reduce(s => floatTab(s, 'editor:a', 400, 300));
  expect(store.getSnapshot().state).toBe(before);
  expect(blocked).toBe(1);
  dirty = false;
  store.reduce(s => floatTab(s, 'editor:a', 400, 300));
  expect(store.getSnapshot().state?.floats[0]?.tab.id).toBe('editor:a');
});
```

The load-bearing assertion is unchanged actual store state, not a pretend rendered text assertion. In the same fixture add table cases for close (service and reducer), dock of an already floating dirty editor, cross-pane `moveTab`, each edge/center drop, document drag-out float, and same-parent reorder. Explicitly test two sessions sharing a tab ID, stale registration cleanup, a clean sibling's move collapsing a dirty editor's ancestor, and `reduceFor`/`update` publication. For every blocked action assert no persist notification and no descriptor `onClose`; for save/discard retry assert actual new placement. Add one callback-wiring regression through the existing editor seam if it can run without new DOM dependencies; otherwise record rendered TextEditor/Modal coverage pending, not fabricated DOM coverage.

- [ ] **Step 2: Run RED.** `pnpm --filter dsh-sidebar test tests/editor-movement.test.ts`. Expected baseline failure is specifically the `expect(store.getSnapshot().state).toBe(before)` movement assertion (the float was published), after setup persistence succeeded. A ReferenceError for window/localStorage, timer failure or setup rejection is not valid RED evidence: correct only the test-local fixture and rerun before production edits. After containment is implemented the same test must also reach `expect(blocked).toBe(1)` and clean-move assertions. Compile missing optional property types in tests via a local structural intersection, not production scaffolding before RED.
- [ ] **Step 3: Implement minimum guard.** Compute candidate state first, compare each registered dirty editor's mount key before/after, call its blocked callback and return without publishing when removal/reparenting occurs. Route all three store publication methods through the same local predicate. Registration disposers remove only their own registration. Register in EditorHost with a live ref updated synchronously by `onToolbarState`, not an effect one render late; unregister on unmount. Existing successful save dirtiness rules stay authoritative. Verify service close callbacks only run when `store.tabOpen(sessionId, tabId)` changed from true to false.

```ts
// In each publication path, after computing next and before memory/persist writes:
if (next === state || this.editorMutationBlocked(sessionId, state, next)) return;
// In editorMutationBlocked, never persist guard callbacks or editor text:
if (guard.isDirty() && editorMountKey(before, tabId) !== editorMountKey(after, tabId)) {
  guard.onBlocked();
  return true;
}
```

- [ ] **Step 4: Add preview RED cases.** Introduce `htmlPreviewResponseHeaders(path: string): Record<string,string>` as the sole registered preview-route header builder. Start assertions with optional export fallback to existing media headers if needed to observe MIME failure rather than an import error. Final tests import the real new helper directly.

```ts
it.each([
  ['style.css', 'text/css; charset=utf-8'],
  ['app.js', 'text/javascript; charset=utf-8'],
  ['module.mjs', 'text/javascript; charset=utf-8'],
  ['index.html', 'text/html; charset=utf-8'],
])('serves preview %s with usable MIME and opaque-origin CSP', (path, mime) => {
  const headers = htmlPreviewResponseHeaders(path);
  expect(headers['content-type']).toBe(mime);
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['content-security-policy']).toContain('sandbox allow-scripts');
  expect(headers['content-security-policy']).not.toContain('allow-same-origin');
  expect(headers['content-security-policy']).toContain("object-src 'none'");
  expect(mediaResponseHeaders('attack.html')['content-disposition']).toMatch(/^attachment;/);
});
```

- [ ] **Step 5: Correct preview map only.** Map CSS/JS/MJS explicitly, reuse media types for passive resources, retain unknown octet-stream fallback and HTML charset. Preserve route fence, GET-only, workspace realpath/size checks, opaque-origin CSP and iframe sandbox. In boundary integration use fake request/response objects and temporary files to invoke the **registered** `/sidebar/html` handler; assert CSS/JS response headers plus 403 for untrusted privileged API requests. Do not loosen Origin handling to make opaque-frame fetch work.
- [ ] **Step 6: GREEN and source/build gate.** `pnpm --filter dsh-sidebar test tests/editor-movement.test.ts tests/editor-truncation.test.ts tests/media-security.test.ts tests/boundary-integration.test.ts`; `pnpm --filter dsh-sidebar typecheck`; inspect diagnostics, then `pnpm --filter dsh-sidebar build`. Capture working-tree diff and report for parent reviewer. Browser relative CSS/classic-script execution and parent/session-access denial remain pending.

### Task 2: Board lifecycle and execution identity (B1, B2)

**Mandatory isolation before this task’s commands**

```bash
cd /Users/codepi/Coding/dsh-plugins/.worktrees/cr-hardening || exit 1
# Source only from the authorized worktree root. Never copy user config/credentials.
[ "$PWD" = /Users/codepi/Coding/dsh-plugins/.worktrees/cr-hardening ] || exit 1
SAFE_ROOT="$PWD/.superpowers/sdd/2026-09-05-cr-hardening-plan/isolated"
mkdir -p "$SAFE_ROOT"/{home,dsh,config,cache,data,state,runtime,tmp,npm-cache,pnpm-store}
export HOME="$SAFE_ROOT/home" DSH_HOME="$SAFE_ROOT/dsh"
export XDG_CONFIG_HOME="$SAFE_ROOT/config" XDG_CACHE_HOME="$SAFE_ROOT/cache"
export XDG_DATA_HOME="$SAFE_ROOT/data" XDG_STATE_HOME="$SAFE_ROOT/state"
export XDG_RUNTIME_DIR="$SAFE_ROOT/runtime"
export npm_config_userconfig="$SAFE_ROOT/npmrc" NPM_CONFIG_USERCONFIG="$SAFE_ROOT/npmrc"
export npm_config_globalconfig="$SAFE_ROOT/global-npmrc" NPM_CONFIG_GLOBALCONFIG="$SAFE_ROOT/global-npmrc"
export npm_config_cache="$SAFE_ROOT/npm-cache" npm_config_store_dir="$SAFE_ROOT/pnpm-store"
touch "$SAFE_ROOT/npmrc" "$SAFE_ROOT/global-npmrc"

# Approved exclusive external fixture root preserves non-repository semantics.
FIXTURE_ROOT=$(cat "$PWD/.superpowers/sdd/2026-09-05-cr-hardening-plan/fixture-root.txt")
case "$FIXTURE_ROOT" in /private/tmp/dsh-cr-hardening-tests.*) ;; *) exit 1 ;; esac
[ -d "$FIXTURE_ROOT" ] || exit 1
export TMPDIR="$FIXTURE_ROOT" TMP="$FIXTURE_ROOT" TEMP="$FIXTURE_ROOT"
export GIT_CEILING_DIRECTORIES="$FIXTURE_ROOT"
```

**Task safety:** Single writer; no nested subagents, staging/commits, service operations, real home/login/credentials, dependency changes or 3080/3081 listeners. Preserve prior uncommitted tracked and untracked changes; capture actual diffs for review, never HEAD..HEAD. Tests are fake/temporary only; live acceptance pending. Full Global Constraints apply.

**Files and ownership**

- Modify `plugins/xtz-ui/src/index.ts:32–59,70–85`: keep board instance on unrelated settings changes; serialize only actual board enable/disable transitions.
- Modify `src/board/service.ts:60–65,86–106,136–180`, `src/board/runner.ts:43–93`, `src/board/ledger.ts:124–176`.
- Extend `plugins/xtz-ui/tests/board-service.test.ts`, `board-runner.test.ts`, `board.test.ts`; add `tests/board-lifecycle.test.ts` to exercise real host settings route and service wiring. Read `board/live.ts`, `board/routes.ts`, `host-routes.ts`, `board/store.ts`; keep public routes/task schema unchanged.

**Interfaces**

Consumes `sessions.create/rename/prompt/list/cancel` RPC envelopes, not raw upstream APIs. Preserve `BoardService.run(id): TaskRecord[]`, `cancel(id): Promise<TaskRecord[]>`, `settleRun(...)` signature. Extend internal `launchTask(apiRaw, input, lifecycle?: { onCreated(sessionId: string): void; shouldPrompt(): boolean }): Promise<string>`; onCreated persists ownership **before** rename/prompt awaits. `dispose(): Promise<void>` stops accepting runs/ticks immediately, retains launch promises, drains them and handles accepted execution cancellation. Parent host must retain service ownership until draining ends. **Early sessionId is ownership, not readiness:** keep a per-execution launch entry from before the first create await through rename/prompt resolution. A local `LaunchOwnership` entry contains `taskId: string`, `executionId: string`, `sessionId?: string`, `launching: boolean`, `cancelRequested: boolean`, `promptStarted: boolean`, `launchPromise: Promise<void>` (the raw launch phase only), and `cancelPromise?: Promise<void>` (the separate cancellation/drain operation). This is local service lifetime state, not a new persisted task schema. Exclude entries with `launching`, cancellation in progress, or unresolved cancellation intent from terminal polling, including revalidation after any already-issued poll returns. `shouldPrompt()` must re-read the current task/execution and return true only when IDs/session match this entry, the task is running, the execution is open, no cancellation intent exists, and service is not disposed. Run that final guard immediately before prompt invocation with no intervening await; mark promptStarted at that boundary. No Task 3–6 consumption.

- [ ] **Step 1: Reproduce settlement mutation in ledger tests.** Use existing `createTask/openRun/settleRun`; no test-only service method.

```ts
it('ignores E1 success after E1 cancel and E2 start', () => {
  const initial = createTask([], { title: 'Task', prompt: 'Work' }, 1);
  const id = initial[0]!.id;
  const e1 = openRun(initial, id, 2);
  const cancelled = settleRun(e1.tasks, id, e1.executionId, 'cancelled', 'cancelled by user', 3);
  const e2 = openRun(cancelled, id, 4);
  const late = settleRun(e2.tasks, id, e1.executionId, 'succeeded', undefined, 5);
  expect(late[0]!.status).toBe('running');
  expect(late[0]!.executions[0]).toMatchObject({ result: 'cancelled', endedAt: 3 });
  expect(late[0]!.executions[1]).toMatchObject({ id: e2.executionId });
  expect(late[0]!.executions[1]!.endedAt).toBeUndefined();
});
```

Add duplicate settlement with conflicting outcomes; unknown execution ID must not change task status/timestamp. Add controlled service poll → cancel E1 → start E2 → resolve old list. Hold list with `Promise.withResolvers`, advance fake timers, assert list was entered before cancelling; return `{result:{ok:true,value:{items:[{sessionId:'s1',running:false}]}}}` and assert E2 remains running. Repeat overlapping list requests and delayed old cancellation. Include persisted `loadBoard` assertions, not memory alone.

- [ ] **Step 2: Repair the false-positive late-disposal fixture and observe RED.** Replace the old test that expects ownership to be dropped; supply every API method actually required by `asApi` and assert entry:

```ts
it('does not prompt after disposal during session creation', async () => {
  const created = Promise.withResolvers<ReturnType<typeof ok<{sessionId:string}>>>();
  const create = vi.fn(() => created.promise);
  const prompt = vi.fn(async () => ok({ accepted: true }));
  const cancel = vi.fn(async () => ok({ accepted: true }));
  const api = { sessions: { create, rename: async () => ok({}), prompt,
    list: async () => ok({ items: [] }), cancel } };
  const home = env();
  const service = new BoardService({ apiProxy: api, workspaceRegistry: undefined }, home);
  const id = service.create({ title: 'Task', prompt: 'Work' })[0]!.id;
  service.run(id);
  expect(create).toHaveBeenCalledOnce();
  const disposing = service.dispose();
  created.resolve(ok({ sessionId: 'late-session' }));
  await disposing;
  await new Promise(resolve => setImmediate(resolve));
  expect(prompt).not.toHaveBeenCalled();
  expect(loadBoard(home)[0]!.executions[0]!.sessionId).toBe('late-session');
});
```

A separate deferred **prompt** test proves prompt entered before disposal, cancellation called for exactly that session, and drain waits for cancellation acknowledgement. On cancel rejection/unavailable result retain session ID + running/uncertain ownership, do not stamp `cancelled` or allow blind retry. Tests must not pass just because create was never reached. Observe expected failures with `pnpm --filter dsh-xtz-ui test tests/board.test.ts tests/board-service.test.ts tests/board-runner.test.ts`.

- [ ] **Step 2a: Protect early ownership from idle-session polling.** Add this test-local fixture and the following regressions to `board-service.test.ts`, reusing its real `env()`, `ok()`, `BoardService` and `loadBoard`. All RPC doubles carry the real result envelope. The list double intentionally offers `running:false` for s1 during launch; a correct scheduler excludes that execution rather than asking inspectSession to interpret an idle pre-prompt session as finished. After acceptance the same real poll path must resume, proving the test did not merely disable polling globally.

```ts
function pendingLaunchFixture(hold: 'rename' | 'prompt') {
  const renameGate = Promise.withResolvers<ReturnType<typeof ok<{}>>>();
  const promptGate = Promise.withResolvers<ReturnType<typeof ok<{ accepted: true }>>>();
  const firstCancel = Promise.withResolvers<ReturnType<typeof ok<{ accepted: true }>>>();
  const secondCancel = Promise.withResolvers<ReturnType<typeof ok<{ accepted: true }>>>();
  let nextSession = 0;
  let idle = true;
  const create = vi.fn(async () => ok({ sessionId: `s${++nextSession}` }));
  const rename = vi.fn(async (req: { payload: { sessionId: string } }) => {
    if (req.payload.sessionId === 's1' && hold === 'rename') return renameGate.promise;
    return ok({});
  });
  const prompt = vi.fn(async (req: { payload: { sessionId: string } }) => {
    if (req.payload.sessionId === 's1') return promptGate.promise;
    return ok({ accepted: true as const });
  });
  const list = vi.fn(async () => ok({ items: [
    { sessionId: 's1', running: !idle }, { sessionId: 's2', running: true },
  ] }));
  let cancelCount = 0;
  const cancel = vi.fn(async (_req: { payload: { sessionId: string } }) => {
    cancelCount += 1;
    return cancelCount === 1 ? firstCancel.promise
      : cancelCount === 2 ? secondCancel.promise : ok({ accepted: true as const });
  });
  const home = env();
  const service = new BoardService({
    apiProxy: { sessions: { create, rename, prompt, list, cancel } },
    workspaceRegistry: undefined,
  }, home, () => 1000);
  const id = service.create({ title: 'Task', prompt: 'Work' })[0]!.id;
  return {
    service, home, id, create, rename, prompt, list, cancel,
    renameGate, promptGate, firstCancel, secondCancel,
    accepted: () => { idle = false; },
    async cleanup() {
      renameGate.resolve(ok({}));
      promptGate.resolve(ok({ accepted: true }));
      firstCancel.resolve(ok({ accepted: true }));
      secondCancel.resolve(ok({ accepted: true }));
      await service.dispose();
    },
  };
}

it.each(['rename', 'prompt'] as const)('does not settle an idle session while %s is pending', async hold => {
  vi.useFakeTimers();
  const f = pendingLaunchFixture(hold);
  try {
    f.service.run(f.id);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.create).toHaveBeenCalledOnce();
    expect(f.rename).toHaveBeenCalledOnce();
    expect(f.prompt).toHaveBeenCalledTimes(hold === 'prompt' ? 1 : 0);
    expect(loadBoard(f.home)[0]!.executions[0]!.sessionId).toBe('s1');
    f.service.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.list).not.toHaveBeenCalled();
    expect(loadBoard(f.home)[0]!.status).toBe('running');
    expect(loadBoard(f.home)[0]!.executions[0]!.endedAt).toBeUndefined();
    f.renameGate.resolve(ok({}));
    await vi.advanceTimersByTimeAsync(0);
    expect(f.prompt).toHaveBeenCalledOnce();
    f.accepted();
    f.promptGate.resolve(ok({ accepted: true }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.list).toHaveBeenCalled();
    expect(loadBoard(f.home)[0]!.status).toBe('running');
  } finally {
    await f.cleanup();
  }
});
```

Extend the suite's existing afterEach to clear fake timers before useRealTimers and remove its owned temporary homes; every deferred fixture uses try/finally to release gates and dispose even on assertion failure. If intentionally testing uncertain disposal, observe/reject that promise explicitly and catch only in fixture cleanup, not in assertions. Original source may first fail the early-sessionId assertion: record that RED for early ownership, then require **all** poll assertions to pass after correction; removing the launch exclusion must fail the idle-session cases. Do not satisfy them by delaying sessionId persistence until prompt returns.

- [ ] **Step 2b: Cancel intent must fence deferred rename before RPC acknowledgement.** This ordering catches a shouldPrompt guard that checks only disposal or terminal settlement. E2 cannot start while E1 still owns unresolved work. Cancellation may settle only after the rename path is safely unwound and acknowledgement is known.

```ts
it('records cancel intent before awaiting RPC and never prompts E1 after rename', async () => {
  vi.useFakeTimers();
  const f = pendingLaunchFixture('rename');
  try {
    const e1 = f.service.run(f.id)[0]!.executions[0]!.id;
    await vi.advanceTimersByTimeAsync(0);
    expect(f.create).toHaveBeenCalledOnce();
    expect(f.rename).toHaveBeenCalledOnce();
    expect(loadBoard(f.home)[0]!.executions[0]!.sessionId).toBe('s1');
    let settled = false;
    const cancelling = f.service.cancel(f.id).then(value => { settled = true; return value; });
    void cancelling.catch(() => undefined); // Observe immediately; still await original below.
    await vi.advanceTimersByTimeAsync(0);
    expect(f.cancel).toHaveBeenCalledOnce();
    expect(f.cancel.mock.calls[0]![0].payload.sessionId).toBe('s1');
    f.renameGate.resolve(ok({})); // Cancel RPC is still pending here.
    await vi.advanceTimersByTimeAsync(0);
    expect(f.prompt).not.toHaveBeenCalled();
    expect(settled).toBe(false);
    expect(loadBoard(f.home)[0]!.executions[0]!.endedAt).toBeUndefined();
    expect(() => f.service.run(f.id)).toThrow('task is running');
    f.firstCancel.resolve(ok({ accepted: true }));
    await cancelling;
    expect(loadBoard(f.home)[0]!.executions[0]).toMatchObject({ id: e1, sessionId: 's1', result: 'cancelled' });
    f.service.run(f.id);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.prompt.mock.calls.map(([req]) => req.payload.sessionId)).toEqual(['s2']);
    f.service.start();
    await vi.advanceTimersByTimeAsync(5000);
    const task = loadBoard(f.home)[0]!;
    expect(task.status).toBe('running');
    expect(task.executions[0]).toMatchObject({ id: e1, result: 'cancelled' });
    expect(task.executions[1]).toMatchObject({ sessionId: 's2' });
    expect(task.executions[1]!.endedAt).toBeUndefined();
  } finally {
    await f.cleanup();
  }
});
```

- [ ] **Step 2c: Prompt acceptance racing cancel requires awaited re-cancellation.** An acknowledgement delivered before the held prompt is accepted does not prove that later accepted work stopped. Keep ownership and cancellation intent across that await; the second cancellation targets s1 only. Test both acknowledged and uncertain second cancellation, with actual create/rename/prompt/cancel entry and durable outcomes:

```ts
it.each(['acknowledged', 'uncertain'] as const)('retains E1 through prompt acceptance and %s re-cancel', async outcome => {
  vi.useFakeTimers();
  const f = pendingLaunchFixture('prompt');
  try {
    const e1 = f.service.run(f.id)[0]!.executions[0]!.id;
    await vi.advanceTimersByTimeAsync(0);
    expect(f.create).toHaveBeenCalledOnce();
    expect(f.rename).toHaveBeenCalledOnce();
    expect(f.prompt).toHaveBeenCalledOnce();
    let settled = false;
    const cancelling = f.service.cancel(f.id).then(value => { settled = true; return value; });
    void cancelling.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.cancel).toHaveBeenCalledOnce();
    f.firstCancel.resolve(ok({ accepted: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    expect(() => f.service.run(f.id)).toThrow('task is running');
    f.accepted();
    f.promptGate.resolve(ok({ accepted: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(f.cancel).toHaveBeenCalledTimes(2);
    expect(f.cancel.mock.calls.map(([req]) => req.payload.sessionId)).toEqual(['s1', 's1']);
    expect(loadBoard(f.home)[0]!.executions[0]!.endedAt).toBeUndefined();
    expect(settled).toBe(false);
    if (outcome === 'uncertain') {
      f.secondCancel.reject(new Error('synthetic cancel unavailable'));
      await expect(cancelling).rejects.toThrow();
      f.service.start();
      await vi.advanceTimersByTimeAsync(5000);
      expect(f.list).not.toHaveBeenCalled();
      expect(loadBoard(f.home)[0]!.status).toBe('running');
      expect(loadBoard(f.home)[0]!.executions[0]).toMatchObject({ id: e1, sessionId: 's1' });
      expect(loadBoard(f.home)[0]!.executions[0]!.endedAt).toBeUndefined();
      expect(() => f.service.run(f.id)).toThrow('task is running');
      expect(f.create).toHaveBeenCalledOnce();
    } else {
      f.secondCancel.resolve(ok({ accepted: true }));
      await cancelling;
      expect(loadBoard(f.home)[0]!.executions[0]).toMatchObject({ id: e1, result: 'cancelled' });
      f.service.run(f.id);
      await vi.advanceTimersByTimeAsync(0);
      expect(loadBoard(f.home)[0]!.status).toBe('running');
      expect(loadBoard(f.home)[0]!.executions[1]).toMatchObject({ sessionId: 's2' });
      expect(f.cancel.mock.calls.map(([req]) => req.payload.sessionId)).toEqual(['s1', 's1']);
    }
  } finally {
    await f.cleanup().catch(() => undefined); // Only cleanup may observe uncertain drain failure.
  }
});
```

Repeat the intent-before-await ordering with first cancel RPC failure while rename is held: no later E1 prompt, no terminal success and no E2 launch on uncertainty. Keep existing old-poll/old-cancel → E2 tests, now checking the launch and cancellation ownership predicates after awaits as well as execution ID. These prescriptions are future RED/GREEN work; no test has been added or executed in this planning amendment.

- [ ] **Step 3: Minimal settlement correction.** Only settle an open execution; only change task status for its current active execution. Revalidate active task/execution/session **and launch/cancellation phase** after every poll/cancel await. Poll selection must exclude still-launching executions before issuing inspection; an older already-issued inspection returning running:false must also be ignored if launch/cancellation ownership now disallows settlement. Cancellation finalization alone may settle its own current cancelled execution after safe drain; ordinary poll success cannot override cancellation intent. A stale/no-op result must not cause a persistence write. Keep first terminal result immutable.

```ts
const current = [...task.executions].reverse().find(e => e.endedAt === undefined);
if (current?.id !== executionId || task.status !== 'running') return task;
// Existing map/status calculation now runs only for this open current execution.
```

- [ ] **Step 4: Track launch ownership and drain user cancellation/disable together.** Create the ownership entry synchronously before starting asynchronous launch, attach immediately in onCreated, and keep launching=true through rename and prompt response. Before sending prompt, shouldPrompt revalidates current task/execution/session, open nonterminal state, cancellation intent and disposal. If it refuses, unwind launch without prompting or publishing success. For `cancel(id)` and disposal, set this entry's cancelRequested **before the first await**, not after cancellation RPC or settleRun. The same idempotent per-execution cancelPromise owns RPC, raw launch drain and any necessary re-cancel. An early RPC may stop already accepted work; if prompt was in flight and its acceptance can occur afterward, await its resolution and then await a second cancel acknowledgement before terminal cancellation. Do not mark ready/pollable or release the entry in a generic launch finally while cancellation is pending or uncertain. Await the raw launchPromise from the cancellation path, never a launch wrapper that itself awaits cancelPromise (self-deadlock). Revalidate IDs after every await so E1 cannot settle or cancel E2. Only a safely resolved uncancelled launch becomes pollable. On failed/unknown cancellation, reject the caller with safe error, retain sessionId/running ownership and cancellation intent, exclude it from terminal polling and disallow E2/retry until cancellation is actually resolved. Host disable/re-enable must retain that owner rather than install a second writer. `run` rejects disposed services. No persisted task schema or global lifecycle framework is introduced.
- [ ] **Step 5: Host settings lifecycle regression.** Mount real `apply` with fake `ctx.inject`, `ctx.effect`, `ctx.get('apiProxy')`, a WebServer collecting registered routes and a temporary DSH_HOME. Send POST JSON via `Readable.from([JSON.stringify({archive:false})])` with trusted loopback Host/Origin headers to the captured settings handler. Start board work through the captured board run route, hold create/prompt, toggle archive/gitGraph/announceToAgent, release it, and GET board to assert one tracked execution and no cancellation/recreate. Toggle actual board off/on while drain is pending; assert routes do not install a second writer until drain ends. Disposal callback awaits/observes drain; sync settings response can remain sync while a local transition promise owns pending work. Keep archive/graph remount behavior otherwise unchanged.
- [ ] **Step 6: GREEN and review.** Run `pnpm --filter dsh-xtz-ui test tests/board.test.ts tests/board-service.test.ts tests/board-runner.test.ts tests/board-lifecycle.test.ts tests/board-routes.test.ts`; then `pnpm --filter dsh-xtz-ui typecheck` before `pnpm --filter dsh-xtz-ui build`. Report uncertainty outcomes explicitly; capture actual diff. Live Harness cancellation semantics are not proved by mocks and remain pending.

### Task 3: CLI lifecycle, distribution and engineering gates (C1–C5)

**Mandatory isolation before this task’s commands**

```bash
cd /Users/codepi/Coding/dsh-plugins/.worktrees/cr-hardening || exit 1
# Source only from the authorized worktree root. Never copy user config/credentials.
[ "$PWD" = /Users/codepi/Coding/dsh-plugins/.worktrees/cr-hardening ] || exit 1
SAFE_ROOT="$PWD/.superpowers/sdd/2026-09-05-cr-hardening-plan/isolated"
mkdir -p "$SAFE_ROOT"/{home,dsh,config,cache,data,state,runtime,tmp,npm-cache,pnpm-store}
export HOME="$SAFE_ROOT/home" DSH_HOME="$SAFE_ROOT/dsh"
export XDG_CONFIG_HOME="$SAFE_ROOT/config" XDG_CACHE_HOME="$SAFE_ROOT/cache"
export XDG_DATA_HOME="$SAFE_ROOT/data" XDG_STATE_HOME="$SAFE_ROOT/state"
export XDG_RUNTIME_DIR="$SAFE_ROOT/runtime"
export npm_config_userconfig="$SAFE_ROOT/npmrc" NPM_CONFIG_USERCONFIG="$SAFE_ROOT/npmrc"
export npm_config_globalconfig="$SAFE_ROOT/global-npmrc" NPM_CONFIG_GLOBALCONFIG="$SAFE_ROOT/global-npmrc"
export npm_config_cache="$SAFE_ROOT/npm-cache" npm_config_store_dir="$SAFE_ROOT/pnpm-store"
touch "$SAFE_ROOT/npmrc" "$SAFE_ROOT/global-npmrc"

# Approved exclusive external fixture root preserves non-repository semantics.
FIXTURE_ROOT=$(cat "$PWD/.superpowers/sdd/2026-09-05-cr-hardening-plan/fixture-root.txt")
case "$FIXTURE_ROOT" in /private/tmp/dsh-cr-hardening-tests.*) ;; *) exit 1 ;; esac
[ -d "$FIXTURE_ROOT" ] || exit 1
export TMPDIR="$FIXTURE_ROOT" TMP="$FIXTURE_ROOT" TEMP="$FIXTURE_ROOT"
export GIT_CEILING_DIRECTORIES="$FIXTURE_ROOT"
```

**Task safety:** Single writer; no nested subagents, staging/commits, service operations, real home/login/credentials, dependency changes or 3080/3081 listeners. Preserve prior uncommitted tracked and untracked changes; capture actual diffs for review, never HEAD..HEAD. Tests are fake/temporary only; live acceptance pending. Full Global Constraints apply.

**Files and ownership**

- Modify `apps/cli/src/app.ts:465–469,800–837,1169–1175,1335–1618`; inspect `runtime.ts` generation-aware signalling, `service.ts` record schema and reconciliation lock helpers. Modify those helpers only where ownership cleanup requires it.
- Modify `apps/cli/src/plugin-spec.ts`; export manifest validator from `src/index.ts` for tests without weakening existing install-argument API.
- Extend `apps/cli/tests/cli.test.mjs`, preserving its in-memory `fakeDependencies`, `VALID_PID_RECORD`, `PRESERVED_PROFILE_OBJECT` fixtures; retain existing `runtime.test.mjs` process identity checks.
- Modify `scripts/sandbox-web.mjs:320–364`; extend `scripts/sandbox-dev.test.mjs` using injected `run`, never `spawnSandboxWeb`.
- Modify `.github/workflows/publish.yml`; create `scripts/publish-policy.mjs`, `scripts/publish-policy.test.mjs`. Update only contradictory release instructions in `docs/workflow.md` and `docs/workflow.zh.md` (manual dispatch packs, cannot publish or prove OIDC).

**Interfaces**

Consumes existing `CliDependencies`, `WebPidRecord {pid,startedAt,identity?}`, `AcquiredReconcileLock`, `stopPid(pid,identity)`, `probe(port)`, and exact default specs. Produce local `clearWebPidIfCurrent(deps, expected: WebPidRecord): Promise<boolean>` called with lifecycle lock held in official paths. Compare all three record fields, not PID alone. Preserve `runCli` and runtime public contracts. Add `manifestDependencyError(spec: string): string | null`; keep `installSpecError` unchanged. Add `releaseDecision(input: {eventName:string; ref:string; packageName:string; packageVersion:string; productVersion:string; containedInMain:boolean}): 'publish' | 'dry-run'` and CLI policy invocation from Actions. No later task consumes these interfaces.

- [ ] **Step 1: RED explicit alternate-port identity refusal.** Add to current CLI test file (uses actual existing fixtures):

```js
test('alternate official port refuses unowned preferred identity before preparation', async () => {
  const ports = [];
  const fake = fakeDependencies({
    probe: async (port) => {
      ports.push(port);
      return { state: port === 3080 ? 'running' : 'stopped', healthy: port === 3080,
        host: '127.0.0.1', port, url: `http://127.0.0.1:${port}/`,
        owner: port === 3080 ? 'xiaotaozi' : 'none' };
    },
  });
  assert.equal(await runCli(['start', '--port', '3082', '--no-open'], fake.dependencies), 2);
  assert.equal(fake.calls.length, 0);
  assert.equal(fake.spawned.length, 0);
  assert.equal(fake.copiedProfiles.length, 0);
  assert.equal(fake.writes.some(({path}) => path.includes('/profiles/') || path.endsWith(XTZ_STAMP_FILE)), false);
  assert.equal(ports.includes(3080), true);
  assert.equal(ports.includes(3081), false);
});
```

Lock contender writes are allowed; profile/stamp/default preparation is not. Test with stale/reused PID record too. Preserve refusal for unknown occupied ports and normal alternate startup when 3080 is non-Xiaotaozi.

- [ ] **Step 2: RED ownership cleanup with barriers.** In fake dependencies set `files[HOME/WEB_PID_FILE]=VALID_PID_RECORD`; override `stopPid` to resolve an entered barrier then await a release barrier. Start stop, wait for entry, start concurrent start on the same fake deps, and assert no spawn until ownership lock is released (contender refusal is also allowed). Release stop, then start/retry; assert replacement record survives. Add the direct cleanup race below; no real signals:

```js
test('stop never removes a replacement PID generation after await', async () => {
  const next = JSON.stringify({ pid: 4343, startedAt: 'later', identity: 'next-generation' });
  const fake = fakeDependencies({ processAlive: pid => pid === 4242,
    processIdentity: async () => PROCESS_IDENTITY });
  fake.files.set(`${HOME}/${WEB_PID_FILE}`, VALID_PID_RECORD);
  fake.dependencies.stopPid = async () => {
    fake.files.set(`${HOME}/${WEB_PID_FILE}`, next);
    return 'stopped';
  };
  await runCli(['stop'], fake.dependencies);
  assert.equal(fake.files.get(`${HOME}/${WEB_PID_FILE}`), next);
});
```

Reuse existing fake `processAlive/processIdentity` overrides so ownership is positively validated. Foreground test uses a deferred `spawned.closed`: await ready/startup-lock release, write a replacement generation, resolve old child exit, and assert record retained. Cover same PID/different identity, same PID+identity/different startedAt, restart cleanup, readiness failure and unknown identity (zero stop signals). Run typecheck → build before each CLI test run because tests import `lib/index.js`; test additions are not product changes. Command: `pnpm --dir apps/cli typecheck && pnpm --dir apps/cli build && (cd apps/cli && node --test tests/cli.test.mjs)`; record expected RED cases.

- [ ] **Step 3: Correct lock and cleanup flow.** Acquire existing lifecycle lock for official stop; no nested acquisition when restart already holds it. Condition every `clearWebPid` call on its captured record. Foreground exit reacquires lifecycle lock after startup releases it, rereads current record and clears only exact match; preserve record and report lock acquisition failure. Do not hold the startup lock for the lifetime of the foreground child. Keep runtime's identity checks before TERM and escalation unchanged. Before `ensureOfficialProfile`/spawn under startup lock, probe preferred official 3080 even when requested/remembered target differs; refuse verified unowned Xiaotaozi there.

```ts
const current = parseWebPidRecord(await deps.readText(pidPath(deps.home)));
if (current?.pid !== expected.pid || current.startedAt !== expected.startedAt
  || current.identity !== expected.identity) return false;
await deps.removePath(pidPath(deps.home));
return true;
```

- [ ] **Step 4: RED manifest context tests.** Table-drive `^1.2.3`, `~1.2.3`, exact `1.2.3`, prerelease `1.2.3-rc.1`, `>=1.2.3 <2.0.0`, `1.x`, `*`, `latest`, and safe Git specs through manifest validation; reject `~/plugin`, `~`, `../plugin`, absolute POSIX/Windows paths, `link:`, `file:`, `workspace:`, `npm:`, `https:`, leading/trailing whitespace and malformed ranges. Preserve install-argument rejection of standalone caret/tilde strings.

```js
for (const range of ['^1.2.3', '~1.2.3']) {
  test(`start preserves legitimate registry manifest ${range}`, async () => {
    const fake = fakeDependencies();
    fake.files.set(PROFILE_PACKAGE, JSON.stringify({ ...PRESERVED_PROFILE_OBJECT,
      dependencies: { ...CURRENT_DEFAULT_DEPENDENCIES, [THIRD_PARTY_PLUGIN]: range } }));
    let launched = false;
    const spawn = fake.dependencies.spawnWeb;
    fake.dependencies.spawnWeb = async (...args) => { launched = true; return spawn(...args); };
    fake.dependencies.probe = async (port) => ({ state: launched ? 'running' : 'stopped',
      healthy: launched, host: '127.0.0.1', port, url: `http://127.0.0.1:${port}/`,
      owner: launched ? 'xiaotaozi' : 'none' });
    assert.equal(await runCli(['start', '--no-open'], fake.dependencies), 0);
    assert.equal(JSON.parse(fake.files.get(PROFILE_PACKAGE)).dependencies[THIRD_PARTY_PLUGIN], range);
  });
}
```

Repeat via `doctor --json` and existing old-profile reconciliation fixture: simulate default plugin installation with real in-memory manifest update, retain third-party range/bundle and byte-preserved user files. Use fake required installed-package paths from current preservation tests, not assertions on a validator alone.

- [ ] **Step 5: Minimal source-aware validator.** Validate Git specs with existing Git grammar. For registry manifest values implement a small conservative range grammar: numeric/x/* components with optional prerelease/build; optional ^/~ or comparison operator; whitespace conjunctions and `||` alternatives; valid tag names separately. Validate each token completely and reject unsupported protocols/local paths before treating anything as a tag; only manifest `~` followed by a numeric version is a tilde range. Do not reuse install-argument leading-tilde path rejection blindly. Use this validator at profile inspection and upgrade preservation; exact `DEFAULT_PLUGINS` mismatch checks remain separate and unchanged.
- [ ] **Step 6: RED stale helper rebuild, then unconditional supervisor-start build.** Existing `ensureXtzCli` accepts injected `run`. Test warm output exists and call twice; both calls must include `['typecheck']` then `['build']`, without starting a child or changing source mtimes. Add an optional `cliDir` seam to point the helper at a temporary copied minimal CLI fixture; create `src/runtime.ts` and a newer `lib/cli.js`, then change only helper bytes and call again. Assert injected build observes changed helper bytes and helper returns expected fixture cli path. No dependency install callback should be reached when fake DSH package marker exists.

```js
const calls = [];
await ensureXtzCli({ cliDir, run: async args => { calls.push(args); } });
assert.deepEqual(calls, [['typecheck'], ['build']]);
```

Delete partial mtime invalidation; keep install-if-missing behavior but frozen lockfile and explicit typecheck-before-build. Do not call this helper without injected run in the test.

- [ ] **Step 7: RED local release policy and workflow wiring.** Use `node:test` and the policy input below, expecting all manual dispatch values (including historical dry_run=false) to yield dry-run. Tag push must validate CLI package name, package/version/tag equality, strict `refs/tags/vX.Y.Z` and main containment; invalid push throws, not silently dry-runs.

```js
const valid = { eventName: 'push', ref: 'refs/tags/v0.5.0',
  packageName: 'xiaotaozi-dsh-cli', packageVersion: '0.5.0',
  productVersion: '0.5.0', containedInMain: true };
assert.equal(releaseDecision(valid), 'publish');
assert.equal(releaseDecision({ ...valid, eventName: 'workflow_dispatch', ref: 'refs/heads/topic' }), 'dry-run');
assert.throws(() => releaseDecision({ ...valid, containedInMain: false }));
assert.throws(() => releaseDecision({ ...valid, ref: 'refs/tags/v0.5.1' }));
assert.throws(() => releaseDecision({ ...valid, productVersion: '0.4.0' }));
assert.throws(() => releaseDecision({ ...valid, ref: 'refs/heads/main' }));
```

Test **consumption**, not source-line grep: extract the relevant YAML run blocks/conditions using existing script-policy conventions (or the already installed YAML parser if directly available; do not add dependencies), evaluate the small supported event/output expression set against push/manual/false/branch cases, invoke policy script with fake metadata and a fake git executable recording `merge-base --is-ancestor HEAD origin/main`, and substitute npm with a recorder. Assert manual reaches only `publish --dry-run`, invalid tag/main cases never reach npm, valid tag is the only real-publish branch. Fail tests on unknown condition grammar rather than treating it as true. Never execute the live OIDC block.

- [ ] **Step 8: Implement workflow gate.** Remove manual dry_run input (manual always packs). Checkout with sufficient main history; validate main containment in the policy step, emit `publish=true` only after all checks. Gate real Publish and OIDC proof/exchange to push + tag + validated policy output; manual skips OIDC exchange. Preserve workflow/job `id-token: write`, `unset NODE_AUTH_TOKEN`, no setup-node registry-url, and `npm@^11.5.1` on Node `22.19.0`. No global tool installs or publish commands are run locally.
- [ ] **Step 9: GREEN and review.** `node --test scripts/sandbox-dev.test.mjs scripts/publish-policy.test.mjs`; `pnpm check:cli`; `node scripts/check-manifest.mjs`; `git diff --check` under isolation. Confirm no manifest/lock drift and no sandbox source/watch/service execution. Release OIDC/main/tag live validation pending; local policy tests are not publication proof.

### Task 4: Provider protocols and authentication races (P1–P4)

**Mandatory isolation before this task’s commands**

```bash
cd /Users/codepi/Coding/dsh-plugins/.worktrees/cr-hardening || exit 1
# Source only from the authorized worktree root. Never copy user config/credentials.
[ "$PWD" = /Users/codepi/Coding/dsh-plugins/.worktrees/cr-hardening ] || exit 1
SAFE_ROOT="$PWD/.superpowers/sdd/2026-09-05-cr-hardening-plan/isolated"
mkdir -p "$SAFE_ROOT"/{home,dsh,config,cache,data,state,runtime,tmp,npm-cache,pnpm-store}
export HOME="$SAFE_ROOT/home" DSH_HOME="$SAFE_ROOT/dsh"
export XDG_CONFIG_HOME="$SAFE_ROOT/config" XDG_CACHE_HOME="$SAFE_ROOT/cache"
export XDG_DATA_HOME="$SAFE_ROOT/data" XDG_STATE_HOME="$SAFE_ROOT/state"
export XDG_RUNTIME_DIR="$SAFE_ROOT/runtime"
export npm_config_userconfig="$SAFE_ROOT/npmrc" NPM_CONFIG_USERCONFIG="$SAFE_ROOT/npmrc"
export npm_config_globalconfig="$SAFE_ROOT/global-npmrc" NPM_CONFIG_GLOBALCONFIG="$SAFE_ROOT/global-npmrc"
export npm_config_cache="$SAFE_ROOT/npm-cache" npm_config_store_dir="$SAFE_ROOT/pnpm-store"
touch "$SAFE_ROOT/npmrc" "$SAFE_ROOT/global-npmrc"

# Approved exclusive external fixture root preserves non-repository semantics.
FIXTURE_ROOT=$(cat "$PWD/.superpowers/sdd/2026-09-05-cr-hardening-plan/fixture-root.txt")
case "$FIXTURE_ROOT" in /private/tmp/dsh-cr-hardening-tests.*) ;; *) exit 1 ;; esac
[ -d "$FIXTURE_ROOT" ] || exit 1
export TMPDIR="$FIXTURE_ROOT" TMP="$FIXTURE_ROOT" TEMP="$FIXTURE_ROOT"
export GIT_CEILING_DIRECTORIES="$FIXTURE_ROOT"
```

**Task safety:** Single writer; no nested subagents, staging/commits, service operations, real home/login/credentials, dependency changes or 3080/3081 listeners. Preserve prior uncommitted tracked and untracked changes; capture actual diffs for review, never HEAD..HEAD. Tests are fake/temporary only; live acceptance pending. Full Global Constraints apply.

**Files and ownership**

- Modify `plugins/providers/src/providers/qwen.ts:80–95`, `openai-chat.ts:338–357`, `common.ts:249–359`, `auth/store.ts:116–123,164–177,201–235`, `auth/selection.ts:19–51`, `index.ts:148–158,436–448`.
- Extend `plugins/providers/tests/qwen.test.ts`, `openai-chat.test.ts`, `store.test.ts`, `selection.test.ts`; add `tests/token-manager.test.ts`. Update existing TokenManager test fixtures in `codex.test.ts`, `kimi.test.ts`, `image-generate.test.ts`, `video-generate.test.ts` only if required by corrected callback signatures; maintain all existing assertions.
- Read `paths.ts`, `providers/kimi.ts`, auth flow cancellation tests. No Market edits. Explicit-selection-path default-directory side effect belongs here under the supervisor amendment.

**Interfaces**

Reuse `toChatTools`, `toChatMessages` and `STREAM_CLOSED` LlmError. Preserve `getSession/saveSession/deleteSession` external signatures. Add auth-store `updateSessionIfCurrent<K extends ProviderId>(provider: K, expected: NonNullable<SessionMap[K]>, next: NonNullable<SessionMap[K]> | undefined, isCurrent: () => boolean, path?: string): Promise<boolean>`; undefined next means conditional delete. Compare accessToken, refreshToken and expiresAt without logging them, inside existing per-file serialized transaction. TokenManager gets atomic `saveIfCurrent(expected,next,isCurrent): Promise<boolean>` and `removeIfCurrent(expected,isCurrent): Promise<boolean>` callbacks rather than unsafe unconditional refresh callbacks; all construction sites use exactly these names. Login/logout still use ordinary serialized store writes. Selection retains `setPicked/clearPicked(...,path?): Promise<void>` with whole-file queue. No cross-plugin interfaces.

- [ ] **Step 1: Qwen request RED then forward tools.** Extend Qwen tests with `collect` and mocked fetch as in Kimi; use synthetic token manager with future expiry. Capture posted JSON, return two complete SSE events (content then `finish_reason:'stop'`).

```ts
async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const chunks: T[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}
const tokens = new TokenManager<QwenSession>({
  displayName: 'Test', preemptMs: 0,
  load: async () => ({ accessToken: 'synthetic', refreshToken: 'synthetic-r', expiresAt: 9e15 }),
  save: async () => undefined, remove: async () => undefined,
  refresh: async current => current, isPermanent: () => false,
});
const adapter = new QwenAdapter({ tokens, streamIdleTimeoutMs: 1_000 });
const bodies: Record<string, unknown>[] = [];
vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
  bodies.push(JSON.parse(String(init?.body)));
  return new Response('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n\n'
    + 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n');
});
await collect(adapter.stream({ provider: 'qwen', model: 'coder-model', messages: [],
  tools: [{ name: 'read', description: 'Read', parameters: { type: 'object' } }] }));
await collect(adapter.stream({ provider: 'qwen', model: 'coder-model', messages: [] }));
expect(bodies[0]?.tools).toEqual([{ type: 'function',
  function: { name: 'read', description: 'Read', parameters: { type: 'object' } } }]);
expect(bodies[1]).not.toHaveProperty('tools');
```

Import `vi` and restore fetch in afterEach with `vi.unstubAllGlobals()`. This pre-fix fixture uses current save/remove hooks; migrate them in Step 4 to atomic hooks without weakening assertions. Do not make a network request. Add tool-call/result continuation with `CallId('call_read')`: assert second posted messages contain assistant `tool_calls` and tool `tool_call_id:'call_read'`, then valid terminal completion. Implement `const tools = toChatTools(options.tools ?? [])` and `...(tools.length > 0 ? {tools} : {})` like Kimi.

- [ ] **Step 2: Partial EOF RED.** Existing `chatStream` appends [DONE]; add helper parameter to omit it and cover both [DONE]-without-finish and actual clean EOF. Expected failure is resolved successful finish, not fetch error.

```ts
it.each([
  { content: 'partial answer' },
  { tool_calls: [{ index: 0, id: 'call_partial', function: { name: 'read', arguments: '{"path":' } }] },
])('rejects partial content without terminal completion', async delta => {
  await expect(collect(chatStream([
    { choices: [{ delta, finish_reason: null }] },
  ]))).rejects.toMatchObject({ code: 'STREAM_CLOSED' });
});
```

Before emitting block-end/finish at EOF, reject nonempty unfinished output. Preserve existing empty `EMPTY_RESPONSE`, stop-only empty behavior, `length`, `content_filter`, reasoning and `tool_calls` finish semantics. Never synthesize valid tool JSON from truncation.

- [ ] **Step 3: Refresh failure/success race RED with real store.** Set DSH_HOME to a newly owned test directory inside isolated fixture root, save old Qwen session, use deferred refresh and entered barriers, invoke manager.session and attach catch immediately, abort, save replacement, then reject permanent old refresh. Assertions compare replacement identity via boolean equality to avoid token values in diagnostics. Repeat delayed success and delayed store-queue entry, simultaneous session callers, new refresh after abort and current permanent failure.

```ts
const old = { accessToken: 'synthetic-old', refreshToken: 'synthetic-old-r', expiresAt: 1 };
const replacement = { accessToken: 'synthetic-new', refreshToken: 'synthetic-new-r', expiresAt: 9e15 };
await saveSession('qwen', old);
const started = Promise.withResolvers<void>();
const refresh = Promise.withResolvers<QwenSession>();
const manager = new TokenManager<QwenSession>({
  displayName: 'Test', preemptMs: 0, load: () => getSession('qwen'),
  saveIfCurrent: (expected, next, current) => updateSessionIfCurrent('qwen', expected, next, current),
  removeIfCurrent: (expected, current) => updateSessionIfCurrent('qwen', expected, undefined, current),
  refresh: async () => { started.resolve(); return refresh.promise; },
  isPermanent: () => true,
});
const pending = manager.session().catch(error => error);
await started.promise;
manager.abort();
await saveSession('qwen', replacement);
refresh.reject(new Error('invalid_grant'));
await pending;
expect((await getSession('qwen'))?.accessToken === replacement.accessToken).toBe(true);
```

To reproduce pre-fix behavior before new callbacks exist, use current `save/remove` callback names for the first RED run and migrate the fixture only with the atomic-hook implementation. This is not permission to make a non-atomic fallback in production.

- [ ] **Step 4: Fence the whole refresh operation.** Capture generation before first load await. Abort invalidates operation and detaches its inflight slot; old `finally` clears only its own slot, not a newer operation. Coalesce only same-generation/credential refreshes. Inside doRefresh catch permanent errors and conditional-delete once; notify onRemoved only when current session was actually removed. Success uses conditional save; after await verify generation before returning token. An obsolete operation rejects as stale/missing credential and cannot return old transient-fallback credentials after abort. CAS checks both generation predicate and stored identity within auth store's existing serialized job; queue recovery after write failure remains intact.

```ts
// Inside the existing per-path queue, never an unlocked load-then-delete:
const store = await loadStore(path);
const current = store[provider];
if (!isCurrent() || current === undefined
  || current.accessToken !== expected.accessToken
  || current.refreshToken !== expected.refreshToken
  || current.expiresAt !== expected.expiresAt) return;
// Update/delete this provider and writeStore atomically; return changed=true only after success.
```

- [ ] **Step 5: Selection RED including explicit-path safety.** Import `clearPicked`, `access`, `mkdir` and `pluginData`. Use real temporary files; restore process env after each test. Assert independent literal restrictions, then save/clear and failure recovery.

```ts
const path = await tempFile();
await Promise.all([setPicked('qwen', ['coder-model'], path), setPicked('kimi', ['k3'], path)]);
expect(await getPicked('qwen', path)).toEqual(['coder-model']);
expect(await getPicked('kimi', path)).toEqual(['k3']);
await Promise.all([clearPicked('qwen', path), setPicked('kimi', ['k3-256k'], path)]);
expect(await getPicked('qwen', path)).toBeUndefined();
expect(await getPicked('kimi', path)).toEqual(['k3-256k']);
```

For a deterministic overlap, mock only `readFile` with a barrier that lets the first operation read before the second is scheduled; release first read after second call has begun. Do not require the second read to enter before release (that deadlocks correctly serialized code). Assert resulting file, not mock count. For default-dir regression use fresh DSH_HOME with no providers dir, write explicit custom selection path, assert `access(join(home,'plugins/providers'))` rejects ENOENT while custom contents are correct. Run it with fake HOME too; never target real home.

- [ ] **Step 6: Selection minimum transaction.** Copy the small `Map<string,Promise<void>>`/`previous.then(job,job)` local queue pattern from auth/store into selection; wrap the entire load+modify+atomic write for both set and clear. Resolve explicit path consistently as queue identity. For explicit path write mkdir its parent (0600 file/0700 new dir), not `ensurePluginDir()` for default home; default migration stays default-only. Remove temp siblings on failure and allow next queued write to succeed. Do not redesign malformed-selection recovery outside scope.
- [ ] **Step 7: Focused RED/GREEN and review.** `pnpm --filter dsh-providers test tests/qwen.test.ts tests/openai-chat.test.ts tests/token-manager.test.ts tests/store.test.ts tests/selection.test.ts tests/flow-cancel.test.ts`; source `pnpm --filter dsh-providers typecheck` before `pnpm --filter dsh-providers build`; full provider suite catches callback fixture migrations. Capture diff and report token-free diagnostics. Live OAuth/provider requests remain pending.

### Task 5: WeCom office identity transactions (W1, W2)

**Mandatory isolation before this task’s commands**

```bash
cd /Users/codepi/Coding/dsh-plugins/.worktrees/cr-hardening || exit 1
# Source only from the authorized worktree root. Never copy user config/credentials.
[ "$PWD" = /Users/codepi/Coding/dsh-plugins/.worktrees/cr-hardening ] || exit 1
SAFE_ROOT="$PWD/.superpowers/sdd/2026-09-05-cr-hardening-plan/isolated"
mkdir -p "$SAFE_ROOT"/{home,dsh,config,cache,data,state,runtime,tmp,npm-cache,pnpm-store}
export HOME="$SAFE_ROOT/home" DSH_HOME="$SAFE_ROOT/dsh"
export XDG_CONFIG_HOME="$SAFE_ROOT/config" XDG_CACHE_HOME="$SAFE_ROOT/cache"
export XDG_DATA_HOME="$SAFE_ROOT/data" XDG_STATE_HOME="$SAFE_ROOT/state"
export XDG_RUNTIME_DIR="$SAFE_ROOT/runtime"
export npm_config_userconfig="$SAFE_ROOT/npmrc" NPM_CONFIG_USERCONFIG="$SAFE_ROOT/npmrc"
export npm_config_globalconfig="$SAFE_ROOT/global-npmrc" NPM_CONFIG_GLOBALCONFIG="$SAFE_ROOT/global-npmrc"
export npm_config_cache="$SAFE_ROOT/npm-cache" npm_config_store_dir="$SAFE_ROOT/pnpm-store"
touch "$SAFE_ROOT/npmrc" "$SAFE_ROOT/global-npmrc"

# Approved exclusive external fixture root preserves non-repository semantics.
FIXTURE_ROOT=$(cat "$PWD/.superpowers/sdd/2026-09-05-cr-hardening-plan/fixture-root.txt")
case "$FIXTURE_ROOT" in /private/tmp/dsh-cr-hardening-tests.*) ;; *) exit 1 ;; esac
[ -d "$FIXTURE_ROOT" ] || exit 1
export TMPDIR="$FIXTURE_ROOT" TMP="$FIXTURE_ROOT" TEMP="$FIXTURE_ROOT"
export GIT_CEILING_DIRECTORIES="$FIXTURE_ROOT"
```

**Task safety:** Single writer; no nested subagents, staging/commits, service operations, real home/login/credentials, dependency changes or 3080/3081 listeners. Preserve prior uncommitted tracked and untracked changes; capture actual diffs for review, never HEAD..HEAD. Tests are fake/temporary only; live acceptance pending. Full Global Constraints apply.

**Files and ownership**

- Modify `plugins/wecom-office/src/office-controller.ts:79–171`, `im-bridge.ts:24–59`, `settings.ts:135–155`.
- Extend `plugins/wecom-office/tests/office-controller.test.ts`, `im-bridge.test.ts`, `settings.test.ts`, and relevant tools test only to validate active CLI identity after rollback.
- Reuse `OfficeError('im-unavailable', USER_MESSAGES['im-unavailable'])` from existing `errors.ts`; no new public status shape needed. Read `auth.ts`, `tools.ts` identity/configDir seam; fake auth only.

**Interfaces**

Keep `loadImWecomBots(path?): Promise<ImWecomBot[]>`, but unavailable/read/parse/invalid-envelope errors reject with safe `im-unavailable`, not authoritative empty list. `parseImWecomConfig` remains the pure tolerant parser; validate catalog completeness separately in the destructive loader, including invalid rows that might hide the active bot. Valid `{version:1,bots:[]}` means confirmed absence. ENOENT means unavailable for destructive reconciliation, not confirmed removal. Preserve OfficeController public methods; add private `#snapshot` and a local generic `#serial<T>(operation:()=>Promise<T>): Promise<T>` using its existing activation queue. Keep `installOfficeSettings(entry,hooks): Promise<void>`, source/writer hook signatures unchanged. No Task 6 shared imports or identity model changes.

- [ ] **Step 1: RED unavailable catalog consumer.** In existing controller fixture create an active IM identity and fake authorized CLI; inject `loadImBots` throwing `OfficeError('im-unavailable',...)`, call snapshot(true), assert no clearCliCredentials and unchanged settings/active identity. Extend parser/loader tests for EACCES/EIO (mock read only), malformed JSON, invalid envelope/version/rows, ENOENT, valid empty and valid bots.

```ts
it('does not interpret invalid IM catalog as confirmed deletion', async () => {
  await withDir(async dir => {
    const path = join(dir, 'config.json');
    await writeFile(path, '{broken-json');
    await expect(loadImWecomBots(path)).rejects.toMatchObject({ code: 'im-unavailable' });
    await writeFile(path, JSON.stringify({ version: 1, bots: [] }));
    await expect(loadImWecomBots(path)).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: RED stale snapshot versus B activation.** Reuse `imBot`, `memoryCredentials`, `deferred`, `withDir` from controller tests. Start A active, catalog now contains only B, pause first snapshot's `cliVersion`; queue activate(B), drain async microtasks with Vitest fake timers and a mocked mkdir that resolves immediately, then release probe and await both. Only filesystem mkdir is mocked here to remove scheduling variability; fake auth and catalog already resolve immediately. Do not await B completion before releasing the snapshot because correctly serialized code would deadlock. Baseline permits B then stale A cleanup; fixed code serializes cleanup then activation. Assert final settings.activeBotId and fake CLI bot both B, actual B authInit entered, zero post-B credential clears. Also pause catalog read during activation/snapshot, vary order, and assert current state is reread at destructive decision, not captured before an await.
- [ ] **Step 3: Serialize destructive identity operations, avoid recursive deadlock.** Public snapshot enqueues `#snapshot`; public activate enqueues `#activate`; `#activate` calls **private** `#snapshot` directly while holding queue. Re-read settings/configDir immediately before comparing catalog to active identity; keep credential clear + settings persistence within queue and report unavailable catalog safely with lastError while preserving identity. If catalog is valid empty, still clear truly removed bot. Recompute authorized status after a successful clear (do not return stale `authorized:true`). Preserve global identity and IM-unloaded fallback behavior.

```ts
#serial<T>(operation: () => Promise<T>): Promise<T> {
  const pending = this.#activationQueue.then(operation, operation);
  this.#activationQueue = pending.then(() => undefined, () => undefined);
  return pending;
}
// snapshot -> #serial(() => #snapshot(...)); #activate -> #snapshot(...) directly.
```

- [ ] **Step 4: RED real settings writer publication failure.** In settings test use `installOfficeSettings`, capture source/writer callbacks, and inject failure at `node:fs/promises.rename` using Vitest module mocking while retaining real read/write/mkdir. The production change being caught is publication before durable rename, not whether a mocked writer rejects.

```ts
let source!: () => WecomOfficeSettings;
let write!: (patch: Partial<WecomOfficeSettings>) => Promise<void>;
await installOfficeSettings({ configDir: dir }, {
  setSource: value => { source = value; },
  setWriter: value => { if (value) write = value; },
});
await write({ activeBotId: 'old', guidance: true });
const before = await readFile(settingsPath(), 'utf8');
renameFailure = Object.assign(new Error('synthetic disk failure'), { code: 'ENOSPC' });
await expect(write({ activeBotId: 'new' })).rejects.toMatchObject({ code: 'ENOSPC' });
expect(source().activeBotId).toBe('old');
expect(await readFile(settingsPath(), 'utf8')).toBe(before);
renameFailure = undefined;
await Promise.all([write({ guidance: false }), write({ allowWrite: false })]);
expect(source()).toMatchObject({ activeBotId: 'old', guidance: false, allowWrite: false });
```

Declare `renameFailure` with `vi.hoisted`; mocked rename throws it only while set, otherwise calls actual filesystem rename. Put fake DSH_HOME under the test dir before install; restore it afterward. Repeat writeFile failure (old contents survive). Add activation with this **real writer**: authenticate B, fail persistence, fake CLI rolls back to A, assert real source/settings file still A and the tools identity seam still receives A configDir/auth state. Then retry to prove queue recovered.

- [ ] **Step 5: Persist candidate then publish.** Compute sanitized candidate **inside** serialized writer job from latest overlay; mkdir destination parent, write unique sibling with mode 0600, atomic rename, then `overlay = candidate`. On failure remove only owned temp sibling, preserve prior live overlay and durable file, reject. Queue tail catches for recovery without swallowing caller errors.

```ts
const candidate = sanitizeOverlay({ ...overlay, ...patch });
await writeFile(temporary, `${JSON.stringify(candidate, null, 2)}\n`, { mode: 0o600 });
await rename(temporary, path);
overlay = candidate;
```

- [ ] **Step 6: GREEN and review.** `pnpm --filter dsh-wecom-office test tests/office-controller.test.ts tests/settings.test.ts tests/im-bridge.test.ts tests/tools.test.ts`; `pnpm --filter dsh-wecom-office typecheck` before `pnpm --filter dsh-wecom-office build`. Report both memory and file evidence. No CLI/auth invocation outside fakes; real activation/rollback acceptance remains pending.

### Task 6: Experimental AI Office cancellation (I1, I2)

**Mandatory isolation before this task’s commands**

```bash
cd /Users/codepi/Coding/dsh-plugins/.worktrees/cr-hardening || exit 1
# Source only from the authorized worktree root. Never copy user config/credentials.
[ "$PWD" = /Users/codepi/Coding/dsh-plugins/.worktrees/cr-hardening ] || exit 1
SAFE_ROOT="$PWD/.superpowers/sdd/2026-09-05-cr-hardening-plan/isolated"
mkdir -p "$SAFE_ROOT"/{home,dsh,config,cache,data,state,runtime,tmp,npm-cache,pnpm-store}
export HOME="$SAFE_ROOT/home" DSH_HOME="$SAFE_ROOT/dsh"
export XDG_CONFIG_HOME="$SAFE_ROOT/config" XDG_CACHE_HOME="$SAFE_ROOT/cache"
export XDG_DATA_HOME="$SAFE_ROOT/data" XDG_STATE_HOME="$SAFE_ROOT/state"
export XDG_RUNTIME_DIR="$SAFE_ROOT/runtime"
export npm_config_userconfig="$SAFE_ROOT/npmrc" NPM_CONFIG_USERCONFIG="$SAFE_ROOT/npmrc"
export npm_config_globalconfig="$SAFE_ROOT/global-npmrc" NPM_CONFIG_GLOBALCONFIG="$SAFE_ROOT/global-npmrc"
export npm_config_cache="$SAFE_ROOT/npm-cache" npm_config_store_dir="$SAFE_ROOT/pnpm-store"
touch "$SAFE_ROOT/npmrc" "$SAFE_ROOT/global-npmrc"

# Approved exclusive external fixture root preserves non-repository semantics.
FIXTURE_ROOT=$(cat "$PWD/.superpowers/sdd/2026-09-05-cr-hardening-plan/fixture-root.txt")
case "$FIXTURE_ROOT" in /private/tmp/dsh-cr-hardening-tests.*) ;; *) exit 1 ;; esac
[ -d "$FIXTURE_ROOT" ] || exit 1
export TMPDIR="$FIXTURE_ROOT" TMP="$FIXTURE_ROOT" TEMP="$FIXTURE_ROOT"
export GIT_CEILING_DIRECTORIES="$FIXTURE_ROOT"
```

**Task safety:** Single writer; no nested subagents, staging/commits, service operations, real home/login/credentials, dependency changes or 3080/3081 listeners. Preserve prior uncommitted tracked and untracked changes; capture actual diffs for review, never HEAD..HEAD. Tests are fake/temporary only; live acceptance pending. Full Global Constraints apply.

**Files and ownership**

- Modify `plugins/im/src/channels/office/office-job-executor.ts:76–92,159–177,245–281,344–382`.
- Inspect/adjust awaited ownership propagation only in `office-runtime.ts:162–167`, `office-controller.ts:88–110,149–160`, `src/host/channels/office/production.ts`.
- Add configurable cancellation bound through exported plugin `Config` in `plugins/im/src/index.ts` and Office-only production/runtime wiring if introducing the bound as an option; do not add arbitrary hardcoded timeout. Use `officeCancelTimeoutMs` default `10_000`, Schema min(1), passed as `cancelTimeoutMs` to OfficeRuntime/OfficeJobExecutor. Preserve officeEnabled default false.
- Extend `plugins/im/tests/channels/office/office.test.ts`; add focused `office-job-executor.test.ts` in that same directory if keeping failure-isolation cases separate improves clarity. Read shared `harness-client.ts:739–784,1411–1417,1493–1510`; do not modify its global abort semantics. Keep ts-nocheck count unchanged unless a touched production boundary is genuinely typed and ratchet lowered in `scripts/check-manifest.mjs`.

**Interfaces**

Keep `offer(jobId): boolean`, `handleEvent(event): boolean`, `cancel(jobId): boolean`, `close(): Promise<void>`, controller remove/reconnect and runtime stop return contracts. Define local `type Reply = { decision: 'approved' | 'rejected'; answer: string }`. Local `waitForReply` returns `{ promise: Promise<Reply>; dispose(reason?: unknown): void }` with immediate rejection observer. Local per-entry `#cancelEntry(entry): Promise<void>` is coalesced; define the entry shape alongside the existing active map (controller, approvals, harness, sessionId, cancelled, task and cancellation promise), not in shared Harness code; use `harness.rpc('session.cancel',{sessionId,keepInbox:true},cancelTimeoutMs)` with an independent cancellation signal/bound, not the already-aborted job signal. Shared Harness rpc unwraps value (`accepted:true`), unlike Board API's result envelope. No Task 5 identity/controller import is valid here.

- [ ] **Step 1: RED failed approval delivery then abort.** Reuse `controlledSleep`, valid job IDs, complete job fixture and real OfficeJobExecutor from existing Office suite. CreateHarness returns fake `createOfficeSession` and `ask` that awaits `options.onInteraction` with the exact valid approval payload below. Transport requestApproval rejects. Observe process unhandledRejection with a temporary listener removed in finally; do not suppress Vitest's own error reporting. Track abort listener add/remove only on captured job signal, not global listeners.

```ts
const interaction = {
  kind: 'approval', interactionId: 'approval-failure', sessionId: 'session-test',
  payload: { type: 'approval/requested', sessionId: 'session-test',
    approvalId: 'approval-failure', toolName: 'apply_patch', callId: 'call-test' },
  toolCall: { callId: 'call-test', name: 'apply_patch', arguments: '{"patch":"safe"}' },
  respond: async () => ({ accepted: true }),
};
// Import getEventListeners from node:events; all Harness/transport work below is fake.
let approvalCalls = 0;
let replyAbortListeners = -1;
const clock = controlledSleep();
const executor = new OfficeJobExecutor({
  config: { maxConcurrency: 1, workspaces: { fixture: process.env.TMPDIR! },
    instructionPresets: { execute: 'Return evidence' } },
  transport: {
    getJob: async () => ({ job: { id: 'job-dddddddddddddddddddddddddddddddd',
      workspaceAlias: 'fixture', instructionPreset: 'execute', markdown: '# Fixture' } }),
    acceptJob: async () => ({ leaseToken: 'synthetic-lease' }),
    renewJob: async () => ({ ok: true }),
    progressJob: async () => ({ ok: true }),
    requestApproval: async () => { approvalCalls += 1; throw new Error('presentation failed'); },
    failJob: async () => ({ ok: true }),
    completeJob: async () => { assert.fail('failed presentation must not complete'); },
  },
  createHarness: () => ({
    createOfficeSession: async () => 'session-test',
    ask: async (_id: string, _prompt: string, options: {
      signal: AbortSignal; onInteraction: (value: typeof interaction) => Promise<void>;
    }) => {
      const before = getEventListeners(options.signal, 'abort').length;
      try { await options.onInteraction(interaction); }
      finally { replyAbortListeners = getEventListeners(options.signal, 'abort').length - before; }
      return 'must not complete';
    },
    rpc: async () => ({ accepted: true }),
  }),
  logger: { warn() {}, debug() {} }, sleepImpl: clock.sleep,
});
const unhandled: unknown[] = [];
const onUnhandled = (error: unknown) => { unhandled.push(error); };
process.on('unhandledRejection', onUnhandled);
try {
  executor.offer('job-dddddddddddddddddddddddddddddddd');
  await eventually(() => approvalCalls === 1);
  await executor.close();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(unhandled, []);
  assert.equal(replyAbortListeners, 0);
} finally {
  process.removeListener('unhandledRejection', onUnhandled);
  await executor.close();
}
```

The fixture samples real AbortSignal listeners immediately after onInteraction rejection, before job-wide abort; the pre-existing renewal listener is subtracted. This avoids assertions on test-created listener bookkeeping. Avoid an orphan waiter test that never enters requestApproval. Add presentation success/response failure, approval reply, external resolution, pre-aborted signal, cancel while pending, and duplicate response paths. All maps/listeners/waiters settle exactly once.

- [ ] **Step 2: Minimal waiter lifecycle.** Attach `void promise.catch(() => undefined)` immediately on creation while returning the original rejecting promise to its consumer. A single finish function removes listener/map entry and resolves/rejects once. `dispose` is called in `finally` around requestApproval **and** await reply/respond. Failed presentation disposes immediately, even before job-wide abort; never leave a listener waiting for an unreachable reply.

```ts
const reply = waitForReply(entry, request.id);
try {
  await this.#transport.requestApproval(jobId, entry.leaseToken, request, { signal });
  const decision = await reply.promise;
  // Keep existing actor/route-approved response construction.
} finally {
  reply.dispose();
}
```

- [ ] **Step 3: RED awaited close cancellation.** Existing lease-loss test already has the complete fake transport/session setup. Parameterize its stop action as explicit cancel, close, runtime.stop, controller.remove and reconnect, with `rpc` blocked by a deferred acknowledgement. Assert accepted ask entered, cancellation target/session/bound exact, close still pending before ack, and no completeJob after abort.

```ts
const ack = Promise.withResolvers<{ accepted: true }>();
const cancellations: unknown[] = [];
// In the real executor fixture's fake Harness:
const rpc = async (method: string, payload: unknown, timeoutMs: number) => {
  cancellations.push({ method, payload, timeoutMs });
  return ack.promise;
};
// after offer() and an entered barrier in ask(...):
let closed = false;
const closing = executor.close().then(() => { closed = true; });
await eventually(() => cancellations.length === 1);
assert.equal(closed, false);
assert.deepEqual(cancellations[0], { method: 'session.cancel',
  payload: { sessionId: 'session-test', keepInbox: true }, timeoutMs: 10_000 });
ack.resolve({ accepted: true });
await closing;
assert.equal(completions, 0);
```

Also test deferred create returns after close (never prompt it; retain/cancel created session where needed), close during accepted prompt but before ask resolves, finished work (no spurious cancellation), duplicate close/cancel (one in-flight request), lease loss and approval pending. Rejection/timeout/negative or malformed accepted result is **uncertain**, not successful cancellation; capture safe warning containing session ID, no token/prompt. Controller reconnect/remove must not silently report clean shutdown and start replacement on an uncertain old execution.

- [ ] **Step 4: One bounded awaited cancellation path.** Set cancelled state before abort to prevent completeJob, store cancel promise before abort triggers task cleanup, await RPC acknowledgement or configured bound, and record uncertainty. Preserve the per-entry session handle until cancellation and local task drain finish. Track ask-completed separately so already-finished work is not cancelled. Late create/prompt results must recheck closed/cancelled state. In runtime.stop, start job close promptly alongside stopping transport, not after a potentially delayed stream drain. Propagate uncertain close rejection through remove/reconnect (safe error, retain ownership reference for retry) instead of nulling runtime before stop succeeds. Do not claim the remote turn is stopped solely because local ask rejected on abort.
- [ ] **Step 5: GREEN and full deterministic acceptance.** Focus `pnpm --filter dsh-im test tests/channels/office/office.test.ts tests/channels/office/office-job-executor.test.ts` (omit second filename only if tests remain in existing suite); `pnpm --filter dsh-im typecheck` before `pnpm --filter dsh-im build`. Verify default-disabled behavior through existing host integration suite and workspace/actor/route approval tests. Record source type coverage limitations honestly.
- [ ] **Step 6: Final gates and review package.** Reapply this complete isolation prefix immediately before final validation:

```bash
cd /Users/codepi/Coding/dsh-plugins/.worktrees/cr-hardening || exit 1
# Source only from the authorized worktree root. Never copy user config/credentials.
[ "$PWD" = /Users/codepi/Coding/dsh-plugins/.worktrees/cr-hardening ] || exit 1
SAFE_ROOT="$PWD/.superpowers/sdd/2026-09-05-cr-hardening-plan/isolated"
mkdir -p "$SAFE_ROOT"/{home,dsh,config,cache,data,state,runtime,tmp,npm-cache,pnpm-store}
export HOME="$SAFE_ROOT/home" DSH_HOME="$SAFE_ROOT/dsh"
export XDG_CONFIG_HOME="$SAFE_ROOT/config" XDG_CACHE_HOME="$SAFE_ROOT/cache"
export XDG_DATA_HOME="$SAFE_ROOT/data" XDG_STATE_HOME="$SAFE_ROOT/state"
export XDG_RUNTIME_DIR="$SAFE_ROOT/runtime"
export npm_config_userconfig="$SAFE_ROOT/npmrc" NPM_CONFIG_USERCONFIG="$SAFE_ROOT/npmrc"
export npm_config_globalconfig="$SAFE_ROOT/global-npmrc" NPM_CONFIG_GLOBALCONFIG="$SAFE_ROOT/global-npmrc"
export npm_config_cache="$SAFE_ROOT/npm-cache" npm_config_store_dir="$SAFE_ROOT/pnpm-store"
touch "$SAFE_ROOT/npmrc" "$SAFE_ROOT/global-npmrc"

# Approved exclusive external fixture root preserves non-repository semantics.
FIXTURE_ROOT=$(cat "$PWD/.superpowers/sdd/2026-09-05-cr-hardening-plan/fixture-root.txt")
case "$FIXTURE_ROOT" in /private/tmp/dsh-cr-hardening-tests.*) ;; *) exit 1 ;; esac
[ -d "$FIXTURE_ROOT" ] || exit 1
export TMPDIR="$FIXTURE_ROOT" TMP="$FIXTURE_ROOT" TEMP="$FIXTURE_ROOT"
export GIT_CEILING_DIRECTORIES="$FIXTURE_ROOT"
```

Run in order:

```bash
pnpm check
# Inspect source type diagnostics above before generated artifacts.
pnpm check:build
pnpm check:path
pnpm check:cli
git diff --check
git diff --cached --quiet
shasum -a 256 -c .superpowers/sdd/2026-09-05-cr-hardening-plan/manifests-before.sha256
```

`check:path` uses owned isolated temporary copies and may resolve allowed existing dependency ranges there; inspect script before running, no dependency upgrades in repository manifests/lockfiles. Stop on permissions/network/native prerequisites rather than changing pins or pretending a blocked build is green. Capture each log separately, task-local fix diff plus cumulative tracked/untracked diff, and retain ledger/reports. Parent requests final independent review; no merge/cleanup/commit choices are offered. Live sidebar/board/official CLI/provider/WeCom/experimental Office acceptance remains pending and cannot be inferred from these gates.

## Self-review and preflight conclusion

The ledger contains six self-consistency rows plus every shared-file/interface pair. All seventeen approved findings map to their owning task; fixture correction maps to B1; explicit selection-path side effect maps to P4 under supervisor amendment. Sidebar S2, CLI C4/C5, provider P2/P4 and WeCom catalog-unavailable P2 are folded into their subsystem task, not priority follow-ups. The two excluded audit findings and website remain excluded. No implementation reports claim completion. Signature consistency checked: board lifecycle hooks, auth CAS/hooks, Office RPC envelope distinction, and repeated isolation prefix. No stub production implementation or speculative shared package is required. Implementation choices and wrong-decision costs remain visible in ledger for review.
