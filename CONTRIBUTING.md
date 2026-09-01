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
| A plugin | Edit and run deterministic gates in its dedicated topic worktree | Start `pnpm dev` or claim **3081** there outside an explicit bounded QA transfer; `link:` it into `~/.dsh` |
| `xtz` | `cd apps/cli && pnpm install && pnpm check` (fake home) | Assume root `pnpm install` installed the CLI |
| Official user path | `xtz start` on `~/.dsh` **3080** | Probe 3081, steal 3080, or `rm -rf ~/.dsh` |

Normally keep `pnpm dev` running only in the repository-root hub as merged-main dogfood. A topic worktree may run it only during an explicit bounded QA transfer, then must return **3081** to the hub; do not edit topic work in the hub.

Cordis / Harness plugin APIs: official DeepSeek Harness docs. How this repo differs: [docs/harness-plugin.md](docs/harness-plugin.md).

The repository-root hub stays clean on `main` and owns sandbox **3081**. Develop every change in a short-lived topic branch checked out in its own worktree; do not develop or commit in the hub. Merge a green PR, fast-forward the hub, exercise the affected journey on `main`, then delete the merged local/remote branch and its clean worktree. Spec: [docs/conventions.md](docs/conventions.md) § Git. Steps: [docs/workflow.md](docs/workflow.md) § Dev environment.

## Gates

Run from the task worktree root. None of these publishes.

| Command | Guarantee |
| --- | --- |
| `pnpm check` | Version/docs/manifest policy, types, plugin tests, script tests |
| `pnpm check:build` | Builds plugins and inspects required `lib/` |
| `pnpm check:path` | Isolated Git `#path:plugins/<slug>` install can build |
| `pnpm check:cli` | Standalone `apps/cli` workspace |
| `pnpm check-home` | Diagnoses unsafe links from `~/.dsh`; never repairs |

Before a commit: `pnpm check`, build the plugin you touched, `pnpm check-home` green (official home unlinked). Title: `<type>(<scope>): <imperative summary>`. Scope is the plugin slug, or `repo`. Do not commit `lib/`, `node_modules`, `.dsh-home/`, or `$DSH_HOME`. Do not bump `cliApp` or plugin versions except in a release commit (see [docs/conventions.md](docs/conventions.md) § Versions). Open a PR into `main`; merge only after required CI passes. Ship `xiaotaozi-dsh-cli` from a git tag via GitHub Actions, not `npm publish` on a laptop ([docs/workflow.md](docs/workflow.md) § Ship a product snapshot).

## Where a change goes

| Kind | Path |
| --- | --- |
| First-party plugin | `plugins/<slug>/` via `pnpm new` |
| Third-party plugin | one row in `plugins/market` `MARKET_PLUGINS` — do not vendor the source |
| User product | `apps/cli/` |
| Public site | `apps/website/` |
| Spec / procedure | `docs/` |

Do not add `apps/desktop/`, `packages/`, or `externals/`. Desktop history is `git show archive/desktop`.
