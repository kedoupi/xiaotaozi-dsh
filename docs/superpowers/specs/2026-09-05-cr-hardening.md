# CR hardening — approved scope

## Authority and baseline

User approved all four remediation batches on 2026-09-05, explicitly including authentication-state logic and release CI source changes. Baseline is `77c20c7a767c4360e7b90461dc89c091179078d6`. Worktree: `/Users/codepi/Coding/dsh-plugins/.worktrees/cr-hardening`; branch: `fix/cr-hardening`.

No commit, staging, push, merge, rebase, publish, deployment, production credentials/home access, real login, or service/port changes are authorized. Keep the repository-root main hub and other worktrees untouched. Use fake/temporary homes, mock transports, and deterministic checks. Do not start `pnpm dev`, `smoke:sandbox`, or listeners on 3080/3081. Required rendered/live acceptance remains explicitly pending unless separately approved. Dependency installation from the existing lockfiles is allowed; adding/upgrading dependencies is not.

### Mandatory test environment isolation (supervisor ruling)

The initial baseline commands exited successfully, but subsequent source inspection found that selection tests with explicit temporary file paths can still call `ensurePluginDir()` against the default home when `DSH_HOME` is unset. The initial run is non-isolated evidence, not a safe acceptance baseline. Actual real-home impact is unknown. Do not inspect, repair, remove, or attempt to undo anything in the real home.

Before every subsequent test/check/build command, explicitly set `HOME`, `DSH_HOME`, `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME` (and `XDG_RUNTIME_DIR` where used) to dedicated temporary paths inside this worktree's ignored plan workspace. Direct npm/pnpm user configuration paths into that isolated environment; preserve executable PATH but do not copy user configuration or credentials. Provide a complete executable isolation prefix in the plan, all task briefs and final validation instructions. Re-run baseline gates under this environment and record the original uncertainty and replacement evidence in the ledger. Isolation is mandatory even when individual tests advertise fake homes. Set `TMPDIR`, `TMP`, and `TEMP` to a separately created, exclusively owned, mode-0700 directory outside any Git checkout: `mktemp -d /private/tmp/dsh-cr-hardening-tests.XXXXXX`. Record its exact returned path and ownership in the environment artifact and ledger. This exception permits only this flow's temporary fixtures outside the worktree; HOME/DSH_HOME/XDG remain isolated as above. Reuse that exact owned temp root or create another with the same procedure. Production Git helpers deliberately remove `GIT_*` variables, so a Git ceiling alone cannot stop fixtures inside this worktree inheriting its repository identity; do not weaken that sanitization. If a ceiling variable is retained, point it to the external temp root but do not rely on it. Verify a new temp directory remains a non-repository even with GIT_* stripped, an explicitly initialized temp repository is discoverable, and the topic checkout still resolves correctly. Keep the original non-isolated and all failed isolation-attempt logs. Do not modify global Git configuration or weaken assertions to accommodate fixture location. Cleanup may address only exact, verified paths created by this flow, never unknown temporary directories. Cost: tests that depend on undeclared global user configuration or parent-repository discovery may fail and require classification rather than accepting a contaminated baseline.

Task 4 also owns the minimal correction for explicit selection-file paths touching the unrelated default plugin directory: add a behavioral regression proving an explicit test/custom path does not cause default-home writes, and fix that path selection without broad storage redesign. This is part of P4's existing selection transaction work, not permission to edit other user-home code.

Preserve the pinned Harness/xtz architecture, the two homes, independent self-contained Git-path plugins, existing public APIs unless an explicitly approved behavior correction requires otherwise, and all security/approval/workspace boundaries. Do not increment versions or the IM ts-nocheck budget. Do not introduce packages/shared, sibling-plugin imports, a global transaction framework, blanket refactors, or unrequested features.

Read AGENTS.md, docs/conventions.md, docs/workflow.md and affected project/domain skills. The original audit is evidence, not unquestionable authority: reproduce each issue before changing production code; explicitly record any disproved or out-of-policy finding rather than blindly implementing it.

## Existing audit artifacts

Read the relevant report only. They live outside the repository:

