<h1 align="center">xiaotaozi-dsh</h1>

<p align="center"><b>Xiaotaozi DSH: DeepSeek Harness plugins and a Win/Mac desktop client. One plugin package per job.</b></p>

<p align="center">
  <b>dsh-providers</b> · <b>dsh-memory</b> · <b>dsh-im</b> · <b>dsh-hello</b> · <b>dsh-agent-teams</b> · <b>dsh-context</b>
</p>

<p align="center">
  Settings → <b>Models</b> · <b>Memory</b> · Plugins → <b>IM bots</b> · Xiaotaozi welcome
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

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) loads plugins from Git or npm. This repo is **xiaotaozi-dsh**: each directory under `plugins/` is its own npm package (`dsh-<slug>`). The Win/Mac client is [`apps/desktop/`](apps/desktop/) (Tauri; not a pnpm workspace member). The workspace root is not a plugin — do not `dsh plugin add` it.

Something broken, or a plugin missing? [Open an issue](https://github.com/kedoupi/xiaotaozi-dsh/issues).

## Features

- **One installable package per job.** Models, memory, IM bots, and the welcome dialog ship separately. Git install is always `github:kedoupi/xiaotaozi-dsh#path:plugins/<slug>`.
- **Chinese Web UI, English docs by default.** User-facing copy in Xiaotaozi plugins is Chinese. Public README is English; Chinese is `README.zh.md`.
- **Two homes.** The 小桃子DSH Tauri app and official `dsh web` share `~/.dsh` (port 3080). The installer bundles Node + dsh. Plugin debug uses `.dsh-home` (`pnpm dev`, 3081). Do not mix them.
- **Host-first layout.** Default `pnpm new` is host-only. Mixed plugins add `src/client` only when there is a settings page, slot, or theme.
- **Git path install builds on the user's machine.** Each plugin keeps `prepare` / `tsdown.config.ts` inside the package so `github:…#path:plugins/<slug>` can compile without the rest of the workspace.

## Plugins

| Package | Occupies | What it does |
| :-- | :-- | :-- |
| [`dsh-providers`](plugins/providers) | Settings → **Models** | Official membership login and API keys on one page; chat only lists the models you checked. [EN](plugins/providers/README.md) · [中文](plugins/providers/README.zh.md) |
| [`dsh-memory`](plugins/memory) | Settings → **Memory** | Noema long-term recall, graph search, remember, and import from other coding tools. [EN](plugins/memory/README.md) · [中文](plugins/memory/README.zh.md) |
| [`dsh-im`](plugins/im) | Settings → Plugins → **IM bots** | Nine chat channels plus an experimental AI Office connector. [EN](plugins/im/README.md) · [中文](plugins/im/README.zh.md) |
| [`dsh-hello`](plugins/hello) | Web overlay | Xiaotaozi DSH welcome dialog when the app opens. [EN](plugins/hello/README.md) · [中文](plugins/hello/README.zh.md) |
| [`dsh-agent-teams`](plugins/agent-teams) | Conversation + activity panel | Named captain (default 张老板) and durable members. Fork of NanmiCoder/dsh-agent-teams. [EN](plugins/agent-teams/README.md) · [中文](plugins/agent-teams/README.zh.md) |
| [`dsh-context`](plugins/context) | Conversation **Context** tab | Composition, history, events, `/context`. Fork of bowenliang123/dsh-context. [EN](plugins/context/README.md) · [中文](plugins/context/README.zh.md) |

## Related (git submodules)

Read-only upstream pins. We fork into `plugins/` and install **only** the fork. Do not add a submodule for a project we will not fork and install. Do not `link-plugin` or `dsh plugin add` anything under `externals/`. Clone with `--recurse-submodules`, or run `git submodule update --init`. Spec: [docs/conventions.md](docs/conventions.md) § Externals.

When the author updates: `git submodule update --remote externals/<name>`, diff against `plugins/<slug>/src`, port into the fork. Never `#path:externals/…`.

| Checkout | Upstream | Our fork (the thing to install) |
| :-- | :-- | :-- |
| [`externals/dsh-agent-teams`](externals/dsh-agent-teams) | [NanmiCoder/dsh-agent-teams](https://github.com/NanmiCoder/dsh-agent-teams) | [`plugins/agent-teams`](plugins/agent-teams) (`dsh-agent-teams`) |
| [`externals/dsh-context`](externals/dsh-context) | [bowenliang123/dsh-context](https://github.com/bowenliang123/dsh-context) | [`plugins/context`](plugins/context) (`dsh-context`) |


## Install

Pick a package. Do not add the repository root.

**Step 1 — add one plugin to the `web` profile.**

```bash
dsh plugin --profile web add github:kedoupi/xiaotaozi-dsh#path:plugins/providers
dsh web
```

**Step 2 — open the page that plugin occupies.** Providers: **Settings → Models**. Memory: **Settings → Memory**. IM: **Settings → Plugins → IM bots**. Hello appears when the Web app opens.

Every plugin uses the same Git path shape:

```text
github:kedoupi/xiaotaozi-dsh#path:plugins/<slug>
```

| Slug | Install path |
| :-- | :-- |
| `providers` | `github:kedoupi/xiaotaozi-dsh#path:plugins/providers` |
| `memory` | `github:kedoupi/xiaotaozi-dsh#path:plugins/memory` |
| `im` | `github:kedoupi/xiaotaozi-dsh#path:plugins/im` |
| `hello` | `github:kedoupi/xiaotaozi-dsh#path:plugins/hello` |
| `agent-teams` | `github:kedoupi/xiaotaozi-dsh#path:plugins/agent-teams` |
| `context` | `github:kedoupi/xiaotaozi-dsh#path:plugins/context` |

Public discovery uses the GitHub topic [`dsh-plugin`](https://github.com/topics/dsh-plugin). After source changes: rebuild that package and restart a running `dsh`.

## Usage

Once a plugin is installed, use it from the corresponding Settings page (or from chat, for memory tools). There is no extra CLI after `dsh plugin add`.

| You want to… | Install | Then |
| :-- | :-- | :-- |
| Sign in to Codex / Claude / Grok / Qwen / Kimi, or store API keys | `dsh-providers` | Settings → **Models** |
| Keep notes the model can recall next session | `dsh-memory` | Chat (“remember that…”) or Settings → **Memory** |
| Talk to the local Harness from Feishu, WeChat, Slack, … | `dsh-im` | Settings → Plugins → **IM bots** |
| Show a Xiaotaozi welcome when the Web app opens | `dsh-hello` | Restart `dsh web` |
| Run a multi-agent team as 张老板 | `dsh-agent-teams` | Chat, or `/agent-teams <goal>` |
| Inspect what is in the model window | `dsh-context` | Session **Context** tab, or `/context` |

## Screenshots

Welcome overlay when the Web app opens. OK dismisses it.

![Xiaotaozi DSH welcome dialog](plugins/hello/docs/welcome.png)

Settings → Models: connected vendors on the left, sign-in or API key on the right.

![Settings → Models](plugins/providers/docs/models.jpg)

Vendors that are not connected yet live behind **Add provider**.

![Add provider](plugins/providers/docs/add-provider.jpg)

Settings → Plugins → IM bots: scan a QR, paste an App Manifest, or enter bot credentials.

![Settings → Plugins → IM bots](plugins/im/docs/imbot.png)

## Layout

```text
plugins/<slug>/     installable plugin, package name dsh-<slug>
apps/desktop/       小桃子DSH Tauri client (not a pnpm workspace member)
externals/          git submodules of upstream plugins (not in the pnpm workspace)
templates/          host / mixed skeletons for `pnpm new`
scripts/            new / link-plugin / check-manifest / doctor / sandbox
docs/               conventions + workflow
.dsh-home/          gitignored sandbox Harness home (port 3081)
```

The workspace root must not declare `dsh.bundle` or `dsh.profile`.
Pinned dsh RC, Node, Python, pnpm, and desktop app versions have one machine-readable source: [`versions.json`](versions.json). Keep normal package metadata literal; `pnpm check` rejects drift instead of trying to make `package.json` evaluate JSON.

| | Official / 小白 desktop | Sandbox |
| :-- | :-- | :-- |
| Home | `~/.dsh` | `<repo>/.dsh-home` (gitignored) |
| Command | 小桃子DSH.app or `dsh web` | `pnpm dev` |
| Port | **3080** | **3081** |
| Plugins | packed tarballs on first launch | `link:` into this workspace |

`link-plugin` and `pnpm dev` set `DSH_HOME` to `.dsh-home`. Never link workspace plugins into `~/.dsh`. `pnpm check-home` (`node scripts/doctor.mjs`) only diagnoses and lists unsafe links; it never edits a profile or fixes anything automatically.

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

```bash
pnpm new greet                 # or: pnpm new sidebar --kind mixed
# replace the greet sample, then:
pnpm --filter dsh-greet test
pnpm --filter dsh-greet build
node scripts/link-plugin.mjs --profile dsh-dev greet
pnpm check-home   # daily ~/.dsh must stay unlinked
```

For Web UI, link into the sandbox `web` profile and run `pnpm dev` (port 3081). Do not `dsh web` against `~/.dsh` while iterating.

```bash
node scripts/link-plugin.mjs --profile web <slug>
pnpm dev
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
| [dsh-hello](plugins/hello/README.md) | Welcome dialog |
| [dsh-agent-teams](plugins/agent-teams/README.md) | Named captain and members |
| [dsh-context](plugins/context/README.md) | Context tab and `/context` |
| [externals/dsh-agent-teams](externals/dsh-agent-teams) | Upstream pin (do not install) |
| [externals/dsh-context](externals/dsh-context) | Upstream pin (do not install) |

## License

[MIT](LICENSE)
