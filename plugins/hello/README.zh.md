<h1 align="center">dsh-hello</h1>

<p align="center"><b>小桃子 DSH 欢迎弹框。Web 打开后浮在页面上，点确定关掉。</b></p>

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

[小桃子 DSH](https://xiaotaozi.cc/) 的应用内说明弹框。第一条是欢迎说明。以后的公告、广告、用户通知往 `src/notices.ts` 的队列里加即可。弹框文案跟随 Harness 语言（中文 / English）。

属于 [`xiaotaozi-dsh`](https://github.com/kedoupi/xiaotaozi-dsh) monorepo。不要对仓库根目录执行 `dsh plugin add`。

## 特性

- **每个 id 只出现一次。** 关掉的条目记在这个源的 `localStorage` 里。
- **往队列里加，不用改弹框。** 在 `src/notices.ts` 再放一条，点确定后会切到下一条。
- **宿主壳。** 所有对 DSH 自带界面的修改都放这里（`src/client/chrome.ts`、`src/client/hide-official.ts`、`src/client/peach.ts`）：侧栏品牌、空白会话 hero 标、桃子强调色、藏 Session log、藏「打开配置文件」、藏官方重复的「模型」导航。功能页（模型 / 记忆 / IM / 上下文）仍在各自插件里。

## 安装

```bash
dsh plugin --profile web add github:kedoupi/xiaotaozi-dsh#path:plugins/hello
dsh web
```

## 截图

![小桃子 DSH 欢迎弹框](docs/welcome.png)

## 开发

在 monorepo 根目录：

```bash
pnpm --filter dsh-hello test
pnpm --filter dsh-hello build
node scripts/link-plugin.mjs --profile web hello
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
