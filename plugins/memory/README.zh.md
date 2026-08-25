<h1 align="center">dsh-memory</h1>

<p align="center"><b>设置 → 记忆：跨会话还能想起来的长期笔记。</b></p>

<p align="center">
  召回 · 搜索 · 图谱 · 记住 · 从 Cursor、Claude Code、Codex 等导入
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh.md">中文</a> ·
  <a href="https://github.com/kedoupi/xiaotaozi-dsh">xiaotaozi-dsh</a> ·
  <a href="NOTICE">NOTICE</a>
</p>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/topic-dsh--plugin-0ea5e9?style=flat-square" alt="dsh-plugin"></a>
  <img src="https://img.shields.io/badge/engine-Noema-64748b?style=flat-square" alt="Noema">
  <img src="https://img.shields.io/badge/dsh-0.1.1--rc.2-4176e6?style=flat-square" alt="DeepSeek Harness 0.1.1-rc.2">
</p>

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件。占用设置 → **记忆**（三个 Tab：对话中使用、已记下的内容、从其他工具导入）。模型侧是 Noema 的 `noema_*` 工具。

引擎是 [Noema](https://github.com/ZSeven-W/noema)（`noema-mcp`），和 [dsh-noema](https://github.com/ZSeven-W/dsh-noema) 同一套。这个包是 DSH 接线和中文设置页。平台二进制来自 `@zseven-w/dsh-noema-<platform>` 可选依赖。见 [NOTICE](NOTICE)。

属于 [`xiaotaozi-dsh`](https://github.com/kedoupi/xiaotaozi-dsh) monorepo。不要对仓库根目录执行 `dsh plugin add`。

## 特性

- **日常在对话里。** 「记住这个项目用 pnpm」→ `noema_remember`。新开一轮应调用 `noema_recall`。
- **设置页给人管。** 搜索、添加、删除，以及从 Cursor / Claude Code / Codex 等导入。
- **文件可检查。** `noemaRoot` 为空则用 `~/.agent-memory`。要跟 harness home 走，在设置里把记忆根目录设成 `$DSH_HOME/plugins/memory`。

## 安装

```bash
dsh plugin --profile web add github:kedoupi/xiaotaozi-dsh#path:plugins/memory
dsh web
```

可选平台包需要能装上，`bundled` 才能找到 `noema-mcp`。改完源码要重新 `build`，并重启正在跑的 `dsh`。

## 配置

可调值在插件 Config 上（`dump-config` 层 `# == dsh-memory`）。设置页还会在上面叠一层 `$DSH_HOME/plugins/memory/settings.json`。

| 字段 | 默认 | 含义 |
| :-- | :-- | :-- |
| `enabled` | `true` | 工具总开关 |
| `command` | `bundled` | `noema-mcp` 启动命令；`bundled` 用可选原生包 |
| `noemaRoot` | 空 | `NOEMA_ROOT`；空则用 `~/.agent-memory` |
| `guidance` | `true` | 是否注入系统提示词 |
| `recallBudgetTokens` | `1200` | 默认召回包大小 |
| `keepAlive` | `true` | MCP 子进程退出后自动拉起 |

## 开发

在 monorepo 根目录：

```bash
pnpm --filter dsh-memory test
pnpm --filter dsh-memory build
node scripts/link-plugin.mjs --profile web memory
pnpm dev
```

挂的是仓库 `.dsh-home`（端口 3081），不是日常 `~/.dsh`。

## 文档

| 文档 | 什么时候看 |
| :-- | :-- |
| [流程](../../docs/workflow.zh.md) | 创建、安装、优化、提交 |
| [规范](../../docs/conventions.zh.md) | 包身份、两套 home |
| [NOTICE](NOTICE) | Noema / dsh-noema 的 MIT 归属 |
| [dsh-plugins](../../README.zh.md) | 整个 monorepo |

## License

[MIT](../../LICENSE)
