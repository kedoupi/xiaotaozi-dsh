<h1 align="center">dsh-plugins</h1>

<p align="center"><b>Installable DeepSeek Harness plugins. One package per job, not one repo-wide bundle.</b></p>

<p align="center">
  <b>dsh-providers</b> · <b>dsh-memory</b> · <b>dsh-im</b> · <b>dsh-hello</b>
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
  <a href="https://github.com/kedoupi/dsh-plugins/stargazers"><img src="https://img.shields.io/github/stars/kedoupi/dsh-plugins?style=flat-square" alt="GitHub stars"></a>
  <a href="https://github.com/kedoupi/dsh-plugins/issues"><img src="https://img.shields.io/github/issues/kedoupi/dsh-plugins?style=flat-square" alt="GitHub issues"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/topic-dsh--plugin-0ea5e9?style=flat-square" alt="dsh-plugin"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22.19-43853d?style=flat-square" alt="Node.js"></a>
  <img src="https://img.shields.io/badge/dsh-0.1.1--rc.2-4176e6?style=flat-square" alt="DeepSeek Harness 0.1.1-rc.2">
</p>

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) loads plugins from Git or npm. This repo is a Xiaotaozi catalog: each directory under `plugins/` is its own npm package (`dsh-<slug>`). The workspace root is not a plugin — do not `dsh plugin add` it.

Something broken, or a plugin missing? [Open an issue](https://github.com/kedoupi/dsh-plugins/issues).

## Features

- **One installable package per job.** Models, memory, IM bots, and the welcome dialog ship separately. Git install is always `github:kedoupi/dsh-plugins#path:plugins/<slug>`.
- **Chinese Web UI, English docs by default.** User-facing copy in Xiaotaozi plugins is Chinese. Public README is English; Chinese is `README.zh.md`.
- **Isolated sandbox.** Daily Harness stays on `~/.dsh` (port 3080). This repo boots `.dsh-home` with `pnpm dev` (port 3081) so plugin work does not rewrite the daily profile.
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

## Related (git submodules)

Read-only upstream pins. We fork into `plugins/` and install **only** the fork. Do not add a submodule for a project we will not fork and install. Do not `link-plugin` or `dsh plugin add` anything under `externals/`. Clone with `--recurse-submodules`, or run `git submodule update --init`. Spec: [docs/conventions.md](docs/conventions.md) § Externals.

When the author updates: `git submodule update --remote externals/<name>`, diff against `plugins/<slug>/src`, port into the fork. Never `#path:externals/…`.

| Checkout | Upstream | Our fork (the thing to install) |
| :-- | :-- | :-- |
| [`externals/dsh-agent-teams`](externals/dsh-agent-teams) | [NanmiCoder/dsh-agent-teams](https://github.com/NanmiCoder/dsh-agent-teams) | [`plugins/agent-teams`](plugins/agent-teams) (`dsh-agent-teams`) |
| [`externals/dsh-context`](externals/dsh-context) | [bowenliang123/dsh-context](https://github.com/bowenliang123/dsh-context) | Pin only until the fork lands. Do not install the checkout. |

## Install

Pick a package. Do not add the repository root.

**Step 1 — add one plugin to the `web` profile.**

```bash
dsh plugin --profile web add github:kedoupi/dsh-plugins#path:plugins/providers
dsh web
```

**Step 2 — open the page that plugin occupies.** Providers: **Settings → Models**. Memory: **Settings → Memory**. IM: **Settings → Plugins → IM bots**. Hello appears when the Web app opens.

Every plugin uses the same Git path shape:

```text
github:kedoupi/dsh-plugins#path:plugins/<slug>
```

| Slug | Install path |
| :-- | :-- |
| `providers` | `github:kedoupi/dsh-plugins#path:plugins/providers` |
| `memory` | `github:kedoupi/dsh-plugins#path:plugins/memory` |
| `im` | `github:kedoupi/dsh-plugins#path:plugins/im` |
| `hello` | `github:kedoupi/dsh-plugins#path:plugins/hello` |
| `agent-teams` | `github:kedoupi/dsh-plugins#path:plugins/agent-teams` |

Public discovery uses the GitHub topic [`dsh-plugin`](https://github.com/topics/dsh-plugin). After source changes: rebuild that package and restart a running `dsh`.

## Usage

Once a plugin is installed, use it from the corresponding Settings page (or from chat, for memory tools). There is no extra CLI after `dsh plugin add`.

| You want to… | Install | Then |
| :-- | :-- | :-- |
| Sign in to Codex / Claude / Grok / Qwen / Kimi, or store API keys | `dsh-providers` | Settings → **Models** |
| Keep notes the model can recall next session | `dsh-memory` | Chat (“remember that…”) or Settings → **Memory** |
| Talk to the local Harness from Feishu, WeChat, Slack, … | `dsh-im` | Settings → Plugins → **IM bots** |
| Show a Xiaotaozi welcome when the Web app opens | `dsh-hello` | Restart `dsh web` |

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
externals/          git submodules of upstream plugins (not in the pnpm workspace)
templates/          host / mixed skeletons for `pnpm new`
docs/               conventions + workflow
```

The workspace root must not declare `dsh.bundle` or `dsh.profile`.

| | Daily | Sandbox (this repo) |
| :-- | :-- | :-- |
| Home | `~/.dsh` | `<repo>/.dsh-home` (gitignored) |
| Command | `dsh web` | `pnpm dev` |
| Port | 3080 | 3081 |
| Plugins | user's stable set | `link:` into this workspace |

`link-plugin` and `pnpm dev` set `DSH_HOME` to `.dsh-home`. Never link workspace plugins into `~/.dsh/profiles/web`.

## Develop

Conventions: [docs/conventions.md](docs/conventions.md). Steps: [docs/workflow.md](docs/workflow.md). Hard rules: [AGENTS.md](AGENTS.md). With an agent, use `/dsh-plugin`.

Requires Node.js `>= 22.19` and the global CLI `@deepseek-ai/dsh@0.1.1-rc.2` (`@next`). First clone:

```bash
git clone --recurse-submodules https://github.com/kedoupi/dsh-plugins.git
```

```bash
pnpm new greet                 # or: pnpm new sidebar --kind mixed
pnpm install
# replace the greet sample, then:
pnpm --filter dsh-greet test
pnpm --filter dsh-greet build
node scripts/link-plugin.mjs --profile dsh-dev greet
```

For Web UI, link into the sandbox `web` profile and run `pnpm dev` (port 3081). Do not `dsh web` against `~/.dsh` while iterating.

```bash
node scripts/link-plugin.mjs --profile web <slug>
pnpm dev
```

## Documentation

| Doc | Read it when |
| :-- | :-- |
| [Conventions](docs/conventions.md) | Package identity, two homes, what `pnpm check` enforces |
| [Workflow](docs/workflow.md) | Create, install, simplify, commit |
| [AGENTS.md](AGENTS.md) | Hard rules for agents in this repo |
| [dsh-providers](plugins/providers/README.md) | Models settings page |
| [dsh-memory](plugins/memory/README.md) | Memory tools and settings |
| [dsh-im](plugins/im/README.md) | IM bots |
| [dsh-hello](plugins/hello/README.md) | Welcome dialog |
| [dsh-agent-teams](plugins/agent-teams/README.md) | Team conversation (fork) |
| [externals/dsh-agent-teams](externals/dsh-agent-teams) | Upstream pin (do not install) |
| [externals/dsh-context](externals/dsh-context) | Upstream pin (do not install) |

## License

[MIT](LICENSE)
