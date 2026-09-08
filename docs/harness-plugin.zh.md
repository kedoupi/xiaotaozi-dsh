# Harness 插件文档（本仓库 vs 上游）

[English](harness-plugin.md) | 中文

本页只写 **差异**。Cordis 和 Harness 插件 API 在 DeepSeek Harness 官方文档里。本仓库不 vendor `deepseek-harness`，也不抄那些教程。包身份、家目录、布局和门禁见 [conventions.zh.md](conventions.zh.md)。怎么创建 / 安装见 [workflow.zh.md](workflow.zh.md)「创建」。

官方页面和已钉死的 `@deepseek-ai/*` 包打架时，以 `versions.json` 的 `dshRc`（当前 `0.1.2-rc.1`）为准。

## 官方文档（读，不要抄）

| 需求 | English | 中文 |
| --- | --- | --- |
| 第一个 Harness 插件（`apply`、`inject`、`ctx.effect`） | [Your first plugin](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/) | [第一个插件](https://deepseek-harness.github.io/deepseek-harness/develop/basic/) |
| Fiber 生命周期、HMR、dispose | [Plugins and lifecycle](https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/) | [插件与生命周期](https://deepseek-harness.github.io/deepseek-harness/develop/framework/) |
| Cordis 概念（`ctx`、服务、事件） | [Cordis primer](https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-primer) | [Cordis 入门](https://deepseek-harness.github.io/deepseek-harness/reference/cordis-primer) |
| Cordis 动手（在 harness 仓库的临时目录里） | [Cordis tutorial](https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/) | [Cordis 教程](https://deepseek-harness.github.io/deepseek-harness/develop/cordis-tutorial/) |
| 工具 DSL | [Build a tool](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/tool) | [开发工具](https://deepseek-harness.github.io/deepseek-harness/develop/basic/tool) |
| 插件配置 | [Plugin configuration](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/config) | [插件配置](https://deepseek-harness.github.io/deepseek-harness/develop/basic/config) |

Cordis 教程和「第一个插件」默认你在 **harness 的 checkout** 里干活。只拿它们看 API 形状。

## 官方「第一个插件」路径不要照做

| 官方教程 | 本仓库 |
| --- | --- |
| 克隆 `deepseek-harness`；`mkdir scratch-plugin` | 不克隆、不 vendor harness。`pnpm new <slug>` → `plugins/<slug>/` |
| overlay 里写 `src/*.ts` 的绝对路径 | profile 加载 `lib/`。Git 安装是 `#path:plugins/<slug>`。`prepare` / `tsdown` 留在插件包内 |
| `pnpm dsh web --patch …` 开在 **3080** | 在独立主题 worktree 中开发。实时沙箱只在干净主干 hub 或有界移交期间使用 `link-plugin` + `pnpm dev` → `xtz --sandbox` **3081**。绝不抢正式 3080 |
| `node --import tsx` / 不构建 | 构建 `lib/`。`@deepseek-ai/*` 保持 external（`deps.neverBundle: true`） |
| `import { … } from '@deepseek-ai/dsh-tools'` | 不要 value-import `dsh-tools`。在 `ctx.tools` 上注册普通 tool 对象 |
| 手写 overlay 的 `id` / 文件路径 | 四个名字对齐：目录、`package.json` `name`、`cordis.patch.yml` `name`、patch `id` |
| 在 harness 树里写配置示例 | 插件导出 Schemastery `Config` |

## 插件中心组合

`dsh-market` 在 `shell.overlay` 下注册 `PluginCenterHost`，声明 child `xiaotaozi.plugin-center.detail` 为 `{ kind: "keyed", scope: "root" }`。只有该父组件 props 的 `renderSlot` 获准分派其声明的详情，即使详情通过主区域 portal 渲染也一样。不要调用 ctx 级 non-root `renderSlot`，也不要替换整个 conversation slot。

贡献者使用 `key`（不是 list 的 `id`）注册：`xiaotaozi`、`side-workbench`、`models` 或 `im`。各包保留本地类型声明、原 inject face 和 Host API。不 import sibling 源码，不建共享 workspace 包；Git path 安装必须自包含。

`dsh-xtz-ui` 的 Settings 隐藏兼容层固定于 **DSH 0.1.2-rc.1**。每次 RC 升级都必须重验 modal/nav selector、旧选中项重定向和恢复行为。它隐藏过时的第一方/技术导航而不隐藏通用偏好；**设置 → 高级** 仍绑定原设置 namespace 和 credentials domain。上游提供正式 hide/replace 合同后删除 DOM 兼容层，不 fork Harness。

## 官方页没写、我们反复踩的坑

- 孤立的 Git `#path:plugins/<slug>` 必须能在没有本 monorepo 的情况下 `prepare`（`pnpm check:path`）。
- 主题 worktree 常态只跑确定性门禁，不占 **3081**。在干净主干 hub 或有界移交期间，`pnpm dev` 重编 `lib/`，Host 产物变了才在 :3081 重启；Client 的 `lib/client.js` 走 Host HMR（界面没更新就硬刷新）。
- `pnpm dev` 下的 `process.cwd()` 是本 checkout。接入后再做落盘工作的插件，要等用户确认目标（[conventions.zh.md](conventions.zh.md)「接入与第一次真实工作」）。
- 两套 home。插件源码留在自己的独立主题 worktree；`link-plugin` 写该 checkout 的 `.dsh-home`，实时 **3081** 常态归干净主干 hub。不要把本仓库 `link:` 进 `~/.dsh`。
- Cordis Client `inject` 只写 `"remote"` 不能访问 `remote.settings` / `remote.llm` / `remote.credentials`。官方 Models 页把这四项都声明了。缺一项会抛 `cannot get property "remote.settings" without inject`，SPA 显示 Failed to load plugins。
- DSH 0.1.2 的 `ctx.remote` Typert 方法是 `listConfigurableProviders`、位置参数 `discoverModels(ns, request)`、`settings.describe()`、`credentials.describe(refs)`，返回 `{ok,value}` —— 不是 `llm.providers({})` / `{result:{ok,…}}`。对不存在的方法做 `.bind` 会把整个 Client apply 打挂。Host identity 200 不证明 SPA 已加载。

同一类上游 vs 我们的坑重复出现时，再往这里加一行。不要把 Cordis API 表贴进本文件。
