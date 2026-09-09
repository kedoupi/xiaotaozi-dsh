# Closed-issue remediation MARKET Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. The parent owns dispatch/review; children never launch agents. Checkbox steps track work. Owner no-commit snapshot ruling overrides skill commits and cleanup.

**Goal:** Complete the approved market user journeys, without confusing deterministic evidence with live acceptance.

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

## R8: Honest market partial-install and rollback lifecycle

Standalone brief: `/Users/codepi/Coding/worktrees/dsh-plugins/pi-worktree-bbb162d2-2690-4346-98ee-26d065c1a5ce-s0-0/.superpowers/sdd/2026-09-08-closed-issue-remediation/briefs/R8.md`

### Files

- `plugins/market/src/routes.ts`
- `plugins/market/src/index.ts`
- `plugins/market/src/profile-deps.ts`
- `plugins/market/tests/profile-deps.test.ts`
- `plugins/market/src/catalog.ts`
- `plugins/market/src/plugin-mutate.ts`
- `plugins/market/src/plugin-entry.ts`
- `plugins/market/src/allow-builds.ts`
- `plugins/market/src/mutate-error.ts`
- `plugins/market/src/client/install-presentation.ts`
- `plugins/market/tests/routes.test.ts`
- `plugins/market/tests/catalog.test.ts`
- `plugins/market/tests/plugin-mutate.test.ts`
- `plugins/market/tests/allow-builds.test.ts`
- `plugins/market/tests/mutate-error.test.ts`
- `plugins/market/tests/install-presentation.test.ts`

### Interfaces

Preserve existing `PluginMutator(action,entry):Promise<{ok:true}|{ok:false;error:string}>`, serialized mutation lane and `MarketStores`. Extend CatalogEntry response additively `installationState?:"absent"|"partial"|"installed"`; installed boolean true only when coherent dependency+bundle+loadable entry. Runtime activation remains separate inventory state, not inferred from disk. Extend profile-deps.ts with `readProfileState(env?:NodeJS.ProcessEnv):{dependencies:Record<string,string>;bundles:string[]}` reading and validating package.json `dsh.profile.bundles` (actual CLI extra-plugin-load.ts convention), preserving readProfileDependencies compatibility. Add optional `MarketStores.readProfileState` and wire it in index.ts; production always supplies it, legacy missing seam cannot certify installed/no-op. Per-target snapshot `{dependencySpec:string|undefined;bundlePresent:boolean;entry:PluginEntryInspection}` supports state projection and safe rollback eligibility. Do not build a whole-profile transaction framework or write manifests directly from routes. If target existed before, never unconditional remove on failed repair; retain honest partial/failure. If absent before, removal may undo only introduced target after DSH mutation; verify unrelated profile/data intact. Prefer structured rollback facts internal to routes; if error string compatibility retained, rollback-failed must take precedence in formatter. Existing explicit allowBuilds:false and unresolved placeholder are denials/pending decisions, never true.

routes.ts currently returns successful no-op if dependency marks installed, before inspecting loadability; failed add can leave dependency-only residue. Missing-entry/uiConversation formatter erases rollback failed.

- [ ] Add executable regression to mutate-error.test.ts:

```ts
it('never converts rollback failure into rollback success', () => {
  const text = explainMutateError('Client waits for uiConversation; rollback failed (EACCES)');
  expect(text).toMatch(/回滚失败/);
  expect(text).not.toContain('已回滚安装');
  expect(text).toContain('EACCES');
});
it('recognizes unresolved native build authorization', () => {
  expect(classifyMutateError('Ignored build scripts: better-sqlite3. set this to true or false')).toBe('allow-builds-blocked');
});
```

