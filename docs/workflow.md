# Workflow

English | [中文](workflow.zh.md)

Hard rules live in [AGENTS.md](../AGENTS.md). This file is the procedure. Change rules in `AGENTS.md`; change steps here.

## Create

1. Default `--kind host`. Use `mixed` only when the user asked for a settings page, slot, or theme.
2. Do not hand-create directories. Do not edit `templates/` to make a new plugin.

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

6. Link into `dsh-dev` (Install below). Creation is done only after `dump-config` shows the layer.

New plugins ship with English `README.md` and Chinese `README.zh.md`. Keep both.

## Install

Build first. Profiles load `lib/`, not `src/`.

```bash
pnpm --filter dsh-<slug> build
node scripts/link-plugin.mjs --profile dsh-dev <slug>
```

- Load check only: `dsh-dev`.
- Web UI or model-callable tools: `--profile web`, then `dsh web`.
- Stop if `link-plugin` fails. Do not pretend it linked.
- After source edits, rebuild. A running `dsh` must be restarted to pick up new `lib/`.
- To skip a rebuild, `dsh web --patch <file>`; `name` in that patch must be an absolute path.

Several plugins:

```bash
for d in plugins/*/; do node scripts/link-plugin.mjs --profile dsh-dev "$(basename "$d")"; done
```

Shipping: publish or pack each plugin on its own (`pnpm --filter dsh-<slug> publish` or `pack`). Git install is `github:kedoupi/dsh-plugins#path:plugins/<slug>`. Never treat the repo root as one plugin package.

## Commit

1. `pnpm check`, and the plugin in question has been `build`ed.
2. `git status` / `git diff` / `git log -5`. If there is no `.git`, `git init` first. Do not add `node_modules`, `lib/`, `*.tgz`, or `$DSH_HOME`.
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

- Can this capability be `dsh plugin add`ed on its own? If not, fold it into an existing plugin, or wait for a second caller before `packages/`.
- No Web UI: stay host-only and delete an empty `src/client`.
- Delete template leftovers (`greet`, unused `Config` fields, unused `inject`, unused deps).
- Keep `lib/index.js` small: no bundled `node_modules`, no `@deepseek-ai/dsh-tools`.
- Tests cover pure functions. Do not mock the whole harness for coverage.

Run `pnpm check` when you finish. To record it, use Commit.