- `/Users/codepi/.pi/agent/sessions/--Users-codepi-Coding-dsh-plugins--/subagent-artifacts/outputs/5afc7579-9e68-4411-98ec-99456a3b3b25/review/cli-engineering.md`
- `/Users/codepi/.pi/agent/sessions/--Users-codepi-Coding-dsh-plugins--/subagent-artifacts/outputs/5afc7579-9e68-4411-98ec-99456a3b3b25/review/providers-market.md`
- `/Users/codepi/.pi/agent/sessions/--Users-codepi-Coding-dsh-plugins--/subagent-artifacts/outputs/5afc7579-9e68-4411-98ec-99456a3b3b25/review/im-office.md`
- `/Users/codepi/.pi/agent/sessions/--Users-codepi-Coding-dsh-plugins--/subagent-artifacts/outputs/5afc7579-9e68-4411-98ec-99456a3b3b25/review/workbench-web.md`

The reported non-web Market profile mismatch and child-repository linked-worktree discovery issue were not included in the final accepted remediation list. Do not expand into those. Do not change the website. IM broad type migration is deferred: only touched boundaries may shed ts-nocheck, with the ratchet lowered if needed.

## Acceptance by subsystem

### Task 1 — Sidebar data safety and preview assets

1. S1: Unsaved editor text is lost when a tab changes React pane parent (float/dock/move). Trace every move and close entry, not only the menu. Choose the smallest coherent protection using existing dirty/close mechanisms; an explicit save/discard confirmation or blocked dirty move is approved containment. Do not require a new editor-buffer framework solely to preserve undo history. Successful non-destructive moves must not silently lose drafts; cancellation must preserve draft and location. Cover menu and drag actions, float/redock and pane movement where reachable.
2. S2: `/sidebar/html` uses a media-only MIME map; CSS/JS assets become octet-stream with nosniff. Give preview resources the correct MIME without permitting same-origin active document access, removing nosniff, or relaxing the privileged API fence. Test MIME and retained CSP/sandbox boundaries. Browser acceptance is not authorized on 3081 and remains pending if unavailable without that port.

Anchors: `plugins/sidebar/src/client/TextEditor.tsx`, `EditorHost.tsx`, `Sidebar.tsx`, `split-pane.tsx`, `state.ts`, `service.ts`, `plugins/sidebar/src/index.ts`, existing editor/media/state tests.

### Task 2 — Board lifecycle and execution identity

1. B1: Unrelated settings remount BoardService and discard pending launch session IDs while the prompt may continue. Preserve service across unrelated settings changes. Actual disable/dispose must not continue launching untracked work: cancel/drain pending launches or retain sufficient ownership, using existing Harness API semantics and explicit handling of uncertain cancellation.
2. B2: Old polls/cancels can settle E1 after E2 starts, overwrite E1 terminal outcome and change task status. Make settlement idempotent and conditional on current execution identity; revalidate after awaits. Exercise old poll -> cancel E1 -> start E2 -> old poll return, duplicate settlements, and overlapping polls.
3. Correct the late-disposal test fixture that omits `sessions.list`; assert actual create/prompt/cancel entry so tests cannot pass by early rejection. This is part of B1, not a separate refactor.

Anchors: `plugins/xtz-ui/src/index.ts`, `board/service.ts`, `board/ledger.ts`, `board/runner.ts`, `tests/board-service.test.ts`, existing board runner/ledger/host tests.

### Task 3 — CLI lifecycle, distribution and engineering gates

1. C1: `stop` and foreground completion can delete a newer generation's PID record. Coordinate lifecycle operations with the existing lock and condition every async cleanup on current ownership; cover stop/start, foreground exit/replacement, restart and PID reuse, without signalling unknown processes.
2. C2: Explicit `--port 3082` bypasses unowned Xiaotaozi identity on 3080. Before any official profile mutation/spawn, check preferred-port identity under the startup lock even for alternate ports. Assert zero preparation/mutation/spawn on refusal; never probe sandbox from official commands.
3. C3: Manifest values `^1.2.3` and `~1.2.3` are rejected by an install-argument validator. Separate source contexts while preserving local-path/protocol rejection and exact default snapshots. Test legitimate registry ranges through fake-home start/doctor and upgrade preservation; do not weaken safety to accept arbitrary strings.
4. C4: Sandbox CLI rebuild invalidation only watches app.ts/cli.ts/package.json. Use a minimal reliable rebuild policy covering all build inputs (unconditional supervisor-start rebuild is acceptable). Test helper-only changes without starting sandbox.
5. C5: Manual workflow dispatch may publish with dry_run=false without a product tag. Make manual dispatch dry-run-only, real publish gated to validated product-tag push. Check package/version/tag agreement and main containment without changing OIDC to static tokens or publishing anything. Add a local workflow-policy regression test, consistent with existing scripts. Preserve npm CLI and Node compatibility pins. Update directly affected procedural descriptions if they contradict the corrected behavior.