- [ ] In routes.test.ts extend existing withMarketServer fixture: first mutate adds dependency then returns failure; inspection says missing lib and profile lacks bundle. GET must show partial/not installed; second install must call mutator again, not no-op; after successful add+entry+bundle mark installed. Also dependency+entry but quarantined bundle-only missing state from CLI #84; retry must repair activation membership, not only add redundant dependency. Runtime failure stays visibly separate until Host activation succeeds.
- [ ] Capture pre-mutation target state and reconcile after ALL failures including thrown subprocess and timeout. Restore only target changes if safe; otherwise represent partial and repairable explicitly. Never unconditional remove an already-present plugin as rollback, never lose user data/unrelated bundles/dependencies. If exact safe restoration needs transaction interface broader than current stores, present parent the minimal snapshot fields before implementation. Retain intent settlement/cleanup failures and mutationApplied behavior.
- [ ] Install no-op only for verified coherent installed state; corrupted/unreadable profile fails closed, not absent. Retry serializes with removal and re-reads state inside queue. Tests concurrent install/install, install/remove, failed rollback, failed intent persistence and unrelated plugin checksum unchanged.
- [ ] Classify ignored native builds, explicit false, unresolved placeholder with precise safe copy. Do not reuse stderr-suggested keys to elevate native or transitive build trust; explicit denials remain untouched byte-for-byte. Existing Git prepare retry may only follow already-authorized target policy; no arbitrary code. Preserve redaction, tail bounds, meaningful rollback failure in client UI.

### Commands (under safe envelope)

```sh
pnpm --filter dsh-market exec vitest run tests/routes.test.ts tests/catalog.test.ts tests/plugin-mutate.test.ts tests/allow-builds.test.ts tests/mutate-error.test.ts tests/install-presentation.test.ts
pnpm --filter dsh-market typecheck
pnpm --filter dsh-market build
```

### Journey gate

Real catalog lifecycle depends on R9 upstream/spec/build authorization and 3081 transfer; fixtures can prove repair transaction without executing third-party code.

- [ ] Snapshot + full unstaged/untracked diff, exact RED/GREEN logs, no-staged check, self-review and bounded report. Parent independent spec+quality review required; retain evidence and make no commit.

## R9: Catalog plugins actually install, activate and work

Standalone brief: `/Users/codepi/Coding/worktrees/dsh-plugins/pi-worktree-bbb162d2-2690-4346-98ee-26d065c1a5ce-s0-0/.superpowers/sdd/2026-09-08-closed-issue-remediation/briefs/R9.md`

### Files

- `plugins/market/src/catalog.ts`
- `plugins/market/tests/catalog.test.ts`
- `plugins/market/README.md`
- `plugins/market/README.zh.md`
- `/Users/codepi/Coding/worktrees/dsh-plugins/pi-worktree-bbb162d2-2690-4346-98ee-26d065c1a5ce-s0-0/.superpowers/sdd/2026-09-08-closed-issue-remediation/reports/R9-upstream-feasibility.json`
- `/Users/codepi/Coding/worktrees/dsh-plugins/pi-worktree-bbb162d2-2690-4346-98ee-26d065c1a5ce-s0-0/.superpowers/sdd/2026-09-08-closed-issue-remediation/reports/R9-catalog-journeys.json`

### Interfaces

Keep MARKET_PLUGINS as sole authority and legacy spec matching. Update only compatible upstream npm/Git exact specs and truthful displayed version after evidence; do not vendor or remove required products to claim success. Feasibility record per plugin: `{id, packageName, version, spec, license, integrity, hostRc, scripts, nativeDependencies, requiredServices, activation, functionality, restart, blocker}`. Status each field pass/fail/blocked/pending with evidence path, never a generic installed=true certificate.

R0 read-only evidence: r9-metadata.json and r9-public-source.json. npm latest at inspection: Teams0.1.15, Context0.46.0 (catalog displays0.44.0 but floating spec), OpenContext0.3.2. Teams actual lib/client.js inject includes uiConversation, incompatible with RC1 current service and rejected by existing safety gate. Context published lib exists and >=0.1.2-rc.1 peers; uiConversation comment alone is NOT injected dependency. OpenContext peers ^0.1.1-rc.2 and @melandlabs/opencontext dependency; local backend lexical fallback exists, HTTP backend is optional; full memory/embedding/native compatibility still unproved. All metadata/license/script observations are not activation acceptance.

