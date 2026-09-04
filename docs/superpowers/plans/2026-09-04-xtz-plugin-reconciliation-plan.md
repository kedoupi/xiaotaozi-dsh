# `xtz` Default Plugin Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `xtz start/restart` transactionally synchronize all first-party plugins to the CLI product snapshot while preserving and recovering the user's Web profile.

**Architecture:** `DEFAULT_PLUGINS` remains the only expected-spec manifest. Official startup reads the current profile, warns without mutation when the owned service is already running, and otherwise rebuilds the profile behind a fixed backup directory before spawning Web. The sandbox keeps its existing `link:` behavior.

**Tech Stack:** Node.js `22.19.0`, TypeScript, Node standard library (`fs/promises`), `node:test`, pinned DeepSeek Harness `0.1.1-rc.2`, pnpm `11.22.0`.

**Spec:** `docs/superpowers/specs/2026-09-04-xtz-plugin-reconciliation-design.md`

## Global Constraints

- Official home is only `~/.dsh`; official port is `3080` or the existing interactive `3082+` fallback, never `3081`.
- Do not mutate a running profile; running `xtz start` only asks the user to run `xtz restart` when drift exists.
- Any failed synchronization or validation restores the old complete profile and prevents Web startup.
- Preserve third-party dependencies, bundles, profile patch, pnpm files, vendor files, sessions, storages, and credentials.
- `xtz update` remains fail closed.
- Sandbox remains repository `link:` based and does not use the official reconciliation transaction.
- Do not add dependencies, publish packages, upgrade DSH/Node/pnpm, or bump `cliApp`.
- All behavioral work is test-first and runs against fake or temporary homes only.

---

## File Structure

- Create `apps/cli/src/profile-reconciliation.ts`: parse profile manifests, compare exact default specs, and copy profile content while excluding `node_modules`.
- Modify `apps/cli/src/service.ts`: persist and parse optional `productVersion` in the existing stamp.
- Modify `apps/cli/src/index.ts`: export reconciliation helpers needed by Node tests.
- Modify `apps/cli/src/app.ts`: doctor checks, running-service warning, transactional synchronization, rollback, crash recovery, and production filesystem adapters.
- Modify `apps/cli/tests/cli.test.mjs`: fake-home state, startup, rollback, recovery, stamp, and doctor contract tests.
- Modify `apps/cli/README.md` and `apps/cli/README.zh.md`: startup/restart upgrade behavior.
- Modify `docs/conventions.md` and `docs/conventions.zh.md`: normative CLI reconciliation contract.
- Modify `AGENTS.md`: hard rule that default plugins reconcile only before startup and never through hot mutation.

---

### Task 1: Detect Product/Profile Drift Without Mutation

**Files:**
- Create: `apps/cli/src/profile-reconciliation.ts`
- Modify: `apps/cli/src/service.ts:10-54`
- Modify: `apps/cli/src/index.ts:1-27`
- Modify: `apps/cli/src/app.ts:234-250,270-451,661-669,1041-1091`
- Test: `apps/cli/tests/cli.test.mjs:1-165,1020-1085`

**Interfaces:**
- Produces: `parseProfileManifest(text: string | null): ProfileManifest | null`
- Produces: `defaultPluginSpecMismatches(manifest: ProfileManifest, expected: readonly ExpectedPluginSpec[]): string[]`
- Produces: `XtzStamp.productVersion?: string`
- Consumes: `DEFAULT_PLUGINS`, `CliDependencies.metadata.version`

- [ ] **Step 1: Make the shared valid fixture represent the current product snapshot**

In `apps/cli/tests/cli.test.mjs`, import `DEFAULT_PLUGINS`, derive exact dependencies, and keep one deliberately old profile:

