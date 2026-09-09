# Closed-issue remediation ROUTING Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. The parent owns dispatch/review; children never launch agents. Checkbox steps track work. Owner no-commit snapshot ruling overrides skill commits and cleanup.

**Goal:** Complete the approved routing user journeys, without confusing deterministic evidence with live acceptance.

**Architecture:** Retain existing package boundaries and pinned Host contracts. Apply minimal root-cause fixes through the exact interfaces below; preserve compatibility and fail closed at authority boundaries.

**Tech Stack:** TypeScript, Node22.19+/24, pnpm11.22.0, DSH0.1.2-rc.1, Cordis, Vitest/Node test, existing Playwright for rendered fixtures.

**Spec:** `/Users/codepi/Coding/worktrees/dsh-plugins/pi-worktree-bbb162d2-2690-4346-98ee-26d065c1a5ce-s0-0/docs/superpowers/specs/2026-09-08-closed-issue-remediation-design.md`

## Global Constraints

- Freeze base `3bc5f8cf68be4310ef83f45051e7cdeabda0c64f`; one writer in the named managed worktree. Do not chase moving main.
- No stage, commit, push, merge, reset, stash, tag, publication or public issue mutation. Review unstaged snapshots, full diffs including intended untracked files, and SHA256 manifests; retain evidence.
- Never access official `~/.dsh` or port 3080. No hub dependencies, shared sessions, account/credential copy, or hub sandbox takeover. Live 3081 requires parent-confirmed bounded transfer and restoration; no alternate live DSH port/home.
- Before every test/build/package command, set isolated HOME, USERPROFILE, DSH_HOME, DSH_AGENTS_HOME, XDG_CONFIG_HOME and XDG_CACHE_HOME before imports; scrub other live/profile/credential/Node overrides. TMPDIR/TMP/TEMP must be an owned synthetic directory outside Git, not the worktree.
- Set `pnpm_config_verify_deps_before_run=error` for root/CLI and recursive pnpm commands. Its pinned pnpm 11 override requires a workspace declaration: new standalone fixtures must include `pnpm-workspace.yaml` with `packages: []`. Never rely on nonexistent autoInstall=false. If out of sync, stop for parent recovery; no implicit reinstall. Reuse R0 owned dependencies.
- DSH `0.1.2-rc.1`, CLI `0.5.1`, Node `^22.19.0 || >=24.0.0`, pnpm `11.22.0`. No new dependencies, CI changes, schema migration, version bump, public CLI command, Harness upgrade or upstream ownership promotion without parent clearance.
- Compatible R3/R4/R5 config/interface additions must follow this reviewed spec; pinned published APIs win. No frozen-request mutation, source vendoring, shared packages, value dsh-tools imports or bundled @deepseek-ai code.
- Product fixes require RED/GREEN, no assertion weakening. Synthetic gateway/Host/provider fixtures are not real account or rendered-journey acceptance. Required unexecuted journeys and upstream blockers remain pending, never complete.
- No nested agents. Parent schedules fresh read-only spec+quality review. Only the next writer updates this plan ledger. Escalate authority/infrastructure blockers while continuing independent approved work.

---

## R3: Router availability and truthful image capability

Standalone brief: `/Users/codepi/Coding/worktrees/dsh-plugins/pi-worktree-bbb162d2-2690-4346-98ee-26d065c1a5ce-s0-0/.superpowers/sdd/2026-09-08-closed-issue-remediation/briefs/R3.md`

### Files

- `plugins/providers/src/router/runtime.ts`
- `plugins/providers/src/router/decision.ts`
- `plugins/providers/src/router/profiles.ts`
- `plugins/providers/src/router/inventory.ts`
- `plugins/providers/src/providers/codex.ts`
- `plugins/providers/src/providers/kimi.ts`
- `plugins/providers/tests/router-decision.test.ts`
- `plugins/providers/tests/router-runtime.test.ts`
- `plugins/providers/tests/router-inventory.test.ts`
- `plugins/providers/tests/router-profiles.test.ts`
- `plugins/providers/tests/codex.test.ts`
- `plugins/providers/tests/kimi.test.ts`

