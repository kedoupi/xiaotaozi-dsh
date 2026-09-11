<p align="right"><a href="./README.md">English</a> · <strong>中文</strong></p>

<h1 align="center">dsh-market</h1>

<p align="center">
  <img src="docs/ip-3d.jpg" width="160" height="160" alt="dsh-market icon">
</p>

<p align="center"><b>插件中心：内置配置、已安装插件与精选发现</b></p>

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

- 「新会话」下方左侧工具条上唯一的 **插件中心** 入口，占用会话主区域。
- 精选第三方插件目录，支持搜索、标签筛选和每个插件的详情。
- **插件中心 → 已安装** 展示内置能力和第三方顶层依赖；**发现插件** 将目录条目安装进当前 profile。

## 插件中心

从 **新会话** 下方的左侧工具条打开 **插件中心**。它占用会话主区域，侧栏和右侧工作台保持可用。
默认打开 **已安装**，内置能力为小桃子功能、侧边工作台、模型和 IM 机器人。
**发现插件** 使用精选目录。外部安装的顶层插件也会出现在已安装列表里，确认后可以移除。
移除包不承诺删除其凭据、会话或已保存数据。

运行参数位于 **设置 → 高级**。技术 Loader 清单不是用户设置页；故障诊断使用 `xtz doctor`。

用标题栏关闭按钮或 Escape 返回会话。详情中的 **返回** 留在主区域内，并保留搜索、筛选和列表位置。嵌套确认框优先处理 Escape，绝不会因此确认移除。

## 功能截图

![发现插件：搜索、标签与插件卡片](docs/catalog.webp)

![插件详情：版本、来源与安装规格](docs/plugin-detail.webp)

## 目录与详情

目录就是 `MARKET_PLUGINS` —— 目前三行精选：

| 插件 | 是什么 |
| :-- | :-- |
| Agent Teams | 一个队长带着可续上的队员，一起把复杂任务拆开做（NanmiCoder） |
| 会话上下文 | 会话里的组成条、历史和事件，需要时用 /context（bowenliang123） |
| OpenContext | 自动记住时间线上的要点，对话时再召回（melandlabs） |

搜索匹配名称、简介和标签；标签 chip 过滤卡片网格。**查看详情** 打开详情视图，展示简介、版本、来源和确切的安装规格。

`plugins/` 自研包在第一次 `xtz start` 时种上。已安装展示四个内置能力而非包清单；不能在此启停或移除。

## 安装状态

包已经成为当前 profile `package.json` 的依赖时，卡片显示 **已安装**；否则显示 **安装**。状态是 profile 级别的：装进 `web` profile 不会让别的 profile 显示已安装。

点击 **安装** 后使用启动当前 Host 的同一份 pinned DSH runtime，对当前 `DSH_HOME` 跑 `dsh plugin --profile web add`（正式 `~/.dsh` 或沙箱 `.dsh-home`）。不会调用 PATH 上的 `dsh`，也不会从 `#path:externals/…` 安装。

## 来源与边界

| 字段 | 默认值 | 含义 |
| :-- | :-- | :-- |
| `indexUrl` | `https://s.xiaotaozi.cc/dsh/packs/market.json` | 配置的官方索引 URL / 来源身份；当前不会在这里拉取 |
| `officialLabel` | `小桃子市场` | 官方源显示名 |
| `allowThirdPartySources` | `true` | 预留开关；远程来源目录尚未实现，因此添加来源仍 fail closed |

历史来源记录仍保存在 `$DSH_HOME/plugins/market/sources.json`；插件中心不提供来源管理界面。在远程拉取、验签和缓存合同明确前，新来源会收到明确的“尚未支持”响应。

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
