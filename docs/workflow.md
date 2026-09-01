# Workflow

English | [中文](workflow.zh.md)

This file is the **procedure** (how to do a job). Hard rules: [AGENTS.md](../AGENTS.md). Spec: [conventions.md](conventions.md). Contributor entry: [CONTRIBUTING.md](../CONTRIBUTING.md). Which file to edit: [README.md](README.md). Change rules in `AGENTS.md`; change the spec in `conventions.md`; change steps here.

## Dev environment

Two homes. Spec: [conventions.md](conventions.md) § Homes. Test stays on test; official stays on official.

| | Official / user | Sandbox |
| --- | --- | --- |
| `DSH_HOME` | `~/.dsh` | `<repo>/.dsh-home` (gitignored) |
| Command | `xtz start` | `pnpm dev` (`xtz --sandbox`) / `link-plugin` |
| Port | **3080** | **3081** |

| Job | Home |
| --- | --- |
| Change plugin source, settings UI, `link-plugin` | Sandbox **3081**. `pnpm dev` watches `plugins/*/src`, rebuilds `lib/`, and restarts host code on :3081 |
| User product (`xtz start`) | Official `~/.dsh` **3080** |
| Inspect official home with `xtz status` / `doctor` | Official `~/.dsh` **3080**. Never `.dsh-home` / 3081 |

If 3080 is taken and `xtz` did not start it, do not steal it.

Before starting, `pnpm dev` stops a listener on **3081** only after process inspection proves it is this repository's marked sandbox `dsh web --host 127.0.0.1 --port 3081` (spawned by `xtz --sandbox`); an unknown or unverifiable listener is a hard error and is never signalled. It never frees **3080**. `link-plugin` always writes into `.dsh-home`. Do not link into `~/.dsh`. Do not run `dsh plugin add ./plugins/<slug>` against the official default. Leave `pnpm dev` running while you edit: it rebuilds `plugins/*/lib` and restarts the `xtz --sandbox` child when host `lib/index.js` or `cordis.patch.yml` content changes, after those files exist again. Sandbox `pnpm dev` sets `DSH_PLUGIN_TRACE=1` so every plugin host prints one-line traces (`dsh-im`, `dsh-wecom-office`, `dsh-xtz-ui`, `dsh-sidebar`, `dsh-providers`, `dsh-market`); official `xtz start` does not. Set `DSH_PLUGIN_TRACE=0` to mute the sandbox. Unexpected sandbox exits retry with backoff; they are not treated as a host rebuild. Client `lib/client.js` uses host HMR (hard-refresh if the UI did not update). `pnpm dev -- --once` is the old build-once path. Clone, then run `pnpm install` before any build/check. `pnpm check-home` (or `node scripts/doctor.mjs`) is diagnosis only: it lists and fails on unsafe links from `~/.dsh`; it never repairs a profile.

Repository gates: `pnpm check` covers version/docs/manifest policy plus type/tests; `pnpm check:build` additionally builds and inspects required `lib/`; `pnpm check:path` proves isolated Git path installs; `pnpm check:cli` checks the standalone CLI workspace (the user product). None of them publishes.

Need API keys in the sandbox: copy `~/.dsh/.credentials.yaml` into `.dsh-home/`. Do not copy `sessions/` or `storages/`.

### Sandbox dogfood monitoring

Spec: [conventions.md](conventions.md) § Homes (sandbox dogfood).

When the user asks to start 沙箱监控 / 持续监控 / dogfood watch:

Keep-alive is mandatory. Journey-break grep is not a substitute.

1. Start `pnpm dev` in **this** checkout (port **3081**) as a background command with `timeout: 0`. Same 3081 rules as above. Do not start a second sandbox. `timeout: 0` does **not** stop a wrapper ~10h `max_runtime` kill — that kill is a hang, not “the task finished”.
2. Watch **both** for the session:
   - Death: the `pnpm dev` command exiting, `sandbox web exited`, or **3081** not listening. A journey grep cannot see these.
   - Journey: `grep --line-buffered` `journey event=.*break=1` on **this** `pnpm dev` log, plus `.dsh-home/traces/YYYY-MM-DD.jsonl`. Not a generic error grep.