### Interfaces

Keep `decideRoute(request: RouteRequest): RouteDecision`, `RouteHealth {code:string; penalty?:number}` and `installRouterRuntime(ctx, options):()=>void`. Use pinned `QUOTA_EXCEEDED_CODE` value `QUOTA` consistently. Preserve `ModelProfile.vision?: boolean` for preference compatibility but never let a name heuristic veto actual declared input capability. `understandsImages(model)` gates truthful `inputModalities`, not code/codex spelling.

Both HARD_HEALTH sets incorrectly contain QUOTA_EXCEEDED. Profile heuristic code/codex => vision:false rejects Codex even when adapter resolves text+image. Capability remains advertised metadata, not proof of real visual understanding.

- [ ] Add to existing router-decision.test.ts using its candidate/inventory helpers:

```ts
it('canonical quota excludes next selection and codex preference is not a capability veto', () => {
  const exhausted = candidate({ provider: 'api', model: 'pro', profile: { quality: 5, speed: 5, cost: 1 } });
  const available = candidate({ provider: 'codex', model: 'gpt-5.1-codex', inputModalities: ['text', 'image'], profile: { quality: 4, speed: 3, cost: 2, code: true, vision: false } });
  const selected = decideRoute({ text: 'describe this image', hasImage: true,
    inventory: inventory([exhausted, available]), health: { [exhausted.ref]: { code: 'QUOTA' } } });
  expect(selected.selected.ref).toBe(available.ref);
});
```

- [ ] Add separate no-image QUOTA regression so image filtering cannot mask quota bug. Emit a real failure finish from ScriptedAdapter in router-runtime.test.ts, complete turn, enqueue next human turn and assert alternate selection; auth generation changes and cooldown expiry permit reconsideration, late success of obsolete generation must not clear current failure.
- [ ] Minimal fix use canonical imported constant in both sets (or one package-local health helper if it removes exact duplication), preserve RATE_LIMIT soft penalty. Remove profile veto from understandsImages; keep visionFit preference ranking. Audit configured vs adapter default modalities: Kimi text-only remains text-only; generate/attach-only routes cannot acquire inbound image support by naming. Keep authorization and picked-model gate before scoring.
- [ ] Production-shaped inventory test must use buildAuthorizedInventory with subscriptions/apis/resolve/profileFor, configured=false and picked=[] exclusions, resolve rejection, model source mutation. Assert request-selected model still authorized immediately before dispatch. Do not modify admission to pretend every API adapter understands images.

### Commands (under safe envelope)

```sh
pnpm --filter dsh-providers exec vitest run tests/router-decision.test.ts tests/router-runtime.test.ts tests/router-inventory.test.ts tests/router-profiles.test.ts tests/codex.test.ts tests/kimi.test.ts
pnpm --filter dsh-providers typecheck
pnpm --filter dsh-providers build
```

### Journey gate

Authorized real image + quota next-turn journeys across selected subscription/API/WeCom paths remain required; synthetic modality declarations never certify external models.

- [ ] Snapshot + full unstaged/untracked diff, exact RED/GREEN logs, no-staged check, self-review and bounded report. Parent independent spec+quality review required; retain evidence and make no commit.

## R4: Safe bounded stalled-turn recovery

Standalone brief: `/Users/codepi/Coding/worktrees/dsh-plugins/pi-worktree-bbb162d2-2690-4346-98ee-26d065c1a5ce-s0-0/.superpowers/sdd/2026-09-08-closed-issue-remediation/briefs/R4.md`

### Files

- `plugins/providers/src/index.ts`
- `plugins/providers/src/router/runtime.ts`
- `plugins/providers/src/router/stall-recovery.ts (new)`
- `plugins/providers/src/providers/common.ts`
- `plugins/providers/src/providers/openai-chat.ts`
- `plugins/providers/src/providers/codex.ts`
- `plugins/providers/src/providers/claude.ts`
- `plugins/providers/src/providers/grok.ts`
- `plugins/providers/src/providers/kimi.ts`
- `plugins/providers/src/providers/qwen.ts`
- `plugins/providers/src/translate/sse.ts`
- `plugins/providers/tests/stall-recovery.test.ts (new)`
- `plugins/providers/tests/router-runtime.test.ts`
- `plugins/providers/tests/router-runtime-contract.test.ts`
- `plugins/providers/README.md`
- `plugins/providers/README.zh.md`

