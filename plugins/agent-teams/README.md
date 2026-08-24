<h1 align="center">dsh-agent-teams</h1>

<p align="center"><b>Named captain plus members as durable subagents. Protocol key stays <code>captain</code>.</b></p>

<p align="center">
  张老板 · 设计师 · 工程师 · tasks · activity panel
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

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin derived from [NanmiCoder/dsh-agent-teams](https://github.com/NanmiCoder/dsh-agent-teams) (MIT). The current session is the captain. Mailboxes and `assignee=captain` keep the protocol key `captain`. The display name (default **张老板**) is config.

Part of the [`xiaotaozi-dsh`](https://github.com/kedoupi/xiaotaozi-dsh) monorepo. Do not `dsh plugin add` the repository root. Do not install this next to `@nanmicoder/dsh-agent-teams`.

## Features

- **Captain display name.** Config `captainName` (default `张老板`) is what the UI and prompts show.
- **Optional member roster.** If `members` is set, creating a team adds those people. Empty roster: the model still picks roles.
- **Activity panel.** Live members, tasks, and the captain inbox.

## Install

```bash
dsh plugin --profile web add github:kedoupi/xiaotaozi-dsh#path:plugins/agent-teams
dsh web
```

If `@nanmicoder/dsh-agent-teams` is already in the profile, remove it first.

## Config

| Field | Default | Meaning |
| :-- | :-- | :-- |
| `captainName` | `张老板` | Display name for the captain. Routing stays `captain`. |
| `members` | `[]` | Preset roster `{ name, role? }`. Non-empty: added on `agent_teams_create`. |
| `stateDir` | `.agent-teams` | Team files under the session workspace |
| `memberProvider` | `spawn` | Subagent provider |
| `maxMembers` | `8` | Roster cap |

## Develop

From the monorepo root:

```bash
pnpm --filter dsh-agent-teams test
pnpm --filter dsh-agent-teams build
node scripts/link-plugin.mjs --profile web agent-teams
pnpm dev
```

That links into the repo `.dsh-home` (port 3081), not the daily `~/.dsh`.

## License

[MIT](../../LICENSE). Upstream attribution in [NOTICE](NOTICE).
