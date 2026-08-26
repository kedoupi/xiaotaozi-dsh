<p align="right"><a href="./README.md">English</a> · <strong>中文</strong></p>

<h1 align="center">dsh-sidebar</h1>

<p align="center">
  <img src="docs/ip.jpg" width="160" height="160" alt="dsh-sidebar icon">
</p>

<p align="center"><b>右侧工作台：文件、编辑器、Git、终端，以及设置 → Side card。</b></p>

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

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的右侧工作台。资源管理器、CodeMirror 编辑器、Git、xterm + node-pty 终端，以及 **设置 → Side card**。按会话隔离的 `/sidebar` API。外链走系统浏览器。

改编自 [DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)（MIT）。见 [NOTICE](NOTICE) 和 [DSH-better-sidebar.LICENSE](DSH-better-sidebar.LICENSE)。不要把作者的 npm 和本包装在同一个 profile。

小桃子壳（品牌、归档、任务看板、Git 图谱）仍在 [`dsh-hello`](../hello)。模型 / 记忆 / IM / 上下文 / agent-teams 仍在各自插件。

属于 [`xiaotaozi-dsh`](https://github.com/kedoupi/xiaotaozi-dsh) monorepo。不要对仓库根目录执行 `dsh plugin add`。

## 安装

```bash
dsh plugin --profile web add github:kedoupi/xiaotaozi-dsh#path:plugins/sidebar
dsh web
```

然后打开 **设置 → Side card** 选择要挂载的 Tab。卸掉本插件即去掉整个右侧面板。

## 开发

在 monorepo 根目录：

```bash
pnpm --filter dsh-sidebar test
pnpm --filter dsh-sidebar build
node scripts/link-plugin.mjs --profile web sidebar
pnpm dev
```

挂的是仓库 `.dsh-home`（端口 3081），不是日常 `~/.dsh`。

## 文档

| 文档 | 什么时候看 |
| :-- | :-- |
| [NOTICE](NOTICE) | 上游 MIT 归属 |
| [流程](../../docs/workflow.zh.md) | 创建、安装、优化、提交 |
| [规范](../../docs/conventions.zh.md) | 包身份、两套 home |
| [xiaotaozi-dsh](../../README.zh.md) | 整个 monorepo |

## License

[MIT](../../LICENSE)
