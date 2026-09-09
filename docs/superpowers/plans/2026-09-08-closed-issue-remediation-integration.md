# Closed-issue remediation INTEGRATION Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. The parent owns dispatch/review; children never launch agents. Checkbox steps track work. Owner no-commit snapshot ruling overrides skill commits and cleanup.

**Goal:** Complete the approved integration user journeys, without confusing deterministic evidence with live acceptance.

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

## R10: Pinned Host protocol journeys

Standalone brief: `/Users/codepi/Coding/worktrees/dsh-plugins/pi-worktree-bbb162d2-2690-4346-98ee-26d065c1a5ce-s0-0/.superpowers/sdd/2026-09-08-closed-issue-remediation/briefs/R10.md`

### Files

- `plugins/providers/src/providers/common.ts`
- `plugins/providers/src/providers/kimi.ts`
- `plugins/providers/src/providers/codex.ts`
- `plugins/providers/src/providers/openai-chat.ts`
- `plugins/providers/src/translate/responses.ts`
- `plugins/providers/src/translate/anthropic.ts`
- `plugins/providers/tests/common.test.ts`
- `plugins/providers/tests/kimi.test.ts`
- `plugins/providers/tests/codex.test.ts`
- `plugins/providers/tests/openai-chat.test.ts`
- `plugins/providers/tests/translate-tool-roles.test.ts`
- `scripts/protocol-journeys.test.mts (new)`

### Interfaces

Preserve adapter GenerateOptions/StreamChunk vocabulary, canonical LlmError codes, toResponsesInput/toAnthropicMessages role gates and Codex neutral permission normalization. New script uses published pinned modules from apps/cli store via the dynamic published(name,path) resolver in runtime-contracts.test.mts; mount actual AgentRegistry, AgentLoop, LlmRuntime, SessionStore, SessionProjectionRegistry, SystemPrompt, ToolRuntime and pinned compaction provider. Register plain test tool objects. No product value dsh-tools import or new dependency. Synthetic endpoints use in-process fetch replacement or bounded port0 HTTP server, never live DSH.

Existing translator tests pass, but no full Host tool/compaction/permission acceptance. Pinned loop retries only failed finish, appends durable request headers and tool results; use that machinery rather than a mock compaction callback.

- [ ] Add minimal empty-body classification guard (no unjustified generic413 compaction):

```ts
it('keeps empty and generic 413 distinct from contextual 413', async () => {
  expect((await httpLlmError(new Response('', { status: 413 }), 'fixture')).code).toBe('HTTP_413');
  expect((await httpLlmError(new Response('context length limit exceeded', { status: 413 }), 'fixture')).code).toBe('CONTEXT_WINDOW_EXCEEDED');
});
```

- [ ] In new script reproduce real Host fixture pattern from providers router-runtime-contract.test.ts, but use actual Kimi/Codex/Claude/Grok adapters with synthetic token managers and HTTP bodies, not ScriptedAdapter only. SessionStore is in-memory (no root-path constructor). Mount `JsonlSessionPersistence` from `@deepseek-ai/dsh-session-persistence-jsonl/lib/index.js` with `{root: fixtureDirectory, compression: "none", packChunks: false}` after SessionStore and explicitly await `ctx.parallel("session/flush", agent.session)` before inspecting persistence; use no real credential or persistence defaults. Parent safe envelope applies before dynamic import. Close adapters/fibers/endpoints and assert no pending request after tests.
- [ ] #52 inject user-role notification quoting tool-call plus assistant parallel tool calls and matching user results; serialize through Responses and Anthropic adapters, assert notification text preserved and no forged tool dispatch; continue through Host tool runtime to final text. Capture normalized ID/role/count facts only.
- [ ] #60/#69 synthetic Kimi SSE: reasoning aliases, indexed parallel deltas with late ID, tool-call finish, tool.execute records count, next request contains correct role=tool/tool_call_id and model returns visible final text. Assert reasoning-only stream is not a visible-answer success; empty/truncated/filter/max-token finish classifications remain distinct. Test invalid/out-of-order tool schema without running real shell tools.
- [ ] #61 mount `@deepseek-ai/dsh-token-meter/lib/index.js` after SessionProjectionRegistry, then default `BasicCompactionEngine` from `@deepseek-ai/dsh-compaction-basic/lib/index.js` (injects llm/tokenMeter/sessions); record resolved module path/version/hash in test provenance. Send long disposable history, first HTTP413 with context facts, generate deterministic summary from synthetic endpoint, observe compaction/start -> summary/checkpoint -> end in persisted session log, next request reduced history and succeeds. After disposing/recreating the Context with the same JSONL root, use `ctx.sessionPersistence.prepare(sessionId)` to restore the recorded log and compare reduced surface/requestHeader; error-only generic413 must not compact. A fake service returning retry is not compaction proof.
- [ ] #70 synthetic Codex schema sends use_default, normalizes only completed bash neutral permission field; real escalation (require_escalated) preserved and surfaced to approval fixture. Host tool/approval fixture rejects actual elevation by default. Assert neutral repeated pwd-like synthetic operation does not prompt twice and real escalation is not silently erased. No real shell or account required for deterministic lane.
- [ ] Product edit only when tests expose root cause; preserve previous role/permission fixes. Full live account/model acceptance remains separate pending, including original SSE-shape uncertainty.

