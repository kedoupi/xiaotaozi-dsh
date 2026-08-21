# dsh-passport

设置 → **模型**：订阅和 API Key 放在同一页。左侧只列出已接上的服务商，右侧登录或填密钥，并勾选对话框里要用的模型。

没接上的在「添加服务商」。

授权实现参考 [dsh-plugin-subscriptions](https://github.com/V1ki/dsh-plugin-subscriptions)（MIT）。

| 订阅 | 登录 |
| --- | --- |
| ChatGPT Codex | OAuth（Plus / Pro） |
| Claude | OAuth（Pro / Max） |
| Grok | OAuth（X Premium） |
| 通义灵码 | 设备码 |
| Kimi 编程 | 设备码（官方 Kimi Code） |
| 其余国内会员 | 添加服务商里已列出，官方授权接入中 |

密钥在 `~/.dsh/plugins/passport/auth.json`（0600）。
