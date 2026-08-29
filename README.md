<h1 align="center">xiaotaozi-dsh</h1>

<p align="center">
  <a href="plugins/providers"><img src="plugins/providers/docs/ip.jpg" width="72" height="72" alt="dsh-providers"></a>
  <a href="plugins/im"><img src="plugins/im/docs/ip.jpg" width="72" height="72" alt="dsh-im"></a>
  <a href="plugins/xtz-ui"><img src="plugins/xtz-ui/docs/ip.jpg" width="72" height="72" alt="dsh-xtz-ui"></a>
  <a href="plugins/sidebar"><img src="plugins/sidebar/docs/ip.jpg" width="72" height="72" alt="dsh-sidebar"></a>
  <a href="plugins/market"><img src="plugins/market/docs/ip.jpg" width="72" height="72" alt="dsh-market"></a>
</p>

<p align="center"><b>Xiaotaozi DSH: xtz CLI as the user product, plus a shared DeepSeek Harness plugin layer.</b></p>

<p align="center">
  <b>dsh-providers</b> · <b>dsh-im</b> · <b>dsh-wecom-office</b> · <b>dsh-xtz-ui</b> · <b>dsh-sidebar</b> · <b>dsh-market</b>
</p>

<p align="center">
  Settings → <b>Models</b> · <b>Xiaotaozi</b> · <b>企业微信办公</b> · Sidebar → <b>IM bots</b> · <b>Market</b>
</p>

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
  <img src="https://img.shields.io/badge/dsh-0.1.1--rc.2-4176e6?style=flat-square" alt="DeepSeek Harness 0.1.1-rc.2">
</p>

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) loads plugins from Git or npm. This repo is **xiaotaozi-dsh**: the user product is the `xtz` command in [`apps/cli/`](apps/cli/); `plugins/` is the capability layer. The workspace root is not a plugin — do not `dsh plugin add` it.

