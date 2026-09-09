# Closed-issue remediation UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. The parent owns dispatch/review; children never launch agents. Checkbox steps track work. Owner no-commit snapshot ruling overrides skill commits and cleanup.

**Goal:** Complete the approved ui user journeys, without confusing deterministic evidence with live acceptance.

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

## R6: Composer ownership and RC1 topology

Standalone brief: `/Users/codepi/Coding/worktrees/dsh-plugins/pi-worktree-bbb162d2-2690-4346-98ee-26d065c1a5ce-s0-0/.superpowers/sdd/2026-09-08-closed-issue-remediation/briefs/R6.md`

### Files

- `plugins/providers/src/client/install-smart-ux.ts`
- `plugins/providers/src/client/SmartUx.tsx`
- `plugins/providers/src/client/smart-ux.ts`
- `plugins/providers/src/client/styles.ts`
- `plugins/providers/src/client/historical-composer.ts (new)`
- `plugins/providers/src/client/plugin-center-contract.ts`
- `plugins/providers/tests/smart-ux.test.ts`
- `plugins/xtz-ui/src/client/composer-hint.ts`
- `plugins/xtz-ui/src/client/styles.ts`
- `plugins/xtz-ui/tests/composer-hint.test.ts`
- `scripts/composer-dom.test.mts (new)`
- `docs/harness-plugin.md`
- `docs/harness-plugin.zh.md`

### Interfaces

Consumes R5 sessionId/attribution and standard useSessions/current/phase. Active registration `{name:"conversation.input.left", id:"providers-smart-ux", order:80}`; keeps native model seat policy separate. No dock relocation. Root `{name:"shell.overlay", id:"providers-historical-composer", order:80}` only for no-session compatibility display. New internal `mountHistoricalComposer(doc:Document, text:string):()=>void` owns one node under real `[data-composer-card]`, not shared ancestors; component calls it only for ready/no-session/historical state. Avoid new react-dom dependency: small package-local DOM mount with textContent and existing styles, not Host React replacement. `syncComposerHint(root:ParentNode):void` must remove/suppress own overlay whenever native `[data-composer-placeholder]` exists.

Pinned client.js:14459 docks above InputBar; :15555 actual card; :15645 input.left inside card but session-only. composer.bar is SINGLE/session-maybe, NOT chain; accessory is owner prop, not an authorized third-party middleware. Parent approved root-owned DOM compatibility adapter for no-session only. Cost is RC DOM drift; selector failure leaves Host composer usable.

- [ ] Replace attachDockToComposerCard logic with supported input.left registration. Delete parent-hiding :has CSS and host-cell mutation; hide only own empty node. Preserve Todo/Queue and all other dock siblings. Do not shadow conversation/composer.bar or move input outlet.
- [ ] Add deterministic browser test using root Playwright, actual RC1 modules loaded in an offline in-memory ModuleLoader fixture (serve no DSH). Existing selectors must be sampled from loaded RC1, not invented last-child mocks. In test callback use:

```ts
for (const width of [1440, 768, 390]) {
  await page.setViewportSize({ width, height: 1000 });
  const chip = page.locator('[data-dsh-providers-turn-model]');
  assert.equal(await chip.evaluate(node => !!node.closest('[data-composer-card]')), true);
  const card = await page.locator('[data-composer-card]').boundingBox();
  const box = await chip.boundingBox();
  assert.ok(card && box && box.x >= card.x && box.x + box.width <= card.x + card.width + 1);
  assert.equal(await page.locator('[data-fixture-todo]').isVisible(), true);
  assert.equal(await page.locator('[data-fixture-queue]').isVisible(), true);
}
```

