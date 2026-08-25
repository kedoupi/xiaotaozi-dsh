<h1 align="center">dsh-hello</h1>

<p align="center"><b>Xiaotaozi DSH welcome dialog. It appears when the Web app opens; OK dismisses it.</b></p>

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

In-app notice for [Xiaotaozi DSH](https://xiaotaozi.cc/). It sits on top of the Web UI. The first item is a Xiaotaozi welcome. Later notices (announcements, ads, user messages) go in `src/notices.ts`. User-facing copy follows the Harness locale (Chinese / English).

Part of the [`xiaotaozi-dsh`](https://github.com/kedoupi/xiaotaozi-dsh) monorepo. Do not `dsh plugin add` the repository root.

## Features

- **Shows once per notice id.** Dismissed ids stay in `localStorage` on this origin.
- **Queue, not a rewrite.** Add another object in `src/notices.ts`; the dialog advances after OK.

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
