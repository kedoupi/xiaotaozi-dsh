# dsh-providers

[English](README.md) | 中文

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件。占用设置 → **模型**：官方订阅登录和 API Key 放在同一页。左侧只列出已接上的服务商，右侧登录或填密钥，并勾选对话框里要用的模型。

没接上的在「添加服务商」。官方 Models 页故意不用。

![设置 → 模型](docs/models.jpg)

![添加服务商](docs/add-provider.jpg)

属于 [`dsh-plugins`](https://github.com/kedoupi/dsh-plugins) monorepo。界面文案只有中文。

授权实现参考 [dsh-plugin-subscriptions](https://github.com/V1ki/dsh-plugin-subscriptions)（MIT）。

## 安装

```bash
dsh plugin --profile web add github:kedoupi/dsh-plugins#path:plugins/providers
dsh web
```

不要对仓库根目录执行 `dsh plugin add`。改完源码要重新构建这个包，并重启 `dsh`。

## 订阅

| 产品 | 登录 |
| --- | --- |
| ChatGPT Codex | OAuth（Plus / Pro） |
| Claude | OAuth（Pro / Max） |
| Grok | OAuth（X Premium） |
| 通义灵码 | 设备码 |
| Kimi 编程 | 设备码（官方 Kimi Code） |
| 智谱 GLM、豆包、MiniMax、讯飞星火、腾讯混元 | 添加服务商里已列出，官方会员授权接入中 |

授权可以在另一台设备上完成：页面会显示本机、授权链接和设备码。

## 密钥和自定义接口

内置 API 服务商走 host 的凭证存储。已保存的密钥只显示星号，不会明文出现。

**启动环境**里带来的密钥在这里是只读的。页面会说明这一点，不会更换或清除。要改请在启动 `dsh` 的环境里处理。

自定义服务商是 OpenAI 兼容接口（名称、地址、密钥）。模型从接口拉取，不用手填模型名。

## 数据

订阅令牌：`$DSH_HOME/plugins/providers/auth.json`（权限 `0600`）。旧包名留下的 `plugins/passport/` 会在首次加载时拷过来。

API 密钥走 host 凭证（`$DSH_HOME/.credentials.yaml`）；若进程环境已经提供同名变量，则以环境为准。

## 开发

在 monorepo 根目录：

```bash
pnpm --filter dsh-providers test
pnpm --filter dsh-providers build
node scripts/link-plugin.mjs --profile web providers
pnpm dev
```

挂的是仓库 `.dsh-home`（端口 3081），不是日常 `~/.dsh`。

流程见 [docs/workflow.zh.md](../../docs/workflow.zh.md)。产品说明：[PRODUCT.md](PRODUCT.md)。
