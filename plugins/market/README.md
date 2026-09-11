<p align="right"><strong>English</strong> · <a href="./README.zh.md">中文</a></p>

<h1 align="center">dsh-market</h1>

<p align="center">
  <img src="docs/ip-3d.jpg" width="160" height="160" alt="dsh-market icon">
</p>

<p align="center"><b>Xiaotaozi DSH Plugin Center: built-in configuration, installed plugins, and curated discovery</b></p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh.md">中文</a> ·
  <a href="https://github.com/kedoupi/xiaotaozi-dsh">xiaotaozi-dsh</a>
</p>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/topic-dsh--plugin-0ea5e9?style=flat-square" alt="dsh-plugin"></a>
</p>

Part of the [`xiaotaozi-dsh`](https://github.com/kedoupi/xiaotaozi-dsh) monorepo. Do not `dsh plugin add` the repository root.

## What it unlocks

- One **Plugin Center** left-rail entry under **New Session**, taking over the conversation area.
- A curated catalog of third-party plugins with search, tag filters, and per-plugin details.
- **Plugin Center → Installed** lists built-in capabilities and third-party top-level dependencies; **Discover plugins** installs catalog entries into the current profile.

## Plugin Center

Open **Plugin Center** from the left-rail control under **New Session**. It occupies the conversation area;
the sidebar and right workbench remain available. **Installed** is the default,
with Xiaotaozi, Side workbench, Models and IM bots as built-in capabilities.
**Discover plugins** uses the curated catalog. External top-level plugins appear
under Installed and can be removed after confirmation. Removing a package does
not promise to delete its credentials, sessions or saved data.

Runtime controls live under **Settings → Advanced**. The technical Loader
inventory is not a user settings page; use `xtz doctor` for diagnosis.

Use the heading's close button or Escape to return to the conversation. Details use an in-area **Back** action; search, filters and list position are retained. A nested confirmation handles Escape first; it never confirms removal.

## See it

![Discover plugins with search, tags, and plugin cards](docs/catalog.webp)

![Plugin detail with version, source, and install specification](docs/plugin-detail.webp)

## Catalog and details

The catalog is `MARKET_PLUGINS` — three curated rows today:

| Plugin | What it is |
| :-- | :-- |
| Agent Teams | A captain plus resumable teammates for splitting hard work (NanmiCoder) |
| session Context (会话上下文) | Composer, history, and events; `/context` when you need it (bowenliang123) |
| OpenContext | Remembers what happened over time and brings it back in chat (melandlabs) |

Search matches name, summary, and tags; tag chips filter the grid. **View details** opens a detail view with the summary, version, source, and the exact install specification.

First-party packages under `plugins/` are seeded on first `xtz start`. Installed presents four built-in capabilities, not a package inventory; they cannot be stopped or removed here.

## Installation state

A card shows **Installed** when the package is already a dependency of the current profile's `package.json`; otherwise it shows **Install**. The state is profile-specific: installing into the `web` profile does not mark the plugin installed in another profile.

Clicking **Install** runs `dsh plugin --profile web add` with the exact pinned DSH runtime that booted the current Host, against the current `DSH_HOME` (official `~/.dsh` or sandbox `.dsh-home`). A PATH `dsh` is never used, and the market never installs from `#path:externals/…`.

## Sources and boundaries

| Field | Default | Meaning |
| :-- | :-- | :-- |
| `indexUrl` | `https://s.xiaotaozi.cc/dsh/packs/market.json` | Configured official index URL / source identity; not fetched here |
| `officialLabel` | `小桃子市场` | Display name of the official source |
| `allowThirdPartySources` | `true` | Reserved switch; remote source catalogs are not implemented, so adding them still fails closed |

Historical source records remain in `$DSH_HOME/plugins/market/sources.json`; Plugin Center has no source-management UI. New source records are rejected with an explicit “not supported” response until remote fetch, signature, and cache contracts exist.

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
