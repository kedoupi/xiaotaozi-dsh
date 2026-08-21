<h1 align="center">dsh-im</h1>

<p align="center"><b>Settings → Plugins → IM bots: connect the local Harness to chat apps.</b></p>

<p align="center">
  Feishu · WeChat · DingTalk · WeCom · QQ · Slack · Telegram · Discord · WhatsApp · AI Office
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh.md">中文</a> ·
  <a href="https://github.com/kedoupi/dsh-plugins">dsh-plugins</a> ·
  <a href="THIRD_PARTY_NOTICES.md">THIRD_PARTY_NOTICES.md</a>
</p>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/topic-dsh--plugin-0ea5e9?style=flat-square" alt="dsh-plugin"></a>
  <img src="https://img.shields.io/badge/dsh-0.1.1--rc.2-4176e6?style=flat-square" alt="DeepSeek Harness 0.1.1-rc.2">
</p>

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin. Scan a QR code, paste an App Manifest, or enter bot credentials. Each channel can hold several bots. Credentials stay in the Host credential store.

Runtime logic lives under `src/channels/`; Cordis RPC wiring is under `src/host/`; the settings UI is `src/client/`.

Part of the [`dsh-plugins`](https://github.com/kedoupi/dsh-plugins) monorepo. User-facing copy follows the Harness language (Chinese / English). Channel adapters come from [xmanrui/dsh-im](https://github.com/xmanrui/dsh-im) (MIT). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Do not `dsh plugin add` the repository root.

## Features

- **Nine chat channels plus experimental AI Office.** QR, App Manifest, or existing secrets, depending on the product.
- **Several bots per channel.** Secrets never go in the client bundle.
- **Bot commands in the chat.** `/help` `/new` `/status` `/models` `/model` `/stop` `/steer` `/compact` `/workspace` `/workspacelist` `/sessionlist` `/session`

## Install

```bash
dsh plugin --profile web add github:kedoupi/dsh-plugins#path:plugins/im
dsh web
```

Then open **Settings → Plugins → IM bots**. After source changes: rebuild this package and restart sandbox `pnpm dev`.

## Screenshots

![IM bot settings](docs/imbot.png)

## Channels

| Channel | Setup |
| :-- | :-- |
| Feishu | QR or App ID + Secret; streaming cards |
| WeChat | QR via Tencent iLink |
| DingTalk | QR or Client ID + Secret; AI Card stream |
| WeCom | QR or Bot ID + Secret |
| QQ | QR or AppID + AppSecret |
| Slack | App Manifest + Bot/App tokens |
| Telegram | BotFather token; optional DM allowlist |
| Discord | Bot token |
| WhatsApp | Linked-device QR (unofficial WhatsApp Web) |
| AI Office | Outbound heartbeat + SSE; experimental |

## Develop

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
| [Workflow](../../docs/workflow.md) | Create, install, simplify, commit |
| [Conventions](../../docs/conventions.md) | Package identity and two homes |
| [dsh-plugins](../../README.md) | The rest of the monorepo |

## License

[MIT](../../LICENSE)