### Interfaces

Mandatory feasibility before production edit. RC1 `llm/stream(options:GenerateOptions,next:()=>AsyncIterable<StreamChunk>)` is a waterfall over deep-frozen loop request; `next` cannot replace signal. RC1 `agent/request-error(payload,next):Promise<{kind:"retry"}|undefined>` retries same step, rebuilds request but does not reassemble prompt. Owned adapters can copy options with a child abort signal before fetch. Proposed package-local `isProductiveChunk(chunk:StreamChunk):boolean` and `withProductiveDeadline(options:GenerateOptions, limits:{preProgressMs:number;totalMs:number}, start:(signal:AbortSignal)=>AsyncIterable<StreamChunk>):AsyncIterable<StreamChunk>`. Config additions on existing exported Schemastery: `routePreProgressTimeoutMs` default 30000 min 1, `routeRecoveryTotalTimeoutMs` default 90000 min 1, `routeRecoveryMaxAttempts` default 2 integer min 1. Existing streamIdleTimeoutMs remains transport-idle control. Limits are reviewed proposals; validate total >= pre-progress and no hidden disable sentinel.

Current idle watchdog pulses on SSE byte/comment activity; infinite keepalive defeats it. Pinned loop index.js:623-697 appends assistant chunks before tool execution, and only returns to retry waterfall after terminal failure finish. Never start a second stream while old effects can dispatch.

- [ ] First implement TEST-ONLY feasibility in router-runtime-contract.test.ts using actual pinned Context/AgentLoop/LlmRuntime fixture already present. Demonstrate registration-bound adapter cancellation, frozen input invariants and exact same-step retry selection. Inspect pinned `prepareCall`/`PreparedLlmCall`/`PreparedAdapterCall` rather than guessing private service methods. Record family matrix: owned subscription adapters vs Host API adapters. A safe seam must abort original request and reject late yield; a timeout Promise.race alone is insufficient. If generic API adapter cancellation has no supported seam, escalate with source evidence and retain full R4 BLOCKED; do not call owned coverage complete.
- [ ] Add core productive classification test:

```ts
import { expect, it } from 'vitest';
import { isProductiveChunk } from '../src/router/stall-recovery.ts';
it('only nonempty semantic deltas advance productive state', () => {
  expect(isProductiveChunk({ type: 'block-start', index: 0, blockType: 'text' })).toBe(false);
  expect(isProductiveChunk({ type: 'text-delta', index: 0, text: ' ' })).toBe(false);
  expect(isProductiveChunk({ type: 'reasoning-delta', index: 0, text: 'reason' })).toBe(true);
  expect(isProductiveChunk({ type: 'text-delta', index: 0, text: 'answer' })).toBe(true);
});
```

- [ ] RED timer tests: endless comments, empty data, delayed first text, reasoning-only forever, caller abort, timeout/finish race, malicious late chunks, timeout while return() waits, dispose while inventory lookup awaits. Fake time only for pure helper; real bounded Host integration for lifecycle. Semantic reasoning counts progress but not visible completion; total deadline never renews. Tool-call delta counts semantic progress but complete tool dispatch is tracked separately. Terminal visible answer must be observed for success.
- [ ] State machine per agent+turn+step: before progress -> attempt expires -> abort/retire generation -> wait bounded cancellation acknowledgement -> select authorized unattempted alternate -> return Host retry. Attempt count and total deadline span alternatives, not reset by keepalive/reasoning/retry. If cancellation cannot be established, return explicit bounded failure and no alternate. Update request selection through agent/request, never mutate frozen options or rewrite durable messages. Skip generic retry handlers when this task owns terminal stall outcome, avoiding hidden infinite fallback.
- [ ] Once productive output or any tool/durable effect has dispatched, prohibit restarting the user turn. Safe continuation may consume already-persisted tool results in same step only after proof; otherwise terminal bounded failure with non-secret actionable copy. Unit and real Host fixture assert ping.execute count exactly 1 in tool -> stall -> recovery/failure and preserved tool result IDs. No effect replay, no late decision publication after dispose. Cancel the reader (not just releaseLock) on obsolete stream and clean timers/listeners in finally.
- [ ] Wire limits through current Config into owned adapter call paths and router runtime. Do not add runtime dependency on timeout utility merely because devDependency exists; use existing JS AbortController arithmetic or request parent approval for manifest promotion. Update formerly deferred docs only to the scope actually proven; external/API blocked scope must stay explicit.

