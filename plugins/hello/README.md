# dsh-hello

English | [中文](README.zh.md)

In-app notice dialog for [Xiaotaozi DSH](https://xiaotaozi.cc/). It sits on top of the Web UI when the app loads. **OK** dismisses it.

The first notice is a Xiaotaozi welcome. Later notices (announcements, ads, user messages) go in `src/notices.ts` as extra items in the queue.

Part of the [`dsh-plugins`](https://github.com/kedoupi/dsh-plugins) monorepo. User-facing copy in the dialog is Chinese.

## Install

```bash
dsh plugin --profile web add github:kedoupi/dsh-plugins#path:plugins/hello
dsh web
```

Dismissed ids are stored in `localStorage` on this origin.

## Develop

From the monorepo root:

```bash
pnpm --filter dsh-hello test
pnpm --filter dsh-hello build
node scripts/link-plugin.mjs --profile web hello
pnpm dev
```

That links into the repo `.dsh-home` (port 3081), not the daily `~/.dsh`.