3. `pnpm dev` plus those watches are one pair for the session. Finishing a code task or merging a PR does not stop them unless the user said stop.
4. If `pnpm dev` exits (crash, tool timeout, parent killed, wrapper `max_runtime`): restart it here in the **same turn**. Do not wait for the user to ask why the sandbox is down. A leftover **3081** listener that is this checkout's marked sandbox may be reclaimed by `pnpm dev`. Unknown or other-checkout 3081 is a hard stop. Never touch **3080**.
5. After a restart: confirm **3081** is LISTENing and `xtz --sandbox` stayed up. Then retarget the journey watch to the **new** `pnpm dev` log. If the child retry-loops (`sandbox web exited`, wrong Node, stale `apps/cli/lib`), fix that boot failure now. Looping exits are not a running sandbox. Watching a dead log is not monitoring.

Act on breaks. Do not wait to be asked to 发现问题 / 优化 / 帮我修:

6. On `journey event=… break=1` or a JSONL line with `"break": true`, read that msgid/stream's events in `.dsh-home/traces/YYYY-MM-DD.jsonl` (`inbound` → `stream_start` / `stream_fail` → `first_visible` → `tool` → `finish` / `abandon` / `ws_kick`).
7. Classify. Separate fact / inference / guess.
   - Ours (hidden stream body, overlay stacking, tool wiring, missing product we own): fix in this checkout now. Leave `pnpm dev` running. Verify the same path in the sandbox. A green unit suite is not that check.
   - Platform limit (for example WeCom ~5 min stream cap): say so; ship a cheap user-visible mitigation if one exists; do not pretend we can lift the cap.
   - Ops (official 3080 and sandbox 3081 sharing the same WeCom bot): tell the user to `xtz stop` official; do not steal 3080.
8. Report the conclusion, what you changed, and what you did not verify. Do not paste secrets or message bodies from traces.
9. Do not commit or push unless asked. Do not touch official home. Irreversible, auth, or public-API changes still wait.

### Parallel checkouts / worktrees

Spec: [conventions.md](conventions.md) § Git and § Homes.

One task, one topic branch. A git worktree is optional isolation for that branch. Do not invent `develop` / `release/*` / `hotfix/*`. Keep a hub checkout on clean `main` for pull, review, and tags.

Before `pnpm dev` or `pnpm smoke:sandbox`: **3081** is free, or it is **this checkout's** marked sandbox. Another checkout's sandbox is a hard stop — stop that sandbox in its own tree first. Unit tests, `pnpm check`, and CLI fake-home tests do not need 3081 and may run in parallel.

Each worktree needs its own `pnpm install` (root and, for CLI work, `apps/cli`). Do not `link:` any worktree into `~/.dsh`.

Handoff across parallel sessions is git, not chat history: worktree path, branch (cut from `origin/main`), and commit / PR state. Uncommitted work stays in that worktree; do not copy it into a second tree.

#### Normal trunk-based main dogfood loop

The steady state. The hub is the repository-root checkout; the topic worktree is where the change lives until it merges.

1. Confirm the repository-root hub is clean, on `main`, current with `origin/main`, and healthy on **3081**.
2. Fetch `origin` and create one short-lived topic branch/worktree from `origin/main`.
3. Develop and run area-specific gates in the task worktree without starting `pnpm dev`.
4. Update with current `main`, rerun required gates, and open a PR.
5. Merge only after required GitHub CI passes.
6. Confirm the reviewed topic head is contained in `origin/main`.
7. Fast-forward the hub with `git pull --ff-only`; never reset or overwrite active work.
8. Keep or restore hub `pnpm dev`, confirm **3081** LISTENs, and retarget journey monitoring if its process/log changed.
9. Exercise the affected real journey on merged `main`.
10. A known post-merge `main` break is active work. Fix forward only when the correction is small and known; revert security, data-loss, startup, broad, or unclear regressions first. `main` must not remain knowingly broken while unrelated work continues.
11. Delete merged local/remote topic branches and remove only a clean task worktree.

