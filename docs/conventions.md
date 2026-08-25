# Conventions

English | [中文](conventions.zh.md)

Hard rules: [AGENTS.md](../AGENTS.md). Steps: [workflow.md](workflow.md). This file is the project spec those two assume.

## Repo

This is a plugin monorepo for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). The workspace root is not a plugin. Do not `dsh plugin add` it.

| Path | Role |
| --- | --- |
| `plugins/<slug>/` | One installable package, name `dsh-<slug>` |
| `packages/` | Shared libraries with no `dsh.bundle`. Add only when a second plugin needs the code |
| `externals/<name>/` | Read-only git submodule of an upstream plugin. Reference only. Never install it |
| `templates/` | Skeletons for `pnpm new`. Do not edit them to make a plugin |
| `.dsh-home/` | Gitignored sandbox Harness home. Not `~/.dsh` |

Public docs are English by default (`README.md`) with Chinese at `README.zh.md`, at the repo root and in each plugin.

## Externals

`externals/` is the upstream pin. `plugins/` is the fork we ship. Users and the sandbox install **only** `plugins/<slug>`. Steps: [workflow.md](workflow.md) § Fork.

### When to take one in

Add a pin **and** a fork only when all of these hold:

- It is (or cleanly becomes) a DeepSeek Harness plugin
- The license is Apache-2.0, MIT, BSD, or similarly permissive
- We will second-develop it (catalog layout, host rc pins, Chinese copy, extra behavior) **and** install the fork

Do **not** add to `externals/`:

- A project we only want to bookmark (star it; do not submodule)
- `deepseek-harness` itself (already forbidden to vendor)
- Libraries, apps, or whole repos that are not plugins
- A second implementation of a job we already ship, unless we are replacing the current plugin
- First-party plugins (`providers`, `memory`, `im`, `hello`): they have no upstream; do not invent a submodule

`externals/` is not a watch list. Every pin must have a matching `plugins/<slug>` we install. A pin with no fork is clone cost with no payoff.

### Pin and fork

- Not in the pnpm workspace. `pnpm install`, `pnpm check`, `pnpm new`, and `link-plugin` ignore them.
- Do not edit files inside a submodule. Do not `pnpm new` under `externals/`. Do not `link:` / `dsh plugin add` a path under `externals/`. Do not tell users to install the upstream npm name when we already have a fork. Do not install our fork and the upstream npm in the same profile.
- Directory under `externals/` keeps the upstream repo name (`dsh-context`). Directory under `plugins/` is our slug with no `dsh-` prefix (`plugins/context`). Package name is `dsh-<slug>`. If upstream already published `dsh-<slug>`, keep that package name so replacing the npm install matches.
- Fork once: `pnpm new <slug>`, port the upstream `src` into `plugins/<slug>`, then catalogize (tsdown `neverBundle: true`, host rc pins, tests, `NOTICE` + upstream `LICENSE`, bilingual README). After that, only edit the fork.
- The fork README states the upstream, the Git path, and that users must not install the author's npm next to this package. Turn off any in-plugin upgrade hint that points at that npm.
- Root README lists both the installable plugin and the `externals/…` → `plugins/…` row.
- When the author publishes: `git submodule update --remote externals/<name>`, diff `externals/<name>/src` against `plugins/<slug>/src`, port selected changes. Do not overwrite our second-development with a wholesale tree copy. Two commits: gitlink bump, then the plugin port.
- Clone with `git clone --recurse-submodules`, or after a plain clone: `git submodule update --init`.
- Git install is always `github:kedoupi/dsh-plugins#path:plugins/<slug>`, never `#path:externals/…`.

## Two homes

The machine already has a daily Harness. Plugin work must not take it down, rewrite its profile, or share its session store.

| | Daily | Sandbox (this repo) |
| --- | --- | --- |
| Home | `~/.dsh` | `<repo>/.dsh-home` |
| CLI | global `dsh` (`@deepseek-ai/dsh@next`) | same binary |
| Boot | `dsh web` → port 3080 | `pnpm dev` → port 3081 |
| Plugins | user's stable set | `link:` into this workspace |

`link-plugin` and `pnpm dev` set `DSH_HOME` to `.dsh-home`. Never link workspace plugins into `~/.dsh/profiles/web`.

Need keys in the sandbox: copy only `~/.dsh/.credentials.yaml` into `.dsh-home/`. Do not copy `sessions/` or `storages/`.

Do not vendor or edit `deepseek-harness` here. Types and APIs come from published `@deepseek-ai/*` packages.

## Host version

Pin the global CLI to `@next`, currently `0.1.1-rc.2`:

```bash
pnpm add -g @deepseek-ai/dsh@0.1.1-rc.2
```

Many `@deepseek-ai/dsh-*` packages still have `latest` stuck on empty `0.0.1-rc.1`; always write an explicit version (`0.1.1-rc.2`). Plugin `@deepseek-ai/dsh-*` pins must match the host rc. When `@next` moves, templates and plugin `devDependencies` move with it.

## Package identity

One plugin, four names that must agree:

| Piece | Value |
| --- | --- |
| Directory | `plugins/<slug>/` |
| `package.json` `name` | `dsh-<slug>` |
| `cordis.patch.yml` `name` | `dsh-<slug>` |
| Patch `id` / `export const name` | `<slug>` |

Slug: lowercase `[a-z][a-z0-9-]*`, no `--`, no `dsh-` prefix in the directory (`pnpm new` strips it).

Git install:

```text
github:kedoupi/dsh-plugins#path:plugins/<slug>
```

That path is one plugin directory. There is no shared `packages/` workspace: it would not be included in a path install. Keep helpers inside the plugin, copy a small snippet, or publish an npm package.

A rename is all of the above, plus `$DSH_HOME/plugins/<slug>/` on disk, plus sandbox `link-plugin` again. Do not leave the old package name in a profile.

User-facing copy in Xiaotaozi plugins is Chinese. The settings page this plugin occupies is named after the job (模型), not the package name.

## Plugin layout

Default `pnpm new <slug>` is **host** (tools/services, no UI). Use `--kind mixed` only for a settings page, slot, or theme.

- Profile loads `lib/`, not `src/`. Rebuild after source edits.
- Logic that can run without Cordis lives in a separate file. Tests import that file only. Do not mock the whole harness.
- Tunable values go on the exported Schemastery `Config`.
- `@deepseek-ai/cordis` is `import type` unless `lib/` actually imports it at runtime — then it belongs in `dependencies`.
- Do not value-import `@deepseek-ai/dsh-tools`. Register a plain tool object on `ctx.tools`.
- `@deepseek-ai/*` stays external (`deps.neverBundle: true`).
- `prepare` / `tsdown.config.ts` stay inside the plugin package so a Git path install can build.
- Each plugin ships `README.md` and `README.zh.md`.

`pnpm check` enforces the installable shape (name, patch, no bundled `node_modules`, no `dsh-tools` in `lib/`).

## Commands

```bash
pnpm new <slug>                 # or: pnpm new <slug> --kind mixed
pnpm --filter dsh-<slug> test
pnpm --filter dsh-<slug> build
node scripts/link-plugin.mjs --profile dsh-dev <slug>   # load check
node scripts/link-plugin.mjs --profile web <slug>       # UI
pnpm dev                                                # sandbox web, :3081
pnpm check
```

Installed means `dump-config` contains `# == dsh-<slug>`. Restart `pnpm dev` after a rebuild. Do not restart the daily `dsh web`.
