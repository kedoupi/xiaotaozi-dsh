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

- One **Plugin Center** entry below **New Session**, taking over the conversation area.
- A curated catalog of third-party plugins with search, tag filters, and per-plugin details.
- **Plugin Center → Installed** lists built-in capabilities and third-party top-level dependencies; **Discover plugins** installs catalog entries into the current profile.

## Plugin Center

Open **Plugin Center** below **New Session**. It occupies the conversation area;
the sidebar and right workbench remain available. **Installed** is the default,
with Xiaotaozi, Side workbench, Models and IM bots as built-in capabilities.
**Discover plugins** uses the curated catalog. External top-level plugins appear
under Installed and can be removed after confirmation. Removing a package does
not promise to delete its credentials, sessions or saved data.

Runtime controls live under **Settings → Advanced**. The technical Loader
inventory is not a user settings page; use `xtz doctor` for diagnosis.

Use the heading's close button or Escape to return to the conversation. Details use an in-area **Back** action; search, filters and list position are retained. A nested confirmation handles Escape first; it never confirms removal.

## See it

**Pre-center examples:** these screenshots show the retired market layout, not Plugin Center. Replacement captures are pending rendered acceptance.

![Market catalog with search, tabs, and plugin cards](docs/catalog.webp)

![Plugin detail with version, source, and install specification](docs/plugin-detail.webp)

## Catalog and details

The catalog is `MARKET_PLUGINS` — three curated rows today:

| Plugin | What it is |
| :-- | :-- |
| Agent Teams | Multi-agent collaboration with a captain and resumable members (NanmiCoder) |
| session Context (会话上下文) | Composition bar, history, events, and `/context` (bowenliang123) |
| OpenContext | Temporal memory graph with automatic recall (melandlabs) |

Search matches name, summary, and tags; tag chips filter the grid. **View details** opens a detail view with the summary, catalog version, source, and install specification. Installed inventory does not borrow the catalog version: dependency requests alone cannot identify the resolved version.

### Compatibility checkpoint (2026-09-09, DSH 0.1.2-rc.1)

- **Context:** the catalog pins `dsh-context@0.46.0` and displays `0.46.0`, rather than resolving a moving npm tag. Its published entries, Apache-2.0 license and RC1 peer declarations were inspected as data only. This is a candidate, not verified installation, activation or functionality. Existing exact npm/Git identities still recognize profile aliases.
- **Agent Teams:** published `0.1.15` and `0.1.16-rc.1` both declare Client `inject: ["uiConversation", …]`, which this repository's current entry gate rejects. RC1 source does contain the `uiConversation` service; neither service presence nor the prerelease's RC1 peer declaration proves successful composition/activation. The gate remains unchanged while that compatibility question is unresolved. The catalog entry is retained, not certified usable.
- **OpenContext:** `0.3.2` declares older `^0.1.1-rc.2` Harness peers and floating memory-library dependencies. Its local backend includes SQLite/native and embedding prerequisites; an HTTP backend is optional, not a required new service or a workaround authorized here. Lexical fallback alone does not establish the advertised memory graph/search and automatic recall.

All three still require real install → activation → advertised features → refresh/restart evidence: Context composition/history/events and `/context`; Teams member dispatch/results/continuation; OpenContext disposable-fact capture and subsequent recall, including persistence after restart. Exact transitive versions, native scripts, storage/project scope, model/backend requirements and any account/service authorization must be reviewed before execution. Do not enable build scripts merely to clear an error. Isolation and an Installed badge are not these functionality checks.

First-party packages under `plugins/` are seeded on first `xtz start`. Installed presents four built-in capabilities, not a package inventory; they cannot be stopped or removed here.

## Installation state

A catalog card shows **Installed** only when the current profile has the dependency, its `dsh.profile.bundles` membership and inspected entry files. This does not prove runtime activation or advertised functionality. Incomplete installs show a partial state and remain available for inspected repair in Discover; Installed retains explicit removal by the actual package name. Missing verification is not success. State is specific to the current profile.

Failed or unverified operations retain their errors and current state. The market does not automatically remove a plugin to roll back: the pinned command reconciles the whole profile, so target-only rollback and data preservation cannot be guaranteed. An acknowledged operation is not completion; inspect and refresh before another mutation. Build denials and unresolved `allowBuilds` decisions remain unchanged; subprocess output never grants script trust or triggers an automatic build retry.

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
