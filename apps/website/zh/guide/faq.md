# 常见问题

## 有桌面客户端吗？

没有。用户产品是 `xtz` CLI，界面是浏览器里的官方 `dsh web`。历史上的桌面客户端归档在 git 标签 `archive/desktop`，不会回来了。

## 需要哪个 Node.js 版本？

**`^22.19.0` 或 `>=24`**，与 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 一致。DSH 本身仍锁定 `0.1.1-rc.2`。`xtz doctor` 会同时验证这两项。

## `xtz start` 提示 3080 端口被占用

`xtz` 永远不杀自己没启动的进程，也不抢端口。如果 3080 被占：

- 如果是 `xtz` 自己启动的小桃子服务，`xtz start` 会直接复用。
- 如果是别的进程，交互式 `xtz start` 会提议 `3082+`，或者你显式传 `--port N`。
- 非交互运行不传 `--port` 就拒绝 —— 这是设计如此。

## 为什么 `xtz plugin` 会失败？

`init`、`plugin`、`run`、`ask`、`config dump`、`config defaults` 和 `update` 都刻意禁用、直接失败。额外插件请在应用内[市场](/zh/guide/market)安装，或用官方 `dsh plugin --profile web add …`。

## 感觉哪里不对，从哪查起？

```bash
xtz doctor
```

它会检查运行时版本、xtz 标记、profile 和端口，并明确报告问题。退出码稳定：`0` 健康，`1` 已停止或就绪检查失败，`2` 被安全策略拦截。

## 怎么重置官方 home？

**不要** `rm -rf ~/.dsh`。正确做法：

```bash
xtz stop
mv ~/.dsh/profiles/web ~/.dsh/profiles/web.bak
xtz start
```

首次启动会在新 profile 里重新种上默认插件。

## 我的数据会被发到哪里吗？

服务只监听回环地址（`127.0.0.1`）。模型流量只发给你在 设置 → **模型** 里接入的厂商；IM 流量走你在 **IM bots** 里连接的渠道。除此之外不会有数据离开你的电脑。

## 在哪里反馈 bug？

去 GitHub [提 issue](https://github.com/kedoupi/xiaotaozi-dsh/issues)，最好附上 `xtz version` 和 `xtz doctor` 的输出。