```js
const CURRENT_DEFAULT_DEPENDENCIES = Object.fromEntries(
  DEFAULT_PLUGINS.map(({ name, spec }) => [name, spec]),
);
const VALID_XTZ_STAMP = JSON.stringify({
  writer: "xtz",
  createdAt: "2026-08-27T00:00:00.000Z",
  productVersion: "0.1.0",
});
const VALID_PROFILE_OBJECT = {
  name: "dsh-profile-web",
  private: true,
  dependencies: CURRENT_DEFAULT_DEPENDENCIES,
  dsh: {
    profile: {
      bundles: [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        ...DEFAULT_PLUGINS.map(({ name }) => name),
      ],
    },
  },
};
const VALID_PROFILE = JSON.stringify(VALID_PROFILE_OBJECT);
const OLD_PROFILE = JSON.stringify({
  ...VALID_PROFILE_OBJECT,
  dependencies: Object.fromEntries(
    DEFAULT_PLUGINS.map(({ name, spec }) => [name, spec.replace("#v0.5.0&", "#v0.4.0&")]),
  ),
});
```

Run the existing CLI suite to prove fixture preparation is neutral:

```bash
cd apps/cli
fnm use
corepack pnpm build
node --test tests/cli.test.mjs
```

Expected: all existing 73 tests pass.

- [ ] **Step 2: Write failing doctor and stamp tests**

Add these behaviors to `apps/cli/tests/cli.test.mjs`:

```js
test("doctor rejects default plugins from an older product snapshot", async () => {
  const fixture = fakeDependencies({
    readText: async (path) => path.replaceAll("\\", "/") === PROFILE_PACKAGE
      ? OLD_PROFILE
      : defaultReadText(path),
  });
  assert.equal(await runCli(["doctor", "--json"], fixture.dependencies), 1);
  const report = JSON.parse(fixture.output.stdout);
  assert.ok(report.checks.some((check) => (
    check.id === "profile-default-specs"
    && check.level === "error"
    && check.message.includes("dsh-im")
    && check.message.includes("xtz restart")
  )));
});

test("doctor accepts a legacy stamp but asks restart to record the product version", async () => {
  const fixture = fakeDependencies({
    readText: async (path) => path.replaceAll("\\", "/").endsWith(XTZ_STAMP_FILE)
      ? JSON.stringify({ writer: "xtz", createdAt: "2026-08-27T00:00:00.000Z" })
      : defaultReadText(path),
  });
  await runCli(["doctor", "--json"], fixture.dependencies);
  const report = JSON.parse(fixture.output.stdout);
  assert.ok(report.checks.some((check) => (
    check.id === "xtz-seed" && check.level === "warning" && /xtz restart/u.test(check.message)
  )));
});
```

Run:

```bash
corepack pnpm build
node --test --test-name-pattern="older product snapshot|legacy stamp" tests/cli.test.mjs
```

Expected: FAIL because `profile-default-specs` and `productVersion` handling do not exist.

- [ ] **Step 3: Implement the smallest shared manifest/spec comparison**

Create `apps/cli/src/profile-reconciliation.ts`:

```ts
import { cp } from "node:fs/promises";
import { join } from "node:path";

export interface ExpectedPluginSpec {
  readonly name: string;
  readonly spec: string;
}

export interface ProfileManifest {
  dependencies?: Record<string, unknown>;
  dsh?: { profile?: { bundles?: unknown } };
  [key: string]: unknown;
}

export function parseProfileManifest(text: string | null): ProfileManifest | null {
  if (text === null) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as ProfileManifest
      : null;
  } catch {
    return null;
  }
}

export function defaultPluginSpecMismatches(
  manifest: ProfileManifest,
  expected: readonly ExpectedPluginSpec[],
): string[] {
  const dependencies = manifest.dependencies ?? {};
  return expected
    .filter(({ name, spec }) => dependencies[name] !== spec)
    .map(({ name }) => name);
}

export async function copyProfileWithoutNodeModules(source: string, target: string): Promise<void> {
  const excluded = join(source, "node_modules");
  await cp(source, target, {
    recursive: true,
    filter: (path) => path !== excluded,
  });
}
```

