<p align="right"><a href="./README.md">English</a> · <strong>中文</strong></p>

<h1 align="center">dsh-wecom-office</h1>

<p align="center"><b>Settings → WeCom Office: calendars, docs, and meetings in chat.</b></p>

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

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin. Occupies **Settings → 企业微信办公**. Chat stays in [`dsh-im`](../im); this package wires the official [`wecom-cli`](https://github.com/WecomTeam/wecom-cli) to model tools.

**Status: first slice implemented; sandbox install and live WeCom auth still need a human pass.** Contract: [docs/prd.zh.md](docs/prd.zh.md) v0.4.

Part of [`xiaotaozi-dsh`](https://github.com/kedoupi/xiaotaozi-dsh). Do not `dsh plugin add` the repository root.

## Install

```bash
dsh plugin --profile web add github:kedoupi/xiaotaozi-dsh#path:plugins/wecom-office
```

`wecom-cli` must be on `PATH` (`npm install -g @wecom/cli`). Rebuild after source changes and restart the running `dsh`.

## Docs

| Doc | When |
| :-- | :-- |
| [PRD (zh)](docs/prd.zh.md) | Product contract |
| [Technical design (zh)](docs/technical.zh.md) | Implementation |
| [Appendix A](docs/appendix-cli.zh.md) | CLI argv |
| [Appendix B](docs/appendix-rpc.zh.md) | Settings RPC |
| [Workflow](../../docs/workflow.md) | Create, install, simplify, commit |
| [Conventions](../../docs/conventions.md) | Package identity and two homes |

## License

[MIT](../../LICENSE)
