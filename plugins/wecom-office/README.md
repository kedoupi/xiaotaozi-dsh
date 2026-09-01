<p align="right"><strong>English</strong> · <a href="./README.zh.md">中文</a></p>

<h1 align="center">dsh-wecom-office</h1>

<p align="center"><b>Sidebar → IM bots → WeCom robot card: calendars, docs, meetings, and more in chat.</b></p>

<p align="center">
  Calendar · Docs · Sheets · Meetings · Contacts · Todos · Disk
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh.md">中文</a> ·
  <a href="https://github.com/kedoupi/xiaotaozi-dsh">xiaotaozi-dsh</a>
</p>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/topic-dsh--plugin-0ea5e9?style=flat-square" alt="dsh-plugin"></a>
  <img src="https://img.shields.io/badge/dsh-0.1.1--rc.2-4176e6?style=flat-square" alt="DeepSeek Harness 0.1.1-rc.2">
</p>

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin. Host-only: no standalone settings page. The single user entry is the office section on each WeCom robot card in **Sidebar → IM bots** (that UI ships in [`dsh-im`](../im)). WeCom **chat** stays in `dsh-im`; this package wires the official [`wecom-cli`](https://github.com/WecomTeam/wecom-cli) to model tools so the conversation can use calendars, Tencent Docs, sheets, meetings, contacts, todos, and WeDrive.

Part of [`xiaotaozi-dsh`](https://github.com/kedoupi/xiaotaozi-dsh). Do not `dsh plugin add` the repository root.

## What it unlocks

- **Office work inside the WeCom conversation.** Ask in chat and the model calls `wecom_*` tools: read a schedule, check a meeting, look up a contact, or draft a Tencent Doc — no second app, no second chat.
- **One integrated entry.** Everything office-related lives in the office section on the WeCom robot card supplied by `dsh-im`. There is no separate office page to learn.
- **An explicit, reversible boundary.** You choose which bot is the office identity and whether it may modify WeCom data. Reads are always available; writes only when you allow them.

## Quick start

First `xtz start` seeds this plugin with the other first-party plugins. Installed alone without `dsh-im`, it exposes no UI.

1. Install `wecom-cli` on `PATH`: `npm install -g @wecom/cli`.
2. In **Sidebar → IM bots → 企业微信 (WeCom)**, bind a bot (QR or Bot ID + Secret).
3. On that bot's card, open the office section and click **Activate office**.
4. **Allow changing WeCom data** defaults on — leave it on if you want create/edit tools to work; turn it off for read-only use.
5. Ask in the WeCom chat: "What's on my calendar this week?"

To install this plugin on its own:

```bash
dsh plugin --profile web add github:kedoupi/xiaotaozi-dsh#path:plugins/wecom-office
```

The office UI lives on the WeCom robot card in `dsh-im`; install both plugins. Rebuild after source changes and leave sandbox `pnpm dev` running.

## See it

The office controls live in **Sidebar → IM bots → 企业微信 (WeCom) → robot card → 办公能力 (Office)**:

- **Setup state.** Before activation the card shows 办公能力未开通 (Office is not activated) with an **Activate office** button; if `wecom-cli` is missing, the card says so and shows the install command instead.
- **Permission controls.** On the active office bot's card you see 办公能力已开通 (Office activated), the **Allow changing WeCom data** switch, and folded CLI/config details.
- **Results in chat.** Reads and delivered documents render as ordinary WeCom conversation messages from that bot — the office identity never becomes a separate surface.

## One office identity

Only one office bot is active at a time. Switching is explicit: click **Make this the office bot** on the target card. The office identity never follows which bot delivered a message, so a conversation on a second bot cannot silently act as the first.

## Read and write boundary

Writes follow the **Allow changing WeCom data** switch on the active office bot's card. When that switch is off, create/edit tools fail closed instead of pretending to succeed. Turning the switch on or off never starts a chat action by itself; it only gates what the `wecom_*` tools may do.

## Supported work

Calendars, Tencent Docs, sheets, meetings, contacts, todos, and WeDrive — exposed as `wecom_*` model tools. Do not run `wecom-cli` in the terminal from a session; the model calls the tools directly.

## Data and dependencies

- **`wecom-cli` is required** on `PATH` (`npm install -g @wecom/cli`). Without it the card reports 未安装 wecom-cli and office stays unavailable.
- **CLI home stays in this Harness home.** Credentials live under `$DSH_HOME/plugins/wecom-office`, not `~/.config/wecom`. Sandbox and official stay isolated.
- **Chat stays in `dsh-im`.** This package adds office tools consumed by the card's office section rendered in `dsh-im`; messaging, files, and sessions remain the IM plugin's job.

## Develop

From the monorepo root:

```bash
pnpm --filter dsh-wecom-office test
pnpm --filter dsh-wecom-office build
node scripts/link-plugin.mjs --profile web wecom-office
pnpm dev
```

That links into the repo `.dsh-home` (port 3081), not the daily `~/.dsh`.

## Documentation

| Doc | When |
| :-- | :-- |
| [PRD (zh)](docs/prd.zh.md) | Product contract |
| [Tencent Docs layout PRD (zh)](docs/ai-document-delivery-prd.zh.md) | Deliver a readable Tencent Doc from chat |
| [Layout standard (zh)](docs/tencent-doc-layout-standard.zh.md) | Word markdown discipline |
| [Layout technical design (zh)](docs/ai-document-delivery-technical.zh.md) | Force markdown, layout checks, guidance |
| [Technical design (zh)](docs/technical.zh.md) | Office plugin implementation |
| [Appendix A](docs/appendix-cli.zh.md) | CLI argv |
| [Appendix B](docs/appendix-rpc.zh.md) | Office status RPC |
| [Workflow](../../docs/workflow.md) | Create, install, simplify, commit |
| [Conventions](../../docs/conventions.md) | Package identity and two homes |

## License

[MIT](../../LICENSE)
