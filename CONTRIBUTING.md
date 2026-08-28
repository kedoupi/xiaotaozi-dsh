# Contributing

English | [中文](CONTRIBUTING.zh.md)

This repository is Xiaotaozi DSH: the user product is `xtz` (`apps/cli/`), plus first-party plugins under `plugins/`. There is no desktop client.

Map of every doc: [docs/README.md](docs/README.md).  
Spec (what is true): [docs/conventions.md](docs/conventions.md).  
Procedure (how to do a job): [docs/workflow.md](docs/workflow.md).  
Hard rules for agents: [AGENTS.md](AGENTS.md).

## Inner loop

```bash
git clone https://github.com/kedoupi/xiaotaozi-dsh.git
cd xiaotaozi-dsh
pnpm install
```

| You are changing | Do this | Do not |
| --- | --- | --- |
| A plugin | `pnpm dev` (sandbox `.dsh-home`, port **3081**) | `link:` this checkout into `~/.dsh` |
| `xtz` | `cd apps/cli && pnpm install && pnpm check` (fake home) | Assume root `pnpm install` installed the CLI |
| Official user path | `xtz start` on `~/.dsh` **3080** | Probe 3081, steal 3080, or `rm -rf ~/.dsh` |

Leave `pnpm dev` running while you edit plugins. It rebuilds `lib/` and restarts `xtz --sandbox` when host output changes.

## Gates

Run from the repo root. None of these publishes.

| Command | Guarantee |
| --- | --- |
| `pnpm check` | Version/docs/manifest policy, types, plugin tests, script tests |
| `pnpm check:build` | Builds plugins and inspects required `lib/` |
| `pnpm check:path` | Isolated Git `#path:plugins/<slug>` install can build |
| `pnpm check:cli` | Standalone `apps/cli` workspace |
| `pnpm check-home` | Diagnoses unsafe links from `~/.dsh`; never repairs |

Before a commit: `pnpm check`, build the plugin you touched, `pnpm check-home` green (official home unlinked). Title: `<type>(<scope>): <imperative summary>`. Scope is the plugin slug, or `repo`. Do not commit `lib/`, `node_modules`, `.dsh-home/`, or `$DSH_HOME`. Do not bump `cliApp` or plugin versions except in a release commit (see [docs/conventions.md](docs/conventions.md) § Versions). Prefer a PR into `main` so CI runs before merge. Ship `xiaotaozi-dsh-cli` from a git tag via GitHub Actions, not `npm publish` on a laptop ([docs/workflow.md](docs/workflow.md) § Ship a product snapshot).

## Where a change goes

| Kind | Path |
| --- | --- |
| First-party plugin | `plugins/<slug>/` via `pnpm new` |
| Third-party plugin | one row in `plugins/market` `MARKET_PLUGINS` — do not vendor the source |
| User product | `apps/cli/` |
| Public site | `apps/website/` |
| Spec / procedure | `docs/` |

Do not add `apps/desktop/`, `packages/`, or `externals/`. Desktop history is `git show archive/desktop`.
