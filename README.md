<h1 align="center">xiaotaozi-dsh</h1>

<p align="center">
  <a href="plugins/providers"><img src="plugins/providers/docs/ip.jpg" width="72" height="72" alt="dsh-providers"></a>
  <a href="plugins/memory"><img src="plugins/memory/docs/ip.jpg" width="72" height="72" alt="dsh-memory"></a>
  <a href="plugins/im"><img src="plugins/im/docs/ip.jpg" width="72" height="72" alt="dsh-im"></a>
  <a href="plugins/hello"><img src="plugins/hello/docs/ip.jpg" width="72" height="72" alt="dsh-hello"></a>
  <a href="plugins/sidebar"><img src="plugins/sidebar/docs/ip.jpg" width="72" height="72" alt="dsh-sidebar"></a>
  <a href="plugins/market"><img src="plugins/market/docs/ip.jpg" width="72" height="72" alt="dsh-market"></a>
  <a href="plugins/agent-teams"><img src="plugins/agent-teams/docs/ip.jpg" width="72" height="72" alt="dsh-agent-teams"></a>
  <a href="plugins/context"><img src="plugins/context/docs/ip.jpg" width="72" height="72" alt="dsh-context"></a>
</p>

<p align="center"><b>Xiaotaozi DSH: Desktop + xtz CLI as two products over one shared DeepSeek Harness plugin layer.</b></p>

<p align="center">
  <b>dsh-providers</b> · <b>dsh-memory</b> · <b>dsh-im</b> · <b>dsh-wecom-office</b> · <b>dsh-hello</b> · <b>dsh-sidebar</b> · <b>dsh-market</b> · <b>dsh-agent-teams</b> · <b>dsh-context</b>
</p>

<p align="center">
  Settings → <b>Models</b> · <b>Xiaotaozi</b> · <b>Memory</b> · Sidebar → <b>IM bots</b>
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

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) loads plugins from Git or npm. This repo is **xiaotaozi-dsh**: its two main products are the Mac-only client in [`apps/desktop/`](apps/desktop/) and the `xtz` command in [`apps/cli/`](apps/cli/); `plugins/` is their shared capability layer. The workspace root is not a plugin — do not `dsh plugin add` it.