### Commands (under safe envelope)

```sh
pnpm --filter dsh-providers exec vitest run tests/common.test.ts tests/translate-tool-roles.test.ts tests/kimi.test.ts tests/codex.test.ts tests/openai-chat.test.ts
node --experimental-strip-types --test scripts/protocol-journeys.test.mts
pnpm --filter dsh-providers typecheck
pnpm --filter dsh-providers build
```

### Journey gate

Authorized real Codex/Grok/Claude subagent continuation, Kimi tool->visible continuation, durable compaction and permission UI remain pending. Deterministic synthetic provider tests certify Host protocol, not real accounts.

- [ ] Snapshot + full unstaged/untracked diff, exact RED/GREEN logs, no-staged check, self-review and bounded report. Parent independent spec+quality review required; retain evidence and make no commit.

## R11: Candidate gate, provenance and complete-journey handoff

Standalone brief: `/Users/codepi/Coding/worktrees/dsh-plugins/pi-worktree-bbb162d2-2690-4346-98ee-26d065c1a5ce-s0-0/.superpowers/sdd/2026-09-08-closed-issue-remediation/briefs/R11.md`

### Files

- `scripts/runtime-contracts.test.mts`
- `scripts/composer-dom.test.mts`
- `scripts/protocol-journeys.test.mts`
- `scripts/smoke-browser.mjs`
- `scripts/smoke-model.mjs`
- `/Users/codepi/Coding/worktrees/dsh-plugins/pi-worktree-bbb162d2-2690-4346-98ee-26d065c1a5ce-s0-0/.superpowers/sdd/2026-09-08-closed-issue-remediation/reports/issue-acceptance.json`
- `/Users/codepi/Coding/worktrees/dsh-plugins/pi-worktree-bbb162d2-2690-4346-98ee-26d065c1a5ce-s0-0/.superpowers/sdd/2026-09-08-closed-issue-remediation/reports/candidate-report.md`
- `/Users/codepi/Coding/worktrees/dsh-plugins/pi-worktree-bbb162d2-2690-4346-98ee-26d065c1a5ce-s0-0/.superpowers/sdd/2026-09-08-closed-issue-remediation/reports/candidate-review-package.md`
- `/Users/codepi/Coding/worktrees/dsh-plugins/pi-worktree-bbb162d2-2690-4346-98ee-26d065c1a5ce-s0-0/.superpowers/sdd/2026-09-08-closed-issue-remediation/progress.md`

### Interfaces

Consumes all R1..R10 task snapshot/review reports. Produces issue rows `{issue:number, tasks:string[], code:"pass"|"fail"|"pending", deterministic:"pass"|"fail"|"pending", realJourney:"pass"|"fail"|"blocked"|"pending", evidence:string[], blockers:string[]}` for exact 17 issues. Candidate complete iff all required code/tests/journeys pass and both independent verdicts accepted, not merely all task workers done.

