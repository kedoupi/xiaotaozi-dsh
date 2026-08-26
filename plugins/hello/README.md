<p align="right"><strong>English</strong> · <a href="./README.zh.md">中文</a></p>

<h1 align="center">dsh-hello</h1>

<p align="center">
  <img src="docs/ip.jpg" width="160" height="160" alt="dsh-hello icon">
</p>

<p align="center"><b>Xiaotaozi DSH workbench: brand chrome, welcome notice, and Settings → Xiaotaozi toggles.</b></p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh.md">中文</a> ·
  <a href="https://github.com/kedoupi/xiaotaozi-dsh">xiaotaozi-dsh</a>
</p>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/topic-dsh--plugin-0ea5e9?style=flat-square" alt="dsh-plugin"></a>
  <img src="https://img.shields.io/badge/dsh-0.1.1--rc.2-4176e6?style=flat-square" alt="DeepSeek Harness 0.1.1-rc.2">
</p>

Workbench plugin for [Xiaotaozi DSH](https://xiaotaozi.cc/). It owns the shipped DSH chrome, the welcome notice, **Settings → Xiaotaozi**, and the right-hand workbench (files, Git, terminal). Each feature can be turned on or off without restarting. Models, memory, IM, context, and agent-teams stay in those plugins.

Part of the [`xiaotaozi-dsh`](https://github.com/kedoupi/xiaotaozi-dsh) monorepo. Do not `dsh plugin add` the repository root.

## Features

- **Settings → Xiaotaozi.** Independent switches for archive, right workbench, task board, Git graph, and “announce to agent”. Defaults are archive / workbench / board / Git graph on; “announce to agent” off. Off means uninstalled: no entry, no routes, no scheduler. Brand chrome and the welcome notice remain. File / Git / terminal tabs are toggled in **Settings → Side card**. “Announce to agent” writes those skills into the system prompt.
- **Right workbench.** The DSH-better-sidebar panel: explorer, CodeMirror editor, PDF / HTML / image / Markdown, Git (worktrees, stage/commit/diff/history), xterm + node-pty terminal, split panes, and free windows. Session-scoped `/sidebar` API. External links open in the system browser.
- **Task board.** Sidebar entry takes over the center column (same layout as dsh-task-board): header, search, five columns, card → detail modal, new-task modal. Optional 5-field cron keeps firing after the browser closes; missed ticks are skipped.
- **Git graph.** On a blank session, a branch chip after the mode pill: search and switch local branches, open a commit graph (SVG lanes, merge curves, ref badges). Click-outside and Escape close the menu. Workspace-level `git switch`. No telemetry.
- **Settings → Archives.** Group archived sessions by workspace, search, preview the last messages, restore, or permanently delete. Uses `$DSH_HOME` only.
- **Shows once per notice id.** Dismissed ids stay in `localStorage` on this origin.
- **Queue, not a rewrite.** Add another object in `src/notices.ts`; the dialog advances after OK.
- **Host chrome.** Sidebar brand, blank-session hero mark, peach accent tokens, hide Session log, hide Open configuration file, hide the duplicate official Models nav.

## Install

```bash
dsh plugin --profile web add github:kedoupi/xiaotaozi-dsh#path:plugins/hello
dsh web
```

## Screenshots

![Xiaotaozi DSH welcome dialog](docs/welcome.png)

## Develop

From the monorepo root:

```bash
pnpm --filter dsh-hello test
pnpm --filter dsh-hello build
node scripts/link-plugin.mjs --profile web hello
pnpm dev
```

That links into the repo `.dsh-home` (port 3081), not the daily `~/.dsh`.

## Documentation

| Doc | Read it when |
| :-- | :-- |
| [Workflow](../../docs/workflow.md) | Create, install, simplify, commit |
| [Conventions](../../docs/conventions.md) | Package identity and two homes |
| [xiaotaozi-dsh](../../README.md) | The rest of the monorepo |

## License

[MIT](../../LICENSE)