`page` is created with chromium.launch/newContext/newPage inside node:test and closed in finally; only source-owned HTML fixtures/module mocks, no live home/auth. Fixture loads published `@deepseek-ai/dsh-web-frontend/dist/index.html` and its owned dist/assets through Playwright route.fulfill, then published `dsh-client-ui-conversation/lib/client.js` via `window.__ModuleLoader__.load`; InputBar is PRIVATE, not an importable public export. Preserve actual slots/renderer/React supplied by the pinned frontend (client-ui-slots/client-store are browser builtin modules, not necessarily separately installed npm packages). Provide deterministic session/workspace/locale/settingsScope service snapshots and fake transport only; the conversation bundle inject list is slots/sessions/uiSession/uiWorkspace/locale/settingsScope. Mount its actual apply contribution and first-party compiled client, so card/input.left come from real RC1 rendering, not copied markup. Route all other network to an explicit failure and never connect a live socket. If pinned bootstrap cannot be hosted without new dependencies/services, report exact fixture blocker; do not substitute fake object nodes or claim a private InputBar export exists.

- [ ] Root historical mount uses createElement/textContent; own data attribute, observer watches card creation/replacement only, coalesces microtasks and ignores own writes. Disposal marks generation dead, disconnects observer and removes only owned node. No Host style/class mutation. Mount only when useSessions phase ready/current undefined; transition to selected session removes it before active chip renders. Unknown/loading selection shows neither historical nor fictitious current display.
- [ ] Native placeholder wins: when card contains data-composer-placeholder remove existing plugin hint and return. Retain legacy textarea fallback only where native absent, but remove stale fallback as native appears. Test typing, whitespace, clear, multiline, resize, workspace-picker inert card, hero-with-session, active, true no-session, card replacement, 20 HMR cycles, no duplicate observer callbacks or owned nodes.
- [ ] RED genuine card containment under old code, GREEN new slot and root adapter. Update pin/removal-condition docs. Full rendered live QA remains separate from offline DOM test; do not count synthetic layout alone as browser acceptance.

### Commands (under safe envelope)

```sh
pnpm --filter dsh-providers exec vitest run tests/smart-ux.test.ts tests/ui-contract.test.ts
pnpm --filter dsh-xtz-ui exec vitest run tests/composer-hint.test.ts
pnpm check:build
node --experimental-strip-types --test scripts/composer-dom.test.mts
```

### Journey gate

Parent-authorized 3081 rendered QA at 1440/768/390, with real RC1 composer and all required transitions. No background sandbox start from this task.

- [ ] Snapshot + full unstaged/untracked diff, exact RED/GREEN logs, no-staged check, self-review and bounded report. Parent independent spec+quality review required; retain evidence and make no commit.

## R7: Models and Advanced configuration round-trip

Standalone brief: `/Users/codepi/Coding/worktrees/dsh-plugins/pi-worktree-bbb162d2-2690-4346-98ee-26d065c1a5ce-s0-0/.superpowers/sdd/2026-09-08-closed-issue-remediation/briefs/R7.md`

### Files

- `plugins/providers/src/client/host-api.ts`
- `plugins/providers/src/client/ModelsWorkspace.tsx`
- `plugins/providers/src/client/workspace-panels.tsx`
- `plugins/providers/src/client/index.ts`
- `plugins/providers/tests/ui-contract.test.ts`
- `plugins/providers/tests/ui-disclosure.test.ts`
- `plugins/xtz-ui/src/client/advanced-runtime.ts`
- `plugins/xtz-ui/src/client/runtime-credentials.ts`
- `plugins/xtz-ui/src/client/index.ts`
- `plugins/xtz-ui/tests/advanced-runtime.test.ts`
- `plugins/xtz-ui/tests/advanced-runtime-ui.test.ts`
- `scripts/runtime-contracts.test.mts`

### Interfaces

Preserve PR213 dotted injection and positional Typert adaptation, PR215 Models root and native dialog. Host methods: remote.credentials.describe(refs:string[]), set(ref:string,value:string), unset(ref:string); remote.settings.describe(), mutate(ns:string, ops:{op:"set"|"unset";path:string[];value?:unknown}[], expectedRevision:number|undefined). Existing hostApiFromRemote(remote):HostApi|undefined retains internal WireResult envelope. Runtime `createRuntimeForm(namespace,scope,credentials):RuntimeForm` retains set/reset/save/read interface.