Merge completion does not stop sandbox monitoring. Hub `pnpm dev` and the journey-break watch keep running until the user says stop; a dead wrapper or stale **3081** listener is restarted in the same turn, not parked for someone else to notice.

#### Exceptional 3081 transfer

For irreversible migration, authentication, external side effects, or equivalent high risk: explicitly stop the hub sandbox, start the topic sandbox on **3081**, verify, stop it, return to the hub main sandbox, confirm **3081** and monitoring, then continue. Never add another port or steal **3081**. Do not make this the default plugin-development path.

## CLI development

`apps/cli/` is a standalone workspace; do not assume a root `pnpm install` installs it. Use a Node that matches DeepSeek Harness (`^22.19.0 || >=24.0.0`; floor is `apps/cli/.node-version` / `versions.json` `node`) and the pinned DSH `0.1.1-rc.2`. After a CLI change, run:

```bash
cd apps/cli
pnpm install
pnpm check
node lib/cli.js --help
node lib/cli.js version --json
```

Prefer `node lib/cli.js` over a global `pnpm link` while developing. `pnpm check` uses a fake home. To inspect the real official environment, `node lib/cli.js doctor`; a red report on a dirty `~/.dsh` is expected. To debug the CLI against the sandbox, use `pnpm dev` (it execs `node apps/cli/lib/cli.js --sandbox start --foreground`); do not `link:` this checkout into `~/.dsh`.

Users install with `apps/cli/scripts/install.sh`, `npm install -g xiaotaozi-dsh-cli`, or `bun add -g xiaotaozi-dsh-cli`. Those commands require Node.js `^22.19.0 || >=24` already on `PATH`; they must not install or switch Node, and they must not start DSH.

Open commands match [conventions.md](conventions.md) § `xtz` CLI: help/version, `start`/`web`, `stop`, `restart`, `open`, `status`, `config path`, `doctor`. First `xtz start` seeds official web and every first-party plugin under `plugins/`. Extra (third-party) plugins: the in-app market (or `dsh plugin --profile web add` with an upstream spec). All official work is fixed to `~/.dsh`; preferred port **3080**. A busy or identity-unverified port is never a reason to use 3081.

`start`/`stop`/`restart` only manage `$DSH_HOME/xiaotaozi-xtz-web.pid`. Refuse an occupied 3080 that `xtz` did not start. `init`, `plugin`, `run`/`ask`, `config dump`/`defaults`, and `update` stay fail closed. Fake-home tests cover start/stop without touching the real official service.

## Talking to agents

First sentence names **product + environment + action**. Environments are only: `sandbox`, `official`, `CLI`. Spec: [conventions.md](conventions.md) § Users. Do not ask for `release Desktop` as new work.

```text
In <environment>, do <action> to <product>. [Do not touch <forbidden>.]
```

