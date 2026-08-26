<p align="right"><a href="./README.md">English</a> · <strong>中文</strong></p>

<h1 align="center">dsh-agent-teams</h1>

<p align="center">
  <img src="docs/ip.jpg" width="160" height="160" alt="dsh-agent-teams icon">
</p>

<p align="center"><b>一句话，把 DeepSeek Harness 会话变成可续上的协作团队。</b></p>

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
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/topic-dsh--plugin-0ea5e9?style=flat-square" alt="dsh-plugin"></a>
  <img src="https://img.shields.io/badge/dsh-0.1.1--rc.2-4176e6?style=flat-square" alt="DeepSeek Harness 0.1.1-rc.2">
</p>

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件，源码来自 [NanmiCoder/dsh-agent-teams](https://github.com/NanmiCoder/dsh-agent-teams)（MIT）。当前会话就是队长。邮箱和 `assignee=captain` 仍用协议键 `captain`。给人看的名字（默认 **张老板**）走配置。

属于 [`xiaotaozi-dsh`](https://github.com/kedoupi/xiaotaozi-dsh) monorepo。不要对仓库根执行 `dsh plugin add`。不要和 `@nanmicoder/dsh-agent-teams` 装在同一个 profile。

## 为什么用 Agent Teams？

| 能力 | 带来的变化 |
| :-- | :-- |
| **队长分工** | 当前会话建队、分配角色并汇总结果。 |
| **可续成员** | 成员是可唤醒的持续子代理，适合后续跟进。 |
| **依赖任务** | 依赖未完成前，任务不会被认领。 |
| **自动调度** | 空闲成员认领就绪任务；旧尝试可安全重分配。 |
| **直接信箱** | 成员可直接给队长或队友发消息。 |
| **活动面板** | 成员、任务、依赖和报告始终可查看。 |

## 安装

```bash
dsh plugin --profile web add github:kedoupi/xiaotaozi-dsh#path:plugins/agent-teams
dsh web
```

profile 里如果已有 `@nanmicoder/dsh-agent-teams`，先卸掉。

## 使用

直接描述目标：

> 用 AgentTeams 从安全、性能、产品三个角度审查这个项目，最后给我一份合并报告。

也可以使用：

```text
/agent-teams 调研三家竞品的定价页面
```

流程是：建队 → 加成员 → 创建带依赖任务 → 调度器认领就绪任务并唤醒空闲成员 → 队长汇总并归档。状态保存在 `<workspace>/.agent-teams/`；重新分配会先撤销旧尝试。

## 配置

| 字段 | 默认 | 含义 |
| :-- | :-- | :-- |
| `captainName` | `张老板` | 队长显示名。路由仍是 `captain`。 |
| `members` | `[]` | 预设人设 `{ name, role? }`。非空则在 `agent_teams_create` 时加入。 |
| `stateDir` | `.agent-teams` | 会话工作区下的团队目录 |
| `memberProvider` | `spawn` | 子代理 provider |
| `memberModel` | 目标默认 | 成员可选模型 |
| `memberMaxDepth` | `1` | 成员继续委派的最大深度 |
| `slashCommand` | `true` | 是否启用 `/agent-teams` |
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

[MIT](LICENSE)。上游归属见 [NOTICE](NOTICE)。
