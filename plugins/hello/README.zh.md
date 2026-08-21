# dsh-hello

[English](README.md) | 中文

[小桃子 DSH](https://xiaotaozi.cc/) 的应用内说明弹框。Web 应用打开后浮在 DSH 页面上，点 **确定** 关掉。

第一条是小桃子欢迎说明。以后的公告、广告、用户通知往 `src/notices.ts` 的队列里加即可。

![小桃子 DSH 欢迎弹框](docs/welcome.png)

属于 [`dsh-plugins`](https://github.com/kedoupi/dsh-plugins) monorepo。弹框文案只有中文。

## 安装

```bash
dsh plugin --profile web add github:kedoupi/dsh-plugins#path:plugins/hello
dsh web
```

关掉的条目记在这个源的 `localStorage` 里。

## 开发

在 monorepo 根目录：

```bash
pnpm --filter dsh-hello test
pnpm --filter dsh-hello build
node scripts/link-plugin.mjs --profile web hello
pnpm dev
```

挂的是仓库 `.dsh-home`（端口 3081），不是日常 `~/.dsh`。