- [ ] Before any execution, read exact selected tarball package/scripts/license/entries and transitive native dependency scripts. Fetch registry JSON and tarball as data only, verify integrity; do not run prepare, import package or create accounts in this phase. Record release date/hash/spec and compatibility against RC1 published symbols. Query upstream public tags/source for a compatible Teams release; latest observed is incompatible, so no guessed package downgrade/upgrade success.
- [ ] Executable metadata sanity example (safe read-only, no lifecycle scripts):

```js
import assert from 'node:assert/strict';
const response = await fetch('https://registry.npmjs.org/dsh-context/0.46.0');
assert.equal(response.status, 200);
const pkg = await response.json();
assert.equal(pkg.name, 'dsh-context');
assert.equal(pkg.license, 'Apache-2.0');
assert.equal(pkg.main, 'lib/index.js');
assert.ok(pkg.dist.integrity);
assert.equal(pkg.peerDependencies['@deepseek-ai/dsh-session'], '>=0.1.2-rc.1');
```

Persist selected metadata without secrets under this task report; fetch availability failure is infrastructure and not package incompatibility.

- [ ] Parent approval must name exact package specs/transitive script allowlist, disposable project/home, 3081 owner window and any service/account. Until then record BLOCKED external acceptance and continue permitted local catalog tests. No silent allowBuilds elevation; no new service as workaround.
- [ ] Context journey: install selected compatible spec -> runtime active -> chart/composition/history/events and /context correspond to a new synthetic session -> hard refresh -> restart -> features persist. Teams: leader creates member, tool dispatch and continuation produce expected separate member results and UI remains loaded; actual advertised collaboration, not just a package entry. OpenContext: capture known disposable fact, query/automatic recall in subsequent turn, restart and recall again; confirm local backend scope and storage target. If embeddings required for advertised graph/search, lexical-only fallback is partial not full completion. No capture of real saved sessions.
- [ ] Each card must use actual version/spec and expose failed activation without breaking core SPA. Compatible upstream absence is exact unresolved blocker. Teams0.1.15 is a confirmed blocker at R0; Context/OpenContext are candidate feasibility, not complete. Do not fake a compatible release, fork/publish upstream, promote ownership or remove catalog rows. R8 cannot satisfy R9 by quarantine.

### Commands (under safe envelope)

```sh
pnpm --filter dsh-market exec vitest run tests/catalog.test.ts tests/plugin-entry.test.ts
pnpm --filter dsh-market typecheck
```

### Journey gate

All three real install->activate->advertised functionality->refresh/restart journeys mandatory. Package and service prerequisites require concrete parent authorization; an upstream incompatibility keeps candidate not complete.

- [ ] Snapshot + full unstaged/untracked diff, exact RED/GREEN logs, no-staged check, self-review and bounded report. Parent independent spec+quality review required; retain evidence and make no commit.

## Verbatim owner rulings — mandatory for every subsequent worker

Source: `/tmp/dsh-full-remediation-20260908-xpJoEa/owner-brief.md`. This verbatim ruling supplements the task instructions above; do not infer weaker authority from abbreviated summaries.

### Mandatory test containment — supervisor ruling after R0 discovery

The first R0 baseline gates ran with DSH_HOME unset and HOME=/Users/codepi. Existing router-preferences tests pass a temporary destination but saveRoutingPreference still calls ensurePluginDir(), whose default path is ~/.dsh/plugins/providers and whose effects include mkdir/chmod. Actual effects in the protected path are UNKNOWN and MUST NOT be investigated or rolled back by accessing it. Preserve those original logs and mark them INVALID FOR SAFE-BASELINE ACCEPTANCE; the parent disclosed this exception to the user. A correctness exit 0 does not establish home isolation. Do not repeat the earlier claim that these invocations were proven official-home-free.

