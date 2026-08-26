<p align="right"><a href="./README.md">English</a> · <strong>中文</strong></p>

<h1 align="center">dsh-market</h1>

<p align="center">
  <img src="docs/ip.jpg" width="160" height="160" alt="dsh-market icon">
</p>

<p align="center"><b>小桃子市场：浏览插件与工作流包，安装请求交给桌面端执行</b></p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh.md">中文</a> ·
  <a href="https://github.com/kedoupi/xiaotaozi-dsh">xiaotaozi-dsh</a>
</p>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/topic-dsh--plugin-0ea5e9?style=flat-square" alt="dsh-plugin"></a>
</p>

在侧边栏「新会话」正下方提供一级入口，点开全屏市场浮层，分为「市场」和「来源」两个 Tab：按来源列出插件与工作流包，支持搜索、标签筛选、详情页，以及「已安装 / 已排队」标记。面板只把安装 / 移除请求**排队**到 `$DSH_HOME/plugins/market/intents.json`；同一条目最新请求生效，最多保留 100 条。下载、验签、应用插件包由小桃子DSH桌面端负责。当前目录是 mock 假数据，桌面端对接后续落地。

当前阶段，配置的 `indexUrl` 只作为来源身份使用，插件不会自行拉取或验签。官方 mock 目录目前包含 `hello`、`providers`、`memory`、`im` 和工作流示例，不代表所有仓库插件都已上架。

属于 [`xiaotaozi-dsh`](https://github.com/kedoupi/xiaotaozi-dsh) monorepo。不要对仓库根目录执行 `dsh plugin add`。

## 配置

| 字段 | 默认值 | 含义 |
| :-- | :-- | :-- |
| `indexUrl` | `https://s.xiaotaozi.cc/dsh/packs/market.json` | 配置的官方索引 URL / 来源身份；当前不会在这里拉取 |
| `officialLabel` | `小桃子市场` | 官方源显示名 |
| `allowThirdPartySources` | `true` | 允许在面板中添加第三方源 |

用户添加的源保存在 `$DSH_HOME/plugins/market/sources.json`（仅 https；本机回环 http 供开发调试）。

## 安装

```bash
dsh plugin --profile <name> add github:kedoupi/xiaotaozi-dsh#path:plugins/market
```

## 文档

| 文档 | 什么时候读 |
| :-- | :-- |
| [Workflow](../../docs/workflow.zh.md) | 创建、安装、精简、提交 |
| [Conventions](../../docs/conventions.zh.md) | 包身份与两个 home |

## 许可证

[MIT](../../LICENSE)
