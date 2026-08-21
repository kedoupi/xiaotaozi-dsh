# dsh-plugins

English | [中文](README.zh.md)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin monorepo. Each plugin is its own installable npm package. Licensed under [MIT](LICENSE).

Do not `dsh plugin add` the repository root. The root is a pnpm workspace, not a plugin. Install a package under `plugins/` by path.

## Plugins

| Package | Path | README | What it does |
| --- | --- | --- | --- |
| [`dsh-providers`](plugins/providers) | `plugins/providers` | [EN](plugins/providers/README.md) · [中文](plugins/providers/README.zh.md) | Occupies Settings → **Models**: official membership login and API keys on one page; chat only lists the models you checked. |
| [`dsh-hello`](plugins/hello) | `plugins/hello` | [EN](plugins/hello/README.md) · [中文](plugins/hello/README.zh.md) | Xiaotaozi DSH welcome dialog when the Web app opens. |

## Install

Example — install Providers into the web profile:

```bash
dsh plugin --profile web add github:kedoupi/dsh-plugins#path:plugins/providers
dsh web
```

Then open **Settings → Models**. After you change source, rebuild that plugin and restart a running `dsh`.

Git-hosted install uses this shape for every package:

```text
github:kedoupi/dsh-plugins#path:plugins/<slug>
```

Public discovery uses the GitHub topic [`dsh-plugin`](https://github.com/topics/dsh-plugin).

## Layout

```text
plugins/<slug>/     installable plugin, package name dsh-<slug>
packages/           internal libraries (no dsh.bundle) — add when a second plugin needs one
templates/          host / mixed skeletons for `pnpm new`
docs/               conventions + workflow ([EN](docs/conventions.md) · [中文](docs/conventions.zh.md))
```

The workspace root must not declare `dsh.bundle` or `dsh.profile`. Daily profiles live under `~/.dsh`. Local development boots a gitignored `.dsh-home/` so the daily home stays untouched.

## Develop

Conventions: [docs/conventions.md](docs/conventions.md). Steps: [docs/workflow.md](docs/workflow.md). Hard rules: [AGENTS.md](AGENTS.md). With an agent, use `/dsh-plugin`.

```bash
pnpm new greet                 # or: pnpm new sidebar --kind mixed
pnpm install
# replace the greet sample, then:
pnpm --filter dsh-greet test
pnpm --filter dsh-greet build
node scripts/link-plugin.mjs --profile dsh-dev greet
```

For Web UI, link into the sandbox `web` profile and run `pnpm dev` (port 3081). Do not `dsh web` against `~/.dsh` while iterating.
