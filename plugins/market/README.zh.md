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

- 侧栏「新会话」下方唯一的 **插件中心** 入口，占用会话主区域。
- 精选第三方插件目录，支持搜索、标签筛选和每个插件的详情。
- **插件中心 → 已安装** 展示内置能力和第三方顶层依赖；**发现插件** 将目录条目安装进当前 profile。

## 插件中心

打开 **新会话** 下方的 **插件中心**。它占用会话主区域，侧栏和右侧工作台保持可用。
默认打开 **已安装**，内置能力为小桃子功能、侧边工作台、模型和 IM 机器人。
**发现插件** 使用精选目录。外部安装的顶层插件也会出现在已安装列表里，确认后可以移除。
移除包不承诺删除其凭据、会话或已保存数据。

运行参数位于 **设置 → 高级**。技术 Loader 清单不是用户设置页；故障诊断使用 `xtz doctor`。

用标题栏关闭按钮或 Escape 返回会话。详情中的 **返回** 留在主区域内，并保留搜索、筛选和列表位置。嵌套确认框优先处理 Escape，绝不会因此确认移除。

## 功能截图

**插件中心迁移前示例：** 以下截图展示已退役的市场布局，不代表插件中心。替换截图待浏览器验收后补充。

![市场目录：搜索、标签页与插件卡片](docs/catalog.webp)

![插件详情：版本、来源与安装规格](docs/plugin-detail.webp)

## 目录与详情

目录就是 `MARKET_PLUGINS` —— 目前三行精选：

| 插件 | 是什么 |
| :-- | :-- |
| Agent Teams | 队长 + 可续成员的多 Agent 协作（NanmiCoder） |
| 会话上下文 | 组成条、历史、事件和 /context（bowenliang123） |
| OpenContext | 时序记忆图谱与自动召回（melandlabs） |

搜索匹配名称、简介和标签；标签 chip 过滤卡片网格。**查看详情** 打开详情视图，展示简介、目录版本、来源和安装规格。已安装清单不会借用目录版本：仅凭依赖请求无法确定磁盘实际解析出的版本。

### 兼容性检查点（2026-09-09，DSH 0.1.2-rc.1）

- **Context：** 目录固定为 `dsh-context@0.46.0`，显示 `0.46.0`，不再跟随浮动 npm 标签。已只读检查发布入口、Apache-2.0 许可和 RC1 peer 声明；它仍只是候选，不代表安装、激活或功能已验收。既有精确 npm/Git 身份仍能识别 profile 别名。
- **Agent Teams：** 发布的 `0.1.15` 与 `0.1.16-rc.1` 都声明 Client `inject: ["uiConversation", …]`，会被本仓库现有入口门禁拒绝。RC1 源码确实包含 `uiConversation` 服务；服务存在或预发布版本声明 RC1 peer 都不能证明实际组合、激活成功。兼容性未确定前门禁保持不变，保留目录条目不等于认证可用。
- **OpenContext：** `0.3.2` 声明较旧的 `^0.1.1-rc.2` Harness peers，记忆库依赖仍浮动。本地后端涉及 SQLite/native 与 embedding 前提；HTTP 后端可选，不是必需的新服务，也不是在此获准的替代方案。仅词法回退不证明宣传的记忆图谱、搜索与自动召回。

三个插件都仍需真实安装 → 激活 → 宣传功能 → 刷新/重启证据：Context 组成、历史、事件与 `/context`；Teams 成员派发、结果及续聊；OpenContext 一次性测试事实的捕获、后续召回及重启持久化。执行前必须检查确切传递版本、原生脚本、存储/项目范围、模型/后端要求及任何账户/服务授权。不要仅为消除错误就放行构建脚本。隔离和「已安装」标记均不能代替这些功能检查。

`plugins/` 自研包在第一次 `xtz start` 时种上。已安装展示四个内置能力而非包清单；不能在此启停或移除。

## 安装状态

目录卡片只有在当前 profile 同时具备依赖、`dsh.profile.bundles` 成员和已检查的入口文件时才显示 **已安装**；这不证明运行时激活或宣传功能已可用。不完整安装显示部分状态，可在「发现插件」检查后修复；「已安装」保留按真实包名明确移除的入口。缺少验证不等于成功，状态仅属于当前 profile。

失败或未验证的操作保留错误和当前状态。市场不会自动移除插件来回滚：pinned 命令会协调整个 profile，无法保证只回滚目标及保全数据。操作已应答不代表完成，应先检查并刷新，再决定下一次变更。构建拒绝和未决定的 `allowBuilds` 保持不变；子进程输出不会提升脚本信任，也不会触发自动构建重试。

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
