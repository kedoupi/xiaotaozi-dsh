# Workflow

English | [中文](workflow.zh.md)

Hard rules: [AGENTS.md](../AGENTS.md). Spec: [conventions.md](conventions.md). This file is the procedure. Change rules in `AGENTS.md`; change the spec in `conventions.md`; change steps here.

## Dev environment

Two homes. Spec: [conventions.md](conventions.md) § Homes.

| | Official / 小白 desktop | Sandbox |
| --- | --- | --- |
| `DSH_HOME` | `~/.dsh` | `<repo>/.dsh-home` (gitignored) |
| Command | 小桃子DSH.app or `dsh web` | `pnpm dev` / `link-plugin` |
| Port | **3080** | **3081** |

Plugin work uses the sandbox. The Tauri client (`apps/desktop`) uses official `~/.dsh` on 3080. If 3080 is taken, do not steal it.

`link-plugin` always writes into `.dsh-home`. Do not link into `~/.dsh`. Do not run `dsh plugin add ./plugins/<slug>` against the official default. After `build`, restart `pnpm dev` only. Clone with `--recurse-submodules` so `externals/` is populated, then run `pnpm install` before any build/check. `pnpm check-home` (or `node scripts/doctor.mjs`) is diagnosis only: it lists and fails on unsafe links from `~/.dsh`; it never repairs a profile.

Repository gates: `pnpm check` covers version/docs/manifest policy plus type/tests; `pnpm check:build` additionally builds and inspects required `lib/`; `pnpm check:path` proves isolated Git path installs; `pnpm check:desktop` runs desktop script/frontend/Rust quality checks without publishing or making a release.

Need API keys in the sandbox: copy `~/.dsh/.credentials.yaml` into `.dsh-home/`. Do not copy `sessions/` or `storages/`.

## Create

1. Default `--kind host`. Use `mixed` only when the user asked for a settings page, slot, or theme.
2. Do not hand-create directories. Do not edit `templates/` to make a new plugin. Do not put new plugins in `externals/` — that directory is read-only upstream pins. Forks live under `plugins/`.

```bash
pnpm new <slug>                 # or: pnpm new <slug> --kind mixed
pnpm install
```

3. Replace the `greet` sample in the same turn. Logic that can run without Cordis stays in a separate file; tests import that file only.
4. Tunable values go on the exported Schemastery `Config`.
5. Then:

```bash
pnpm --filter dsh-<slug> test
pnpm --filter dsh-<slug> build
pnpm check
pnpm build && node scripts/check-manifest.mjs --require-lib   # requires and inspects built lib/ (check:path proves the install)
```

6. Link into the sandbox `dsh-dev` profile (Install below). Creation is done only after `dump-config` shows the layer.

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
- After source edits, rebuild and restart the sandbox `pnpm dev`.
- To skip a rebuild, `pnpm dev -- --patch <file>`; `name` in that patch must be an absolute path.
- Optional: copy `~/.dsh/.credentials.yaml` into `.dsh-home/` if the sandbox needs API keys. Do not copy `sessions/` or `storages/`.

Several plugins:

```bash
for d in plugins/*/; do node scripts/link-plugin.mjs --profile dsh-dev "$(basename "$d")"; done
```

Developer ship (Node users): publish or pack each plugin on its own (`pnpm --filter dsh-<slug> publish` or `pack`). Git install is `github:kedoupi/xiaotaozi-dsh#path:plugins/<slug>`. Never treat the repo root as one plugin package. 小白 desktop is the other path, below.

## Ship a desktop plugin pack

Not `dsh plugin add`, not `link:`, not GitHub. Spec: [conventions.md](conventions.md) § Desktop plugin packs.

1. Change the plugin in the sandbox, verify on **3081**.
2. Commit only if they asked.
3. Generate an Ed25519 key once with `pnpm generate-pack-key`. Commit only `src-tauri/keys/pack-signing-key.der`; never commit `.pack-signing/pack-signing-key.pem`. CI/release automation receives the private PEM (or its path) through the `XIAOTAOZI_PACK_SIGNING_KEY` secret.
4. Pack on every **target OS** (native addons follow the host). Preserve and transfer the whole `plugin-packs/` aggregate between builders. With matching metadata, each new target is added to the existing signed payload and keeps the same `packVersion`; collect all referenced target tarballs on the final publisher before publishing:

```bash
cd apps/desktop
pnpm pack-plugins      # plugin-packs/*.tar.gz + signed latest.json
pnpm publish-pack      # tcb upload, then PurgeUrlsCache, then wait for live index
```

Needs `tcb` on PATH and `~/.config/env/tencent/tcb.env`. Before release, run `pnpm check`, `pnpm check:build`, `pnpm check:path`, and `pnpm check:desktop`, then test first install, update, rollback/health failure, and an externally owned 3080 process. Do not use these steps to perform a real publish during routine verification.

Done means the live `https://s.xiaotaozi.cc/dsh/packs/latest.json` envelope decodes to the new `packVersion`. COS put without purge is not done. Do not upload from the TCB console and skip the script. Do not point 小白 at GitHub. First-time prefix only: `pnpm publish-pack --init`.

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
