<h1 align="center">dsh-memory</h1>

<p align="center"><b>Settings → Memory: durable notes the model can recall across sessions.</b></p>

<p align="center">
  recall · search · graph · remember · import from Cursor, Claude Code, Codex, and others
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh.md">中文</a> ·
  <a href="https://github.com/kedoupi/dsh-plugins">dsh-plugins</a> ·
  <a href="NOTICE">NOTICE</a>
</p>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/topic-dsh--plugin-0ea5e9?style=flat-square" alt="dsh-plugin"></a>
  <img src="https://img.shields.io/badge/engine-Noema-64748b?style=flat-square" alt="Noema">
  <img src="https://img.shields.io/badge/dsh-0.1.1--rc.2-4176e6?style=flat-square" alt="DeepSeek Harness 0.1.1-rc.2">
</p>

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin. Occupies Settings → **Memory** (three tabs: in chat, saved notes, import). The model gets Noema's `noema_*` tools.

The engine is [Noema](https://github.com/ZSeven-W/noema) (`noema-mcp`), the same one [dsh-noema](https://github.com/ZSeven-W/dsh-noema) ships. This package is the DSH glue plus a Chinese settings page. Native binaries come from `@zseven-w/dsh-noema-<platform>` optional dependencies. See [NOTICE](NOTICE).

Part of the [`dsh-plugins`](https://github.com/kedoupi/dsh-plugins) monorepo. Do not `dsh plugin add` the repository root.

## Features

- **Chat is the main path.** “Remember that we deploy with pnpm” → `noema_remember`. A new session should call `noema_recall`.
- **Settings page for humans.** Search, add, delete, and import from Cursor / Claude Code / Codex and similar tools.
- **Inspectable files.** Empty `noemaRoot` uses `~/.agent-memory`. Set Memory root to `$DSH_HOME/plugins/memory` to keep them in the Harness home.

## Install

```bash
dsh plugin --profile web add github:kedoupi/dsh-plugins#path:plugins/memory
dsh web
```

Optional platform packages must be allowed to install so `bundled` can find `noema-mcp`. After source changes: rebuild this package and restart `dsh`.

## Config

Tunable values live on the plugin Config (`dump-config` layer `# == dsh-memory`). The settings page also writes `$DSH_HOME/plugins/memory/settings.json` on top of that.

| Field | Default | Meaning |
| :-- | :-- | :-- |
| `enabled` | `true` | Master switch for the tools |
| `command` | `bundled` | `noema-mcp` launch; `bundled` uses the optional native package |
| `noemaRoot` | empty | `NOEMA_ROOT`; empty keeps `~/.agent-memory` |
| `guidance` | `true` | Inject the system-prompt section |
| `recallBudgetTokens` | `1200` | Default recall pack size |
| `keepAlive` | `true` | Restart the MCP child if it exits |

## Develop

From the monorepo root:

```bash
pnpm --filter dsh-memory test
pnpm --filter dsh-memory build
node scripts/link-plugin.mjs --profile web memory
pnpm dev
```

That links into the repo `.dsh-home` (port 3081), not the daily `~/.dsh`.

## Documentation

| Doc | Read it when |
| :-- | :-- |
| [Workflow](../../docs/workflow.md) | Create, install, simplify, commit |
| [Conventions](../../docs/conventions.md) | Package identity and two homes |
| [NOTICE](NOTICE) | Noema / dsh-noema MIT attribution |
| [dsh-plugins](../../README.md) | The rest of the monorepo |

## License

[MIT](../../LICENSE)
