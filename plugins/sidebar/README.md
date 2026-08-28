<p align="right"><strong>English</strong> · <a href="./README.zh.md">中文</a></p>

<h1 align="center">dsh-sidebar</h1>

<p align="center">
  <img src="docs/ip.jpg" width="160" height="160" alt="dsh-sidebar icon">
</p>

<p align="center"><b>Right workbench: files, editor, Git, terminal, and Settings → Side card.</b></p>

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

Right-hand workbench for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Explorer, CodeMirror editor, Git, xterm + node-pty terminal, and **Settings → Side card**. Session-scoped `/sidebar` API. External links open in the system browser.

Adapted from [DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) (MIT). See [NOTICE](NOTICE) and [DSH-better-sidebar.LICENSE](DSH-better-sidebar.LICENSE). Do not install the author's npm next to this package.

Xiaotaozi chrome (brand, archive, task board, git graph) stays in [`dsh-xtz-ui`](../xtz-ui). Models, IM, WeCom office, and market stay in those plugins.

Part of the [`xiaotaozi-dsh`](https://github.com/kedoupi/xiaotaozi-dsh) monorepo. Do not `dsh plugin add` the repository root.

## Install

```bash
dsh plugin --profile web add github:kedoupi/xiaotaozi-dsh#path:plugins/sidebar
dsh web
```

Then open **Settings → Side card** to choose which tabs mount. Uninstall this plugin to remove the right panel entirely.

## Develop

From the monorepo root:

```bash
pnpm --filter dsh-sidebar test
pnpm --filter dsh-sidebar build
node scripts/link-plugin.mjs --profile web sidebar
pnpm dev
```

That links into the repo `.dsh-home` (port 3081), not the daily `~/.dsh`.

## Documentation

| Doc | Read it when |
| :-- | :-- |
| [NOTICE](NOTICE) | Upstream MIT attribution |
| [Workflow](../../docs/workflow.md) | Create, install, simplify, commit |
| [Conventions](../../docs/conventions.md) | Package identity and two homes |
| [xiaotaozi-dsh](../../README.md) | The rest of the monorepo |

## License

[MIT](../../LICENSE)