The copy helper is introduced here because Task 2 uses the same focused module; it has no dependency beyond the Node standard library.

Export the three functions and two types from `apps/cli/src/index.ts`.

- [ ] **Step 4: Extend the stamp compatibly**

In `apps/cli/src/service.ts`:

```ts
export interface XtzStamp {
  writer: "xtz";
  createdAt: string;
  productVersion?: string;
  plugins?: string[];
  port?: number;
}
```

Read `productVersion` only when it is a non-empty string. Legacy stamps remain valid. In `writeXtzStamp()` add:

```ts
productVersion: deps.metadata.version,
```

Change `inspectXtzStamp` to accept the expected version. Return warning—not error—when the stamp is valid but missing or different:

```ts
return stamp.productVersion === expectedVersion
  ? { id: "xtz-seed", level: "ok", message: `xtz ${expectedVersion} 已初始化（${stamp.createdAt}）` }
  : { id: "xtz-seed", level: "warning", message: `安装戳不是当前产品 ${expectedVersion}；请运行 xtz restart` };
```

- [ ] **Step 5: Add the exact-spec doctor check**

Use `parseProfileManifest` inside `inspectProfile()`. After `profile-bundles`, append exactly one check:

```ts
const mismatches = deps.sandbox ? [] : defaultPluginSpecMismatches(pkg, DEFAULT_PLUGINS);
checks.push(mismatches.length === 0
  ? { id: "profile-default-specs", level: "ok", message: "默认插件规格与当前产品一致" }
  : {
      id: "profile-default-specs",
      level: "error",
      message: `默认插件不是当前产品快照：${mismatches.join(", ")}；请运行 xtz restart`,
    });
```

Pass `deps.metadata.version` to `inspectXtzStamp()` in `doctorCommand()`.

- [ ] **Step 6: Verify Task 1 green**

Run:

```bash
corepack pnpm typecheck
corepack pnpm build
node --test --test-name-pattern="older product snapshot|legacy stamp|complete xtz-seeded" tests/cli.test.mjs
corepack pnpm test
```

Expected: all tests pass, including both new tests.

- [ ] **Step 7: Commit Task 1**

```bash
git add apps/cli/src/profile-reconciliation.ts apps/cli/src/service.ts apps/cli/src/index.ts apps/cli/src/app.ts apps/cli/tests/cli.test.mjs
git commit -F - <<'EOF'
fix(cli): detect default plugin drift

Compare official profile dependencies with the current product snapshot and
record the CLI version without rejecting legacy installation stamps.
EOF
```

---

### Task 2: Reconcile the Official Profile Transactionally

**Files:**
- Modify: `apps/cli/src/app.ts:1-78,547-556,700-844,846-920,1142-1209`
- Modify: `apps/cli/tests/cli.test.mjs:80-165,350-475,700-780,1248-1270`
- Test: `apps/cli/tests/cli.test.mjs`

**Interfaces:**
- Consumes: `parseProfileManifest`, `defaultPluginSpecMismatches`, `copyProfileWithoutNodeModules`
- Adds to `CliDependencies`:
  - `copyProfile(source: string, target: string): Promise<void>`
  - `movePath(source: string, target: string): Promise<void>`
  - `removeTree(path: string): Promise<void>`
- Produces: official-profile reconciliation before `spawnWeb`
- Preserves: sandbox sequential `link:` installation path

- [ ] **Step 1: Write the failing running-service test**

