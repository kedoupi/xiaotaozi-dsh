# CLI 命令参考

`xtz` 刻意做得很小：只负责启动、停止和检查官方 web 服务，别的不做。任何验证不了的事，它会直接拒绝，并返回非零退出码。

## 命令

| 命令 | 作用 |
| :-- | :-- |
| `xtz` | 等同于 `xtz start` |
| `xtz start [--port N]` | 需要时种上默认插件，后台启动，打印 URL，打开浏览器 |
| `xtz stop` | 停掉 `xtz` 自己启动的进程 |
| `xtz restart` | 先停再启 |
| `xtz open` | 在浏览器打开当前 URL |
| `xtz status` | 只查看记住的端口，不做任何改动 |
| `xtz doctor` | 检查运行时、xtz 标记、profile 和端口 |
| `xtz config path` | 打印官方 web profile 补丁文件路径 |
| `xtz version` | 打印 CLI、Node 和锁定的 DSH 版本 |
| `xtz help` | 显示帮助 |

## 端口

默认监听地址是 `127.0.0.1:3080`。

- 如果 3080 被**非**小桃子进程占用，交互式的 `xtz start` 会提议改用 `3082+`。
- 非交互运行时，不显式传 `--port` 就直接拒绝。
- `xtz` 永远不杀自己没启动的进程，也不抢端口。

只有当仅监听回环地址、带版本号的小桃子身份端点返回精确的 v1 契约时，服务才被认定为健康。

## 刻意禁用的命令

以下子命令按设计直接失败（fail closed）：

```text
init · plugin · run · ask · config dump · config defaults · update
```

额外插件请在应用内[市场](/zh/guide/market)安装，不走命令行。

## 退出码

| 码 | 含义 |
| :-- | :-- |
| `0` | 请求的操作成功 |
| `1` | 服务已停止，或就绪检查失败 |
| `2` | 用法错误、端口占用者未通过验证，或操作被安全策略拦截 |

退出码是稳定的，可以放心在脚本里使用 `xtz status` 和 `xtz doctor`。
