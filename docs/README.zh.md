# 文档地图

[English](README.md) | 中文

一次只打开一层。不要把另一层的表格抄过来。两份文件打架时，以**规范**为准，并在同一次改动里修另一份。

| 层 | 文件 | 读者 | 写什么 |
| --- | --- | --- | --- |
| 对外产品 | [`README.md`](../README.md) · [`README.zh.md`](../README.zh.md) | GitHub 上的用户 | 是什么、怎么装 `xtz`、插件表、截图 |
| 参与贡献 | [`CONTRIBUTING.md`](../CONTRIBUTING.md) · [`CONTRIBUTING.zh.md`](../CONTRIBUTING.zh.md) | 在本仓库干活的人 | 克隆、日常循环、门禁、改动放哪 |
| 规范 | [`conventions.md`](conventions.md) · [`conventions.zh.md`](conventions.zh.md) | 所有人 | 事实：家目录、Git（`main` + tag，不用 Git Flow）、包身份、CLI 合同、版本、市场目录 |
| 产品 changelog | [`CHANGELOG.md`](../CHANGELOG.md) | 用户和维护者 | 每个 `vX.Y.Z` 发了什么 |
| 步骤 | [`workflow.md`](workflow.md) · [`workflow.zh.md`](workflow.zh.md) | 人和 Agent | 怎么做：创建、安装、提交、发布、并行 checkout |
| Agent 规则 | [`AGENTS.md`](../AGENTS.md) | Agent | 只写硬性规则，不写教程 |
| Agent 技能 | [`.grok/skills/`](../.grok/skills) | Agent | 按任务分流；指向规范和步骤，不替代它们 |
| 内部草稿 | [`NOTES.md`](../NOTES.md) | 维护者 | 工作笔记。不是合同，不是对外文档 |
| CLI 产品 | [`apps/cli/README.zh.md`](../apps/cli/README.zh.md) | `xtz` 用户 | 命令列表和安全边界 |
| 插件用户文档 | `plugins/<slug>/README.zh.md` | 该插件的用户 | 占用哪一页、怎么用 |
| 插件 PRD / 设计 | `plugins/<slug>/docs/` | 产研 | 已实现行为。延期的必须标延期 |
| UI 设计系统 | [`design-system/xiaotaozi-dsh/MASTER.md`](../design-system/xiaotaozi-dsh/MASTER.md) | 产品、设计、前端 | 统一的视觉、交互、无障碍和响应式合同 |

## 改了什么就改哪份

| 你改了… | 要更新 |
| --- | --- |
| 硬性规则（家目录、拒绝的命令、没有 Desktop、SemVer、Git） | `AGENTS.md` **和** `docs/conventions.zh.md`（中英一起） |
| 分支 / worktree / Git Flow | [conventions.zh.md](conventions.zh.md)「Git」**和** [workflow.zh.md](workflow.zh.md)「开发环境」（中英一起） |
| 一次产品发布 | `CHANGELOG.md`、`versions.json` 的 `cliApp`、git tag；步骤：[workflow.zh.md](workflow.zh.md)「发一枪产品快照」 |
| `xtz` 怎么上 npm | [conventions.zh.md](conventions.zh.md)「版本」（Trusted Publisher 身份）**和** [workflow.zh.md](workflow.zh.md)「发一枪」 |
| 如何创建 / 安装 / 提交 | `docs/workflow.zh.md`（中英一起） |
| 沙箱持续监控 | [conventions.zh.md](conventions.zh.md)「家目录」**和** [workflow.zh.md](workflow.zh.md)「沙箱持续监控」（中英一起）；`AGENTS.md`。保活是硬要求，journey grep 不能代替。 |
| 安装命令、插件表、对外叙事 | 根目录 `README.md` / `README.zh.md` |
| `xtz` 开关或禁用命令 | `apps/cli/README.zh.md` **和** 规范里的 `xtz` CLI |
| 插件对用户可见的行为 | 该插件的 README 成对文件；产品合同变了再改 PRD |
| Agent 分流（用哪个 skill） | `.grok/skills/*/SKILL.md` — 保持短 |
| 自研插件 Web UI | `design-system/xiaotaozi-dsh/MASTER.md` 和受影响的插件 UI |
| 营销官网 UI | `apps/website/DESIGN.md` 和受影响的官网 UI |

## 工程目录

```text
README.md           对外产品
CONTRIBUTING.md     贡献入口
AGENTS.md           Agent 硬性规则
NOTES.md            内部草稿
docs/               规范 + 步骤 + 本地图
apps/cli/           用户产品 xtz — 独立 workspace
apps/website/       对外网站 — 独立 workspace
plugins/<slug>/     一个自研可安装包
plugins/market/     市场界面；第三方是目录行
templates/          pnpm new 骨架
design-system/      自研 UI 合同和视觉参考
scripts/            new / link-plugin / 沙箱 / 门禁 / doctor
.grok/skills/       Agent 技能
.dsh-home/          gitignore 的沙箱 home（3081）
```

没有 `apps/desktop/`。历史在 git 标签 `archive/desktop`。没有 `packages/`，也没有 `externals/`。
