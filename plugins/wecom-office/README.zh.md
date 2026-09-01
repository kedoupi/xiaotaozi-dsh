<p align="right"><a href="./README.md">English</a> · <strong>中文</strong></p>

<h1 align="center">dsh-wecom-office</h1>

<p align="center"><b>侧栏 → IM机器人 → 企业微信机器人卡片：对话里用日程、文档、会议。</b></p>

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

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件。纯 Host：没有独立设置页。唯一用户入口是 **侧栏 → IM机器人** 里每张企业微信机器人卡片的「办公能力」区（界面在 [`dsh-im`](../im) 包里）。企业微信**聊天**仍在 `dsh-im`；本包把官方 [`wecom-cli`](https://github.com/WecomTeam/wecom-cli) 接到模型工具上，对话里就能用日程、腾讯文档、表格、会议、通讯录、待办和微盘。

属于 [`xiaotaozi-dsh`](https://github.com/kedoupi/xiaotaozi-dsh) monorepo。不要对仓库根目录执行 `dsh plugin add`。

## 能做什么

- **在企业微信对话里办公。** 直接在聊天里说需求，模型调 `wecom_*` 工具：查日程、查会议、查通讯录、起草腾讯文档——不用打开第二个应用，也没有第二套聊天。
- **一个集成入口。** 所有办公相关操作都在 `dsh-im` 提供的企业微信机器人卡片的「办公能力」区里，没有单独的办公页面要学。
- **明确、可撤回的边界。** 你显式选择哪只 bot 是办公身份、是否允许它修改企业微信数据。读取始终可用；写入只在你允许时发生。

## 快速开始

第一次 `xtz start` 会和其它自研插件一起种上本插件。只装本包、不装 `dsh-im` 时没有任何办公 UI。

1. 在本机 PATH 上安装 `wecom-cli`：`npm install -g @wecom/cli`。
2. 打开 **侧栏 → IM机器人 → 企业微信**，绑定一只 bot（扫码或 Bot ID + Secret）。
3. 在那只 bot 的卡片上找到「办公能力」区，点「开通办公能力」。
4. 可选：需要创建/修改类工具时，打开「允许修改企业微信数据」。
5. 在企业微信聊天里直接问："这周我的日程是什么？"

单独安装本插件：

```bash
dsh plugin --profile web add github:kedoupi/xiaotaozi-dsh#path:plugins/wecom-office
```

办公界面在 `dsh-im` 的企业微信机器人卡片上，两个插件都要装。改源码后重新 `build`，并让沙箱 `pnpm dev` 一直跑。

## 功能截图

办公控件在 **侧栏 → IM机器人 → 企业微信 → 机器人卡片 → 办公能力**：

- **开通状态。** 未开通时卡片显示「办公能力未开通」和「开通办公能力」按钮；未安装 `wecom-cli` 时卡片会直接说明并给出安装命令。
- **权限控件。** 在当前办公机器人卡片上可以看到「办公能力已开通」、「允许修改企业微信数据」开关，以及折叠的 CLI 与配置详情。
- **结果在对话里。** 读取结果和交付的文档就是那只 bot 发来的普通企业微信会话消息——办公身份不会变成另一个独立界面。

## 唯一办公身份

同一时间只有一只办公机器人。切换是显式的：在目标卡片点「设为办公机器人」。办公身份不跟随消息来自哪只 bot，所以在另一只 bot 上的对话不会偷偷用第一只的身份行动。

## 读写边界

写入跟当前办公机器人卡片上的「允许修改企业微信数据」开关。关掉后，创建/修改类工具直接失败，不假装成功。拨动开关本身不会触发任何聊天动作，它只是约束 `wecom_*` 工具能做什么。

## 支持的办公能力

日程、腾讯文档、表格、会议、通讯录、待办和微盘——以 `wecom_*` 模型工具暴露。不要在会话里让模型去终端跑 `wecom-cli`；模型直接调工具。

## 数据与依赖

- **必须安装 `wecom-cli`** 到 PATH（`npm install -g @wecom/cli`）。没有它卡片会提示「未安装 wecom-cli」，办公保持不可用。
- **CLI 家目录钉在本套 Harness home。** 凭据在 `$DSH_HOME/plugins/wecom-office`，不用 `~/.config/wecom`。沙箱和正式隔离。
- **聊天留在 `dsh-im`。** 本包只加办公工具和卡片上的办公区；消息、文件、会话仍是 IM 插件的职责。

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
| [附录 B](docs/appendix-rpc.zh.md) | 办公状态 RPC |
| [流程](../../docs/workflow.zh.md) | 创建、安装、优化、提交 |
| [规范](../../docs/conventions.zh.md) | 包身份、两套 home |

## License

[MIT](../../LICENSE)
