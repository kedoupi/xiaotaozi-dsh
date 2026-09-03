<p align="right"><a href="./README.md">English</a> · <strong>中文</strong></p>

<h1 align="center">dsh-sidebar</h1>

<p align="center">
  <img src="docs/ip-3d.jpg" width="160" height="160" alt="dsh-sidebar icon">
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

小桃子壳（品牌、归档、任务看板、Git 图谱）仍在 [`dsh-xtz-ui`](../xtz-ui)。模型 / IM / 企业微信办公 / 市场仍在各自插件。

属于 [`xiaotaozi-dsh`](https://github.com/kedoupi/xiaotaozi-dsh) monorepo。不要对仓库根目录执行 `dsh plugin add`。

## 能做什么

- 在会话旁边多一个右侧工作台：工作区文件树、CodeMirror 编辑器、源代码管理和真实终端，共用一条 Tab 栏。
- 一切都通过按会话隔离的 `/sidebar` API 绑定当前会话 —— 每个会话的面板都指向该会话自己的工作区。
- 由 **设置 → Side card** 决定挂载哪些 Tab；卸载本插件即移除整个面板。

## 快速开始

```bash
dsh plugin --profile web add github:kedoupi/xiaotaozi-dsh#path:plugins/sidebar
dsh web
```

选中一个会话，点右上角的面板开关展开工作台。打开 **设置 → Side card** 选择要挂载的 Tab。卸掉本插件即去掉整个右侧面板。

## 功能截图

一次走完工作台：在会话旁展开面板，在文件树里浏览工作区并用编辑器的渲染预览打开一篇 Markdown 笔记，在源代码管理里审阅并提交这次修改，然后在终端里跑一条命令 —— 全程只作用于该会话的工作区。

![对话旁的 Sidebar 文件栏](docs/workbench.webp)

## 文件与编辑器

- 惰性加载的 VSCode 风格文件树，根目录就是会话工作区；支持按文件名搜索和拖拽上传到任意文件夹；以点开头的文件始终列出、变暗显示。
- 每个文件行的右键菜单都能复制相对路径或绝对路径。
- CodeMirror 编辑器支持多 Tab 和分屏；Markdown 文件在编辑与渲染预览（含 Mermaid 图）之间切换，PDF 有独立查看器。
- 「打开方式」可把文件送进配置好的编辑器；设置 SSH 目标后，VSCode 系编辑器走远端协议打开。

## Git

- 源代码管理面板区分已暂存与未暂存，支持暂存/取消暂存和填写提交信息。
- 分支切换，外加 VSCode 风格历史：每行带分支装饰、作者和相对时间。
- 点击改动文件或历史记录会打开独立的 diff Tab。
- 右键改动文件可看高级操作（在编辑器中打开、丢弃）；破坏性操作一律先弹确认框。

## 终端

- 真实终端 —— 页面里是 xterm，宿主机上是 node-pty —— 在会话工作区里运行你的默认 shell。
- 连接断开会自动重连；shell 已退出会如实提示，不会吞掉输入。
- 如果 node-pty 加载失败，面板会直接给出修复命令和重试按钮。

## Side card 设置

**设置 → Side card** 把每个工作台功能列成一张卡片；点卡片即可挂载或卸载对应 Tab。每项功能的二级设置在各自弹层里：文件打开方式、编辑器「打开方式」应用、终端选项等。

## 安全与边界

- 工作台的所有请求都走按会话隔离的 `/sidebar` API 并携带会话 id；文件路径经过符号链接感知的守卫解析，越出会话工作区的一律拒绝。
- 外部 http(s) 链接默认交给系统浏览器；当链接拦截偏好允许时，注册了 URL 目标的插件 Tab 可以接管该链接。
- HTML 文件在不透明源的沙箱 iframe 里预览，读不到会话数据（默认如此；带警示的设置可以解除沙箱）。Markdown 预览经消毒后在页面内渲染，不会作为原始 HTML 注入。
- 破坏性 Git 操作（丢弃、还原、cherry-pick）都要先过确认框。
- 编辑器和终端表面跟随应用自身的明暗主题 token；小桃子壳（品牌、归档、任务看板、Git 图谱）在 [`dsh-xtz-ui`](../xtz-ui)，不在本插件。

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
