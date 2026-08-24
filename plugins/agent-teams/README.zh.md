<h1 align="center">dsh-agent-teams</h1>

<p align="center"><b>有名字的队长，加上可续上的成员子代理。协议键仍是 <code>captain</code>。</b></p>

<p align="center">
  张老板 · 设计师 · 工程师 · 任务 · 活动面板
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
  <img src="https://img.shields.io/badge/dsh-0.1.1--rc.2-4176e6?style=flat-square" alt="DeepSeek Harness 0.1.1-rc.2">
</p>

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件，源码来自 [NanmiCoder/dsh-agent-teams](https://github.com/NanmiCoder/dsh-agent-teams)（MIT）。当前会话就是队长。邮箱和 `assignee=captain` 仍用协议键 `captain`。给人看的名字（默认 **张老板**）走配置。

属于 [`xiaotaozi-dsh`](https://github.com/kedoupi/xiaotaozi-dsh) monorepo。不要对仓库根执行 `dsh plugin add`。不要和 `@nanmicoder/dsh-agent-teams` 装在同一个 profile。

## 特性

- **队长显示名。** 配置 `captainName`（默认 `张老板`），界面和提示词用这个。
- **可选成员表。** 配了 `members`，建队时自动加人。空表：仍由模型按任务找角色。
- **活动面板。** 成员、任务、队长收件箱。

## 安装

```bash
dsh plugin --profile web add github:kedoupi/xiaotaozi-dsh#path:plugins/agent-teams
dsh web
```

profile 里如果已有 `@nanmicoder/dsh-agent-teams`，先卸掉。

## 配置

| 字段 | 默认 | 含义 |
| :-- | :-- | :-- |
| `captainName` | `张老板` | 队长显示名。路由仍是 `captain`。 |
| `members` | `[]` | 预设人设 `{ name, role? }`。非空则在 `agent_teams_create` 时加入。 |
| `stateDir` | `.agent-teams` | 会话工作区下的团队目录 |
| `memberProvider` | `spawn` | 子代理 provider |
| `maxMembers` | `8` | 人数上限 |

## 开发

在 monorepo 根目录：

```bash
pnpm --filter dsh-agent-teams test
pnpm --filter dsh-agent-teams build
node scripts/link-plugin.mjs --profile web agent-teams
pnpm dev
```

挂的是仓库 `.dsh-home`（端口 3081），不是日常 `~/.dsh`。

## License

[MIT](../../LICENSE)。上游归属见 [NOTICE](NOTICE)。