```js
test("running start reports plugin drift without mutating or restarting", async () => {
  const fixture = fakeDependencies({
    readText: async (path) => {
      const portable = path.replaceAll("\\", "/");
      if (portable.endsWith(WEB_PID_FILE)) return VALID_PID_RECORD;
      if (portable === PROFILE_PACKAGE) return OLD_PROFILE;
      return defaultReadText(path);
    },
    processAlive: (pid) => pid === 4242,
    probe: async (port = 3080) => ({
      state: "running", healthy: true, host: "127.0.0.1", port,
      url: `http://127.0.0.1:${port}/`, owner: "xiaotaozi-dsh",
    }),
  });
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 0);
  assert.equal(fixture.calls.some((call) => call.args[0] === "plugin"), false);
  assert.equal(fixture.spawned.length, 0);
  assert.match(fixture.output.stdout, /xtz restart/u);
});
```

Run:

```bash
corepack pnpm build
node --test --test-name-pattern="running start reports plugin drift" tests/cli.test.mjs
```

Expected: FAIL because current running startup does not inspect drift.

- [ ] **Step 2: Write the failing synchronization and rollback tests**

Extend `fakeDependencies()` with `copiedProfiles`, `movedPaths`, and `removedTrees`, plus default implementations that only record calls:

```js
copyProfile: async (source, target) => { copiedProfiles.push({ source, target }); },
movePath: async (source, target) => { movedPaths.push({ source, target }); },
removeTree: async (path) => { removedTrees.push(path); },
```

Add a successful old-profile test. Its `runDsh` flips `reconciled = true` after the one multi-spec add and returns bundle markers for dump-config:

```js
test("stopped start reconciles all default plugins before spawning web", async () => {
  let reconciled = false;
  let probes = 0;
  const fixture = fakeDependencies({
    readText: async (path) => path.replaceAll("\\", "/") === PROFILE_PACKAGE
      ? reconciled ? VALID_PROFILE : OLD_PROFILE
      : defaultReadText(path),
    runDsh: async (args, options) => {
      fixture.calls.push({ args, options });
      if (args[0] === "plugin" && args[3] === "add") reconciled = true;
      const stdout = args[0] === "web" && args[1] === "--dump-config"
        ? DEFAULT_PLUGINS.map(({ name }) => `# == ${name}`).join("\n")
        : options?.capture ? "0.1.1-rc.2\n" : "";
      return { code: 0, stdout, stderr: "", signal: null };
    },
    probe: async (port = 3080) => {
      probes += 1;
      return probes === 1
        ? { state: "stopped", healthy: false, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "none" }
        : { state: "running", healthy: true, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "xiaotaozi-dsh" };
    },
  });
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 0);
  const adds = fixture.calls.filter((call) => call.args[0] === "plugin" && call.args[3] === "add");
  assert.equal(adds.length, 1);
  assert.deepEqual(adds[0].args.slice(4), DEFAULT_PLUGINS.map(({ spec }) => spec));
  assert.equal(fixture.movedPaths.length, 1);
  assert.equal(fixture.copiedProfiles.length, 1);
  assert.equal(fixture.spawned.length, 1);
});
```

Add an install-failure test:

```js
test("failed default plugin reconciliation restores the old profile and does not spawn", async () => {
  const fixture = fakeDependencies({
    readText: async (path) => path.replaceAll("\\", "/") === PROFILE_PACKAGE
      ? OLD_PROFILE
      : defaultReadText(path),
    runDsh: async (args, options) => args[0] === "plugin"
      ? { code: 1, stdout: "", stderr: "install failed", signal: null }
      : { code: 0, stdout: options?.capture ? "0.1.1-rc.2\n" : "", stderr: "", signal: null },
  });
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 1);
  assert.deepEqual(fixture.movedPaths.map(({ source, target }) => [source, target]), [
    [`${HOME}/profiles/web`, `${HOME}/profiles/.web-reconcile-backup`],
    [`${HOME}/profiles/.web-reconcile-backup`, `${HOME}/profiles/web`],
  ]);
  assert.deepEqual(fixture.removedTrees, [`${HOME}/profiles/web`]);
  assert.equal(fixture.spawned.length, 0);
});
```

Run both targeted tests. Expected: FAIL because no transaction exists.

- [ ] **Step 3: Verify the real copy adapter fails before implementation**

Add a temporary-home test using `createDefaultDependencies`, `mkdtemp`, `mkdir`, `readFile`, `rm`, `tmpdir`, and `writeFile`:

```js
test("profile copy preserves user files and excludes node_modules", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "xtz-profile-copy-"));
  t.after(async () => { await rm(home, { recursive: true, force: true }); });
  const source = join(home, "source");
  const target = join(home, "target");
  await mkdir(join(source, "node_modules", "dsh-im"), { recursive: true });
  await mkdir(join(source, "vendor"), { recursive: true });
  await writeFile(join(source, "cordis.patch.yml"), "# user patch\n");
  await writeFile(join(source, "vendor", "custom.tgz"), "archive");
  await writeFile(join(source, "node_modules", "dsh-im", "package.json"), "{}");
  const deps = await createDefaultDependencies({ home });
  assert.equal(typeof deps.copyProfile, "function");
  await deps.copyProfile(source, target);
  assert.equal(await readFile(join(target, "cordis.patch.yml"), "utf8"), "# user patch\n");
  assert.equal(await readFile(join(target, "vendor", "custom.tgz"), "utf8"), "archive");
  await assert.rejects(readFile(join(target, "node_modules", "dsh-im", "package.json"), "utf8"), /ENOENT/u);
});
```

Run it before production changes. Expected: FAIL at the missing `copyProfile` method.

- [ ] **Step 4: Add production filesystem adapters**

In `CliDependencies`, add the three required methods. In `createDefaultDependencies()` wire only Node standard library functions:

```ts
copyProfile: copyProfileWithoutNodeModules,
movePath: async (source, target) => { await rename(source, target); },
removeTree: async (path) => { await rm(path, { recursive: true, force: true }); },
```

Import `rename` and the Task 1 helper. Do not add a filesystem abstraction class.

- [ ] **Step 5: Implement crash recovery and one-profile transaction**

Add:

```ts
const PROFILE_RECONCILE_BACKUP = ".web-reconcile-backup";

