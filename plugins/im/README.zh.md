<h1 align="center">dsh-im</h1>

<p align="center"><b>设置 → 插件 → IM机器人：把本机 Harness 接到聊天软件。</b></p>

<p align="center">
  飞书 · 微信 · 钉钉 · 企业微信 · QQ · Slack · Telegram · Discord · WhatsApp · AI Office
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

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件。扫码、App Manifest 或已有凭据即可接入。每个渠道可以挂多个机器人。Secret 只进 Host 凭据存储。

渠道运行时在 `src/channels/`，Cordis RPC 在 `src/host/`，设置页在 `src/client/`。

属于 [`dsh-plugins`](https://github.com/kedoupi/dsh-plugins) monorepo。界面文案跟随 Harness 语言（中文 / English）。渠道适配来自 [xmanrui/dsh-im](https://github.com/xmanrui/dsh-im)（MIT）。第三方说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。不要对仓库根目录执行 `dsh plugin add`。

## 特性

- **九个聊天渠道，外加实验性 AI Office。** 按产品用扫码、App Manifest 或已有密钥。
- **每个渠道可以挂多个机器人。** Secret 不会进客户端包。
- **对话里可用命令。** `/help` `/new` `/status` `/models` `/model` `/stop` `/steer` `/compact` `/workspace` `/workspacelist` `/sessionlist` `/session`

## 安装

```bash
dsh plugin --profile web add github:kedoupi/dsh-plugins#path:plugins/im
dsh web
```

然后打开 **设置 → 插件 → IM机器人**。改完源码要重新构建这个包，并重启沙箱 `pnpm dev`。

## 截图

![IM 机器人设置](docs/imbot.png)

## 渠道

| 渠道 | 接入 |
| :-- | :-- |
| 飞书 | 扫码或 App ID + Secret；流式卡片 |
| 微信 | 扫码（腾讯 iLink） |
| 钉钉 | 扫码或 Client ID + Secret；AI Card |
| 企业微信 | 扫码或 Bot ID + Secret |
| QQ | 扫码或 AppID + AppSecret |
| Slack | App Manifest + Bot/App Token |
| Telegram | BotFather Token；可选私聊白名单 |
| Discord | Bot Token |
| WhatsApp | 关联设备扫码（非官方 WhatsApp Web） |
| AI Office | 本机向外心跳 + SSE；实验功能 |

## 开发

在 monorepo 根目录：

```bash
pnpm --filter dsh-im test
pnpm --filter dsh-im build
node scripts/link-plugin.mjs --profile web im
pnpm dev
```

## 文档

| 文档 | 什么时候看 |
| :-- | :-- |
| [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) | 上游 MIT 归属 |
| [流程](../../docs/workflow.zh.md) | 创建、安装、优化、提交 |
| [规范](../../docs/conventions.zh.md) | 包身份、两套 home |
| [dsh-plugins](../../README.zh.md) | 整个 monorepo |

## License

[MIT](../../LICENSE)
