# dsh-plugins

English | [中文](README.zh.md)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin monorepo. Each plugin is its own installable npm package. Licensed under [MIT](LICENSE).

Do not `dsh plugin add` the repository root. The root is a pnpm workspace, not a plugin. Install a package under `plugins/` by path.

## Plugins

| Package | Path | README | What it does |
| --- | --- | --- | --- |
| [`dsh-passport`](plugins/passport) | `plugins/passport` | [EN](plugins/passport/README.md) · [中文](plugins/passport/README.zh.md) | Occupies Settings → **Models**: official membership login and API keys on one page; chat only lists the models you checked. |
| [`dsh-hello`](plugins/hello) | `plugins/hello` | [EN](plugins/hello/README.md) · [中文](plugins/hello/README.zh.md) | Host-only scaffold canary. Not a product. Confirms `pnpm new` still builds and links. |

## Install

Example — install Passport into the web profile:

```bash
dsh plugin --profile web add github:kedoupi/dsh-plugins#path:plugins/passport
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
docs/               maintainer workflow ([EN](docs/workflow.md) · [中文](docs/workflow.zh.md))
```

The workspace root must not declare `dsh.bundle` or `dsh.profile`. Profiles live under `$DSH_HOME/profiles/` and stay out of git.

## Develop

Hard rules: [AGENTS.md](AGENTS.md). Steps: [docs/workflow.md](docs/workflow.md). With an agent, use `/dsh-plugin`.

```bash
pnpm new greet                 # or: pnpm new sidebar --kind mixed
pnpm install
# replace the greet sample, then:
pnpm --filter dsh-greet test
pnpm --filter dsh-greet build
node scripts/link-plugin.mjs --profile dsh-dev greet
```

For Web UI, link into `web` and run `dsh web`.
