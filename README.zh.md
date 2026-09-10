<h1 align="center">xiaotaozi-dsh</h1>

<p align="center">
  <a href="plugins/providers"><img src="plugins/providers/docs/ip-3d.jpg" width="72" height="72" alt="dsh-providers"></a>
  <a href="plugins/im"><img src="plugins/im/docs/ip-3d.jpg" width="72" height="72" alt="dsh-im"></a>
  <a href="plugins/wecom-office"><img src="plugins/wecom-office/docs/ip-3d.jpg" width="72" height="72" alt="dsh-wecom-office"></a>
  <a href="plugins/xtz-ui"><img src="plugins/xtz-ui/docs/ip-3d.jpg" width="72" height="72" alt="dsh-xtz-ui"></a>
  <a href="plugins/sidebar"><img src="plugins/sidebar/docs/ip-3d.jpg" width="72" height="72" alt="dsh-sidebar"></a>
  <a href="plugins/market"><img src="plugins/market/docs/ip-3d.jpg" width="72" height="72" alt="dsh-market"></a>
</p>

<p align="center"><b>小桃子 DSH：用户产品是 xtz CLI，外加一套 DeepSeek Harness 插件。</b></p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh.md">中文</a> ·
  <a href="docs/conventions.zh.md">规范</a> ·
  <a href="docs/workflow.zh.md">流程</a> ·
  <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a>
</p>

<p align="center">
  <a href="https://github.com/kedoupi/xiaotaozi-dsh/stargazers"><img src="https://img.shields.io/github/stars/kedoupi/xiaotaozi-dsh?style=flat-square" alt="GitHub stars"></a>
  <a href="https://github.com/kedoupi/xiaotaozi-dsh/issues"><img src="https://img.shields.io/github/issues/kedoupi/xiaotaozi-dsh?style=flat-square" alt="GitHub issues"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/topic-dsh--plugin-0ea5e9?style=flat-square" alt="dsh-plugin"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22.19-43853d?style=flat-square" alt="Node.js"></a>
  <img src="https://img.shields.io/badge/dsh-0.1.2--rc.1-4176e6?style=flat-square" alt="DeepSeek Harness 0.1.2-rc.1">
</p>