Something broken, or a plugin missing? [Open an issue](https://github.com/kedoupi/xiaotaozi-dsh/issues).

## Features

- **Two entry points, one official environment.** Users use Desktop; people comfortable with terminals and configuration also use `xtz`. The CLI currently inspects the Desktop-owned `~/.dsh` / 3080 environment read-only; lifecycle and task commands wait for shared safety primitives. Dual install does not change plugin ownership.
- **One installable package per job.** Models, memory, IM bots, and the Xiaotaozi workbench ship separately. Git install is always `github:kedoupi/xiaotaozi-dsh#path:plugins/<slug>`.
- **Chinese Web UI, English docs by default.** User-facing copy in Xiaotaozi plugins is Chinese. Public README is English; Chinese is `README.zh.md`.
- **Two homes.** Test stays on test; official stays on official. Plugin debug and `pnpm tauri dev` use `.dsh-home` (`pnpm dev`, 3081). The installed 小桃子DSH.app uses `~/.dsh` (3080). Do not mix them.
- **Host-first layout.** Default `pnpm new` is host-only. Mixed plugins add `src/client` only when there is a settings page, slot, or theme.
- **Git path install builds on the user's machine.** Each plugin keeps `prepare` / `tsdown.config.ts` inside the package so `github:…#path:plugins/<slug>` can compile without the rest of the workspace.

## `xtz` CLI

The first `xtz` release is a read-only safety foundation. Its runtime is pinned to exactly Node.js `22.19.0` and DSH `0.1.1-rc.2`. Install with npm, bun, or the script (installers only; `xtz` still runs on Node):

```bash
curl -fsSL https://raw.githubusercontent.com/kedoupi/xiaotaozi-dsh/main/apps/cli/scripts/install.sh | sh
npm install -g xiaotaozi-dsh-cli
bun add -g xiaotaozi-dsh-cli
xtz --help
xtz version
xtz status
xtz config path
xtz plugin list
xtz doctor
```

`start`/`web`, `open`, `run`/`ask`, `config dump`/`defaults`, `stop`, and `update` are disabled until Desktop and CLI share a trusted cross-process supervisor, authenticated instance ownership, and a locked profile transaction boundary. The existing v1 endpoint proves product-compatible health only; it is not authority for a CLI mutation. The CLI therefore does not yet promise Desktop/Web headless capability parity. See [`apps/cli/README.md`](apps/cli/README.md) for the full command and safety contract.

## Plugins

| | Package | Occupies | What it does |
| :-- | :-- | :-- | :-- |
| <img src="plugins/providers/docs/ip.jpg" width="48" height="48" alt=""> | [`dsh-providers`](plugins/providers) | Settings → **Models** | Official membership login and API keys on one page; chat only lists the models you checked. [EN](plugins/providers/README.md) · [中文](plugins/providers/README.zh.md) |
| <img src="plugins/memory/docs/ip.jpg" width="48" height="48" alt=""> | [`dsh-memory`](plugins/memory) | Settings → **Memory** | Noema long-term recall, graph search, remember, and import from other coding tools. [EN](plugins/memory/README.md) · [中文](plugins/memory/README.zh.md) |
| <img src="plugins/im/docs/ip.jpg" width="48" height="48" alt=""> | [`dsh-im`](plugins/im) | Sidebar below New Session → **IM bots** | Nine chat channels plus an experimental AI Office connector. [EN](plugins/im/README.md) · [中文](plugins/im/README.zh.md) |
| | [`dsh-wecom-office`](plugins/wecom-office) | Settings → **企业微信办公** | WeCom calendar, docs, sheets, and meetings via `wecom-cli`. Chat stays in `dsh-im`. [EN](plugins/wecom-office/README.md) · [中文](plugins/wecom-office/README.zh.md) |
| <img src="plugins/hello/docs/ip.jpg" width="48" height="48" alt=""> | [`dsh-hello`](plugins/hello) | Settings → **Xiaotaozi** | Brand chrome, archive, task board, git graph, and feature toggles. [EN](plugins/hello/README.md) · [中文](plugins/hello/README.zh.md) |
| <img src="plugins/sidebar/docs/ip.jpg" width="48" height="48" alt=""> | [`dsh-sidebar`](plugins/sidebar) | Settings → **Side card** | Right-hand files / editor / Git / terminal. [EN](plugins/sidebar/README.md) · [中文](plugins/sidebar/README.zh.md) |
| <img src="plugins/market/docs/ip.jpg" width="48" height="48" alt=""> | [`dsh-market`](plugins/market) | Sidebar → **Market** (below New Session) | Browse plugins and workflow packs, manage sources, queue installs for the desktop shell. [EN](plugins/market/README.md) · [中文](plugins/market/README.zh.md) |
| <img src="plugins/agent-teams/docs/ip.jpg" width="48" height="48" alt=""> | [`dsh-agent-teams`](plugins/agent-teams) | Conversation + activity panel | Named captain (default 张老板) and durable members. Fork of NanmiCoder/dsh-agent-teams. [EN](plugins/agent-teams/README.md) · [中文](plugins/agent-teams/README.zh.md) |
| <img src="plugins/context/docs/ip.jpg" width="48" height="48" alt=""> | [`dsh-context`](plugins/context) | Conversation **Context** tab | Composition, history, events, `/context`. Fork of bowenliang123/dsh-context. [EN](plugins/context/README.md) · [中文](plugins/context/README.zh.md) |

## Related (git submodules)

Read-only upstream pins. We fork into `plugins/` and install **only** the fork. Do not add a submodule for a project we will not fork and install. Do not `link-plugin` or `dsh plugin add` anything under `externals/`. Clone with `--recurse-submodules`, or run `git submodule update --init`. Spec: [docs/conventions.md](docs/conventions.md) § Externals.

When the author updates: `git submodule update --remote externals/<name>`, diff against `plugins/<slug>/src`, port into the fork. Never `#path:externals/…`.

| Checkout | Upstream | Our fork (the thing to install) |
| :-- | :-- | :-- |
| [`externals/dsh-agent-teams`](externals/dsh-agent-teams) | [NanmiCoder/dsh-agent-teams](https://github.com/NanmiCoder/dsh-agent-teams) | [`plugins/agent-teams`](plugins/agent-teams) (`dsh-agent-teams`) |
| [`externals/dsh-context`](externals/dsh-context) | [bowenliang123/dsh-context](https://github.com/bowenliang123/dsh-context) | [`plugins/context`](plugins/context) (`dsh-context`) |


## Install

Pick a package. Do not add the repository root.

**Choose an install mode first.** The Git path commands below are for a Node/developer sandbox (`.dsh-home`, port 3081). Do not use GitHub, npm, or `link:` installs in the official `~/.dsh` / 3080 desktop line; the desktop app uses bundled plugins and verified signed packs.

**Step 1 — add one plugin to the sandbox `web` profile.**

```bash
dsh plugin --profile web add github:kedoupi/xiaotaozi-dsh#path:plugins/providers
dsh web
```

**Step 2 — open the page or entry that plugin occupies.** Providers: **Settings → Models**. Memory: **Settings → Memory**. Hello: **Settings → Xiaotaozi**. IM: sidebar, below **New Session** → **IM bots**. WeCom office: **Settings → 企业微信办公**. Market: sidebar, below **New Session** → **Market**. Agent teams: conversation + activity panel. Context: session **Context** tab or `/context`.

Every plugin uses the same Git path shape:

```text
github:kedoupi/xiaotaozi-dsh#path:plugins/<slug>
```

| Slug | Install path |
| :-- | :-- |
| `providers` | `github:kedoupi/xiaotaozi-dsh#path:plugins/providers` |
| `memory` | `github:kedoupi/xiaotaozi-dsh#path:plugins/memory` |
| `im` | `github:kedoupi/xiaotaozi-dsh#path:plugins/im` |
| `wecom-office` | `github:kedoupi/xiaotaozi-dsh#path:plugins/wecom-office` |
| `hello` | `github:kedoupi/xiaotaozi-dsh#path:plugins/hello` |
| `market` | `github:kedoupi/xiaotaozi-dsh#path:plugins/market` |
| `agent-teams` | `github:kedoupi/xiaotaozi-dsh#path:plugins/agent-teams` |
| `context` | `github:kedoupi/xiaotaozi-dsh#path:plugins/context` |

Public discovery uses the GitHub topic [`dsh-plugin`](https://github.com/topics/dsh-plugin). After source changes: rebuild that package and restart a running `dsh`.

## Usage

Once a plugin is installed, use it from the corresponding page (Settings for models / memory / Xiaotaozi, the sidebar below New Session for IM, or chat for memory tools). There is no extra CLI after `dsh plugin add`.

| You want to… | Install | Then |
| :-- | :-- | :-- |
| Sign in to Codex / Claude / Grok / Qwen / Kimi, or store API keys | `dsh-providers` | Settings → **Models** |
| Keep notes the model can recall next session | `dsh-memory` | Chat (“remember that…”) or Settings → **Memory** |
| Talk to the local Harness from Feishu, WeChat, Slack, … | `dsh-im` | Sidebar below **New Session** → **IM bots** |
| Let the model use WeCom calendars, docs, and meetings | `dsh-wecom-office` | Settings → **企业微信办公**; `wecom-cli` on `PATH` |
| Browse plugins and workflow packs | `dsh-market` | Sidebar below **New Session** → **Market**; browse/search/filter, then queue install or remove |
| Turn Xiaotaozi chrome features on or off | `dsh-hello` | Settings → **Xiaotaozi** |
| Use the right-hand files / Git / terminal panel | `dsh-sidebar` | Settings → **Side card** |
| Run a multi-agent team as 张老板 | `dsh-agent-teams` | Chat, or `/agent-teams <goal>` |
| Inspect what is in the model window | `dsh-context` | Session **Context** tab, or `/context` |

## Screenshots

Welcome overlay when the Web app opens. OK dismisses it.

![Xiaotaozi DSH welcome dialog](plugins/hello/docs/welcome.png)

Settings → Models: connected vendors on the left, sign-in or API key on the right.

![Settings → Models](plugins/providers/docs/models.jpg)

Vendors that are not connected yet live behind **Add provider**.

![Add provider](plugins/providers/docs/add-provider.jpg)

Sidebar below New Session → IM bots: scan a QR, paste an App Manifest, or enter bot credentials.

![Sidebar → IM bots](plugins/im/docs/imbot.png)

## Layout

```text
plugins/<slug>/     installable plugin, package name dsh-<slug>
apps/desktop/       小桃子DSH Tauri client (not a pnpm workspace member)
apps/cli/           xtz CLI (standalone publishable pnpm workspace)
externals/          git submodules of upstream plugins (not in the pnpm workspace)
templates/          host / mixed skeletons for `pnpm new`
scripts/            new / link-plugin / sandbox / manifest / path-install / doctor
docs/               conventions + workflow
apps/website/       standalone VitePress official site workspace
.dsh-home/          gitignored sandbox Harness home (port 3081)
```

The workspace root must not declare `dsh.bundle` or `dsh.profile`.
Pinned dsh RC, Node, Python, pnpm, desktop app, and CLI versions have one machine-readable source: [`versions.json`](versions.json). Keep normal package metadata literal; `pnpm check` rejects drift instead of trying to make `package.json` evaluate JSON.

| | Official / Desktop user | Sandbox |
| :-- | :-- | :-- |
| Home | `~/.dsh` | `<repo>/.dsh-home` (gitignored) |
| Command | 小桃子DSH.app or official `dsh web`; `xtz` is read-only in the first release | `pnpm dev` |
| Port | **3080** | **3081** |
| Plugins | packed tarballs on first launch | `link:` into this workspace |

| Job | Home |
| :-- | :-- |
| Change plugin source, settings UI, `link-plugin`, debug `pnpm tauri dev` | Sandbox **3081** |
| Pack apply, notarization, installed 小桃子DSH.app | Official `~/.dsh` **3080** |
| Shipped `.dmg` | Official `~/.dsh` **3080** |

`pnpm tauri dev` is debug-only (sandbox **3081**). Release never probes 3081. Do not verify `link:` checkouts inside the installed 小桃子DSH.app. `link-plugin` and `pnpm dev` set `DSH_HOME` to `.dsh-home`. Never link workspace plugins into `~/.dsh`. `pnpm check-home` (`node scripts/doctor.mjs`) only diagnoses and lists unsafe links; it never edits a profile or fixes anything automatically.

## Develop

Conventions: [docs/conventions.md](docs/conventions.md). Steps: [docs/workflow.md](docs/workflow.md). Hard rules: [AGENTS.md](AGENTS.md). With an agent, use `/dsh-plugin`.

Requires Node.js `>= 22.19` and the global CLI `@deepseek-ai/dsh@0.1.1-rc.2` (`@next`). First clone:

```bash
git clone --recurse-submodules https://github.com/kedoupi/xiaotaozi-dsh.git
cd xiaotaozi-dsh
pnpm install
```

Install dependencies before any build or check after cloning.

| Gate | What it guarantees |
| :-- | :-- |
| `pnpm check` | Version/docs/manifest policy, type checks, plugin tests, and script tests; it does not prove generated `lib/` exists |
| `pnpm check:build` | Builds every plugin, then requires and inspects generated `lib/` for Git path-install safety |
| `pnpm check:path` | Installs each plugin from its isolated Git `#path:` shape and verifies its self-contained build |
| `pnpm check:desktop` | Desktop script tests, frontend build, Rust format/lint/tests/check; it does not publish or create a release installer |
| `pnpm check:cli` | Independently installs, typechecks, builds, and tests `apps/cli`; it does not start the official service |

```bash
pnpm new greet                 # or: pnpm new sidebar --kind mixed
# replace the greet sample, then:
pnpm --filter dsh-greet test
pnpm --filter dsh-greet build
node scripts/link-plugin.mjs --profile dsh-dev greet
pnpm check-home   # daily ~/.dsh must stay unlinked
```

For Web UI, link into the sandbox `web` profile and run `pnpm dev` (port 3081). Do not `dsh web` against `~/.dsh` while iterating a plugin. `pnpm tauri dev` uses the same sandbox :3081.

```bash
node scripts/link-plugin.mjs --profile web <slug>
pnpm dev   # stop only a verified repo-owned :3081, then watch plugins (use -- --once to build once)
```

## Documentation

| Doc | Read it when |
| :-- | :-- |
| [Conventions](docs/conventions.md) | Package identity, two homes, what each check enforces |
| [Workflow](docs/workflow.md) | Create, install, simplify, commit |
| [AGENTS.md](AGENTS.md) | Hard rules for agents in this repo |
| [dsh-providers](plugins/providers/README.md) | Models settings page |
| [dsh-memory](plugins/memory/README.md) | Memory tools and settings |
| [dsh-im](plugins/im/README.md) | IM bots |
| [dsh-wecom-office](plugins/wecom-office/README.md) | WeCom office tools |
| [dsh-market](plugins/market/README.md) | Market catalog and queued install intents |
| [dsh-hello](plugins/hello/README.md) | Xiaotaozi chrome |
| [dsh-sidebar](plugins/sidebar/README.md) | Right-hand files / Git / terminal |
| [dsh-agent-teams](plugins/agent-teams/README.md) | Named captain and members |
| [dsh-context](plugins/context/README.md) | Context tab and `/context` |
| [externals/dsh-agent-teams](externals/dsh-agent-teams) | Upstream pin (do not install) |
| [externals/dsh-context](externals/dsh-context) | Upstream pin (do not install) |

## License

[MIT](LICENSE)