### Commands (under safe envelope)

```sh
pnpm --filter dsh-providers exec vitest run tests/stall-recovery.test.ts tests/router-runtime.test.ts tests/router-runtime-contract.test.ts
pnpm --filter dsh-providers typecheck
pnpm --filter dsh-providers build
```

### Journey gate

Mandatory synthetic RC1 + actual authorized stalled-image journey. Full criterion BLOCKED until every required provider family has cancellable bounded behavior. No second DSH service or real account use under R0 authority.

- [ ] Snapshot + full unstaged/untracked diff, exact RED/GREEN logs, no-staged check, self-review and bounded report. Parent independent spec+quality review required; retain evidence and make no commit.

## R5: Session-attributed decisions and serialized persistence

Standalone brief: `/Users/codepi/Coding/worktrees/dsh-plugins/pi-worktree-bbb162d2-2690-4346-98ee-26d065c1a5ce-s0-0/.superpowers/sdd/2026-09-08-closed-issue-remediation/briefs/R5.md`

### Files

- `plugins/providers/src/router/events.ts`
- `plugins/providers/src/router/last-selected.ts`
- `plugins/providers/src/router/preferences.ts`
- `plugins/providers/src/router/contract.ts`
- `plugins/providers/src/router/runtime.ts`
- `plugins/providers/src/index.ts`
- `plugins/providers/src/rpc.ts`
- `plugins/providers/src/client/routing-live.ts`
- `plugins/providers/src/client/SmartUx.tsx`
- `plugins/providers/src/client/smart-ux.ts`
- `plugins/providers/src/client/install-smart-ux.ts`
- `plugins/providers/tests/router-preferences.test.ts`
- `plugins/providers/tests/router-contract.test.ts`
- `plugins/providers/tests/router-runtime.test.ts`
- `plugins/providers/tests/smart-ux.test.ts`
- `plugins/providers/tests/routing-live.test.ts (new)`

### Interfaces

Exact client files: routing-live.ts, SmartUx.tsx, smart-ux.ts, install-smart-ux.ts. Add optional `sessionId?:string` to RouterDecisionEvent and LastRouteRef, optional `turn?:number; step?:number` to stored last ref. Add `RoutingContract.attribution?:"session"|"historical"` and `sessionId?:string`, retain mode/candidateCount/lastSelected. Add optional `refreshTiming?:{pollIntervalMs:number;totalTimeoutMs:number}` to RoutingContract, populated from existing Config additions: `routeDecisionPollIntervalMs` default500 min1 integer and R4 `routeRecoveryTotalTimeoutMs`. Legacy Host payload fallback uses reviewed 500/90000ms, never unbounded. Query `routing(signal?:AbortSignal, sessionId?:string):Promise<RoutingContract>` (new second parameter preserves old calls), RPC payload `{sessionId?:string}`. `loadRoutingContract(rpc:Rpc, sessionId?:string)` preserves old calls. `updateRoutingPreference(patch:Partial<RoutingPreference>, path?:string):Promise<void>` merges inside one per-path serialized transaction; old saveRoutingPreference signature remains compatible. Store only optional lastSelected identity, not a new schema/migration or unbounded session map. For a session lacking matching lastSelected use its durable requestHeader config as session-attributed last-used model, never invent a routing decision.

