<h1 align="center">xiaotaozi-dsh</h1>

<p align="center">
  <a href="plugins/providers"><img src="plugins/providers/docs/ip-3d.jpg" width="72" height="72" alt="dsh-providers"></a>
  <a href="plugins/im"><img src="plugins/im/docs/ip-3d.jpg" width="72" height="72" alt="dsh-im"></a>
  <a href="plugins/wecom-office"><img src="plugins/wecom-office/docs/ip-3d.jpg" width="72" height="72" alt="dsh-wecom-office"></a>
  <a href="plugins/xtz-ui"><img src="plugins/xtz-ui/docs/ip-3d.jpg" width="72" height="72" alt="dsh-xtz-ui"></a>
  <a href="plugins/sidebar"><img src="plugins/sidebar/docs/ip-3d.jpg" width="72" height="72" alt="dsh-sidebar"></a>
  <a href="plugins/market"><img src="plugins/market/docs/ip-3d.jpg" width="72" height="72" alt="dsh-market"></a>
</p>

<p align="center"><b>Xiaotaozi DSH: the xtz CLI as the user product, plus a shared DeepSeek Harness plugin layer.</b></p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh.md">中文</a> ·
  <a href="docs/conventions.md">Conventions</a> ·
  <a href="docs/workflow.md">Workflow</a> ·
  <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a>
</p>

<p align="center">
  <a href="https://github.com/kedoupi/xiaotaozi-dsh/stargazers"><img src="https://img.shields.io/github/stars/kedoupi/xiaotaozi-dsh?style=flat-square" alt="GitHub stars"></a>
  <a href="https://github.com/kedoupi/xiaotaozi-dsh/issues"><img src="https://img.shields.io/github/issues/kedoupi/xiaotaozi-dsh?style=flat-square" alt="GitHub issues"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/topic-dsh--plugin-0ea5e9?style=flat-square" alt="dsh-plugin"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22.19-43853d?style=flat-square" alt="Node.js"></a>
  <img src="https://img.shields.io/badge/dsh-0.1.2--rc.1-4176e6?style=flat-square" alt="DeepSeek Harness 0.1.2-rc.1">
</p>