| Intent | Say |
| --- | --- |
| Change a plugin | In the sandbox, change `dsh-im` settings, link to web, verify with `pnpm dev` on 3081. Do not touch `~/.dsh`. |
| New plugin | Create `dsh-foo` (host) via dsh-plugin, install into sandbox `dsh-dev`, not the official home. |
| Ship to users | Sandbox already verified. Extra plugins: `dsh plugin --profile web add`. Do not `link:` official home. |
| Revive Desktop / `.dmg` / pack | Refuse. Point at `xtz`. History is `git show archive/desktop`. |
| Test a user's first launch | `xtz stop`, move `~/.dsh/profiles/web` aside, run `xtz start`. Do not `rm -rf ~/.dsh`. |
| See if official looks like a user machine | Supported Node (`^22.19.0 || >=24`): `node lib/cli.js doctor`. A red `doctor` is an environment signal first. |
| Change the CLI | In `apps/cli` with `.node-version`. `pnpm check` on a fake home. Sandbox via `pnpm dev` / `xtz --sandbox`. Do not `link:` official home. |
| Ship `xtz` | Follow [Ship a product snapshot](#ship-a-product-snapshot). Tag `vX.Y.Z`; GitHub Actions publishes `xiaotaozi-dsh-cli`. Do not `npm publish` from a laptop. |
| Parallel checkout | One task, one topic branch (worktree optional). Do not start `pnpm dev` if 3081 is another checkout. |
| Start sandbox monitoring | Keep `pnpm dev` alive on **3081** and watch journey breaks. Process death (including wrapper ~10h kill) is a hang: restart in the same turn and confirm **3081** LISTENs. Journey grep is not keep-alive. Do not touch `~/.dsh`. |

Refuse or rewrite: install plugins into `~/.dsh` from this repo; revive Desktop / pack / notarization; merge everyone onto `~/.dsh`; delete all of `~/.dsh` to test CLI install; add Git Flow standing branches (`develop` / `release/*` / `hotfix/*`); start a second sandbox on 3081.

Opening line for a new chat:

```text
Per AGENTS / conventions: plugins only in sandbox 3081; official ~/.dsh 3080 default seed is first xtz start. This task is: …
```

## Rebuild official home

Do not `rm -rf ~/.dsh` (credentials and sessions live there).

1. `xtz stop`.
2. Optional: copy `~/.dsh/.credentials.yaml` somewhere outside `~/.dsh`.
3. `mv ~/.dsh/profiles/web ~/.dsh/profiles/web.bak-dirty`
4. `xtz start`
5. With a supported Node (`^22.19.0 || >=24`): `dsh plugin --profile web list` and `node lib/cli.js doctor`.

Expect Git / npm deps from first `xtz start` (defaults) and `dsh plugin --profile web add` (extras). A missing plugin is an environment problem, not a reason to `dsh plugin add` from this repo.

## Ship a product snapshot

User product is `xtz` (`xiaotaozi-dsh-cli`). Version rules: [conventions.md](conventions.md) § Versions. The live number is `versions.json` `cliApp`. bun/pnpm/`install.sh` only fetch that package. No Homebrew. First-party plugins stay Git-path / first `xtz start`; do not publish them to npm in the same step. Do not wait for a `.dmg` or signed pack.

`.github/workflows/publish.yml` publishes on push of tag `vX.Y.Z` using npm Trusted Publisher (OIDC). Do not `npm publish` from a laptop. Do not set `NODE_AUTH_TOKEN`.

### Release commit

1. `pnpm check`, `pnpm check:build`, `pnpm check:path`, `pnpm check:cli`. `pnpm check-home` must show official home unlinked from this repo.
2. Inspect official `~/.dsh` with `node lib/cli.js doctor`. A red `doctor` on a stopped or unseeded home is environment dirt; do not weaken CLI checks. Do not reseed against `#vNEW` until that tag exists on GitHub.
3. One release commit: set `cliApp` and `apps/cli/package.json` `version` to the new number; pin every `DEFAULT_PLUGINS` spec to `#vX.Y.Z&path:plugins/<slug>`; add the `CHANGELOG.md` section. Keep `bin.xtz` as `lib/cli.js` and `repository.url` as this GitHub repo.
4. Merge to `main`, tag `vX.Y.Z` on that commit, push the tag. npm trusts the workflow **filename** `publish.yml` on that tagged commit.
5. After the tag job has published to npm, create the GitHub Release for **the same tag** and mark it Latest. `publish.yml` only runs `npm publish` (`contents: read`); it does **not** create a Release. Missing this step leaves the repo Releases page on an older tag (v0.2.1 and v0.2.2 shipped to npm with no Release page; GitHub still showed v0.2.0 as Latest). Example: `gh release create vX.Y.Z --latest --title vX.Y.Z --notes-file` from that version’s `CHANGELOG.md` section. Do not attach a laptop-built `.tgz` as the user install unit; npm is the artifact.

### Trusted Publisher form

Spec: [conventions.md](conventions.md) § Versions. Filename is `publish.yml` only. Environment empty. Allow `npm publish`. npm does not verify the form when you save it.

### Prove vs ship

- `workflow_dispatch` with `dry_run=true` only packs. It does **not** prove OIDC (no token exchange).
- Version **already on npm**: do not republish. Bump PATCH or MINOR, then tag.
- Tag job failed **before** the version appeared on npm: rerun that tag's workflow. Do not bump.
- A matching Trusted Publisher plus a dummy `NODE_AUTH_TOKEN` or npm 10 still yields `ENEEDAUTH`. OIDC exchange **404** `package not found` means the form does not match this run (wrong filename, extra environment, missing Allow `npm publish`).
- Successful OIDC publish shows `_npmUser` `GitHub Actions <npm-oidc-no-reply@github.com>` and a provenance attestation.

### Publish job (do not regress)

- `permissions: id-token: write` on the workflow **and** the job.
- Do not pass `registry-url` to `actions/setup-node` (it writes `_authToken=${NODE_AUTH_TOKEN}` and npm skips OIDC).
- `unset NODE_AUTH_TOKEN` before `npm publish`. An empty string is not unset.
- After Node `22.19.0`, `npm install -g 'npm@^11.5.1'`. Do not `npm@latest` (npm 12 needs a newer Node than we pin).

## Create

1. Default `--kind host`. Use `mixed` only when the user asked for a settings page, slot, or theme.
2. Do not hand-create directories. Do not edit `templates/` to make a new plugin. First-party work goes in `plugins/`. Third-party plugins are catalog rows in `plugins/market`, not a second source tree.

```bash
pnpm new <slug>                 # or: pnpm new <slug> --kind mixed
pnpm install
```

3. Replace the `greet` sample in the same turn. Logic that can run without Cordis stays in a separate file; tests import that file only. Do not fold models / IM / WeCom office / market / the right-hand files-Git-terminal panel into `xtz-ui`; that plugin is chrome plus archive, task board, and git graph. The right panel is `plugins/sidebar`. DSH `Button` defaults to `ghost`; a danger hover must beat `.ghost:hover` (double the class). `Input` focus is `:focus-within` on the wrap, not the inner control.
4. Tunable values go on the exported Schemastery `Config`.
5. If the plugin binds / connects / adds an account and then creates a session, writes files, or otherwise does durable work: follow [conventions.md](conventions.md) § Onboarding and first work. `process.cwd()` under `pnpm dev` is this repo. Keep first work pending until the user confirms the target; the bind picker must not open at the plugin repo cwd; tests must cover that first-action race.
6. Then:

```bash
pnpm --filter dsh-<slug> test
pnpm --filter dsh-<slug> build
pnpm check
pnpm check:build                # requires and inspects built lib/ (expands to pnpm build + check-manifest --require-lib; check:path proves the install)
```

7. Link into the sandbox `dsh-dev` profile (Install below). Creation is done only after `dump-config` shows the layer.

New plugins ship with English `README.md` and Chinese `README.zh.md`. Keep both.

## List a third-party plugin

Spec: [conventions.md](conventions.md) § Market catalog. Third-party plugins are rows in `plugins/market`. `plugins/` is first-party and is seeded. Do not add `externals/`.

### Decide

List it in the market when it is a DeepSeek Harness plugin, the license is permissive, and we will offer **optional** install. Do not copy it into `plugins/` unless we are taking ownership and seeding it.

Do not vendor `deepseek-harness`, a non-plugin, or a second implementation of a first-party job.

### First listing

1. Record the upstream URL, license, package name, and install spec.
2. Add a row to `MARKET_PLUGINS` in `plugins/market/src/catalog.ts` (`id`, `name`, `version`, `summary`, `packageName`, `installSpec`).
3. `installSpec` is upstream Git or npm. Never `link:`, `file:`, or `#path:externals/`.
4. Do not clone the author's repo into this tree.

### Later update

Bump `version` / `summary` / `installSpec` in the catalog when upstream ships.

### Promote to first-party (rare)

Only when we will second-develop **and** seed it: `pnpm new <slug>`, port `src`, catalogize (four names, `neverBundle`, host rc pins, no `dsh-tools` value-import, `NOTICE` + upstream `LICENSE`, bilingual README), remove the market row, add it to `DEFAULT_PLUGINS`. `link-plugin` only `plugins/<slug>`.

## Install

Build first. Profiles load `lib/`, not `src/`.

`link-plugin` and `pnpm dev` set `DSH_HOME` to the repo `.dsh-home` (gitignored). Do not link workspace plugins into `~/.dsh`.

```bash
pnpm --filter dsh-<slug> build
node scripts/link-plugin.mjs --profile dsh-dev <slug>
```

- Load check only: `dsh-dev` (still under `.dsh-home`).
- Web UI or model-callable tools: `--profile web`, then `pnpm dev` (port 3081). Leave official `~/.dsh` (3080) alone.
- Stop if `link-plugin` fails. Do not pretend it linked.
- After source edits, leave sandbox `pnpm dev` running. It watches plugins, rebuilds `lib/`, and restarts `xtz --sandbox` on 3081 when host output changes (and retries crashed boots with backoff once `lib/index.js` is back). Use `pnpm dev -- --once` to build once with no watch. `pnpm dev -- --filter im` watches one plugin.
- To skip a rebuild, `pnpm dev -- --once --patch <file>`; `name` in that patch must be an absolute path.
- Optional: copy `~/.dsh/.credentials.yaml` into `.dsh-home/` if the sandbox needs API keys. Do not copy `sessions/` or `storages/`.

Sandbox verification when the plugin binds then does durable work (spec: [conventions.md](conventions.md) § Onboarding and first work):

1. Leave `pnpm dev` running. Sandbox traces stay on (`DSH_PLUGIN_TRACE=1` for every plugin host; official `xtz start` stays silent).
2. Add / bind as a user would, then confirm the target. For `dsh-im`, choose one project already present in `workspace.list`; do not browse to a folder. The picker must not default to this repo, and cancel must not confirm cwd.
3. Do the **first** real action (first IM message, first write, first session).
4. Check that work appeared only in the chosen target, not under this repository / `process.cwd()`. A later action landing correctly does not excuse the first one.
5. A passing `pnpm --filter dsh-<slug> test` is not this check. Do not call the plugin verified until that first-action path has been watched in the sandbox.

Several plugins:

```bash
for d in plugins/*/; do node scripts/link-plugin.mjs --profile dsh-dev "$(basename "$d")"; done
```

Developer ship (Node users): publish or pack each plugin on its own (`pnpm --filter dsh-<slug> publish` or `pack`). Git install is `github:kedoupi/xiaotaozi-dsh#path:plugins/<slug>` (floating) or `#vX.Y.Z&path:plugins/<slug>` (product tag). Never treat the repo root as one plugin package. Users take first `xtz start` for defaults, then the in-app market for extras.

## Commit

1. `pnpm check`, the plugin in question has been `build`ed, and `pnpm check-home` passes (`~/.dsh` unlinked).
2. `git status` / `git diff` / `git log -5`. If there is no `.git`, `git init` first. Do not add `node_modules`, `lib/`, `*.tgz`, `.dsh-home/`, or `$DSH_HOME`. Do not add an `externals/` tree.
3. One concern per commit. Split by plugin when you can. Do not bump `cliApp` or plugin `package.json` versions on an ordinary commit. Land ordinary work on a topic branch (a worktree is optional). Prefer a PR into `main`. Do not add Git Flow standing branches.
4. Title:

```text
<type>(<scope>): <imperative summary>
```

`type`: `feat` `fix` `refactor` `docs` `chore` `test`. `scope` is the plugin slug; repo-wide changes use `repo`.
5. Write the message with a HEREDOC. Do not `git commit --no-verify`. Do not `git push` unless the user asked.
6. After the commit, `git status` should be clean or only hold files left on purpose.

## Simplify

Do this after the plugin works. Do not extract a shared layer while you are still adding features.

- Can this capability be `dsh plugin add`ed on its own? If not, fold it into an existing plugin. Do not add a shared `packages/` workspace; path installs would not include it.
- No Web UI: stay host-only and delete an empty `src/client`.
- Delete template leftovers (`greet`, unused `Config` fields, unused `inject`, unused deps).
- Keep `lib/index.js` small: no bundled `node_modules`, no `@deepseek-ai/dsh-tools`.
- Tests cover pure functions. Do not mock the whole harness for coverage.

Run `pnpm check` when you finish. To record it, use Commit.