For EVERY R0 rerun and later implementation/fix/validation child, before any test/build/package subprocess or import of product code: use an explicitly constructed sanitized environment with HOME, DSH_HOME and cache paths in this plan's synthetic fixture; TMPDIR/TMP/TEMP must instead point to one uniquely owned mkdtemp OUTSIDE every Git checkout, recorded in this plan's ledger. Existing tests deliberately require a temporary non-Git directory, so an in-worktree TMPDIR is invalid infrastructure, not a product defect. Omit inherited live-home overrides and real account/provider credentials. Inspect transitive path helpers, test setup and subprocess helpers for explicit protected-home literals and code that deletes overrides. Environment setup must happen before module import; a temporary data filename alone is not isolation. Fail closed if a command cannot be shown contained; contact parent rather than execute it. Plain Git/source reads may use ordinary environment, but never inspect ~/.dsh. Do not rerun package installs merely because HOME changed; inspect lifecycle and use already owned dependencies where possible. pnpm 11 implicitly recreated owned node_modules during the first isolated rerun after HOME/store changed; preserve that log and the associated failed workbench outside-Git test as an infrastructure attempt. Pinned pnpm 11 has no autoInstall=false switch for this script dependency synchronization. For the root and CLI workspaces use the source-verified, command-scoped environment setting pnpm_config_verify_deps_before_run=error inherited by recursive invocations; runDepsStatusCheck must throw VERIFY_DEPS_BEFORE_RUN instead of installing. R0 controls proved this env override works WITH pnpm-workspace.yaml (packages: [] suffices), but a bare standalone fixture WITHOUT that file ignored it and implicitly installed TypeScript plus synthetic marker scripts. Preserve both controls. Do not claim global environment-only enforcement. Any new standalone fixture must prove fail-closed behavior for its actual layout: either a fixture-local workspace declaration or a verified command-scoped --config.verify-deps-before-run=error mechanism; an untested CLI flag is not proof. Never change persistent user/project config. Capture source/index/lock hashes and dependency ownership/provenance before retry. Any further install must be explicit, frozen, isolated and justified; do not hide automatic reinstalls or assume old gates still attest changed dependencies. Keep tests and generated artifacts in the single task worktree/plan fixture, never the hub. These fixtures are not another live DSH home or server.

R5 additionally MUST remove custom-path persistence's unrelated default-directory preparation. Preparing an explicit destination may create only its missing parent path with private mode and must not silently chmod a pre-existing caller-owned directory. Preserve 0600 file guarantees and atomic/serialized writes. Regression uses a synthetic default-home sentinel path distinct from the custom destination and proves the default preparation is not invoked/touched. Test it under isolated environment; no protected-path probe.

### Corrected RC1 composer ownership ruling

R6 Composer: only plugin-owned content within real composer surface, don't move/hide shared dock siblings. RC1 conversation.composer.bar is SINGLE/session-maybe, not a chain and has no evidenced public middleware/derive API. Use the supported session-scoped input.left for session chips; a minimal root shell.overlay contribution may portal its OWN historical-only node into actual [data-composer-card] for verified no-session state. This is an explicit pinned DOM compatibility adapter, not a nonexistent upstream accessory contract. Never replace composer, move Host nodes, mutate Host styles/classes, or hide shared parents. Suppress ambiguous/loading selection states and test transitions/disposal/own-node mutation filtering/coalescing; selector mismatch must leave Host usable. Record this ruling and its upstream-DOM-drift cost in the spec/ledger; no redundant native placeholder layer; test real RC1 DOM topology, hero/active/no-session, width 1440/768/390, typing/clearing/resize and disposal/HMR.