function reconcileBackupDir(home: string): string {
  return join(home, "profiles", PROFILE_RECONCILE_BACKUP);
}

async function restoreReconcileBackup(deps: CliDependencies): Promise<boolean> {
  const profile = officialProfileDir(deps.home);
  const backup = reconcileBackupDir(deps.home);
  const backupKind = await pathKind(deps, backup);
  if (backupKind === "missing") return true;
  if (backupKind !== "directory") {
    line(deps.stderr, `${backup} 不是可恢复的 profile 目录。`);
    return false;
  }
  if (await pathKind(deps, profile) !== "missing") await deps.removeTree(profile);
  await deps.movePath(backup, profile);
  line(deps.stdout, "已恢复上次未完成同步前的 Web profile。");
  return true;
}

async function rollbackReconcile(
  deps: CliDependencies,
  profile: string,
  backup: string,
): Promise<boolean> {
  try {
    if (await pathKind(deps, profile) !== "missing") await deps.removeTree(profile);
    await deps.movePath(backup, profile);
    return true;
  } catch (error) {
    line(deps.stderr, `恢复旧 Web profile 失败：${error instanceof Error ? error.message : String(error)}`);
    line(deps.stderr, `完整备份仍保留在 ${backup}`);
    return false;
  }
}
```

At the start of official `ensureOfficialProfile()`, recover backup before reading drift. Before moving `web`, verify its canonical path is contained by the canonical home using the existing `isContained` rule.

- [ ] **Step 6: Replace official per-plugin seeding with one transactional add**

Keep the sandbox loop unchanged. For official mode:

1. Read and parse profile manifest.
2. Compute exact mismatches and installation/retired drift.
3. Return immediately if no drift.
4. Move `web` to backup and copy profile content back without `node_modules`.
5. Run one add with all `DEFAULT_PLUGINS.map(({ spec }) => spec)`.
6. Reuse `parseAllowBuildKeys`, `expandAllowBuildKeysForDefaultPlugins`, and `allowOfficialBuilds` for one retry of the same multi-spec command.
7. Remove retired plugins only inside the candidate.
8. Run `healOfficialHostTools()` against the candidate, then require `inspectProfile()` to have no error checks.
9. Require `dsh web --dump-config` to return code 0 and contain `# == <plugin-name>` for every default plugin.
10. Delete backup only after validation.
11. On any failure, call `rollbackReconcile()` and return nonzero.
12. Do not write the home-level installation stamp here; `launchOn()` writes it only after Web passes readiness and identity checks.

