# Workflow

English | [中文](workflow.zh.md)

Hard rules: [AGENTS.md](../AGENTS.md). Spec: [conventions.md](conventions.md). This file is the procedure. Change rules in `AGENTS.md`; change the spec in `conventions.md`; change steps here.

## Dev environment

Two homes. Spec: [conventions.md](conventions.md) § Homes. Test stays on test; official stays on official.

| | Official / Desktop user | Sandbox |
| --- | --- | --- |
| `DSH_HOME` | `~/.dsh` | `<repo>/.dsh-home` (gitignored) |
| Command | 小桃子DSH.app or official `dsh web`; first-release `xtz` inspection is read-only | `pnpm dev` / `link-plugin` / debug `tauri dev` |
| Port | **3080** | **3081** |

| Job | Home |
| --- | --- |
| Change plugin source, settings UI, `link-plugin`, debug `pnpm tauri dev` | Sandbox **3081**. `pnpm dev` watches `plugins/*/src`, rebuilds `lib/`, and restarts host code on :3081 |
| Pack apply, notarization, installed 小桃子DSH.app | Official `~/.dsh` **3080**. This tests the product users get |
| Shipped `.dmg` | Official `~/.dsh` **3080** |
| Inspect official home with first-release `xtz` | Official `~/.dsh` **3080**, read-only |

`pnpm tauri dev` is debug-only (`.dsh-home` :**3081**). Release never probes 3081 and never falls back to 3080. Do not verify `link:` checkouts inside the installed 小桃子DSH.app. If 3080 is taken, do not steal it.

Before starting, `pnpm dev` stops a listener on **3081** only after process inspection proves it is this repository's marked `dsh web --host 127.0.0.1 --port 3081`; an unknown or unverifiable listener is a hard error and is never signalled. It never frees **3080**. `link-plugin` always writes into `.dsh-home`. Do not link into `~/.dsh`. Do not run `dsh plugin add ./plugins/<slug>` against the official default. Leave `pnpm dev` running while you edit: it rebuilds `plugins/*/lib` and restarts `dsh web` when host `lib/index.js` or `cordis.patch.yml` content changes, after those files exist again. Sandbox `pnpm dev` sets `DSH_PLUGIN_TRACE=1` so IM and wecom-office hosts print one-line traces; official pack / 小桃子DSH.app does not. Set `DSH_PLUGIN_TRACE=0` to mute the sandbox. Unexpected `dsh web` exits retry with backoff; they are not treated as a host rebuild. Client `lib/client.js` uses host HMR (hard-refresh if the UI did not update). `pnpm dev -- --once` is the old build-once path. Clone with `--recurse-submodules` so `externals/` is populated, then run `pnpm install` before any build/check. `pnpm check-home` (or `node scripts/doctor.mjs`) is diagnosis only: it lists and fails on unsafe links from `~/.dsh`; it never repairs a profile.

Repository gates: `pnpm check` covers version/docs/manifest policy plus type/tests; `pnpm check:build` additionally builds and inspects required `lib/`; `pnpm check:path` proves isolated Git path installs; `pnpm check:desktop` runs desktop script/frontend/Rust quality checks; `pnpm check:cli` checks the standalone CLI workspace. None of them publishes.

Need API keys in the sandbox: copy `~/.dsh/.credentials.yaml` into `.dsh-home/`. Do not copy `sessions/` or `storages/`.

## CLI development

`apps/cli/` is a standalone workspace; do not assume a root `pnpm install` installs it. Use exactly Node.js `22.19.0` (`apps/cli/.node-version`, kept equal to `versions.json` `node`) and the pinned DSH `0.1.1-rc.2`. After a CLI change, run:

```bash
cd apps/cli
pnpm install
pnpm check
node lib/cli.js --help
node lib/cli.js version --json
```

Prefer `node lib/cli.js` over a global `pnpm link` while developing. `pnpm check` uses a fake home. To inspect the real official environment, `node lib/cli.js doctor`; a red report on a dirty `~/.dsh` is expected.

