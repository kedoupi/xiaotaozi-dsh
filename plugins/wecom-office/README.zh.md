<p align="right"><a href="./README.md">English</a> · <strong>中文</strong></p>

<h1 align="center">dsh-wecom-office</h1>

<p align="center"><b>设置 → 企业微信办公：对话里查日程、文档、会议。</b></p>

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

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件。占用 **设置 → 企业微信办公**。聊天仍在 [`dsh-im`](../im)；本包把官方 [`wecom-cli`](https://github.com/WecomTeam/wecom-cli) 接到模型工具上。

**当前状态：第一刀已实现，待沙箱安装与真机开通验证。** 合同：[docs/prd.zh.md](docs/prd.zh.md) v0.4。

属于 [`xiaotaozi-dsh`](https://github.com/kedoupi/xiaotaozi-dsh) monorepo。不要对仓库根目录执行 `dsh plugin add`。

## 安装

```bash
dsh plugin --profile web add github:kedoupi/xiaotaozi-dsh#path:plugins/wecom-office
```

本机 PATH 上需要 `wecom-cli`（`npm install -g @wecom/cli`）。改源码后重新 `build`，并重启正在跑的 `dsh`。

## 文档

| 文档 | 什么时候看 |
| :-- | :-- |
| [产品规格 PRD](docs/prd.zh.md) | 产研主合同 |
| [技术方案](docs/technical.zh.md) | 实现 |
| [附录 A](docs/appendix-cli.zh.md) | 第一刀 CLI argv |
| [附录 B](docs/appendix-rpc.zh.md) | 设置页 RPC |
| [流程](../../docs/workflow.zh.md) | 创建、安装、优化、提交 |
| [规范](../../docs/conventions.zh.md) | 包身份、两套 home |

## License

[MIT](../../LICENSE)
