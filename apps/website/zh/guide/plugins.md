# 插件介绍

首次 `xtz start` 会自动种上六个自研插件。每个插件只做一件事，在界面里也只占一个位置。

打开 **新会话** 下方的 **插件中心**。它占用会话主区域，侧栏和右侧工作台保持可用。默认打开 **已安装**。运行参数在 **设置 → 高级**。

| 插件 | 位置 | 作用 |
| :-- | :-- | :-- |
| `dsh-providers` | 插件中心 → 已安装 → **模型** | 会员登录和 API Key 一页搞定；聊天里只列出你勾选的模型。可选智能选择，默认仍是手动 |
| `dsh-im` | 插件中心 → 已安装 → **IM 机器人** | 九个聊天渠道，外加实验性的 AI Office 连接器 |
| `dsh-wecom-office` | 插件中心 → 已安装 → **IM 机器人** → 企业微信机器人卡片 | 企微日历、文档、会议、通讯录、表格、待办和微盘 |
| `dsh-xtz-ui` | 插件中心 → 已安装 → **小桃子功能**；设置 → 高级 | 品牌界面、归档、Git 图和功能开关 |
| `dsh-sidebar` | 插件中心 → 已安装 → **侧边工作台** | 右侧文件 / 编辑器 / Git / 终端面板 |
| `dsh-market` | **插件中心** | 已安装能力与 **发现插件**；点 **安装** 添加第三方插件 |

## 模型 — `dsh-providers`

用官方会员登录 Codex、Claude、Grok、Qwen、Kimi，或直接存 API Key —— 都在 **插件中心 → 已安装 → 模型**。聊天的模型选择器只列出你启用的模型，保持简短和相关。**智能选择**默认关闭；只有打开后，每个人类提问才可能在你已勾选的模型里换一个。

**插件中心迁移前示例：** 以下截图早于本次迁移，不代表插件中心的新导航或布局。替换截图待浏览器验收后补充。

<ThemeShot light="/models.webp" dark="/models-dark.webp" alt="插件中心迁移前的模型页" />

还没接入的厂商收在 **添加厂商** 里。

## IM 机器人 — `dsh-im`

把本机 Harness 接到你已经在用的聊天软件：微信、企业微信、飞书、钉钉、Slack 等共九个渠道。在手机上发条消息，Agent 在你的电脑上干活，结果回到同一个会话里。

<ThemeShot light="/imbot.webp" dark="/imbot-dark.webp" alt="插件中心迁移前的 IM 机器人：企业微信手动接入" />

扫码、粘贴 App Manifest 或填机器人凭据 —— 每个渠道都有自己的接入说明。

::: info 企微聊天 vs 企微办公
企业微信**聊天**在 `dsh-im` 里；企业微信**办公**能力（日历、文档、会议等）是独立插件 `dsh-wecom-office`，需要 `PATH` 上有官方 `wecom-cli`。
:::

## 企业微信办公 — `dsh-wecom-office`

让模型通过官方 `wecom-cli` 使用企微日历、在线文档、会议、通讯录、表格、待办和微盘。在 **插件中心 → 已安装 → IM 机器人** → 企业微信机器人卡片 上配置。

## 小桃子界面 — `dsh-xtz-ui`

品牌层：欢迎页、蜜桃色主题、会话归档、Git 图，以及 **插件中心 → 已安装 → 小桃子功能** 下的功能开关。不需要的都可以关掉。运行参数仍在 **设置 → 高级**。

<ThemeShot light="/xiaotaozi-settings.webp" dark="/xiaotaozi-settings-dark.webp" alt="插件中心迁移前的小桃子功能开关" />

第一次打开会看到欢迎卡。关掉其它开关时，品牌层仍在。

<ThemeShot light="/welcome.webp" dark="/welcome-dark.webp" alt="欢迎" />

## 侧边工作台 — `dsh-sidebar`

右侧面板：文件、编辑器、Git 状态和终端 —— 不用离开聊天就能检查 Agent 干了什么。由 **插件中心 → 已安装 → 侧边工作台** 决定挂载哪些 Tab。

<ThemeShot light="/workbench.webp" dark="/workbench-dark.webp" alt="对话旁的文件栏" />

## 插件中心 — `dsh-market`

内置配置、已安装插件和精选 **发现插件**。见[插件市场](/zh/guide/market)。

<ThemeShot light="/market.webp" dark="/market-dark.webp" alt="插件中心迁移前的市场目录" />
