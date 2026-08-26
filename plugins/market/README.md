<p align="right"><strong>English</strong> · <a href="./README.zh.md">中文</a></p>

<h1 align="center">dsh-market</h1>

<p align="center">
  <img src="docs/ip.jpg" width="160" height="160" alt="dsh-market icon">
</p>

<p align="center"><b>Xiaotaozi DSH market: browse plugins and workflow packs, queue installs for the desktop shell</b></p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh.md">中文</a> ·
  <a href="https://github.com/kedoupi/xiaotaozi-dsh">xiaotaozi-dsh</a>
</p>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/topic-dsh--plugin-0ea5e9?style=flat-square" alt="dsh-plugin"></a>
</p>

A first-class sidebar entry right below **New Session** opens a full-screen market overlay with **Market** and **Sources** tabs. It supports search, tag filters, detail views, and installed / queued badges. The panel only **queues** install / remove intents under `$DSH_HOME/plugins/market/intents.json`; the latest request for each entry wins, with a 100-intent bound. The 小桃子DSH desktop shell owns downloading, signature verification, and applying packs. The current catalog is mock data — shell integration lands later.

The configured `indexUrl` is currently used as source identity; this plugin does not fetch or verify it. The official mock catalog currently contains `hello`, `providers`, `memory`, `im`, and workflow examples, not every repository plugin.

Part of the [`xiaotaozi-dsh`](https://github.com/kedoupi/xiaotaozi-dsh) monorepo. Do not `dsh plugin add` the repository root.

## Use it

Open the sidebar entry below **New Session**, browse **Market** or manage **Sources**, then queue an install or remove request. The current UI is intentionally a catalog and intent queue; the desktop shell applies packs later.

## Config

| Field | Default | Meaning |
| :-- | :-- | :-- |
| `indexUrl` | `https://s.xiaotaozi.cc/dsh/packs/market.json` | Configured official index URL / source identity; not fetched here |
| `officialLabel` | `小桃子市场` | Display name of the official source |
| `allowThirdPartySources` | `true` | Allow adding extra sources from the panel |

User-added sources persist in `$DSH_HOME/plugins/market/sources.json` (https only; loopback http allowed for dev).

## Install

```bash
dsh plugin --profile <name> add github:kedoupi/xiaotaozi-dsh#path:plugins/market
```

## Documentation

| Doc | Read it when |
| :-- | :-- |
| [Workflow](../../docs/workflow.md) | Create, install, simplify, commit |
| [Conventions](../../docs/conventions.md) | Package identity and two homes |

## License

[MIT](../../LICENSE)
