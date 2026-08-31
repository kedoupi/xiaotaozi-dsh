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

First `xtz start` seeds it with the other first-party plugins. Installed alone without `dsh-im`, it exposes no UI.

Part of [`xiaotaozi-dsh`](https://github.com/kedoupi/xiaotaozi-dsh). Do not `dsh plugin add` the repository root.

## Features

- **One entry: the WeCom robot card.** Bind the bot in IM (QR or Bot ID + Secret), then enable office on that bot's card. Switching the office identity is explicit: click **Set as office bot** on the target card. Only one office bot at a time; it never follows which bot delivered a message.
- **Model tools, not a second chat.** The model calls `wecom_*` tools. Do not run `wecom-cli` in the terminal from a session.
- **Read and write.** Writes follow the **Allow modifying WeCom data** switch on the active office bot's card. When that switch is off, create/edit tools fail closed instead of pretending to succeed.
- **CLI home stays in this Harness home.** Credentials live under `$DSH_HOME/plugins/wecom-office`, not `~/.config/wecom`. Sandbox and official stay isolated.

## Install

```bash
dsh plugin --profile web add github:kedoupi/xiaotaozi-dsh#path:plugins/wecom-office
```

`wecom-cli` must be on `PATH` (`npm install -g @wecom/cli`). The office UI lives on the WeCom robot card in `dsh-im`; install both plugins. Rebuild after source changes and leave sandbox `pnpm dev` running.

## Develop

From the monorepo root:

```bash
pnpm --filter dsh-wecom-office test
pnpm --filter dsh-wecom-office build
node scripts/link-plugin.mjs --profile web wecom-office
pnpm dev
```

That links into the repo `.dsh-home` (port 3081), not the daily `~/.dsh`.

## Docs

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