Change the add helper signature to accept all specs:

```ts
async function addOfficialPlugins(
  deps: CliDependencies,
  specs: readonly string[],
  addOptions: { capture: true; cwd?: string },
): Promise<number> {
  const args = ["plugin", "--profile", "web", "add", ...specs];
  const added = await deps.runDsh(args, addOptions);
  // Existing allowBuild key extraction and one retry use the same args.
}
```

Output one truthful progress line:

```ts
line(deps.stdout, `正在同步 ${DEFAULT_PLUGINS.length} 个官方插件到小桃子 ${deps.metadata.version}…`);
```

- [ ] **Step 7: Add the running warning without changing process ownership**

Extract one read-only `officialProfileDrift()` predicate and use it in both reconciliation and this branch. It must report exact-spec mismatch, a missing default install directory, or an installed retired plugin. Before the existing early return for an owned running process, call that predicate; if any reason exists, write the restart notice, then continue the existing `announceRunning()` path. Do not call `stopRecordedPid`, `ensureOfficialProfile`, `runDsh(["plugin", ...])`, or `spawnWeb`.

- [ ] **Step 8: Add validation-failure, crash-recovery, rollback-failure, and sandbox tests**

Add four focused tests:

- `dump-config` without one `# == dsh-im` marker restores backup and does not spawn;
- an initial `.web-reconcile-backup` directory restores before a fresh reconciliation;
- a failing backup-to-web move keeps the backup path and returns nonzero;
- sandbox missing plugins still produce six local `link:` adds and no move/copy/remove-tree calls.

Also update the old allow-build test to expect two multi-spec add invocations, not seven per-plugin invocations:

```js
assert.equal(adds, 2);
assert.deepEqual(
  calls.filter((call) => call.args[0] === "plugin")[0].args.slice(4),
  DEFAULT_PLUGINS.map(({ spec }) => spec),
);
```

Update `inspectTransactions()` so `pathKind(deps, reconcileBackupDir(deps.home)) !== "missing"` reports an active Web reconciliation transaction while the five historical Desktop paths keep their existing wording.

- [ ] **Step 9: Verify Task 2 green**

Run:

```bash
corepack pnpm typecheck
corepack pnpm build
node --test --test-name-pattern="reconcil|plugin drift|profile copy|dump-config|sandbox start" tests/cli.test.mjs
corepack pnpm test
```

Expected: all CLI tests pass; no test accesses `~/.dsh`, port 3080, or port 3081.

- [ ] **Step 10: Commit Task 2**

```bash
git add apps/cli/src/profile-reconciliation.ts apps/cli/src/app.ts apps/cli/tests/cli.test.mjs
git commit -F - <<'EOF'
fix(cli): reconcile default plugins transactionally

Rebuild the stopped Web profile against the current product snapshot and
restore the previous profile on install, validation, or crash failures.
EOF
```

---

### Task 3: Document the Reconciliation Contract

**Files:**
- Modify: `apps/cli/README.md:28-65`
- Modify: `apps/cli/README.zh.md` corresponding Start/Safety sections
- Modify: `docs/conventions.md` § `xtz` CLI and § Versions
- Modify: `docs/conventions.zh.md` corresponding sections
- Modify: `AGENTS.md` `xtz` hard rule

**Interfaces:**
- Documents the Task 2 behavior; no runtime interface changes.

