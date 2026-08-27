<p align="right"><strong>English</strong> · <a href="./README.zh.md">中文</a></p>

<h1 align="center">dsh-im</h1>

<p align="center">
  <img src="docs/ip.jpg" width="160" height="160" alt="dsh-im icon">
</p>

<p align="center"><b>Sidebar below New Session → IM bots: connect the local Harness to chat apps.</b></p>

<p align="center">
  Feishu · WeChat · DingTalk · WeCom · QQ · Slack · Telegram · Discord · WhatsApp · AI Office
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh.md">中文</a> ·
  <a href="https://github.com/kedoupi/xiaotaozi-dsh">xiaotaozi-dsh</a> ·
  <a href="THIRD_PARTY_NOTICES.md">THIRD_PARTY_NOTICES.md</a>
</p>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/topic-dsh--plugin-0ea5e9?style=flat-square" alt="dsh-plugin"></a>
  <img src="https://img.shields.io/badge/dsh-0.1.1--rc.2-4176e6?style=flat-square" alt="DeepSeek Harness 0.1.1-rc.2">
</p>

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin. Scan a QR code, paste an App Manifest, or enter bot credentials. Each channel can hold several bots. Credentials stay in the Host credential store.

Runtime logic lives under `src/channels/`; Cordis RPC wiring is under `src/host/`; the Web UI is `src/client/`.

Part of the [`xiaotaozi-dsh`](https://github.com/kedoupi/xiaotaozi-dsh) monorepo. User-facing copy follows the Harness language (Chinese / English). Channel adapters come from [xmanrui/dsh-im](https://github.com/xmanrui/dsh-im) (MIT). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). WeCom **chat** is this plugin; WeCom **office** (calendars, docs, meetings) is [`dsh-wecom-office`](../wecom-office). Do not `dsh plugin add` the repository root.

## Features

- **Nine chat channels plus experimental AI Office.** QR, App Manifest, or existing secrets, depending on the product.
- **Several bots per channel.** Secrets never go in the client bundle.
- **Files in both directions.** Ordinary chat files go into the current Harness session; result files and images come back as native attachments (`dsh_im_return_file`).
- **Bot commands in the chat.** `/help` `/new` `/status` `/models` `/model` `/presetlist` `/preset` `/stop` `/steer` `/compact` `/workspace` `/workspacelist` `/sessionlist` `/session`
- **Per-bot Agent Preset.** Pick a preset in the IM hub or with `/preset`; new sessions follow it, existing chats need `/new` first.
- **Per-bot role / scope.** A short instruction on the bot card, applied on every inbound turn. Project `AGENTS.md` stays shared; Agent Preset still owns the toolset.
- **English bot copy.** Host `language: en` or `DSH_IM_LANGUAGE=en` switches prompts and command help. Untranslated strings stay Chinese.
- **Resilience and authority.** Config defaults to loopback RPC, isolated channel failures, a 600000ms reply timeout, and a 20000ms connect timeout. QQ, WhatsApp, and Office are loaded on demand; `agentPreset` can provide the default preset.

## Install

```bash
dsh plugin --profile web add github:kedoupi/xiaotaozi-dsh#path:plugins/im
dsh web
```

Then open **IM bots** in the sidebar, directly below **New Session** (and below **Xiaotaozi Market** if that plugin is installed). Leave sandbox `pnpm dev` running while you edit; host restarts itself when `lib/index.js` changes.

## Screenshots

![IM bot settings](docs/imbot.png)

## Channels

| Channel | Setup |
| :-- | :-- |
| Feishu | QR or App ID + Secret; streaming cards; group @/all-message mode; session watches |
| WeChat | QR via Tencent iLink |
| DingTalk | QR or Client ID + Secret; AI Card stream |
| WeCom | QR or Bot ID + Secret |
| QQ | QR or AppID + AppSecret; Markdown replies, one progress bubble in DMs |
| Slack | App Manifest + Bot/App tokens |
| Telegram | BotFather token; optional DM allowlist; native Rich Messages (draft in DMs, in-place in groups/topics) |
| Discord | Bot token. Enable **Message Content Intent**. Server text/announcement mentions open a Public Thread; grant **Create Public Threads**, **Send Messages in Threads**, **Send Messages**, and **Read Message History**. Result files also need **Attach Files**. |
| WhatsApp | Linked-device QR (unofficial WhatsApp Web; use a dedicated number). Default access is **Only me**; Selected contacts and Open responses are available per bot. |
| AI Office | Outbound heartbeat + SSE; experimental, off unless `officeEnabled: true` |

Chat files (not just images) are staged into the current session workspace. Harness can send a result file back with the `dsh_im_return_file` tool. Slack apps need `files:write` as well as `files:read`.

## Develop

AI Office is disabled by default. Enable it per profile with `officeEnabled: true` in `Config` (or `office.enabled: true`); the channel then also needs its own connector credentials.

From the monorepo root:

```bash
pnpm --filter dsh-im test
pnpm --filter dsh-im build
node scripts/link-plugin.mjs --profile web im
pnpm dev
```

## Documentation

| Doc | Read it when |
| :-- | :-- |
| [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) | Upstream MIT attribution |
| [dsh-wecom-office](../wecom-office/README.md) | WeCom calendars, docs, meetings |
| [Workflow](../../docs/workflow.md) | Create, install, simplify, commit |
| [Conventions](../../docs/conventions.md) | Package identity and two homes |
| [xiaotaozi-dsh](../../README.md) | The rest of the monorepo |

## License

[MIT](../../LICENSE)
