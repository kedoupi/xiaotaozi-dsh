# Workflow

English | [中文](workflow.zh.md)

Hard rules: [AGENTS.md](../AGENTS.md). Spec: [conventions.md](conventions.md). This file is the procedure. Change rules in `AGENTS.md`; change the spec in `conventions.md`; change steps here.

## Dev environment

Daily Harness stays on `~/.dsh` (`dsh web`, port 3080). This repo boots a second home:

| | Daily | Sandbox |
| --- | --- | --- |
| `DSH_HOME` | `~/.dsh` | `<repo>/.dsh-home` (gitignored) |
| Command | `dsh web` | `pnpm dev` |
| Port | 3080 | 3081 |

`link-plugin` always writes into `.dsh-home`. Do not link into `~/.dsh`. After `build`, restart `pnpm dev` only. Clone with `--recurse-submodules` so `externals/` is populated.

Need API keys in the sandbox: copy `~/.dsh/.credentials.yaml` into `.dsh-home/`. Do not copy `sessions/` or `storages/`.

## Create

1. Default `--kind host`. Use `mixed` only when the user asked for a settings page, slot, or theme.
2. Do not hand-create directories. Do not edit `templates/` to make a new plugin. Do not put new plugins in `externals/` — that directory is git submodules only.

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
```

6. Link into the sandbox `dsh-dev` profile (Install below). Creation is done only after `dump-config` shows the layer.

New plugins ship with English `README.md` and Chinese `README.zh.md`. Keep both.

## Install

Build first. Profiles load `lib/`, not `src/`.

`link-plugin` and `pnpm dev` set `DSH_HOME` to the repo `.dsh-home` (gitignored). That home is separate from the user's daily `~/.dsh`. Do not link workspace plugins into `~/.dsh/profiles/web`.

```bash
pnpm --filter dsh-<slug> build
node scripts/link-plugin.mjs --profile dsh-dev <slug>
```

- Load check only: `dsh-dev` (still under `.dsh-home`).
- Web UI or model-callable tools: `--profile web`, then `pnpm dev` (port 3081). Leave the daily `dsh web` on 3080 alone.
- Stop if `link-plugin` fails. Do not pretend it linked.
- After source edits, rebuild and restart the sandbox `pnpm dev`.
- To skip a rebuild, `pnpm dev -- --patch <file>`; `name` in that patch must be an absolute path.
- Optional: copy `~/.dsh/.credentials.yaml` into `.dsh-home/` if the sandbox needs API keys. Do not copy `sessions/` or `storages/`.

Several plugins:

```bash
for d in plugins/*/; do node scripts/link-plugin.mjs --profile dsh-dev "$(basename "$d")"; done
```

Shipping: publish or pack each plugin on its own (`pnpm --filter dsh-<slug> publish` or `pack`). Git install is `github:kedoupi/dsh-plugins#path:plugins/<slug>`. Never treat the repo root as one plugin package.

## Commit

1. `pnpm check`, and the plugin in question has been `build`ed.
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
