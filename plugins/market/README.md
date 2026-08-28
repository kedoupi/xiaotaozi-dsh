<p align="right"><strong>English</strong> · <a href="./README.zh.md">中文</a></p>

<h1 align="center">dsh-market</h1>

<p align="center">
  <img src="docs/ip.jpg" width="160" height="160" alt="dsh-market icon">
</p>

<p align="center"><b>Xiaotaozi DSH market: third-party plugins from the catalog, install into this profile</b></p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh.md">中文</a> ·
  <a href="https://github.com/kedoupi/xiaotaozi-dsh">xiaotaozi-dsh</a>
</p>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/topic-dsh--plugin-0ea5e9?style=flat-square" alt="dsh-plugin"></a>
</p>

A first-class sidebar entry right below **New Session** opens a full-screen market overlay. The catalog is `MARKET_PLUGINS` (Agent Teams, session Context, OpenContext). First-party packages under `plugins/` are seeded on start and are not sold here.

Installed plugins show **Installed**. The rest show **Install**; a click runs `dsh plugin --profile web add` against the current `DSH_HOME` (official `~/.dsh` or sandbox `.dsh-home`). It never installs from `#path:externals/…`.

Part of the [`xiaotaozi-dsh`](https://github.com/kedoupi/xiaotaozi-dsh) monorepo. Do not `dsh plugin add` the repository root.

## Use it

Open the sidebar entry below **New Session**, browse the catalog, and click **Install** on anything not yet in this profile.

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