Xiaotaozi DSH is a product bundle on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): the `xtz` command in [`apps/cli/`](apps/cli/) is what users install, and `plugins/` is the capability layer it seeds. Something broken, or a plugin missing? [Open an issue](https://github.com/kedoupi/xiaotaozi-dsh/issues).

## Quick start

Requires Node.js `^22.19.0 || >=24.0.0` on `PATH`:

```bash
npm install -g xiaotaozi-dsh-cli
xtz start
```

The first `xtz start` prepares the official web profile and seeds every first-party plugin under `plugins/`, then serves the UI in your browser. Prefer one command? The install script (`curl -fsSL https://raw.githubusercontent.com/kedoupi/xiaotaozi-dsh/main/apps/cli/scripts/install.sh | sh`) and `bun add -g xiaotaozi-dsh-cli` install the same CLI; `xtz` still runs on Node.

Open commands: help/version, `start`/`web`, `stop`, `restart`, `open`, `status`, `config path`, `doctor`. Disabled by design: `init`, `plugin`, `run`/`ask`, `config dump`/`defaults`, `update`. `xtz` only manages a process it started and never steals port 3080. Full command and safety contract: [`apps/cli/README.md`](apps/cli/README.md). The CLI pins DeepSeek Harness `@deepseek-ai/dsh@0.1.2-rc.1`; other DSH versions are not treated as compatible.

## Plugin Center

Open **Plugin Center** from the left-rail control under **New Session**. It occupies the conversation area;
the sidebar and right workbench remain available. **Installed** is the default,
with Xiaotaozi, Side workbench, Models and IM bots as built-in capabilities.
**Discover plugins** uses the curated catalog. External top-level plugins appear
under Installed and can be removed after confirmation. Removing a package does
not promise to delete its credentials, sessions or saved data.

First-run welcome confirm opens **Plugin Center → Installed → Models**. Archive also opens from the session ⋯ menu. Runtime controls live under **Settings → Advanced**. The technical Loader
inventory is not a user settings page; use `xtz doctor` for diagnosis.

## What you get

- **Models** — official subscription login and API keys on one page; chat lists only the models you checked.
- **IM bots** — nine chat channels (Feishu, WeChat, Slack, and more) plus an experimental AI Office connector, embedded in Plugin Center.
- **WeCom office** — calendar, docs, meetings, contacts, sheets, todos, and disk through the official `wecom-cli`.
- **Xiaotaozi chrome** — brand UI and the welcome notice stay on; switches cover archive, git graph, and announce-to-agent.
- **Side workbench** — files, editor, Git, and terminal in a right-hand panel.
- **Plugin Center** — built-in configuration, installed plugins, and curated discovery with one-click install.

## See Xiaotaozi DSH

The welcome overlay greets users the first time the web app opens.

![Xiaotaozi DSH welcome dialog](plugins/xtz-ui/docs/welcome.webp)

**Plugin Center → Installed → Xiaotaozi** holds archive, Git graph, and announce-to-agent switches.

![Xiaotaozi feature switches in Plugin Center](plugins/xtz-ui/docs/xiaotaozi-settings.webp)

The Git graph identifies the current commit, branch references, and merge lanes without replacing the Host Git workflow.

![Xiaotaozi Git graph](plugins/xtz-ui/docs/git-graph.webp)

The right-hand workbench keeps files beside the composer; the Git graph chip sits on the session.

![Sidebar files panel beside the composer](plugins/sidebar/docs/workbench.webp)

**Plugin Center → Installed → Models** shows connected vendors, optional smart routing, and the models chat will offer.

![Models overview and model selection](plugins/providers/docs/models-overview.webp)

Add provider lists every vendor a user can still sign in to or key in.

![Add provider catalog](plugins/providers/docs/add-provider.webp)

**Plugin Center → Installed → IM bots** lists chat channels; QR bind is the default on WeChat.

![IM bots in Plugin Center: WeChat selected](plugins/im/docs/channels-overview.webp)

Telegram manual setup asks for a Bot Token; credentials stay in the Host credential store, not the client bundle.

![Manual bot setup: paste a Bot Token](plugins/im/docs/add-bot.webp)

**Plugin Center → Discover plugins** lists curated third-party plugins with search and tags.

![Discover plugins with search, tags, and plugin cards](plugins/market/docs/catalog.webp)

The plugin detail page shows version, source, and the exact install specification.

![Plugin detail with version, source, and install specification](plugins/market/docs/plugin-detail.webp)

## Plugins

One installable package per job; every first-party plugin is seeded on the first `xtz start`. Each plugin also builds standalone from its `github:kedoupi/xiaotaozi-dsh#path:plugins/<slug>` Git path.

| Package | Occupies | What it does | Git path install |
| :-- | :-- | :-- | :-- |
| [`dsh-providers`](plugins/providers) | Plugin Center → Installed → **Models** | Vendor sign-in, API keys, model selection, and optional smart routing (no online learning, reasoning-effort routing, or durable router audit). [EN](plugins/providers/README.md) · [中文](plugins/providers/README.zh.md) | `github:kedoupi/xiaotaozi-dsh#path:plugins/providers` |
| [`dsh-im`](plugins/im) | Plugin Center → Installed → **IM bots** | Nine chat channels plus an experimental AI Office connector. [EN](plugins/im/README.md) · [中文](plugins/im/README.zh.md) | `github:kedoupi/xiaotaozi-dsh#path:plugins/im` |
| [`dsh-wecom-office`](plugins/wecom-office) | Plugin Center → Installed → **IM bots** → WeCom robot card | WeCom calendar, docs, meetings, contacts, sheets, todos, and disk via `wecom-cli`. [EN](plugins/wecom-office/README.md) · [中文](plugins/wecom-office/README.zh.md) | `github:kedoupi/xiaotaozi-dsh#path:plugins/wecom-office` |
| [`dsh-xtz-ui`](plugins/xtz-ui) | Plugin Center → Installed → **Xiaotaozi**; Settings → Advanced | Brand chrome, archive, git graph, and feature toggles. [EN](plugins/xtz-ui/README.md) · [中文](plugins/xtz-ui/README.zh.md) | `github:kedoupi/xiaotaozi-dsh#path:plugins/xtz-ui` |
| [`dsh-sidebar`](plugins/sidebar) | Plugin Center → Installed → **Side workbench** | Right-hand files / editor / Git / terminal panel. [EN](plugins/sidebar/README.md) · [中文](plugins/sidebar/README.zh.md) | `github:kedoupi/xiaotaozi-dsh#path:plugins/sidebar` |
| [`dsh-market`](plugins/market) | **Plugin Center** | Installed capabilities and **Discover plugins**; click **Install** to add a third-party plugin. [EN](plugins/market/README.md) · [中文](plugins/market/README.zh.md) | `github:kedoupi/xiaotaozi-dsh#path:plugins/market` |

## Third-party Market

**Plugin Center → Discover plugins** installs third-party plugins from their upstream Git/npm sources; this repo only keeps the catalog rows in `plugins/market` (`MARKET_PLUGINS`) and never vendors those repos. Current entries: [Agent Teams](https://github.com/NanmiCoder/dsh-agent-teams), [Session Context](https://github.com/bowenliang123/dsh-context), and [OpenContext](https://github.com/melandlabs/opencontext).

## Official vs sandbox

Two Harness homes, never mixed:

| | Official (users) | Sandbox (plugin development) |
| :-- | :-- | :-- |
| Home | `~/.dsh` | `<repo>/.dsh-home` (gitignored) |
| Command | `xtz start` | `pnpm dev` |
| Port | **3080** | **3081** |
| Plugins | Seeded by first `xtz start`; extras via `dsh plugin --profile web add` | `link:` from this workspace |

`xtz` and official installs never touch the sandbox; sandbox tooling never touches `~/.dsh`.

## Learn more

- Contributor entry: [CONTRIBUTING.md](CONTRIBUTING.md); hard rules for agents: [AGENTS.md](AGENTS.md)
- Spec: [docs/conventions.md](docs/conventions.md); procedures: [docs/workflow.md](docs/workflow.md); doc map: [docs/README.md](docs/README.md)
- Product snapshots: [CHANGELOG.md](CHANGELOG.md); pinned versions: [versions.json](versions.json)
- CLI contract and source: [`apps/cli/`](apps/cli/)

## License

[MIT](LICENSE)
