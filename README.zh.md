<h1 align="center">xiaotaozi-dsh</h1>

<p align="center">
  <a href="plugins/providers"><img src="plugins/providers/docs/ip.jpg" width="72" height="72" alt="dsh-providers"></a>
  <a href="plugins/memory"><img src="plugins/memory/docs/ip.jpg" width="72" height="72" alt="dsh-memory"></a>
  <a href="plugins/im"><img src="plugins/im/docs/ip.jpg" width="72" height="72" alt="dsh-im"></a>
  <a href="plugins/hello"><img src="plugins/hello/docs/ip.jpg" width="72" height="72" alt="dsh-hello"></a>
  <a href="plugins/sidebar"><img src="plugins/sidebar/docs/ip.jpg" width="72" height="72" alt="dsh-sidebar"></a>
  <a href="plugins/market"><img src="plugins/market/docs/ip.jpg" width="72" height="72" alt="dsh-market"></a>
  <a href="plugins/agent-teams"><img src="plugins/agent-teams/docs/ip.jpg" width="72" height="72" alt="dsh-agent-teams"></a>
  <a href="plugins/context"><img src="plugins/context/docs/ip.jpg" width="72" height="72" alt="dsh-context"></a>
</p>

<p align="center"><b>小桃子 DSH：Desktop + xtz CLI 两个主产品，共用一套 DeepSeek Harness 插件能力。</b></p>

<p align="center">
  <b>dsh-providers</b> · <b>dsh-memory</b> · <b>dsh-im</b> · <b>dsh-wecom-office</b> · <b>dsh-hello</b> · <b>dsh-sidebar</b> · <b>dsh-market</b> · <b>dsh-agent-teams</b> · <b>dsh-context</b>
</p>

<p align="center">
  设置 → <b>模型</b> · <b>小桃子</b> · <b>记忆</b> · <b>企业微信办公</b> · 侧栏 → <b>IM机器人</b> · <b>小桃子市场</b>
</p>

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
  <img src="https://img.shields.io/badge/dsh-0.1.1--rc.2-4176e6?style=flat-square" alt="DeepSeek Harness 0.1.1-rc.2">
</p>

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 从 Git 或 npm 装插件。本仓库是 **xiaotaozi-dsh**：两个主产品是 [`apps/desktop/`](apps/desktop/) 的 Mac 客户端，以及 [`apps/cli/`](apps/cli/) 的 `xtz` 命令；`plugins/` 是两者共用的能力层。根目录不是插件，不要对它执行 `dsh plugin add`。