Users install with `apps/cli/scripts/install.sh`, `npm install -g xiaotaozi-dsh-cli`, or `bun add -g xiaotaozi-dsh-cli`. Those commands require Node.js `22.19.0` already on `PATH`; they must not install or switch Node, and they must not start DSH.

The first release exposes only help/version, `status`, `config path`, `plugin list`, and `doctor`; each stays read-only. `plugin list` parses the official profile manifest directly and never calls `dsh plugin`. All official inspection is fixed to `~/.dsh` and `127.0.0.1:3080`; a busy or identity-unverified port is never a reason to use 3081.

Do not run or implement `start`/`web`, `open`, `run`/`ask`, `config dump`/`defaults`, `stop`, or `update` yet. They must fail closed until Desktop and CLI share a trusted cross-process supervisor, authenticated instance ownership, and a locked profile transaction boundary. The exact v1 identity endpoint is only a product-health contract. Desktop additionally matches a fresh per-process token before adopting its child; that private launch token is not yet a shared CLI authorization protocol. In particular, do not invoke a DSH command against `~/.dsh` if it may prepare or rewrite generated profile state, even when its user-facing name sounds read-only. Routine CI checks only help/version and unit-tested read-only behavior; they never start or mutate the official service.

## Talking to agents

First sentence names **product + environment + action**. Environments are only: `sandbox`, `official`, `release Desktop`, `CLI read-only`. Spec: [conventions.md](conventions.md) § Users.

```text
In <environment>, do <action> to <product>. [Do not touch <forbidden>.]
```

| Intent | Say |
| --- | --- |
| Change a plugin | In the sandbox, change `dsh-im` settings, link to web, verify with `pnpm dev` on 3081. Do not touch `~/.dsh`. |
| New plugin | Create `dsh-foo` (host) via dsh-plugin, install into sandbox `dsh-dev`, not the official home. |
| Ship to users | Sandbox already verified. Ship a desktop plugin pack. Do not `link:` official home. Do not install with `xtz`. |
| Change the shell while iterating plugins | `pnpm tauri dev` on sandbox 3081. Do not retarget to 3080. |
| Test a user's first launch | Build a local release app, move `~/.dsh/profiles/web` aside, cold-start the new app. Do not `rm -rf ~/.dsh`. Do not use an outdated installed app. |
| See if official looks like a user machine | Node 22.19.0: `node lib/cli.js doctor`, read-only. A red `doctor` is an environment signal first. |
| Change the CLI | In `apps/cli` with `.node-version`. `pnpm check` on a fake home; real `~/.dsh` is read-only. Do not implement `plugin add`. |
| Dual install | Dual install = a user who also has `xtz`. Plugin ownership stays with Desktop. Do not Git-install into official web via CLI. |
| First public release | No external users yet. Align seed / pack / CLI doctor on hello, sidebar, providers, memory, im, then dmg → pack → npm. Do not accept a dirty `~/.dsh` as release evidence. |

Refuse or rewrite: install plugins into `~/.dsh`; Git-install via CLI; `tauri dev` on 3080; merge everyone onto `~/.dsh`; delete all of `~/.dsh` to test CLI install; treat debug shell as the user path.

Opening line for a new chat:

```text
Per AGENTS / conventions: plugins only in sandbox 3081; official ~/.dsh 3080 is written by release Desktop and read by xtz. This task is: …
```

## Rebuild official home

Do not `rm -rf ~/.dsh` (credentials and sessions live there).

1. Quit 小桃子DSH.app.
2. Optional: copy `~/.dsh/.credentials.yaml` somewhere outside `~/.dsh`.
3. `mv ~/.dsh/profiles/web ~/.dsh/profiles/web.bak-dirty`
4. Cold-start a **release** 小桃子DSH.app (not `pnpm tauri dev`).
5. With Node 22.19.0: `node lib/cli.js plugin list` and `node lib/cli.js doctor`.

Expect only `file:./vendor/dsh-*.tgz`. A missing bundled plugin (for example `dsh-sidebar`) means the release seed is stale, not that CLI should install it.

## First public ship

