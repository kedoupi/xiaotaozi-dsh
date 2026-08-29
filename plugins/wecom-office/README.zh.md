<p align="right"><a href="./README.md">English</a> · <strong>中文</strong></p>

<h1 align="center">dsh-wecom-office</h1>

<p align="center"><b>设置 → 企业微信办公：对话里用日程、文档、会议。</b></p>

<p align="center">
  日程 · 文档 · 表格 · 会议 · 通讯录 · 待办 · 微盘
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

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件。占用 **设置 → 企业微信办公**。企业微信**聊天**仍在 [`dsh-im`](../im)；本包把官方 [`wecom-cli`](https://github.com/WecomTeam/wecom-cli) 接到模型工具上，对话里就能用日程、腾讯文档、表格、会议、通讯录、待办和微盘。

第一次 `xtz start` 会和其它自研插件一起种上。

属于 [`xiaotaozi-dsh`](https://github.com/kedoupi/xiaotaozi-dsh) monorepo。不要对仓库根目录执行 `dsh plugin add`。

## 特性

- **设置 → 企业微信办公。** 已装 `dsh-im` 且绑过企微机器人：选那只 bot 再开通。没装 IM：本页扫码或填 Bot ID + Secret。
- **模型工具，不是第二套聊天。** 模型调 `wecom_*` 工具。不要在会话里让模型去终端跑 `wecom-cli`。
- **可读可写。** 写入跟 **设置 → 企业微信办公 → 高级 → 允许修改**。关掉后，创建/修改类工具直接失败，不假装成功。
- **CLI 家目录钉在本套 Harness home。** 凭据在 `$DSH_HOME/plugins/wecom-office`，不用 `~/.config/wecom`。沙箱和正式隔离。

## 安装

```bash
dsh plugin --profile web add github:kedoupi/xiaotaozi-dsh#path:plugins/wecom-office
```

本机 PATH 上需要 `wecom-cli`（`npm install -g @wecom/cli`）。改源码后重新 `build`，并让沙箱 `pnpm dev` 一直跑。

## 开发

在 monorepo 根目录：

```bash
pnpm --filter dsh-wecom-office test
pnpm --filter dsh-wecom-office build
node scripts/link-plugin.mjs --profile web wecom-office
pnpm dev
```

挂的是仓库 `.dsh-home`（端口 3081），不是日常 `~/.dsh`。

## 文档

| 文档 | 什么时候看 |
| :-- | :-- |
| [产品规格 PRD](docs/prd.zh.md) | 产研主合同 |
| [腾讯文档智能排版 PRD](docs/ai-document-delivery-prd.zh.md) | 对话里做成能看的腾讯文档 |
| [覆盖范围内的排版标准](docs/tencent-doc-layout-standard.zh.md) | Word 正文 markdown 纪律 |
| [智能排版技术方案](docs/ai-document-delivery-technical.zh.md) | 强制 markdown、纪律检查、guidance |
| [技术方案](docs/technical.zh.md) | 办公插件主实现 |
| [附录 A](docs/appendix-cli.zh.md) | CLI argv |
| [附录 B](docs/appendix-rpc.zh.md) | 设置页 RPC |
| [流程](../../docs/workflow.zh.md) | 创建、安装、优化、提交 |
| [规范](../../docs/conventions.zh.md) | 包身份、两套 home |

## License

[MIT](../../LICENSE)
