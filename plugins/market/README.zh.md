<p align="right"><a href="./README.md">English</a> · <strong>中文</strong></p>

<h1 align="center">dsh-market</h1>

<p align="center">
  <img src="docs/ip.jpg" width="160" height="160" alt="dsh-market icon">
</p>

<p align="center"><b>小桃子市场：目录里的第三方插件，点安装写入当前 profile</b></p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh.md">中文</a> ·
  <a href="https://github.com/kedoupi/xiaotaozi-dsh">xiaotaozi-dsh</a>
</p>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/topic-dsh--plugin-0ea5e9?style=flat-square" alt="dsh-plugin"></a>
</p>

属于 [`xiaotaozi-dsh`](https://github.com/kedoupi/xiaotaozi-dsh) monorepo。不要对仓库根目录执行 `dsh plugin add`。

## 能做什么

- 侧栏「新会话」下方的一级入口，打开市场浮层。
- 精选第三方插件目录，支持搜索、标签筛选和每个插件的详情。
- 一键安装进当前 profile，卡片如实显示已装/未装状态。

## 打开市场

点击侧栏工具行里的 **小桃子市场**（市场在左，IM 在右），就在「新会话」正下方。浮层覆盖当前会话，点右上角 × 或点击遮罩即可关闭。

## 市场与「设置 → 插件」

市场负责发现、安装和移除可选的第三方插件，不能替代 **设置 → 插件**：**插件配置**是内置终端、Agent 循环和网页搜索设置的唯一界面，**插件列表**则展示 Host 的运行时清单与状态，其中也包含内置插件和第一方插件。

## 功能截图

![市场目录：搜索、标签页与插件卡片](docs/catalog.webp)

![插件详情：版本、来源与安装规格](docs/plugin-detail.webp)

## 目录与详情

目录就是 `MARKET_PLUGINS` —— 目前三行精选：

| 插件 | 是什么 |
| :-- | :-- |
| Agent Teams | 队长 + 可续成员的多 Agent 协作（NanmiCoder） |
| 会话上下文 | 组成条、历史、事件和 /context（bowenliang123） |
| OpenContext | 时序记忆图谱与自动召回（melandlabs） |

搜索匹配名称、简介和标签；标签 chip 过滤卡片网格。**查看详情** 打开详情视图，展示简介、版本、来源和确切的安装规格。

`plugins/` 自研包启动时种上，不在这里卖。

## 安装状态

包已经成为当前 profile `package.json` 的依赖时，卡片显示 **已安装**；否则显示 **安装**。状态是 profile 级别的：装进 `web` profile 不会让别的 profile 显示已安装。

点击 **安装** 后使用启动当前 Host 的同一份 pinned DSH runtime，对当前 `DSH_HOME` 跑 `dsh plugin --profile web add`（正式 `~/.dsh` 或沙箱 `.dsh-home`）。不会调用 PATH 上的 `dsh`，也不会从 `#path:externals/…` 安装。

## 来源与边界

| 字段 | 默认值 | 含义 |
| :-- | :-- | :-- |
| `indexUrl` | `https://s.xiaotaozi.cc/dsh/packs/market.json` | 配置的官方索引 URL / 来源身份；当前不会在这里拉取 |
| `officialLabel` | `小桃子市场` | 官方源显示名 |
| `allowThirdPartySources` | `true` | 预留开关；远程来源目录尚未实现，因此本版本仍会停用添加入口 |

历史来源记录仍保存在 `$DSH_HOME/plugins/market/sources.json`，可从面板移除。在远程拉取、验签和缓存合同明确前，新来源会收到明确的“尚未支持”响应。

## 安装

```bash
dsh plugin --profile <name> add github:kedoupi/xiaotaozi-dsh#path:plugins/market
```

## 文档

| 文档 | 什么时候读 |
| :-- | :-- |
| [Workflow](../../docs/workflow.zh.md) | 创建、安装、精简、提交 |
| [Conventions](../../docs/conventions.zh.md) | 包身份与两个 home |

## License

[MIT](../../LICENSE)