R0 safe final baseline: recovered check pass, isolated build/path/CLI/runtime pass, first uncontained pass INVALID for safety, one fixture-topology failure retained. R5 explicit-path safety regression is mandatory. No historical beccf0b5 counts may be presented as candidate evidence.

- [ ] Read all task reports/reviews and ledger rulings; map exact seventeen issues. R0 report is not product acceptance. Verify known REDs have focused GREEN with same assertions and source provenance; parked in-scope functional failures prevent complete.
- [ ] Add report validator using exact IDs:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const rows = JSON.parse(await readFile(process.argv[2], 'utf8'));
const ids = [51,52,60,61,69,70,80,84,100,101,104,105,131,132,135,205,207];
assert.deepEqual(rows.map(row => row.issue).sort((a,b)=>a-b), ids);
assert.ok(rows.every(row => row.evidence.length > 0));
const complete = rows.every(row => row.code === 'pass' && row.deterministic === 'pass' && row.realJourney === 'pass' && row.blockers.length === 0);
console.log(JSON.stringify({ complete }));
if (!complete) process.exitCode = 1;
```

Store as task-owned reports/validate-acceptance.mjs, run `node reports/validate-acceptance.mjs reports/issue-acceptance.json` from this task evidence directory. Expected failure for any required missing journey is honest candidate status, not a weakened validator.

- [ ] Inspect changed scripts for protected-home/service/account operations BEFORE execution. Run root check, build, path, CLI, fixture-isolated runtime, new protocol and composer scripts under sanitized fail-closed envelope, retaining logs/exits. Source gate failure is RED with owner fix; infrastructure stops that lane for parent recovery. No test suppressions.
- [ ] Live gates only after parent confirms bounded3081 transfer, own project/synthetic credential values and selected real account/model/script scope. Existing smoke-sandbox is destructive disposable-home orchestration, not safe simply because its name contains smoke; do not invoke while another checkout owns3081. Existing smoke-browser reads auth from supplied home; only approved topic home and ephemeral browser. smoke-model writes board/workspace/session and invokes model, so needs explicit authorization and durable-artifact cleanup receipt beyond deleting temp project directory. Preserve PR215 real hit-testing (no force click) and native NoticeDialog.
- [ ] Capture tracked diff and untracked intended source as complete snapshot; source SHA256 for all changed files, built lib entries, root/CLI lock hashes, versions, actual Node/OS. Rebuild immediately before live QA and prove rendered process is that snapshot (disk hash alone insufficient). Final report discloses every unexecuted journey, upstream compatibility blocker and R0 safety exception.
- [ ] Parent independent final spec+quality reviewer consumes candidate package and per-task rulings. No known required failure can be parked as complete. Deliver local candidate without npm publication, git stage/commit/push/merge or branch cleanup; preserve managed worktree and evidence.

### Commands (under safe envelope)

```sh
pnpm check
pnpm check:build
pnpm check:path
pnpm check:cli
pnpm check:runtime
node --experimental-strip-types --test scripts/protocol-journeys.test.mts scripts/composer-dom.test.mts
```

### Journey gate

Full candidate remains not complete if R4 generic safety, R9 any catalog plugin, real configuration/auth/model/UI journey or independent review is blocked/unexecuted.

- [ ] Snapshot + full unstaged/untracked diff, exact RED/GREEN logs, no-staged check, self-review and bounded report. Parent independent spec+quality review required; retain evidence and make no commit.

## Verbatim owner rulings — mandatory for every subsequent worker

Source: `/tmp/dsh-full-remediation-20260908-xpJoEa/owner-brief.md`. This verbatim ruling supplements the task instructions above; do not infer weaker authority from abbreviated summaries.

### Mandatory test containment — supervisor ruling after R0 discovery

The first R0 baseline gates ran with DSH_HOME unset and HOME=/Users/codepi. Existing router-preferences tests pass a temporary destination but saveRoutingPreference still calls ensurePluginDir(), whose default path is ~/.dsh/plugins/providers and whose effects include mkdir/chmod. Actual effects in the protected path are UNKNOWN and MUST NOT be investigated or rolled back by accessing it. Preserve those original logs and mark them INVALID FOR SAFE-BASELINE ACCEPTANCE; the parent disclosed this exception to the user. A correctness exit 0 does not establish home isolation. Do not repeat the earlier claim that these invocations were proven official-home-free.

For EVERY R0 rerun and later implementation/fix/validation child, before any test/build/package subprocess or import of product code: use an explicitly constructed sanitized environment with HOME, DSH_HOME and cache paths in this plan's synthetic fixture; TMPDIR/TMP/TEMP must instead point to one uniquely owned mkdtemp OUTSIDE every Git checkout, recorded in this plan's ledger. Existing tests deliberately require a temporary non-Git directory, so an in-worktree TMPDIR is invalid infrastructure, not a product defect. Omit inherited live-home overrides and real account/provider credentials. Inspect transitive path helpers, test setup and subprocess helpers for explicit protected-home literals and code that deletes overrides. Environment setup must happen before module import; a temporary data filename alone is not isolation. Fail closed if a command cannot be shown contained; contact parent rather than execute it. Plain Git/source reads may use ordinary environment, but never inspect ~/.dsh. Do not rerun package installs merely because HOME changed; inspect lifecycle and use already owned dependencies where possible. pnpm 11 implicitly recreated owned node_modules during the first isolated rerun after HOME/store changed; preserve that log and the associated failed workbench outside-Git test as an infrastructure attempt. Pinned pnpm 11 has no autoInstall=false switch for this script dependency synchronization. For the root and CLI workspaces use the source-verified, command-scoped environment setting pnpm_config_verify_deps_before_run=error inherited by recursive invocations; runDepsStatusCheck must throw VERIFY_DEPS_BEFORE_RUN instead of installing. R0 controls proved this env override works WITH pnpm-workspace.yaml (packages: [] suffices), but a bare standalone fixture WITHOUT that file ignored it and implicitly installed TypeScript plus synthetic marker scripts. Preserve both controls. Do not claim global environment-only enforcement. Any new standalone fixture must prove fail-closed behavior for its actual layout: either a fixture-local workspace declaration or a verified command-scoped --config.verify-deps-before-run=error mechanism; an untested CLI flag is not proof. Never change persistent user/project config. Capture source/index/lock hashes and dependency ownership/provenance before retry. Any further install must be explicit, frozen, isolated and justified; do not hide automatic reinstalls or assume old gates still attest changed dependencies. Keep tests and generated artifacts in the single task worktree/plan fixture, never the hub. These fixtures are not another live DSH home or server.

R5 additionally MUST remove custom-path persistence's unrelated default-directory preparation. Preparing an explicit destination may create only its missing parent path with private mode and must not silently chmod a pre-existing caller-owned directory. Preserve 0600 file guarantees and atomic/serialized writes. Regression uses a synthetic default-home sentinel path distinct from the custom destination and proves the default preparation is not invoked/touched. Test it under isolated environment; no protected-path probe.

### Corrected RC1 composer ownership ruling

R6 Composer: only plugin-owned content within real composer surface, don't move/hide shared dock siblings. RC1 conversation.composer.bar is SINGLE/session-maybe, not a chain and has no evidenced public middleware/derive API. Use the supported session-scoped input.left for session chips; a minimal root shell.overlay contribution may portal its OWN historical-only node into actual [data-composer-card] for verified no-session state. This is an explicit pinned DOM compatibility adapter, not a nonexistent upstream accessory contract. Never replace composer, move Host nodes, mutate Host styles/classes, or hide shared parents. Suppress ambiguous/loading selection states and test transitions/disposal/own-node mutation filtering/coalescing; selector mismatch must leave Host usable. Record this ruling and its upstream-DOM-drift cost in the spec/ledger; no redundant native placeholder layer; test real RC1 DOM topology, hero/active/no-session, width 1440/768/390, typing/clearing/resize and disposal/HMR.