Current global lastRoute is not session-aware; startup load races onDecision, fire-and-forget save reads old mode; button-only timers miss Enter and long decisions. New R0 finding: custom-path save calls ensurePluginDir default home.

- [ ] Add explicit-path isolation regression in router-preferences.test.ts (use tempFile() from that file):

```ts
it('custom-path save does not prepare default storage', async () => {
  const path = await tempFile();
  const forbidden = `${path}-default-home`;
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = forbidden;
  try {
    await saveRoutingPreference('smart', path);
    await expect(stat(forbidden)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await loadRoutingPreference(path)).toEqual({ mode: 'smart' });
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
  }
});
```

- [ ] RED serialization test uses controllable deferred read/write boundary, starts decision update, saves manual mode, releases delayed decision; persisted mode must remain manual and latest decision retained. Failure queue must recover for next write. Prepare only missing dirname(path) with recursive mkdir mode0700; never chmod a pre-existing caller-owned parent (test preserved mode separately). Write private temp file0600 and rename; never prepare unrelated default home. Test missing nested parent, existing permissive caller-owned parent left unchanged, persisted file0600, and unrelated synthetic default-home sentinel absent. The existing default-path save still prepares only its resolved destination parent. Update lastSelected with patch only, no captured mode overwrite. Keep old files readable and optional metadata validated.
- [ ] Derive sessionId from `payload.agent.session.id` in actual request events; use known `turn`/`step`, avoid adding private message contents. Resolve active session requestHeader only through existing session/agent inventory, not new file crawling. Current-session chip may say last-used model from durable header, but cannot call that a new routing decision. Historical fallback always labelled 历史模型 / Last used; no 本轮模型 when attribution is historical or session mismatch.
- [ ] Move refresh lifecycle off inputActions.submit timers: mounted session component uses published `useSession`/`useInput` snapshots and `sessionId` standard props, refreshes on request/turn progression and when running becomes idle; use a cancellable bounded polling loop while Host decision is pending (use contract refreshTiming, one request in flight, maximum total same as R4, with no false result on timeout; stop immediately on idle/dispose/session change). Both button and Enter change the same Host input/session lifecycle. Never inject private keyboard interface into arbitrary slots. Empty-pool capture guard stays until a supported Host block seam is proven.
- [ ] Routing-live responses carry request generation/session key; discard older request or disposed result. Switching A->B must clear A snapshot before B reply; late A cannot overwrite B. Startup preload cannot replace a new onDecision. Remove all timers and listeners on disposal/HMR; do not reset shared subscribers owned by another mount. R6 owns physical slot placement; coordinate SmartUx props before editing same files.
- [ ] Session-less identity comes from root standard `useSessions(s=>({current:s.current,phase:s.phase}))`; only phase ready + current undefined is true absence. Do not infer absence from hero or empty messages. R6 consumes this exact identity and attribution contract.

### Commands (under safe envelope)

```sh
pnpm --filter dsh-providers exec vitest run tests/router-preferences.test.ts tests/router-contract.test.ts tests/router-runtime.test.ts tests/smart-ux.test.ts tests/routing-live.test.ts
pnpm --filter dsh-providers typecheck
pnpm --filter dsh-providers build
```

### Journey gate

Authorized browser: send by button and Enter, decision delayed beyond 2400ms, A/B switching, hard refresh and Host restart, manual-mode change concurrent with decision. True no-session fallback must be historical and loading transitions suppressed.

- [ ] Snapshot + full unstaged/untracked diff, exact RED/GREEN logs, no-staged check, self-review and bounded report. Parent independent spec+quality review required; retain evidence and make no commit.

## Verbatim owner rulings — mandatory for every subsequent worker

Source: `/tmp/dsh-full-remediation-20260908-xpJoEa/owner-brief.md`. This verbatim ruling supplements the task instructions above; do not infer weaker authority from abbreviated summaries.

### Mandatory test containment — supervisor ruling after R0 discovery