- [ ] **Step 1: Update the English and Chinese CLI README pair**

State all four user-visible facts in both files:

```text
- First start installs the default plugins.
- After the global CLI is upgraded, the next stopped start/restart synchronizes defaults to that product snapshot.
- A running start never hot-mutates the profile; it asks the user to run xtz restart.
- A failed synchronization restores the previous profile and does not launch Web.
```

Keep `update` in the intentionally disabled list.

- [ ] **Step 2: Update the normative convention pair and hard rule**

Add the same contract under `xtz` CLI in `docs/conventions.md` and `docs/conventions.zh.md`. In `AGENTS.md`, add one compact hard rule sentence beside the existing first-start seed contract:

```text
After a CLI product upgrade, stopped start/restart reconciles every default plugin to the exact product specs as one rollback-safe profile transaction; running start only asks for restart and never hot-mutates the profile.
```

Do not describe future npm plugin publishing, Market pinning, or IM authorization as implemented.

- [ ] **Step 3: Run documentation and consistency checks**

```bash
cd ../..
git diff --check
node scripts/check-manifest.mjs
node scripts/check-ui-design.mjs
```

Expected: all commands exit 0.

- [ ] **Step 4: Commit Task 3**

```bash
git add AGENTS.md docs/conventions.md docs/conventions.zh.md apps/cli/README.md apps/cli/README.zh.md
git commit -F - <<'EOF'
docs(cli): document plugin snapshot synchronization

Describe automatic stopped-start reconciliation, running restart guidance,
and rollback behavior without enabling xtz self-update.
EOF
```

---

### Task 4: Full Verification and Review Handoff

**Files:**
- Verify only; modify files only to fix findings introduced by Tasks 1-3.

**Interfaces:**
- Produces: command evidence, clean diff, and review-ready topic branch.

- [ ] **Step 1: Run proactive diagnostics**

Run `lsp_diagnostics` on:

```text
apps/cli/src/profile-reconciliation.ts
apps/cli/src/service.ts
apps/cli/src/app.ts
apps/cli/src/index.ts
apps/cli/tests/cli.test.mjs
```

Then run `lens_diagnostics` with `mode=all`.

Expected: no blocking errors or warnings caused by this branch.

- [ ] **Step 2: Run the standalone CLI gate under the pinned Node floor**

```bash
cd apps/cli
fnm use
corepack pnpm check
node lib/cli.js --help
node lib/cli.js version --json
```

Expected:

- Node is `22.19.0`;
- `pnpm check` exits 0;
- every Node test passes;
- help still lists `start/stop/restart` and not plugin management;
- version JSON reports CLI `0.5.0` and DSH `0.1.1-rc.2`.

- [ ] **Step 3: Run repository gates that cover CLI contracts**

```bash
cd ../..
corepack pnpm check
corepack pnpm check:build
corepack pnpm check:path
corepack pnpm check:cli
git diff --check
git status --short --branch
```

Expected: all gates exit 0; the worktree contains no generated `lib/`, `node_modules`, `.dsh-home`, or tarball changes.

- [ ] **Step 4: Review the final diff against the spec**

Check explicitly:

```bash
git diff origin/main...HEAD --stat
git diff origin/main...HEAD -- apps/cli/src apps/cli/tests AGENTS.md docs/conventions.md docs/conventions.zh.md apps/cli/README.md apps/cli/README.zh.md
git log --oneline origin/main..HEAD
```

Confirm:

- no `xtz update` implementation;
- no version bump;
- no official-home or 3081 operation;
- no third-party plugin mutation during default reconciliation;
- backup survives rollback failure;
- Web spawn occurs only after successful validation.

- [ ] **Step 5: Request correctness review before PR**

Use the repository review workflow on the complete diff. Fix only findings within this spec, rerun the affected test first, then rerun Task 4 Steps 1-3. Open a PR only after the review verdict and all gates are green.