出了问题，或还缺某个插件？[提个 issue](https://github.com/kedoupi/xiaotaozi-dsh/issues)。

## 特性

- **两个入口，同一套正式环境。** 用户使用 Desktop；熟悉终端和配置的人也可以用 `xtz`。当前 CLI 只读检查由 Desktop 管理的 `~/.dsh` / 3080；生命周期和任务命令要等共享安全能力落地。双持不改变插件所有权。
- **一个包做一件事。** 模型、记忆、IM 聊天、企业微信办公、市场、小桃子工作台各自安装。Git 安装一律是 `github:kedoupi/xiaotaozi-dsh#path:plugins/<slug>`。第一刀 Desktop 种子仍是 hello / sidebar / providers / memory / im；市场、企业微信办公、agent-teams、context 是额外安装。
- **界面中文，默认英文文档。** 小桃子插件给用户看的文案是中文。对外 README 默认英文，中文在 `README.zh.md`。
- **两套家目录。** 测试走测试，正式走正式。改插件和 `pnpm tauri dev` 用 `.dsh-home`（`pnpm dev`，3081）。已安装的小桃子DSH.app 走 `~/.dsh`（3080）。不要混。
- **默认 Host，有 UI 再 mixed。** `pnpm new` 默认 host。只有设置页、Slot、主题才加 `src/client`。
- **Git 路径安装在用户机器上构建。** 每个插件把 `prepare` / `tsdown.config.ts` 留在包内，这样 `github:…#path:plugins/<slug>` 不必依赖整个 workspace 也能编过。

## `xtz` CLI

第一版 `xtz` 是只读安全基础，运行时精确固定为 Node.js `22.19.0` 和 DSH `0.1.1-rc.2`。用 npm、bun 或安装脚本装（它们只负责装包，运行仍是 Node）：

```bash
curl -fsSL https://raw.githubusercontent.com/kedoupi/xiaotaozi-dsh/main/apps/cli/scripts/install.sh | sh
npm install -g xiaotaozi-dsh-cli
bun add -g xiaotaozi-dsh-cli
xtz --help
xtz version
xtz status
xtz config path
xtz plugin list
xtz doctor
```

在 Desktop 与 CLI 共用可信的跨进程 supervisor、经过认证的实例归属和加锁的 profile 事务边界之前，`start`/`web`、`open`、`run`/`ask`、`config dump`/`defaults`、`stop`、`update` 全部禁用。现有 v1 端点只证明产品兼容的健康状态，不能授权 CLI 做变更。因此 CLI 首版也不承诺与 Desktop/Web 等价的 headless 能力。完整命令和安全边界见 [`apps/cli/README.zh.md`](apps/cli/README.zh.md)。

## 插件

| | 包 | 占用 | 做什么 |
| :-- | :-- | :-- | :-- |
| <img src="plugins/providers/docs/ip.jpg" width="48" height="48" alt=""> | [`dsh-providers`](plugins/providers) | 设置 → **模型** | 官方订阅登录和 API Key 同一页，对话只显示勾选过的模型。[EN](plugins/providers/README.md) · [中文](plugins/providers/README.zh.md) |
| <img src="plugins/memory/docs/ip.jpg" width="48" height="48" alt=""> | [`dsh-memory`](plugins/memory) | 设置 → **记忆** | Noema 长期召回、图谱搜索、记住，以及从其他编程工具导入。[EN](plugins/memory/README.md) · [中文](plugins/memory/README.zh.md) |
| <img src="plugins/im/docs/ip.jpg" width="48" height="48" alt=""> | [`dsh-im`](plugins/im) | 侧栏「新会话」下方 → **IM机器人** | 九个聊天渠道和实验性 AI Office 连接器。企业微信**聊天**在这里；企业微信**办公**是 `dsh-wecom-office`。[EN](plugins/im/README.md) · [中文](plugins/im/README.zh.md) |
| | [`dsh-wecom-office`](plugins/wecom-office) | 设置 → **企业微信办公** | 通过官方 `wecom-cli` 接日程、文档、会议、通讯录、表格、待办、微盘。聊天仍走 `dsh-im`。不进第一刀 Desktop 种子。[EN](plugins/wecom-office/README.md) · [中文](plugins/wecom-office/README.zh.md) |
| <img src="plugins/hello/docs/ip.jpg" width="48" height="48" alt=""> | [`dsh-hello`](plugins/hello) | 设置 → **小桃子** | 品牌壳、归档、任务看板、Git 图谱，以及功能开关。[EN](plugins/hello/README.md) · [中文](plugins/hello/README.zh.md) |
| <img src="plugins/sidebar/docs/ip.jpg" width="48" height="48" alt=""> | [`dsh-sidebar`](plugins/sidebar) | 设置 → **Side card** | 右侧文件 / 编辑器 / Git / 终端。[EN](plugins/sidebar/README.md) · [中文](plugins/sidebar/README.zh.md) |
| <img src="plugins/market/docs/ip.jpg" width="48" height="48" alt=""> | [`dsh-market`](plugins/market) | 侧边栏 → **小桃子市场**（新会话下方） | 浏览插件与工作流包、管理来源，安装请求交给桌面端执行。[EN](plugins/market/README.md) · [中文](plugins/market/README.zh.md) |
| <img src="plugins/agent-teams/docs/ip.jpg" width="48" height="48" alt=""> | [`dsh-agent-teams`](plugins/agent-teams) | 对话 + 活动面板 | 有名字的队长（默认张老板）和可续上的成员。从 NanmiCoder/dsh-agent-teams fork。[EN](plugins/agent-teams/README.md) · [中文](plugins/agent-teams/README.zh.md) |
| <img src="plugins/context/docs/ip.jpg" width="48" height="48" alt=""> | [`dsh-context`](plugins/context) | 对话 **上下文** Tab | 组成、历史、事件、`/context`。从 bowenliang123/dsh-context fork。[EN](plugins/context/README.md) · [中文](plugins/context/README.zh.md) |

## 关联（git submodule）

只读的上游 pin。我们 fork 进 `plugins/`，**只装 fork**。不打算 fork 并安装的项目不要加 submodule。不要对 `externals/` 跑 `link-plugin` 或 `dsh plugin add`。克隆时加 `--recurse-submodules`，或事后 `git submodule update --init`。规范：[docs/conventions.zh.md](docs/conventions.zh.md)「Externals」。

作者有更新：`git submodule update --remote externals/<name>`，对照 `plugins/<slug>/src`，把要的改动迁进 fork。不要 `#path:externals/…`。

| 检出 | 上游 | 我们的 fork（真正要装的） |
| :-- | :-- | :-- |
| [`externals/dsh-agent-teams`](externals/dsh-agent-teams) | [NanmiCoder/dsh-agent-teams](https://github.com/NanmiCoder/dsh-agent-teams) | [`plugins/agent-teams`](plugins/agent-teams)（`dsh-agent-teams`） |
| [`externals/dsh-context`](externals/dsh-context) | [bowenliang123/dsh-context](https://github.com/bowenliang123/dsh-context) | [`plugins/context`](plugins/context)（`dsh-context`） |

## 安装

选一个包装，不要装仓库根目录。

**先选安装模式。** 下面的 Git 路径命令是给 Node / 开发沙箱用的（`.dsh-home`、端口 3081）。正式 `~/.dsh` / 3080 的桌面产品线不要用 GitHub、npm 或 `link:` 安装；桌面端使用内置插件和验签后的插件包。

**第一步 — 把一个插件加到沙箱的 `web` profile。**

```bash
dsh plugin --profile web add github:kedoupi/xiaotaozi-dsh#path:plugins/providers
dsh web
```

**第二步 — 打开这个插件占用的页面或入口。** 模型：**设置 → 模型**；记忆：**设置 → 记忆**；工作台：**设置 → 小桃子**；侧栏：**设置 → Side card**；IM：侧栏 **新会话** 下方 → **IM机器人**；企业微信办公：**设置 → 企业微信办公**；市场：侧栏 **新会话** 下方 → **小桃子市场**；Agent Teams：对话和活动面板；Context：会话 **上下文** Tab 或 `/context`。欢迎弹框由工作台插件管理。

每个插件都是这种 Git 路径：

```text
github:kedoupi/xiaotaozi-dsh#path:plugins/<slug>
```

| 目录 | 安装路径 |
| :-- | :-- |
| `providers` | `github:kedoupi/xiaotaozi-dsh#path:plugins/providers` |
| `memory` | `github:kedoupi/xiaotaozi-dsh#path:plugins/memory` |
| `im` | `github:kedoupi/xiaotaozi-dsh#path:plugins/im` |
| `wecom-office` | `github:kedoupi/xiaotaozi-dsh#path:plugins/wecom-office` |
| `hello` | `github:kedoupi/xiaotaozi-dsh#path:plugins/hello` |
| `sidebar` | `github:kedoupi/xiaotaozi-dsh#path:plugins/sidebar` |
| `market` | `github:kedoupi/xiaotaozi-dsh#path:plugins/market` |
| `agent-teams` | `github:kedoupi/xiaotaozi-dsh#path:plugins/agent-teams` |
| `context` | `github:kedoupi/xiaotaozi-dsh#path:plugins/context` |

公开仓库请带 GitHub topic [`dsh-plugin`](https://github.com/topics/dsh-plugin)。改完源码要重新 `build`，并重启正在跑的 `dsh`。

## 用法

装好之后从对应页面用（模型 / 记忆 / 小桃子 / Side card / 企业微信办公走设置，IM 和市场走侧栏「新会话」下方，记忆和办公还可以在对话里用）。`dsh plugin add` 之后没有额外命令。

| 你想… | 安装 | 然后 |
| :-- | :-- | :-- |
| 登录 Codex / Claude / Grok / 通义灵码 / Kimi，或存 API Key | `dsh-providers` | 设置 → **模型** |
| 让模型跨会话还能想起来 | `dsh-memory` | 对话里说「记住……」，或设置 → **记忆** |
| 从飞书、微信、Slack 等跟本机 Harness 说话 | `dsh-im` | 侧栏「新会话」下方 → **IM机器人** |
| 让模型用企业微信日程、文档和会议 | `dsh-wecom-office` | 设置 → **企业微信办公**；`PATH` 上要有 `wecom-cli` |
| 浏览插件和工作流包 | `dsh-market` | 侧栏「新会话」下方 → **小桃子市场**；搜索/筛选后排队安装或移除 |
| 打开或关闭小桃子壳功能 | `dsh-hello` | 设置 → **小桃子** |
| 用右侧文件 / Git / 终端面板 | `dsh-sidebar` | 设置 → **Side card** |
| 让张老板带队干活 | `dsh-agent-teams` | 对话，或 `/agent-teams <目标>` |
| 看模型窗口里现在有什么 | `dsh-context` | 会话 **上下文** Tab，或 `/context` |

## 截图

Web 打开时的欢迎弹框，点确定关掉。

![小桃子 DSH 欢迎弹框](plugins/hello/docs/welcome.png)

设置 → 模型：左侧已接上的服务商，右侧登录或填密钥。

![设置 → 模型](plugins/providers/docs/models.jpg)

还没接上的服务商在「添加服务商」。

![添加服务商](plugins/providers/docs/add-provider.jpg)

侧栏「新会话」下方 → IM机器人：扫码、贴 App Manifest，或填机器人凭据。

![侧栏 → IM机器人](plugins/im/docs/imbot.png)

## 结构

```text
plugins/<slug>/     可发布的插件，包名 dsh-<slug>
apps/desktop/       小桃子DSH Tauri 客户端（不是 pnpm workspace 成员）
apps/cli/           xtz CLI（独立、可发布的 pnpm workspace）
externals/          上游插件的 git submodule（不进 pnpm workspace）
templates/          `pnpm new` 用的 host / mixed 模板
scripts/            new / link-plugin / 沙箱启动 / manifest / path-install / doctor
docs/               规范 + 流程
apps/website/       独立的 VitePress 官网 workspace
.dsh-home/          gitignore 掉的沙箱 Harness 家目录（端口 3081）
```

根包不要声明 `dsh.bundle` 或 `dsh.profile`。
dsh RC、Node、Python、pnpm、桌面应用和 CLI 版本只有一个机器可读规范源：[`versions.json`](versions.json)。各清单仍写普通字面值，不让 `package.json` 动态引用 JSON；`pnpm check` 负责拒绝漂移。

| | 官网 / 用户桌面端 | 沙箱 |
| :-- | :-- | :-- |
| 家目录 | `~/.dsh` | `<仓库>/.dsh-home`（gitignore） |
| 命令 | 小桃子DSH.app 或正式 `dsh web`；首版 `xtz` 仅只读检查 | `pnpm dev` |
| 端口 | **3080** | **3081** |
| 插件 | 第一次启动拷预打好的 tarball | `link:` 到本仓库 |

| 要做什么 | 用哪套 |
| :-- | :-- |
| 改插件源码、设置页、`link-plugin`、debug `pnpm tauri dev` | 沙箱 **3081** |
| pack 落地、公证、已安装的小桃子DSH.app | 正式 `~/.dsh` **3080** |
| 发出去的 `.dmg` | 正式 `~/.dsh` **3080** |

`pnpm tauri dev` 只在 debug（沙箱 **3081**）。release 绝不探 3081。不要在已安装的小桃子DSH.app 里验证 `link:` 的插件。`link-plugin` 和 `pnpm dev` 会把 `DSH_HOME` 设成 `.dsh-home`。不要把工作区插件挂到 `~/.dsh`。`pnpm check-home`（`node scripts/doctor.mjs`）只诊断并列出误挂项，绝不自动编辑 profile 或修复。

## 开发

规范：[docs/conventions.zh.md](docs/conventions.zh.md)。步骤：[docs/workflow.zh.md](docs/workflow.zh.md)。硬性规则：[AGENTS.md](AGENTS.md)。和我一起开发时走 `/dsh-plugin`。

需要 Node.js `>= 22.19`，以及全局 CLI `@deepseek-ai/dsh@0.1.1-rc.2`（`@next`）。先克隆：

```bash
git clone --recurse-submodules https://github.com/kedoupi/xiaotaozi-dsh.git
cd xiaotaozi-dsh
pnpm install
```

克隆后先安装依赖，再运行任何构建或检查。

| 门禁 | 保证什么 |
| :-- | :-- |
| `pnpm check` | 版本/文档/清单策略、类型检查、插件测试和脚本测试；不证明已经生成 `lib/` |
| `pnpm check:build` | 构建全部插件，再强制检查生成的 `lib/`，保证 Git path 安装所需产物安全 |
| `pnpm check:path` | 按隔离的 Git `#path:` 形态安装每个插件并验证包内自构建 |
| `pnpm check:desktop` | 桌面脚本测试、前端构建、Rust 格式/lint/测试/check；不发布，也不生成正式安装包 |
| `pnpm check:cli` | 独立安装、类型检查、构建并测试 `apps/cli`；不启动正式服务 |

```bash
pnpm new greet                 # 或：pnpm new sidebar --kind mixed
# 把 greet 样例换成真实逻辑，然后：
pnpm --filter dsh-greet test
pnpm --filter dsh-greet build
node scripts/link-plugin.mjs --profile dsh-dev greet
pnpm check-home   # 日常 ~/.dsh 不能挂本仓
```

要在 Web UI 里用：挂到沙箱的 `web`，再 `pnpm dev`（端口 3081）。改插件时不要对 `~/.dsh` 跑 `dsh web`。`pnpm tauri dev` 走同一套沙箱 :3081。

```bash
node scripts/link-plugin.mjs --profile web <slug>
pnpm dev   # 只停验证为本仓启动的 :3081，再监视插件；未知监听者会拒绝启动
```

## 文档

| 文档 | 什么时候看 |
| :-- | :-- |
| [规范](docs/conventions.zh.md) | 包身份、两套 home、各项检查查什么 |
| [流程](docs/workflow.zh.md) | 创建、安装、优化、提交 |
| [AGENTS.md](AGENTS.md) | 本仓库给 agent 的硬性规则 |
| [dsh-providers](plugins/providers/README.zh.md) | 模型设置页 |
| [dsh-memory](plugins/memory/README.zh.md) | 记忆工具和设置页 |
| [dsh-im](plugins/im/README.zh.md) | IM 机器人 |
| [dsh-wecom-office](plugins/wecom-office/README.zh.md) | 企业微信办公工具 |
| [dsh-market](plugins/market/README.zh.md) | 市场目录和排队安装请求 |
| [dsh-hello](plugins/hello/README.zh.md) | 小桃子壳 |
| [dsh-sidebar](plugins/sidebar/README.zh.md) | 右侧文件 / Git / 终端 |
| [dsh-agent-teams](plugins/agent-teams/README.zh.md) | 有名字的队长和成员 |
| [dsh-context](plugins/context/README.zh.md) | 上下文 Tab 和 `/context` |
| [externals/dsh-agent-teams](externals/dsh-agent-teams) | 上游 pin（不要装） |
| [externals/dsh-context](externals/dsh-context) | 上游 pin（不要装） |

## License

[MIT](LICENSE)
