# 插件介绍

首次 `xtz start` 会自动种上六个自研插件。每个插件只做一件事，在界面里也只占一个位置。

| 插件 | 位置 | 作用 |
| :-- | :-- | :-- |
| `dsh-providers` | 设置 → **模型** | 会员登录和 API Key 一页搞定；聊天里只列出你勾选的模型。可选智能选择，默认仍是手动 |
| `dsh-im` | 侧边栏 → **IM bots** | 九个聊天渠道，外加实验性的 AI Office 连接器 |
| `dsh-wecom-office` | 侧栏 → **IM机器人** → 企业微信机器人卡片 | 企微日历、文档、会议、通讯录、表格、待办和微盘 |
| `dsh-xtz-ui` | 设置 → **小桃子** | 品牌界面、归档、任务板、Git 图和功能开关 |
| `dsh-sidebar` | 设置 → **侧边卡片** | 右侧文件 / 编辑器 / Git / 终端面板 |
| `dsh-market` | 侧边栏 → **市场** | 浏览并安装第三方插件 |

## 模型 — `dsh-providers`

用官方会员登录 Codex、Claude、Grok、Qwen、Kimi，或直接存 API Key —— 都在一个设置页里。聊天的模型选择器只列出你启用的模型，保持简短和相关。**智能选择**默认关闭；只有打开后，每个人类提问才可能在你已勾选的模型里换一个。

<ThemeShot light="/models.webp" dark="/models-dark.webp" alt="设置 → 模型" />

还没接入的厂商收在 **添加厂商** 里。

## IM 数字员工 — `dsh-im`

把本机 Harness 接到你已经在用的聊天软件：微信、企业微信、飞书、钉钉、Slack 等共九个渠道。在手机上发条消息，Agent 在你的电脑上干活，结果回到同一个会话里。

<ThemeShot light="/imbot.webp" dark="/imbot-dark.webp" alt="侧边栏 → IM机器人：企业微信手动接入" />

扫码、粘贴 App Manifest 或填机器人凭据 —— 每个渠道都有自己的接入说明。

::: info 企微聊天 vs 企微办公
企业微信**聊天**在 `dsh-im` 里；企业微信**办公**能力（日历、文档、会议等）是独立插件 `dsh-wecom-office`，需要 `PATH` 上有官方 `wecom-cli`。
:::

## 企业微信办公 — `dsh-wecom-office`

让模型通过官方 `wecom-cli` 使用企微日历、在线文档、会议、通讯录、表格、待办和微盘。在 侧栏 → **IM机器人** → 企业微信机器人卡片 上配置。

## 小桃子界面 — `dsh-xtz-ui`

品牌层：欢迎页、蜜桃色主题、会话归档、任务板、Git 图，以及 设置 → **小桃子** 下的功能开关。不需要的都可以关掉。

<ThemeShot light="/xiaotaozi-settings.webp" dark="/xiaotaozi-settings-dark.webp" alt="设置 → 小桃子" />

第一次打开会看到欢迎卡。关掉其它开关时，品牌层仍在。

<ThemeShot light="/welcome.webp" dark="/welcome-dark.webp" alt="欢迎" />

## 侧边卡片 — `dsh-sidebar`

右侧面板：文件、编辑器、Git 状态和终端 —— 不用离开聊天就能检查 Agent 干了什么。

<ThemeShot light="/workbench.webp" dark="/workbench-dark.webp" alt="对话旁的文件栏" />

## 市场 — `dsh-market`

第三方插件目录。见[插件市场](/zh/guide/market)。

<ThemeShot light="/market.webp" dark="/market-dark.webp" alt="侧边栏 → 市场" />