Latest base already adapts Advanced; do not restore superseded #51 navigation or treat PR213 as unimplemented. Need actual safe CRUD and no stale draft writes.

- [ ] Extend current real Cordis clientFixture test in scripts/runtime-contracts.test.mts with configured/writable maps for CR_FAKE_KEY; fake transport implements set/describe/unset and returns validation failures without any credentials service disk writes. Add:

```ts
test('Models credential round-trip uses positional RC1 calls', async () => {
  let configured = false;
  await clientFixture('providers', async remote => {
    const api = hostApiFromRemote(remote); assert.ok(api);
    assert.equal((await api.credentials.set({ref:'CR_FAKE_KEY',value:'disposable-1'})).result.ok, true);
    const afterSet = (await api.credentials.describe({refs:['CR_FAKE_KEY']})).result;
    assert.ok(afterSet.ok);
    assert.equal(afterSet.value.credentials.CR_FAKE_KEY.configured, true);
    assert.equal((await api.credentials.unset({ref:'CR_FAKE_KEY'})).result.ok, true);
    const afterUnset = (await api.credentials.describe({refs:['CR_FAKE_KEY']})).result;
    assert.ok(afterUnset.ok);
    assert.equal(afterUnset.value.credentials.CR_FAKE_KEY.configured, false);
  }, async (_channel, endpoint) => {
    if (endpoint === 'credentials/set') configured = true;
    if (endpoint === 'credentials/unset') configured = false;
    return {ok:true,value:endpoint === 'credentials/describe' ? {CR_FAKE_KEY:{configured,writable:true}} : undefined};
  });
});
```

- [ ] Add replace with disposable-2 and assertions on exact payload order, failed save preserving draft, stale describe after save not reverting state, readonly source denying set/unset (including environment source), bad expectedRevision rejecting stale model selection. No secret value in snapshot/errors.
- [ ] Extend Advanced form tests for shell timeout/agent-loop settings set->save->describe->reset->save->unset and credentials replace/remove; clear sensitive draft after successful operation and disposal. UI controls show read-only reason, not editable-looking fields that silently no-op. Keep existing namespace-specific keys.
- [ ] Only change product paths where new regression exposes failure. Already-correct PR213/215 behavior may be test-only. Models stays under Plugin Center keyed models; Advanced stays runtime only. Do not add credentials to Settings duplicates or restore obsolete navigation.
- [ ] Real UI test protocol: in parent-approved disposable environment record configured bit/revision (never value), save two synthetic safe values, re-open/read, replace, remove/reset, re-open and verify old override absent. Environment-owned key readonly with explanation. No real credentials, discovery calls or account config without explicit authorization.

### Commands (under safe envelope)

```sh
pnpm check:runtime
pnpm --filter dsh-xtz-ui exec vitest run tests/advanced-runtime.test.ts tests/advanced-runtime-ui.test.ts
pnpm --filter dsh-providers exec vitest run tests/ui-contract.test.ts tests/ui-disclosure.test.ts
pnpm --filter dsh-providers typecheck
pnpm --filter dsh-xtz-ui typecheck
```

### Journey gate

Actual Models+Advanced UI writes remain separately authorized. Fake gateway proves shape, not disk/UI usability. Safe disposable values and cleanup receipt required.

- [ ] Snapshot + full unstaged/untracked diff, exact RED/GREEN logs, no-staged check, self-review and bounded report. Parent independent spec+quality review required; retain evidence and make no commit.

## Verbatim owner rulings — mandatory for every subsequent worker

Source: `/tmp/dsh-full-remediation-20260908-xpJoEa/owner-brief.md`. This verbatim ruling supplements the task instructions above; do not infer weaker authority from abbreviated summaries.

### Mandatory test containment — supervisor ruling after R0 discovery