Nothing has been published yet. One cut, then stop. Seed, pack, and CLI `doctor` must agree on hello / sidebar / providers / memory / im.

1. `pnpm check`, `pnpm check:build`, `pnpm check:path`, `pnpm check:desktop`, `pnpm check:cli`. `pnpm check-home` must show official home unlinked from this repo.
2. Release Desktop `.dmg` from a bundle that includes those five plugins. Notarize.
3. `cd apps/desktop && pnpm pack-plugins && pnpm publish-pack`. COS put without purge is not done.
4. Reseed official home from **that** app, then `xtz doctor` / `plugin list`.
5. Only then `npm publish` `xiaotaozi-dsh-cli`. bun/pnpm/`install.sh` only fetch that package. No Homebrew.

Do not publish CLI while the user Desktop seed still omits a plugin `doctor` requires.

## Dual-install check

Same official home as a user who only has Desktop. The shell runs; `xtz doctor` is read-only. Do not test Git install on that home.

## Create

1. Default `--kind host`. Use `mixed` only when the user asked for a settings page, slot, or theme.
2. Do not hand-create directories. Do not edit `templates/` to make a new plugin. Do not put new plugins in `externals/` — that directory is read-only upstream pins. Forks live under `plugins/`.

```bash
pnpm new <slug>                 # or: pnpm new <slug> --kind mixed
pnpm install
```

3. Replace the `greet` sample in the same turn. Logic that can run without Cordis stays in a separate file; tests import that file only. Do not fold models / memory / IM / context / agent-teams / the right-hand files-Git-terminal panel into `hello`; that plugin is chrome plus archive, task board, and git graph. The right panel is `plugins/sidebar`.
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

## Fork an upstream plugin

Spec: [conventions.md](conventions.md) § Externals. `externals/` is the pin. `plugins/` is what we install.

### Decide

Stop unless all three hold: it is a DeepSeek Harness plugin (or cleanly becomes one); the license is Apache-2.0 / MIT / BSD or similar; we will second-develop **and** install the fork.

Do not `git submodule add` a bookmark, `deepseek-harness`, a non-plugin, or a duplicate of a job we already ship. First-party plugins have no upstream. `externals/` is not a watch list.

### First fork

1. Record the upstream URL, license, and the commit we are aligning to.
2. If it is not a submodule yet: `git submodule add <url> externals/<upstream-dir>`. Use the upstream repo name (`dsh-context`).
3. `pnpm new <slug>` (or `--kind mixed` when there is UI). Do not hand-create `plugins/<slug>`. Do not edit `templates/` to make the fork.
4. Port `externals/<name>/src` into `plugins/<slug>`. Catalogize:
   - four names agree (`plugins/<slug>`, `dsh-<slug>`, patch `name`, `export const name` / patch `id` = `<slug>`)
   - tsdown `neverBundle: true`; every `@deepseek-ai/dsh-*` pinned to the host rc
   - no value-import of `@deepseek-ai/dsh-tools`
   - Cordis-free logic in a separate file; tests import that file only
   - `NOTICE` plus the upstream `LICENSE`
   - bilingual README: fork-of, Git path `github:kedoupi/xiaotaozi-dsh#path:plugins/<slug>`, do not install the author's npm next to this package
   - turn off any in-plugin upgrade hint that hits that npm
5. Add the plugin row **and** the `externals/…` → `plugins/…` row on the root README (English and Chinese).
6. `link-plugin` only `plugins/<slug>` (Install below). Never `link:` `externals/`. Creation is done only after `dump-config` shows `# == dsh-<slug>` and `pnpm check-home` passes.
7. Two commits when the user asked to commit: submodule gitlink first, then the fork. Do not commit unless asked.

### Later pull

```bash
git submodule update --remote externals/<name>
# diff externals/<name>/src against plugins/<slug>/src, then port
```

