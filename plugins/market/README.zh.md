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

侧栏「新会话」正下方一级入口，打开全屏市场。目录就是 `MARKET_PLUGINS`（Agent Teams、会话上下文、OpenContext）。`plugins/` 自研包启动时种上，不在这里卖。

已装显示 **已安装**。未装显示 **安装**；点击后使用启动当前 Host 的同一份 pinned DSH runtime，对当前 `DSH_HOME` 跑 `dsh plugin --profile web add`（正式 `~/.dsh` 或沙箱 `.dsh-home`）。不会调用 PATH 上的 `dsh`，也不会从 `#path:externals/…` 安装。

属于 [`xiaotaozi-dsh`](https://github.com/kedoupi/xiaotaozi-dsh) monorepo。不要对仓库根目录执行 `dsh plugin add`。

## 配置

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

## 许可证

[MIT](../../LICENSE)