The first R0 baseline gates ran with DSH_HOME unset and HOME=/Users/codepi. Existing router-preferences tests pass a temporary destination but saveRoutingPreference still calls ensurePluginDir(), whose default path is ~/.dsh/plugins/providers and whose effects include mkdir/chmod. Actual effects in the protected path are UNKNOWN and MUST NOT be investigated or rolled back by accessing it. Preserve those original logs and mark them INVALID FOR SAFE-BASELINE ACCEPTANCE; the parent disclosed this exception to the user. A correctness exit 0 does not establish home isolation. Do not repeat the earlier claim that these invocations were proven official-home-free.

For EVERY R0 rerun and later implementation/fix/validation child, before any test/build/package subprocess or import of product code: use an explicitly constructed sanitized environment with HOME, DSH_HOME and cache paths in this plan's synthetic fixture; TMPDIR/TMP/TEMP must instead point to one uniquely owned mkdtemp OUTSIDE every Git checkout, recorded in this plan's ledger. Existing tests deliberately require a temporary non-Git directory, so an in-worktree TMPDIR is invalid infrastructure, not a product defect. Omit inherited live-home overrides and real account/provider credentials. Inspect transitive path helpers, test setup and subprocess helpers for explicit protected-home literals and code that deletes overrides. Environment setup must happen before module import; a temporary data filename alone is not isolation. Fail closed if a command cannot be shown contained; contact parent rather than execute it. Plain Git/source reads may use ordinary environment, but never inspect ~/.dsh. Do not rerun package installs merely because HOME changed; inspect lifecycle and use already owned dependencies where possible. pnpm 11 implicitly recreated owned node_modules during the first isolated rerun after HOME/store changed; preserve that log and the associated failed workbench outside-Git test as an infrastructure attempt. Pinned pnpm 11 has no autoInstall=false switch for this script dependency synchronization. For the root and CLI workspaces use the source-verified, command-scoped environment setting pnpm_config_verify_deps_before_run=error inherited by recursive invocations; runDepsStatusCheck must throw VERIFY_DEPS_BEFORE_RUN instead of installing. R0 controls proved this env override works WITH pnpm-workspace.yaml (packages: [] suffices), but a bare standalone fixture WITHOUT that file ignored it and implicitly installed TypeScript plus synthetic marker scripts. Preserve both controls. Do not claim global environment-only enforcement. Any new standalone fixture must prove fail-closed behavior for its actual layout: either a fixture-local workspace declaration or a verified command-scoped --config.verify-deps-before-run=error mechanism; an untested CLI flag is not proof. Never change persistent user/project config. Capture source/index/lock hashes and dependency ownership/provenance before retry. Any further install must be explicit, frozen, isolated and justified; do not hide automatic reinstalls or assume old gates still attest changed dependencies. Keep tests and generated artifacts in the single task worktree/plan fixture, never the hub. These fixtures are not another live DSH home or server.

R5 additionally MUST remove custom-path persistence's unrelated default-directory preparation. Preparing an explicit destination may create only its missing parent path with private mode and must not silently chmod a pre-existing caller-owned directory. Preserve 0600 file guarantees and atomic/serialized writes. Regression uses a synthetic default-home sentinel path distinct from the custom destination and proves the default preparation is not invoked/touched. Test it under isolated environment; no protected-path probe.

### Corrected RC1 composer ownership ruling

R6 Composer: only plugin-owned content within real composer surface, don't move/hide shared dock siblings. RC1 conversation.composer.bar is SINGLE/session-maybe, not a chain and has no evidenced public middleware/derive API. Use the supported session-scoped input.left for session chips; a minimal root shell.overlay contribution may portal its OWN historical-only node into actual [data-composer-card] for verified no-session state. This is an explicit pinned DOM compatibility adapter, not a nonexistent upstream accessory contract. Never replace composer, move Host nodes, mutate Host styles/classes, or hide shared parents. Suppress ambiguous/loading selection states and test transitions/disposal/own-node mutation filtering/coalescing; selector mismatch must leave Host usable. Record this ruling and its upstream-DOM-drift cost in the spec/ledger; no redundant native placeholder layer; test real RC1 DOM topology, hero/active/no-session, width 1440/768/390, typing/clearing/resize and disposal/HMR.