小桃子 DSH 是建立在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 上的产品套装：用户安装的是 [`apps/cli/`](apps/cli/) 里的 `xtz` 命令，`plugins/` 是它种下的能力层。出了问题，或还缺某个插件？[提个 issue](https://github.com/kedoupi/xiaotaozi-dsh/issues)。

## 快速开始

需要 `PATH` 上有 Node.js `^22.19.0 || >=24.0.0`：

```bash
npm install -g xiaotaozi-dsh-cli
xtz start
```

第一次 `xtz start` 会准备好正式 web profile，把 `plugins/` 下所有自研插件种好，然后在浏览器里打开界面。想用别的装法？安装脚本（`curl -fsSL https://raw.githubusercontent.com/kedoupi/xiaotaozi-dsh/main/apps/cli/scripts/install.sh | sh`）和 `bun add -g xiaotaozi-dsh-cli` 装的是同一个 CLI；`xtz` 运行仍是 Node。

开放命令：帮助/版本、`start`/`web`、`stop`、`restart`、`open`、`status`、`config path`、`doctor`。刻意禁用：`init`、`plugin`、`run`/`ask`、`config dump`/`defaults`、`update`。`xtz` 只管理自己拉起的进程，绝不抢占 3080 端口。完整命令和安全边界见 [`apps/cli/README.zh.md`](apps/cli/README.zh.md)。CLI 固定 DeepSeek Harness `@deepseek-ai/dsh@0.1.2-rc.1`；其他 DSH 版本不视为兼容。

## 插件中心

从 **新会话** 下方的左侧工具条打开 **插件中心**。它占用会话主区域，侧栏和右侧工作台保持可用。
默认打开 **已安装**，内置能力为小桃子功能、侧边工作台、模型和 IM 机器人。
**发现插件** 使用精选目录。外部安装的顶层插件也会出现在已安装列表里，确认后可以移除。
移除包不承诺删除其凭据、会话或已保存数据。

首次欢迎确认打开 **插件中心 → 已安装 → 模型**。归档也可从会话 ⋯ 菜单打开。运行参数位于 **设置 → 高级**。技术 Loader 清单不是用户设置页；故障诊断使用 `xtz doctor`。

## 你会得到什么

- **模型** —— 官方订阅登录和 API Key 同一页，对话只列出勾选过的模型。
- **IM 机器人** —— 九个聊天渠道（飞书、微信、Slack 等）和一个实验性 AI Office 连接器，完整嵌入插件中心。
- **企业微信办公** —— 通过官方 `wecom-cli` 使用日程、文档、会议、通讯录、表格、待办和微盘。
- **小桃子壳** —— 品牌界面和欢迎说明保持开启；开关覆盖归档、Git 图谱和向 Agent 宣告。
- **侧边工作台** —— 右侧面板里的文件、编辑器、Git 和终端。
- **插件中心** —— 内置配置、已安装插件和精选发现，一键安装。

## 看看小桃子 DSH

Web 应用第一次打开时，欢迎弹框向用户问好。

![小桃子 DSH 欢迎弹框](plugins/xtz-ui/docs/welcome.webp)

**插件中心 → 已安装 → 小桃子功能** 开关覆盖归档、Git 图谱和向 Agent 宣告。

![插件中心里的小桃子功能开关](plugins/xtz-ui/docs/xiaotaozi-settings.webp)

Git 图谱标出当前提交、分支引用和合并泳道，不替代 Host 原有 Git 工作流。

![小桃子 Git 图谱](plugins/xtz-ui/docs/git-graph.webp)

右侧工作台把文件留在会话旁边；会话上还有 Git 图谱胶囊。

![对话旁的 Sidebar 文件栏](plugins/sidebar/docs/workbench.webp)

**插件中心 → 已安装 → 模型** 展示已接入的服务商、可选的智能选择，以及对话会提供的模型。

![模型总览与模型选择](plugins/providers/docs/models-overview.webp)

添加服务商列出用户还可以登录或填密钥的所有厂商。

![添加服务商目录](plugins/providers/docs/add-provider.webp)

**插件中心 → 已安装 → IM 机器人** 列出聊天渠道；微信默认扫码接入。

![插件中心里的 IM 机器人：微信选中](plugins/im/docs/channels-overview.webp)

手动接入 Telegram 机器人只需要 Bot Token；凭据保存在 Host 凭据存储，而不是客户端包。

![手动接入机器人：粘贴 Bot Token](plugins/im/docs/add-bot.webp)

**插件中心 → 发现插件** 列出精选第三方插件，支持搜索和标签。

![发现插件：搜索、标签和插件卡片](plugins/market/docs/catalog.webp)

插件详情页展示版本、来源和确切的安装规格。

![插件详情：版本、来源和安装规格](plugins/market/docs/plugin-detail.webp)

## 插件

一个包做一件事；每个自研插件都会在第一次 `xtz start` 时种好。每个插件也都能用 `github:kedoupi/xiaotaozi-dsh#path:plugins/<slug>` 的 Git 路径单独构建安装。

| 包 | 占用 | 做什么 | Git 路径安装 |
| :-- | :-- | :-- | :-- |
| [`dsh-providers`](plugins/providers) | 插件中心 → 已安装 → **模型** | 服务商登录、API Key、模型勾选和可选智能选择（无在线学习、reasoning effort 路由、耐久路由审计）。[EN](plugins/providers/README.md) · [中文](plugins/providers/README.zh.md) | `github:kedoupi/xiaotaozi-dsh#path:plugins/providers` |
| [`dsh-im`](plugins/im) | 插件中心 → 已安装 → **IM 机器人** | 九个聊天渠道和实验性 AI Office 连接器。[EN](plugins/im/README.md) · [中文](plugins/im/README.zh.md) | `github:kedoupi/xiaotaozi-dsh#path:plugins/im` |
| [`dsh-wecom-office`](plugins/wecom-office) | 插件中心 → 已安装 → **IM 机器人** → 企业微信机器人卡片 | 通过 `wecom-cli` 接企业微信日程、文档、会议、通讯录、表格、待办和微盘。[EN](plugins/wecom-office/README.md) · [中文](plugins/wecom-office/README.zh.md) | `github:kedoupi/xiaotaozi-dsh#path:plugins/wecom-office` |
| [`dsh-xtz-ui`](plugins/xtz-ui) | 插件中心 → 已安装 → **小桃子功能**；设置 → 高级 | 品牌壳、归档、Git 图谱和功能开关。[EN](plugins/xtz-ui/README.md) · [中文](plugins/xtz-ui/README.zh.md) | `github:kedoupi/xiaotaozi-dsh#path:plugins/xtz-ui` |
| [`dsh-sidebar`](plugins/sidebar) | 插件中心 → 已安装 → **侧边工作台** | 右侧文件 / 编辑器 / Git / 终端面板。[EN](plugins/sidebar/README.md) · [中文](plugins/sidebar/README.zh.md) | `github:kedoupi/xiaotaozi-dsh#path:plugins/sidebar` |
| [`dsh-market`](plugins/market) | **插件中心** | 已安装能力与 **发现插件**；点 **安装** 添加第三方插件。[EN](plugins/market/README.md) · [中文](plugins/market/README.zh.md) | `github:kedoupi/xiaotaozi-dsh#path:plugins/market` |

## 第三方市场

**插件中心 → 发现插件** 从第三方插件的上游 Git/npm 源安装；本仓库只保存 `plugins/market` 里的目录行（`MARKET_PLUGINS`），从不 vendor 那些仓库。当前收录：[Agent Teams](https://github.com/NanmiCoder/dsh-agent-teams)、[会话上下文](https://github.com/bowenliang123/dsh-context) 和 [OpenContext](https://github.com/melandlabs/opencontext)。

## 正式环境与沙箱

两套 Harness 家目录，绝不混用：

| | 正式（用户） | 沙箱（插件开发） |
| :-- | :-- | :-- |
| 家目录 | `~/.dsh` | `<仓库>/.dsh-home`（gitignore） |
| 命令 | `xtz start` | `pnpm dev` |
| 端口 | **3080** | **3081** |
| 插件 | 第一次 `xtz start` 种好；额外插件用 `dsh plugin --profile web add` | 从本仓库 `link:` |

`xtz` 和正式安装绝不碰沙箱；沙箱工具也绝不碰 `~/.dsh`。

## 继续了解

- 贡献入口：[CONTRIBUTING.zh.md](CONTRIBUTING.zh.md)；给 agent 的硬性规则：[AGENTS.md](AGENTS.md)
- 规范：[docs/conventions.zh.md](docs/conventions.zh.md)；流程：[docs/workflow.zh.md](docs/workflow.zh.md)；文档地图：[docs/README.zh.md](docs/README.zh.md)
- 产品快照：[CHANGELOG.md](CHANGELOG.md)；锁定版本：[versions.json](versions.json)
- CLI 合同与源码：[`apps/cli/`](apps/cli/)

## License

[MIT](LICENSE)
