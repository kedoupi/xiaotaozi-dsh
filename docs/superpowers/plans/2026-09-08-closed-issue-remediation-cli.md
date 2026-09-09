# Closed-issue remediation CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. The parent owns dispatch/review; children never launch agents. Checkbox steps track work. Owner no-commit snapshot ruling overrides skill commits and cleanup.

**Goal:** Complete the approved cli user journeys, without confusing deterministic evidence with live acceptance.

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

## R1: Detached CLI launch and complete-line authentication capture

Standalone brief: `/Users/codepi/Coding/worktrees/dsh-plugins/pi-worktree-bbb162d2-2690-4346-98ee-26d065c1a5ce-s0-0/.superpowers/sdd/2026-09-08-closed-issue-remediation/briefs/R1.md`

### Files

- `apps/cli/src/runtime.ts`
- `apps/cli/src/startup-reporter.ts` (new internal preload)
- `apps/cli/tsdown.config.ts` (private build entry)
- `apps/cli/tests/startup-reporter.test.mjs` (new)
- `apps/cli/package.json` (read/pack validation only; preserve public exports)
- `apps/cli/src/web-auth-url.ts`
- `apps/cli/src/launch-output.ts (new internal module)`
- `apps/cli/tests/launch-output.test.mjs (new)`
- `apps/cli/tests/detached-launch.test.mjs (new)`

### R1 concrete detached candidate (parent-authorized for fresh review)

Source proof: `apps/cli/src/runtime.ts:162-180` resolves ONLY bundled package bin through `process.execPath` with `prefixArgs:[resolvedBin]`, preserving Windows/Unix Node and `shell:false`; there is no currently supported PATH dsh fallback to remove. Pinned `@deepseek-ai/dsh-web-app/lib/index.js:196-220` constructs authenticated URL through the connection service and announces it through complete console.log output / optional browser handoff. Its `lib/types/index.d.ts` exposes printUrl/openBrowser/trustedHosts, not startup IPC. Connection Host API is not an unauthenticated outside-process recovery endpoint. Recheck these entries before coding; prefer a genuinely supported simpler one-shot channel if found, with fresh review of the changed seam.

- Use the planned `launch-output.ts` bounded collector for foreground and detached capture. Add `startup-reporter.ts` built by private `startup-reporter: "src/startup-reporter.ts"` tsdown entry; not a public command/export or new dependency. Verify npm pack contains helper/shared collector and file URL resolves from installed lib, not source cwd.
- Detached spawn uses SAME bundled Node command/pid/argv plus `--import <file-URL-of-published-startup-reporter.js>` before existing bin prefix; `stdio:["ignore","ignore","ignore","ipc"]`. No Harness patch or NODE_OPTIONS/token environment. Reporter operates only under private IPC contract. stdout/stderr remain OS-discard sinks throughout child lifetime.
- Reporter observes stdout.write/stderr.write independently only until capture settles. Forward exactly once preserving original this, return/backpressure value, Buffer/encoding overloads, callbacks and exceptions. Incremental StringDecoder avoids UTF-8 corruption. Never print/replay captured token bytes. Restore BOTH original functions on capture, local deadline, parent done/disconnect, malformed IPC or startup teardown. A stream-hook exception must not prevent forwarding legitimate Host output to its ignore sink.
- IPC accepts only versioned plain objects with exact kind/shape and bounded strings. Messages: parent `{kind:"xtz-startup-done", version:1}`; child `{kind:"xtz-startup-url", version:1, url:string}`. Parent applies same loopback/scheme/path/token/port validation as parser; no raw URL in errors. Send at most one URL; unref/disconnect channel, remove listeners/timers after settlement. Reporter has independent finite safety deadline even if parent disappears; share the reviewed 10,000ms internal capture default with collector (test seam permits shorter deadline). Parent deadline sends done/disconnect and frees handles without killing a legitimately started DSH.
- Preserve SpawnedDsh interface, actual service pid and truthful exit/ownership. Absent URL means browser-not-ready (R2), not bare-url success. Foreground retains normal live tee and same bounded framing, no preload/IPC. Reporter timeout/disconnect restores hooks even when no startup line exists.
- Add `apps/cli/tests/startup-reporter.test.mjs` for actual preload interception/callback and one-shot channel behavior. Extend detached-launch fixture to repeatedly write both streams AFTER wrapper exit and record increasing progress in explicit synthetic file. Assert wrapper exits within deadline while child remains alive/progress increases without EPIPE/blocked output; terminate ONLY its recorded owned pid in finally. Test no URL, early disconnect/exit, failed spawn, oversize/unterminated/malformed output, fragmented Buffer/UTF-8 and reporter restoration. Do not infer liveness from mock unref calls.
- Fresh reviewer must challenge complexity, Windows/Unix file URL resolution, output interception, npm pack/internal entry availability, frozen path-install/build implications, and lack of long-lived IPC. This is an approved plan candidate, not a pre-accepted implementation. No daemon, spool, new dependency, public setting, credential argv/env/logs or unsupported-launch removal.