The first R0 baseline gates ran with DSH_HOME unset and HOME=/Users/codepi. Existing router-preferences tests pass a temporary destination but saveRoutingPreference still calls ensurePluginDir(), whose default path is ~/.dsh/plugins/providers and whose effects include mkdir/chmod. Actual effects in the protected path are UNKNOWN and MUST NOT be investigated or rolled back by accessing it. Preserve those original logs and mark them INVALID FOR SAFE-BASELINE ACCEPTANCE; the parent disclosed this exception to the user. A correctness exit 0 does not establish home isolation. Do not repeat the earlier claim that these invocations were proven official-home-free.

For EVERY R0 rerun and later implementation/fix/validation child, before any test/build/package subprocess or import of product code: use an explicitly constructed sanitized environment with HOME, DSH_HOME and cache paths in this plan's synthetic fixture; TMPDIR/TMP/TEMP must instead point to one uniquely owned mkdtemp OUTSIDE every Git checkout, recorded in this plan's ledger. Existing tests deliberately require a temporary non-Git directory, so an in-worktree TMPDIR is invalid infrastructure, not a product defect. Omit inherited live-home overrides and real account/provider credentials. Inspect transitive path helpers, test setup and subprocess helpers for explicit protected-home literals and code that deletes overrides. Environment setup must happen before module import; a temporary data filename alone is not isolation. Fail closed if a command cannot be shown contained; contact parent rather than execute it. Plain Git/source reads may use ordinary environment, but never inspect ~/.dsh. Do not rerun package installs merely because HOME changed; inspect lifecycle and use already owned dependencies where possible. pnpm 11 implicitly recreated owned node_modules during the first isolated rerun after HOME/store changed; preserve that log and the associated failed workbench outside-Git test as an infrastructure attempt. Pinned pnpm 11 has no autoInstall=false switch for this script dependency synchronization. For the root and CLI workspaces use the source-verified, command-scoped environment setting pnpm_config_verify_deps_before_run=error inherited by recursive invocations; runDepsStatusCheck must throw VERIFY_DEPS_BEFORE_RUN instead of installing. R0 controls proved this env override works WITH pnpm-workspace.yaml (packages: [] suffices), but a bare standalone fixture WITHOUT that file ignored it and implicitly installed TypeScript plus synthetic marker scripts. Preserve both controls. Do not claim global environment-only enforcement. Any new standalone fixture must prove fail-closed behavior for its actual layout: either a fixture-local workspace declaration or a verified command-scoped --config.verify-deps-before-run=error mechanism; an untested CLI flag is not proof. Never change persistent user/project config. Capture source/index/lock hashes and dependency ownership/provenance before retry. Any further install must be explicit, frozen, isolated and justified; do not hide automatic reinstalls or assume old gates still attest changed dependencies. Keep tests and generated artifacts in the single task worktree/plan fixture, never the hub. These fixtures are not another live DSH home or server.

R5 additionally MUST remove custom-path persistence's unrelated default-directory preparation. Preparing an explicit destination may create only its missing parent path with private mode and must not silently chmod a pre-existing caller-owned directory. Preserve 0600 file guarantees and atomic/serialized writes. Regression uses a synthetic default-home sentinel path distinct from the custom destination and proves the default preparation is not invoked/touched. Test it under isolated environment; no protected-path probe.

### Corrected RC1 composer ownership ruling

R6 Composer: only plugin-owned content within real composer surface, don't move/hide shared dock siblings. RC1 conversation.composer.bar is SINGLE/session-maybe, not a chain and has no evidenced public middleware/derive API. Use the supported session-scoped input.left for session chips; a minimal root shell.overlay contribution may portal its OWN historical-only node into actual [data-composer-card] for verified no-session state. This is an explicit pinned DOM compatibility adapter, not a nonexistent upstream accessory contract. Never replace composer, move Host nodes, mutate Host styles/classes, or hide shared parents. Suppress ambiguous/loading selection states and test transitions/disposal/own-node mutation filtering/coalescing; selector mismatch must leave Host usable. Record this ruling and its upstream-DOM-drift cost in the spec/ledger; no redundant native placeholder layer; test real RC1 DOM topology, hero/active/no-session, width 1440/768/390, typing/clearing/resize and disposal/HMR.
