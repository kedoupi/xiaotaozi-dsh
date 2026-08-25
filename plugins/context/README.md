<h1 align="center">dsh-context</h1>

<p align="center"><b>Conversation Context tab and <code>/context</code>: composition, history, events.</b></p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh.md">中文</a> ·
  <a href="https://github.com/kedoupi/xiaotaozi-dsh">xiaotaozi-dsh</a> ·
  <a href="NOTICE">NOTICE</a>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square" alt="Apache-2.0"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/topic-dsh--plugin-0ea5e9?style=flat-square" alt="dsh-plugin"></a>
  <img src="https://img.shields.io/badge/dsh-0.1.1--rc.2-4176e6?style=flat-square" alt="DeepSeek Harness 0.1.1-rc.2">
</p>

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin derived from [bowenliang123/dsh-context](https://github.com/bowenliang123/dsh-context) (Apache-2.0). Session **Context** tab plus `/context`.

Part of [`xiaotaozi-dsh`](https://github.com/kedoupi/xiaotaozi-dsh). Do not `dsh plugin add` the repository root. Do not install the npm `dsh-context` next to this fork. The upstream pin is `externals/dsh-context` — reference only.

## Features

- **Context tab.** Composition bar, per-request history, events, and the model-visible surface.
- **`/context`.** Same insight as a modal without leaving chat.

## Install

```bash
dsh plugin --profile web add github:kedoupi/xiaotaozi-dsh#path:plugins/context
dsh web
```

If the npm `dsh-context` is already in the profile, remove it first.

## Develop

From the monorepo root:

```bash
pnpm --filter dsh-context test
pnpm --filter dsh-context build
node scripts/link-plugin.mjs --profile web context
pnpm dev
```

That links into the repo `.dsh-home` (port 3081), not the daily `~/.dsh`.

## License

[Apache-2.0](LICENSE). Upstream attribution in [NOTICE](NOTICE).