## Interfaces

Consumes `parseDshWebAuthenticatedUrl(text: string): string | undefined` (complete logical line parser) and existing `SpawnedDsh.authenticatedUrl?: Promise<string | undefined>`. Preserve `spawnDshDetached(args: string[], home: string, cwd?: string, extraEnv?: NodeJS.ProcessEnv): Promise<SpawnedDsh>` and foreground contract. New internal collector interface: `createLaunchOutputCollector({timeoutMs, maxLineBytes}: {timeoutMs:number; maxLineBytes:number}): {push(stream: "stdout"|"stderr", text:string):void; end(stream:"stdout"|"stderr"):void; fail():void; url:Promise<string|undefined>; dispose():void}`. Test source module directly with Node strip-types; do not enlarge CLI public index exports merely for tests.

Current runtime.ts:collectAuthenticatedUrl combines stdout/stderr and parses unfinished buffer; child.unref leaves pipe handles alive. Keep foreground tee semantics.

- [ ] Extract only line framing into launch-output.ts; independent stream accumulators, UTF8 decoding at stream boundary, CRLF normalization, complete LF lines or EOF final logical line. Overflow discards the entire overlong line until delimiter (never salvage a token suffix). First valid complete URL wins. End both streams without URL, child error, deadline and disposal resolve undefined once and remove timers/listeners. Defaults for internal capture: 65,536 bytes per line and 10,000ms capture bound; foreground tee survives capture completion without unbounded accumulation.
- [ ] Add this executable collector regression to the new source-import Node test:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLaunchOutputCollector } from '../src/launch-output.ts';
test('all token splits wait for line completion', async () => {
  const line = 'dsh web: http://127.0.0.1:43210/?token=synthetic-token\n';
  for (let split = 1; split < line.length; split++) {
    const c = createLaunchOutputCollector({ timeoutMs: 1000, maxLineBytes: 65536 });
    let done = false; c.url.then(() => { done = true; });
    c.push('stdout', line.slice(0, split));
    c.push('stderr', 'unrelated error line\n');
    await Promise.resolve(); assert.equal(done, false);
    c.push('stdout', line.slice(split));
    assert.equal(await c.url, line.trim().slice('dsh web: '.length));
    c.dispose();
  }
});
```

- [ ] Run RED; add cases for URL split across stderr chunks, unrelated partial stdout, multiple lines, CRLF split, EOF without newline, two EOFs, timeout, invalid/nonloopback URL, duplicate tokens, overflowing line, error before spawn identity, repeated dispose and late data.
- [ ] Implement the concrete private preload/one-shot IPC candidate below after rechecking pinned startup channel. Reject unref-only, dead pipes, spool or helper daemon; actual subprocess/packaging proof gates acceptance.
- [ ] Add a wrapper subprocess fixture that invokes the production launcher against a fake resolved Node child (use a private launch resolver seam, not PATH dsh). Child writes a complete split launch line, continues stdout/stderr after parent readiness and after parent exit, records a synthetic completion marker, exits within 2s. Parent test must observe wrapper exit within 750ms after readiness, child marker exists after wrapper death, no EPIPE/unhandled errors, both process identities eventually ESRCH. Kill only recorded fixture child on timeout in finally. This tests OS lifetime, not injected spawn call counts. Repeat with failed spawn and URL timeout.
- [ ] Retain all current CLI auth tests. R2 owns user-facing missing-token behavior; do not decide bare-URL success here.

### Commands (under safe envelope)

```sh
node --experimental-strip-types --test apps/cli/tests/launch-output.test.mjs
pnpm --dir apps/cli build
node --test apps/cli/tests/detached-launch.test.mjs apps/cli/tests/startup-reporter.test.mjs
pnpm check:cli
```

### Journey gate

Bounded synthetic subprocess lifecycle is mandatory now. Actual detached xtz launch/browser authentication belongs to authorized R2/R11 3081 transfer; no official start.

- [ ] Snapshot + full unstaged/untracked diff, exact RED/GREEN logs, no-staged check, self-review and bounded report. Parent independent spec+quality review required; retain evidence and make no commit.

## R2: Owned-process authentication lifecycle

Standalone brief: `/Users/codepi/Coding/worktrees/dsh-plugins/pi-worktree-bbb162d2-2690-4346-98ee-26d065c1a5ce-s0-0/.superpowers/sdd/2026-09-08-closed-issue-remediation/briefs/R2.md`

### Files

- `apps/cli/src/app.ts`
- `apps/cli/src/web-auth-url.ts`
- `apps/cli/tests/cli.test.mjs`
- `apps/cli/README.md`
- `apps/cli/README.zh.md`
- `docs/conventions.md`
- `docs/conventions.zh.md`

### Interfaces

Consumes R1 complete `authenticatedUrl` promise; preserve `WebAuthUrlRecord {pid:number; url:string}` and existing PID generation checks. `readMatchingAuthUrl` must reject null/unknown PID and mismatch; internal `resolvePublicWebUrl(deps:CliDependencies, status:ServiceStatus, pid:number|null): Promise<string | undefined>` must not fabricate a browser-ready URL. `runCli(argv,deps): Promise<number>` remains unchanged.

Current app.ts:resolvePublicWebUrl falls back to status.url; missing PID can accept any cached record at same host/port. Start/open can report success despite new BrowserAuth client receiving 401.

- [ ] Extend existing fakeDependencies matrix across open, already-running start, stopped start, restart and status. Use no live service. In cli.test.mjs add:

```js
test('open without matching launch auth does not open a known unusable bare URL', async () => {
  const fixture = fakeDependencies({ probe: async () => serviceAt(3080, true) });
  fixture.files.set(`${HOME}/${WEB_PID_FILE}`, VALID_PID_RECORD);
  assert.equal(await runCli(['open'], fixture.dependencies), 2);
  assert.deepEqual(fixture.opened, []);
  assert.match(fixture.output.stderr, /restart/);
  assert.equal(fixture.stopped.length, 0);
});
```

- [ ] Run RED for missing record, wrong pid, unknown PID, host/port mismatch, malformed record, stale token after restart, reused PID generation, read/write failure. Valid same-generation record must open full URL on first/repeated open; restarted owned child supplies a different synthetic token and prior URL is never reused. Preserve concurrent lifecycle lock and generation-safe cleanup assertions.
- [ ] Separate process status from browser-launch readiness: no auth => nonzero open/start browser result with minimal safe manual `xtz restart` guidance ONLY when owned process permits it; foreign/unverified process => do not restart, signal, or offer ownership adoption. `status` may report healthy Host but must not say browser opened or ready URL if unknown. Fresh launch whose capture fails preserves valid ownership record and explains explicit retry/restart, never auto-restarts a foreign process. No new command.
- [ ] Use undefined control flow rather than `?? status.url`; announce/open only after matched token URL. Error output redacts tokens; record file remains 0600 and only current generation is removed. Add Chinese/English docs describing exact recovery without protected-home inspection instructions in task verification.
- [ ] Validate fresh browser handshake separately: token URL -> cookie -> clean '/' -> SPA; token rotation invalidates old URL. Fake gateway and successful opener return are not handshake proof.

### Commands (under safe envelope)

```sh
pnpm --dir apps/cli build
node --test --test-name-pattern="auth|open|restart|running|pid" apps/cli/tests/cli.test.mjs
pnpm check:cli
```

### Journey gate

Parent must authorize bounded 3081 transfer and disposable browser/profile values; test first/repeated opens, restart rotation, missing/stale records there. Never read/copy official auth.

- [ ] Snapshot + full unstaged/untracked diff, exact RED/GREEN logs, no-staged check, self-review and bounded report. Parent independent spec+quality review required; retain evidence and make no commit.

## Verbatim owner rulings — mandatory for every subsequent worker

Source: `/tmp/dsh-full-remediation-20260908-xpJoEa/owner-brief.md`. This verbatim ruling supplements the task instructions above; do not infer weaker authority from abbreviated summaries.

### Mandatory test containment — supervisor ruling after R0 discovery

The first R0 baseline gates ran with DSH_HOME unset and HOME=/Users/codepi. Existing router-preferences tests pass a temporary destination but saveRoutingPreference still calls ensurePluginDir(), whose default path is ~/.dsh/plugins/providers and whose effects include mkdir/chmod. Actual effects in the protected path are UNKNOWN and MUST NOT be investigated or rolled back by accessing it. Preserve those original logs and mark them INVALID FOR SAFE-BASELINE ACCEPTANCE; the parent disclosed this exception to the user. A correctness exit 0 does not establish home isolation. Do not repeat the earlier claim that these invocations were proven official-home-free.

For EVERY R0 rerun and later implementation/fix/validation child, before any test/build/package subprocess or import of product code: use an explicitly constructed sanitized environment with HOME, DSH_HOME and cache paths in this plan's synthetic fixture; TMPDIR/TMP/TEMP must instead point to one uniquely owned mkdtemp OUTSIDE every Git checkout, recorded in this plan's ledger. Existing tests deliberately require a temporary non-Git directory, so an in-worktree TMPDIR is invalid infrastructure, not a product defect. Omit inherited live-home overrides and real account/provider credentials. Inspect transitive path helpers, test setup and subprocess helpers for explicit protected-home literals and code that deletes overrides. Environment setup must happen before module import; a temporary data filename alone is not isolation. Fail closed if a command cannot be shown contained; contact parent rather than execute it. Plain Git/source reads may use ordinary environment, but never inspect ~/.dsh. Do not rerun package installs merely because HOME changed; inspect lifecycle and use already owned dependencies where possible. pnpm 11 implicitly recreated owned node_modules during the first isolated rerun after HOME/store changed; preserve that log and the associated failed workbench outside-Git test as an infrastructure attempt. Pinned pnpm 11 has no autoInstall=false switch for this script dependency synchronization. For the root and CLI workspaces use the source-verified, command-scoped environment setting pnpm_config_verify_deps_before_run=error inherited by recursive invocations; runDepsStatusCheck must throw VERIFY_DEPS_BEFORE_RUN instead of installing. R0 controls proved this env override works WITH pnpm-workspace.yaml (packages: [] suffices), but a bare standalone fixture WITHOUT that file ignored it and implicitly installed TypeScript plus synthetic marker scripts. Preserve both controls. Do not claim global environment-only enforcement. Any new standalone fixture must prove fail-closed behavior for its actual layout: either a fixture-local workspace declaration or a verified command-scoped --config.verify-deps-before-run=error mechanism; an untested CLI flag is not proof. Never change persistent user/project config. Capture source/index/lock hashes and dependency ownership/provenance before retry. Any further install must be explicit, frozen, isolated and justified; do not hide automatic reinstalls or assume old gates still attest changed dependencies. Keep tests and generated artifacts in the single task worktree/plan fixture, never the hub. These fixtures are not another live DSH home or server.

R5 additionally MUST remove custom-path persistence's unrelated default-directory preparation. Preparing an explicit destination may create only its missing parent path with private mode and must not silently chmod a pre-existing caller-owned directory. Preserve 0600 file guarantees and atomic/serialized writes. Regression uses a synthetic default-home sentinel path distinct from the custom destination and proves the default preparation is not invoked/touched. Test it under isolated environment; no protected-path probe.

### Corrected RC1 composer ownership ruling

R6 Composer: only plugin-owned content within real composer surface, don't move/hide shared dock siblings. RC1 conversation.composer.bar is SINGLE/session-maybe, not a chain and has no evidenced public middleware/derive API. Use the supported session-scoped input.left for session chips; a minimal root shell.overlay contribution may portal its OWN historical-only node into actual [data-composer-card] for verified no-session state. This is an explicit pinned DOM compatibility adapter, not a nonexistent upstream accessory contract. Never replace composer, move Host nodes, mutate Host styles/classes, or hide shared parents. Suppress ambiguous/loading selection states and test transitions/disposal/own-node mutation filtering/coalescing; selector mismatch must leave Host usable. Record this ruling and its upstream-DOM-drift cost in the spec/ledger; no redundant native placeholder layer; test real RC1 DOM topology, hero/active/no-session, width 1440/768/390, typing/clearing/resize and disposal/HMR.