Anchors: `apps/cli/src/app.ts`, `plugin-spec.ts`, `runtime.ts`, fake-home tests; `scripts/sandbox-web.mjs`, sandbox-dev tests; `.github/workflows/publish.yml`, existing manifest/script policy tests. CLI package is a standalone workspace; install its lockfile separately. Node floor and all version literals come from versions.json.

### Task 4 — Provider protocols and authentication races

 1. P1: Qwen stream omits options.tools. Reuse toChatTools like Kimi. Test posted body with/without tools and tool result continuation.
 2. P2: Chat Completions EOF after partial data but before terminal finish_reason emits successful stop. Reject premature EOF as a stream error, preserving legitimate finish reasons and tool continuation behavior. Mock fetch; no live requests.
 3. P3: Old permanent refresh rejection removes newly established credentials after logout/relogin. Fence failure cleanup and success publication with operation/credential identity, coordinating conditional writes/deletes with the existing serialized auth store. Test delayed failure and success versus abort/relogin, plus current permanent failure clearing current credentials. Do not log synthetic or real token values.
 4. P4: Selection read-modify-write loses another provider's updates. Serialize the whole per-file transaction, including clear/logout. Test concurrent different-provider saves, save/clear and recovery after write failure. Reuse existing local patterns, not a new shared framework.

Anchors: `plugins/providers/src/providers/qwen.ts`, `openai-chat.ts`, `common.ts`, `auth/store.ts`, `auth/selection.ts`, `index.ts`, and corresponding tests. Parent already reproduced these four defects with actual source and fake in-memory/network seams.

### Task 5 — WeCom office identity transactions

 1. W1: Stale snapshot can erase newly activated identity; unreadable/invalid IM catalog is treated as authoritative absence. Serialize destructive reconciliation with activation and re-read current identity at the decision point. Distinguish catalog unavailable from successfully confirmed absence; preserve credentials on read/parse failures and still handle genuine bot removal. Avoid recursive queue deadlocks from activate -> snapshot.
 2. W2: Settings writer publishes overlay before durable write; failure then rolls CLI credentials back but leaves new overlay. Candidate state must persist before publication using serialized atomic replacement. Exercise the real writer with injected filesystem failure and activation rollback, ensuring live settings/CLI identity remain consistent. Test concurrent settings updates and preserve prior file contents on failure.

Anchors: `plugins/wecom-office/src/office-controller.ts`, `settings.ts`, `im-bridge.ts`, auth/tools seams, corresponding controller/settings/parser tests. Global office identity is intentional, not per-inbound-bot isolation. Use fake auth and temporary config directories only; no real wecom-cli invocation.

### Task 6 — Experimental AI Office cancellation

 1. I1: Failed requestApproval leaves an unhandled reply waiter and abort listener. Attach rejection handling immediately, clean up/settle waiter on all presentation/response/abort paths, and prove no unhandled rejection after failed presentation then abort.
 2. I2: close/remove/reconnect stops local observation without cancelling accepted Harness execution. Reuse a bounded awaited cancellation path for active sessions; distinguish already finished work and uncertain cancel results. Cover close while prompt accepted, remove/reconnect, lease loss and approval pending; no remote successful completion after cancellation. Keep feature disabled by default.

Anchors: `plugins/im/src/channels/office/office-job-executor.ts`, office-runtime/controller call sites, shared harness-client abort semantics, existing experimental Office suites. Preserve all workspace fencing and actor/route approval requirements. Do not introduce raw upstream APIs or broad channel rewrites.

## Execution and review

Use a detailed implementation plan with six independently reviewable tasks in this order. Sidebar preview and CLI release gating stay with their owning subsystem to avoid reopening the same files across four priority batches. Serial single writer; a fresh reviewer after each task; no continuing past unresolved load-bearing findings. Record rulings and task-local changed paths/diffs in the plan ledger. No commits: review actual uncommitted/new files, not an empty HEAD..HEAD diff. Prepare uniquely named diff artifacts including new files.

For each defect, record observed RED failure, minimal production correction, focused GREEN test, and affected typecheck/build evidence. Do not add dependencies for testing. Final deterministic gates in the worktree: `pnpm check`, `pnpm check:build`, `pnpm check:path`, `pnpm check:cli`, plus `git diff --check`. Inspect source diagnostics before builds where available. Do not claim rendered/live/official-home verification. Preserve the worktree and reports for user review; no cleanup that discards uncommitted work.