Port selected changes. Do not wholesale-overwrite our second-development. Two commits: gitlink bump, then the plugin port. Do not commit dirty files inside the submodule.

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
- After source edits, leave sandbox `pnpm dev` running. It watches plugins, rebuilds `lib/`, and restarts `dsh web` on 3081 when host output changes (and retries crashed boots with backoff once `lib/index.js` is back). Use `pnpm dev -- --once` to build once with no watch. `pnpm dev -- --filter im` watches one plugin.
- To skip a rebuild, `pnpm dev -- --once --patch <file>`; `name` in that patch must be an absolute path.
- Optional: copy `~/.dsh/.credentials.yaml` into `.dsh-home/` if the sandbox needs API keys. Do not copy `sessions/` or `storages/`.

Sandbox verification when the plugin binds then does durable work (spec: [conventions.md](conventions.md) § Onboarding and first work):

1. Leave `pnpm dev` running. Sandbox traces stay on (`DSH_PLUGIN_TRACE=1` for IM; official pack / 小桃子DSH.app stay silent).
2. Add / bind as a user would, then confirm the target (directory, workspace, project). The picker must not default to this repo.
3. Do the **first** real action (first IM message, first write, first session).
4. Check that work appeared only in the chosen target, not under this repository / `process.cwd()`. A later action landing correctly does not excuse the first one.
5. A passing `pnpm --filter dsh-<slug> test` is not this check. Do not call the plugin verified until that first-action path has been watched in the sandbox.

Several plugins:

```bash
for d in plugins/*/; do node scripts/link-plugin.mjs --profile dsh-dev "$(basename "$d")"; done
```

Developer ship (Node users): publish or pack each plugin on its own (`pnpm --filter dsh-<slug> publish` or `pack`). Git install is `github:kedoupi/xiaotaozi-dsh#path:plugins/<slug>`. Never treat the repo root as one plugin package. Desktop users take the pack path below.

## Ship a desktop plugin pack

Not `dsh plugin add`, not `link:`, not GitHub. Spec: [conventions.md](conventions.md) § Desktop plugin packs.

1. Change the plugin in the sandbox, verify on **3081**.
2. Commit only if they asked.
3. Generate an Ed25519 key once with `pnpm generate-pack-key`. It writes the private key to `~/.config/xiaotaozi-dsh/pack-signing-key.pem` (per user, shared by all checkouts — back it up off the machine). Commit only `src-tauri/keys/pack-signing-key.der`; the private PEM never enters git. CI/release automation receives the private PEM (or its path) through the `XIAOTAOZI_PACK_SIGNING_KEY` secret.
4. Pack on every **target OS** (native addons follow the host). Preserve and transfer the whole `plugin-packs/` aggregate between builders. With matching metadata, each new target is added to the existing signed payload and keeps the same `packVersion`; collect all referenced target tarballs on the final publisher before publishing:

```bash
cd apps/desktop
pnpm pack-plugins      # plugin-packs/*.tar.gz + signed latest.json
pnpm publish-pack      # tcb upload, then PurgeUrlsCache, then wait for live index
```

Needs `tcb` on PATH and `~/.config/env/tencent/tcb.env`. Before release, run `pnpm check`, `pnpm check:build`, `pnpm check:path`, and `pnpm check:desktop`, then test first install, update, rollback/health failure, and an externally owned 3080 process. Do not use these steps to perform a real publish during routine verification.

Done means the live `https://s.xiaotaozi.cc/dsh/packs/latest.json` envelope decodes to the new `packVersion`. COS put without purge is not done. Do not upload from the TCB console and skip the script. Do not point users at GitHub. First-time prefix only: `pnpm publish-pack --init`.

The index is a signed envelope (spec: conventions § Index envelope). Clients without envelope verification cannot consume these packs safely and must receive an application upgrade first; never downgrade the index to unsigned JSON for them.

## Commit

1. `pnpm check`, the plugin in question has been `build`ed, and `pnpm check-home` passes (`~/.dsh` unlinked).
2. `git status` / `git diff` / `git log -5`. If there is no `.git`, `git init` first. Do not add `node_modules`, `lib/`, `*.tgz`, `.dsh-home/`, or `$DSH_HOME`. Do not commit dirty files inside an `externals/` submodule; only bump the gitlink.
3. One concern per commit. Split by plugin when you can.
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
