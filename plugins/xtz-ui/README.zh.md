<p align="right"><a href="./README.md">English</a> · <strong>中文</strong></p>

<h1 align="center">dsh-xtz-ui</h1>

<p align="center">
  <img src="docs/ip.jpg" width="160" height="160" alt="dsh-xtz-ui icon">
</p>

<p align="center"><b>小桃子 DSH 壳：品牌、欢迎弹框，以及设置 → 小桃子开关。</b></p>

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

[小桃子 DSH](https://xiaotaozi.cc/) 的壳插件。管自带界面的壳、欢迎弹框、**设置 → 小桃子**、归档、任务看板和 Git 图谱。每一项都可以单独打开或关闭，不必重启。右侧文件 / Git / 终端在 [`dsh-sidebar`](../sidebar)。模型 / IM / 企业微信办公 / 市场仍在各自插件里。

属于 [`xiaotaozi-dsh`](https://github.com/kedoupi/xiaotaozi-dsh) monorepo。不要对仓库根目录执行 `dsh plugin add`。

## 能做什么

- **设置 → 小桃子**：归档、任务看板、Git 图谱、「向 Agent 宣告」各自一档开关。
- **任务看板**占中间栏，可选 cron 定时执行，关掉浏览器也会到点跑。
- **Git 图谱**：空白会话上的分支胶囊，打开提交图（SVG 泳道、合并曲线、分支标签）。
- **归档**管理：搜索、预览、恢复或永久删除已隐藏的会话。
- **品牌壳**：小桃子品牌、欢迎弹框、桃子强调色。

## 快速开始

```bash
dsh plugin --profile web add github:kedoupi/xiaotaozi-dsh#path:plugins/xtz-ui
dsh web
```

第一次打开会看到欢迎弹框；开关在 **设置 → 小桃子**。

## 功能截图

![小桃子 DSH 欢迎弹框](docs/welcome.webp)

![设置 → 小桃子功能开关](docs/xiaotaozi-settings.webp)

![小桃子任务看板](docs/task-board.webp)

![小桃子 Git 图谱](docs/git-graph.webp)

## 功能开关

**设置 → 小桃子** 每个功能一档。默认打开归档 / 任务看板 / Git 图谱；「向 Agent 宣告」默认关闭。关掉当作没装：没有入口、没有路由、没有调度。品牌壳和欢迎弹框仍保留。「向 Agent 宣告」会把归档、任务看板、Git 图谱写进系统提示，让 Agent 知道它们存在。

## 任务看板

侧栏入口占中间栏（布局跟 dsh-task-board 一样）：顶栏、搜索、五列、卡片进详情、新建弹窗。可选 5 段 cron，关掉浏览器也会到点跑；错过的点不补跑。

## Git 图谱

空白会话里跟在模式胶囊后面的分支胶囊：搜索并切换本地分支，打开提交图（SVG 泳道、合并曲线、分支标签）。点菜单外部或 Escape 会收起。切换是工作区级 `git switch`。没有遥测。

## 归档

**设置 → 小桃子 → 管理归档会话。** 搜索或按项目筛选平面会话列表，预览最近对话，单条或批量恢复，并通过明确确认永久删除。只读写 `$DSH_HOME`。

## 品牌壳与边界

- 侧栏品牌、空白会话 hero 标、桃子强调色。
- 藏掉自带的 Session log、「打开配置文件」和官方重复的「模型」导航。
- 欢迎弹框每个 id 只出现一次，关掉的条目记在这个源的 `localStorage` 里；在 `src/notices.ts` 再放一条即可排队新公告。
- 归档、任务看板、Git 图谱归本插件。右侧文件 / Git / 终端面板属于 [`dsh-sidebar`](../sidebar)（**设置 → Side card**）。模型 / IM / 企业微信办公 / 市场仍在各自插件里。

## 开发

在 monorepo 根目录：

```bash
pnpm --filter dsh-xtz-ui test
pnpm --filter dsh-xtz-ui build
node scripts/link-plugin.mjs --profile web xtz-ui
pnpm dev
```

挂的是仓库 `.dsh-home`（端口 3081），不是日常 `~/.dsh`。

## 文档

| 文档 | 什么时候看 |
| :-- | :-- |
| [流程](../../docs/workflow.zh.md) | 创建、安装、优化、提交 |
| [规范](../../docs/conventions.zh.md) | 包身份、两套 home |
| [xiaotaozi-dsh](../../README.zh.md) | 整个 monorepo |

## License

[MIT](../../LICENSE)