Something broken, or a plugin missing? [Open an issue](https://github.com/kedoupi/xiaotaozi-dsh/issues).

## Features

- **One user entry: `xtz`.** Install the CLI, run `xtz start`, and open official `dsh web` in a browser. First `xtz start` seeds the default plugins.
- **One installable package per job.** First-party plugins live under `plugins/` and are all seeded on first `xtz start`. Third-party plugins are rows in the market catalog; users install upstream Git/npm. Never vendor those repos here.
- **Chinese Web UI, English docs by default.** User-facing copy in Xiaotaozi plugins is Chinese. Public README is English; Chinese is `README.zh.md`.
- **Two homes.** Test stays on test; official stays on official. Plugin debug uses `.dsh-home` (`pnpm dev`, 3081). Users use `~/.dsh` (3080) via `xtz`. Do not mix them.
- **Host-first layout.** Default `pnpm new` is host-only. Mixed plugins add `src/client` only when there is a settings page, slot, or theme.
- **Git path install builds on the user's machine.** Each plugin keeps `prepare` / `tsdown.config.ts` inside the package so `github:…#path:plugins/<slug>` can compile without the rest of the workspace.

## `xtz` CLI

`xtz` is the user product. Its runtime is pinned to exactly Node.js `22.19.0` and DSH `0.1.1-rc.2`. Install with npm, bun, or the script (installers only; `xtz` still runs on Node):

```bash
curl -fsSL https://raw.githubusercontent.com/kedoupi/xiaotaozi-dsh/main/apps/cli/scripts/install.sh | sh
npm install -g xiaotaozi-dsh-cli
bun add -g xiaotaozi-dsh-cli
xtz --help
xtz start
xtz doctor
dsh plugin --profile web add github:kedoupi/xiaotaozi-dsh#path:plugins/market
```

Open: help/version, `start`/`web`, `stop`, `restart`, `open`, `status`, `config path`, `doctor`. `init`, `plugin`, `run`/`ask`, `config dump`/`defaults`, and `update` stay disabled. `start`/`stop` only manage a process `xtz` started; an occupied 3080 that `xtz` did not start is refused. See [`apps/cli/README.md`](apps/cli/README.md) for the full command and safety contract.

## Plugins

| | Package | Occupies | What it does |
| :-- | :-- | :-- | :-- |
| <img src="plugins/providers/docs/ip.jpg" width="48" height="48" alt=""> | [`dsh-providers`](plugins/providers) | Settings → **Models** | Official membership login and API keys on one page; chat only lists the models you checked. [EN](plugins/providers/README.md) · [中文](plugins/providers/README.zh.md) |
| <img src="plugins/im/docs/ip.jpg" width="48" height="48" alt=""> | [`dsh-im`](plugins/im) | Sidebar below New Session → **IM bots** | Nine chat channels plus an experimental AI Office connector. WeCom **chat** lives here; WeCom **office** is `dsh-wecom-office`. [EN](plugins/im/README.md) · [中文](plugins/im/README.zh.md) |
| | [`dsh-wecom-office`](plugins/wecom-office) | Settings → **企业微信办公** | WeCom calendar, docs, meetings, contacts, sheets, todos, and disk via official `wecom-cli`. Chat stays in `dsh-im`. Seeded with the other first-party plugins. [EN](plugins/wecom-office/README.md) · [中文](plugins/wecom-office/README.zh.md) |
| <img src="plugins/xtz-ui/docs/ip.jpg" width="48" height="48" alt=""> | [`dsh-xtz-ui`](plugins/xtz-ui) | Settings → **Xiaotaozi** | Brand chrome, archive, task board, git graph, and feature toggles. [EN](plugins/xtz-ui/README.md) · [中文](plugins/xtz-ui/README.zh.md) |
| <img src="plugins/sidebar/docs/ip.jpg" width="48" height="48" alt=""> | [`dsh-sidebar`](plugins/sidebar) | Settings → **Side card** | Right-hand files / editor / Git / terminal. [EN](plugins/sidebar/README.md) · [中文](plugins/sidebar/README.zh.md) |
| <img src="plugins/market/docs/ip.jpg" width="48" height="48" alt=""> | [`dsh-market`](plugins/market) | Sidebar → **Market** (below New Session) | Lists third-party plugins; **Installed** if this profile has them, otherwise click **Install**. [EN](plugins/market/README.md) · [中文](plugins/market/README.zh.md) |


## Third-party (market catalog)

Listed in `plugins/market` (`MARKET_PLUGINS`). Users click **Install** in the market, or run the spec below. Do not vendor those repos in this tree. Spec: [docs/conventions.md](docs/conventions.md) § Market catalog.

| Plugin | Upstream | Install spec |
| :-- | :-- | :-- |
| Agent Teams | [NanmiCoder/dsh-agent-teams](https://github.com/NanmiCoder/dsh-agent-teams) | `github:NanmiCoder/dsh-agent-teams` |
| Session Context | [bowenliang123/dsh-context](https://github.com/bowenliang123/dsh-context) | `github:bowenliang123/dsh-context` |
| OpenContext | [melandlabs/opencontext](https://github.com/melandlabs/opencontext) | `github:melandlabs/opencontext#path:plugins/dsh-opencontext` |


## Install

Pick a package. Do not add the repository root.

**Choose an install mode first.** The Git path commands below are for a Node/developer sandbox (`.dsh-home`, port 3081). Do not `link:` this workspace into official `~/.dsh` / 3080. Extra user installs go through `dsh plugin --profile web add`.

**Step 1 — add one plugin to the sandbox `web` profile.**

```bash
dsh plugin --profile web add github:kedoupi/xiaotaozi-dsh#path:plugins/providers
dsh web
```

**Step 2 — open the page or entry that plugin occupies.** Providers: **Settings → Models**. Xiaotaozi UI: **Settings → Xiaotaozi**. Sidebar: **Settings → Side card**. IM: sidebar, below **New Session** → **IM bots**. WeCom office: **Settings → 企业微信办公**. Market: sidebar, below **New Session** → **Market**.

Every plugin uses the same Git path shape:

```text
github:kedoupi/xiaotaozi-dsh#path:plugins/<slug>
```

| Slug | Install path |
| :-- | :-- |
| `providers` | `github:kedoupi/xiaotaozi-dsh#path:plugins/providers` |
| `im` | `github:kedoupi/xiaotaozi-dsh#path:plugins/im` |
| `wecom-office` | `github:kedoupi/xiaotaozi-dsh#path:plugins/wecom-office` |
| `xtz-ui` | `github:kedoupi/xiaotaozi-dsh#path:plugins/xtz-ui` |
| `sidebar` | `github:kedoupi/xiaotaozi-dsh#path:plugins/sidebar` |
| `market` | `github:kedoupi/xiaotaozi-dsh#path:plugins/market` |

Public discovery uses the GitHub topic [`dsh-plugin`](https://github.com/topics/dsh-plugin). After source changes: rebuild that package and restart a running `dsh`.

## Usage

Once a plugin is installed, use it from the corresponding page (Settings for models / Xiaotaozi / Side card / WeCom office, the sidebar below New Session for IM and Market, or chat for office tools). User entry is `xtz`; the Web UI is official `dsh web` in a browser.

| You want to… | Install | Then |
| :-- | :-- | :-- |
| Sign in to Codex / Claude / Grok / Qwen / Kimi, or store API keys | `dsh-providers` | Settings → **Models** |
| Talk to the local Harness from Feishu, WeChat, Slack, … | `dsh-im` | Sidebar below **New Session** → **IM bots** |
| Let the model use WeCom calendars, docs, and meetings | `dsh-wecom-office` | Settings → **企业微信办公**; `wecom-cli` on `PATH` |
| Browse third-party plugins | `dsh-market` | Sidebar below **New Session** → **Market**; click **Install** |
| Turn Xiaotaozi chrome features on or off | `dsh-xtz-ui` | Settings → **Xiaotaozi** |
| Use the right-hand files / Git / terminal panel | `dsh-sidebar` | Settings → **Side card** |
| Run a multi-agent team | third-party Agent Teams | Market, then `dsh plugin --profile web add github:NanmiCoder/dsh-agent-teams` |
| Inspect what is in the model window | third-party dsh-context | Market, then `dsh plugin --profile web add github:bowenliang123/dsh-context` |
| Long-term memory / recall | third-party OpenContext | Market, then `dsh plugin --profile web add github:melandlabs/opencontext#path:plugins/dsh-opencontext` |

## Screenshots

Welcome overlay when the Web app opens. OK dismisses it.

![Xiaotaozi DSH welcome dialog](plugins/xtz-ui/docs/welcome.png)

Settings → Models: connected vendors on the left, sign-in or API key on the right.

![Settings → Models](plugins/providers/docs/models.jpg)

Vendors that are not connected yet live behind **Add provider**.

![Add provider](plugins/providers/docs/add-provider.jpg)

Sidebar below New Session → IM bots: scan a QR, paste an App Manifest, or enter bot credentials.

![Sidebar → IM bots](plugins/im/docs/imbot.png)

## Layout

```text
plugins/<slug>/     installable first-party plugin, package name dsh-<slug>
apps/cli/           xtz CLI — the user product (standalone publishable pnpm workspace)
templates/          host / mixed skeletons for `pnpm new`
scripts/            new / link-plugin / sandbox / manifest / path-install / doctor
docs/               spec + procedure + documentation map
CONTRIBUTING.md     contributor inner loop and gates
apps/website/       standalone VitePress official site workspace
.dsh-home/          gitignored sandbox Harness home (port 3081)
```

The workspace root must not declare `dsh.bundle` or `dsh.profile`.
Pinned dsh RC, Node, Python, pnpm, and CLI versions have one machine-readable source: [`versions.json`](versions.json). Keep normal package metadata literal; `pnpm check` rejects drift instead of trying to make `package.json` evaluate JSON.

| | Official / user | Sandbox |
| :-- | :-- | :-- |
| Home | `~/.dsh` | `<repo>/.dsh-home` (gitignored) |
| Command | `xtz start` | `pnpm dev` |
| Port | **3080** | **3081** |
| Plugins | first `xtz start` (defaults); extra `dsh plugin --profile web` | `link:` into this workspace |

| Job | Home |
| :-- | :-- |
| Change plugin source, settings UI, `link-plugin` | Sandbox **3081** |
| User product (`xtz`) | Official `~/.dsh` **3080** |

`link-plugin` and `pnpm dev` set `DSH_HOME` to `.dsh-home`. Never link workspace plugins into `~/.dsh`. `pnpm check-home` (`node scripts/doctor.mjs`) only diagnoses and lists unsafe links; it never edits a profile or fixes anything automatically.

## Develop

Contributor entry: [CONTRIBUTING.md](CONTRIBUTING.md). Spec: [docs/conventions.md](docs/conventions.md). Steps: [docs/workflow.md](docs/workflow.md). Doc map: [docs/README.md](docs/README.md). Hard rules: [AGENTS.md](AGENTS.md). With an agent, use `/dsh-plugin`.

Requires Node.js `>= 22.19` and the global CLI `@deepseek-ai/dsh@0.1.1-rc.2` (`@next`). First clone:

```bash
git clone https://github.com/kedoupi/xiaotaozi-dsh.git
cd xiaotaozi-dsh
pnpm install
```

Install dependencies before any build or check after cloning.

| Gate | What it guarantees |
| :-- | :-- |
| `pnpm check` | Version/docs/manifest policy, type checks, plugin tests, and script tests; it does not prove generated `lib/` exists |
| `pnpm check:build` | Builds every plugin, then requires and inspects generated `lib/` for Git path-install safety |
| `pnpm check:path` | Installs each plugin from its isolated Git `#path:` shape and verifies its self-contained build |
| `pnpm check:cli` | Independently installs, typechecks, builds, and tests `apps/cli`; it does not start the official service |

```bash
pnpm new greet                 # or: pnpm new sidebar --kind mixed
# replace the greet sample, then:
pnpm --filter dsh-greet test
pnpm --filter dsh-greet build
node scripts/link-plugin.mjs --profile dsh-dev greet
pnpm check-home   # daily ~/.dsh must stay unlinked
```

For Web UI, link into the sandbox `web` profile and run `pnpm dev` (port 3081). Do not `dsh web` against `~/.dsh` while iterating a plugin.

```bash
node scripts/link-plugin.mjs --profile web <slug>
pnpm dev   # stop only a verified repo-owned :3081, then watch plugins (use -- --once to build once)
```

## Documentation

Which file to open: [docs/README.md](docs/README.md).

| Doc | Read it when |
| :-- | :-- |
| [Contributing](CONTRIBUTING.md) | Clone, inner loop, gates |
| [Conventions](docs/conventions.md) | Package identity, two homes, Git (`main` + tags), CLI contract, versions, what each check enforces |
| [Changelog](CHANGELOG.md) | Product snapshots (`vX.Y.Z`) |
| [Workflow](docs/workflow.md) | Create, install, simplify, commit, ship |
| [AGENTS.md](AGENTS.md) | Hard rules for agents in this repo |
| [dsh-providers](plugins/providers/README.md) | Models settings page |
| [dsh-im](plugins/im/README.md) | IM bots |
| [dsh-wecom-office](plugins/wecom-office/README.md) | WeCom office tools |
| [dsh-market](plugins/market/README.md) | Third-party catalog and install |
| [dsh-xtz-ui](plugins/xtz-ui/README.md) | Xiaotaozi chrome |
| [dsh-sidebar](plugins/sidebar/README.md) | Right-hand files / Git / terminal |

## License

[MIT](LICENSE)
