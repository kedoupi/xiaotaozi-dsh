# 快速开始

小桃子DSH 的用户产品是一个 CLI：**`xtz`**。它包了一层锁定版本的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)，负责准备官方 web profile，并在首次启动时种上六个自研插件。界面就是浏览器里的官方 `dsh web` —— 不需要装桌面客户端。

## 前置条件

- `PATH` 上有 **Node.js 22.19.0**。运行时精确锁定这个版本，其他版本不视为兼容。
- macOS 或 Linux。npm 和 bun 只作为安装器 —— `xtz` 始终跑在 Node 上。

::: tip 管理 Node 版本
如果你用 `fnm`、`nvm` 或 `mise` 这类版本管理器，先装好并激活 `22.19.0`，例如 `fnm install 22.19.0 && fnm use 22.19.0`。
:::

## 安装

三选一：

::: code-group

```bash [脚本]
curl -fsSL https://raw.githubusercontent.com/kedoupi/xiaotaozi-dsh/main/apps/cli/scripts/install.sh | sh
```

```bash [npm]
npm install -g xiaotaozi-dsh-cli
```

```bash [bun]
bun add -g xiaotaozi-dsh-cli
```

:::

npm 和 bun 都在时脚本优先用 `npm`；想指定就传 `--bun` 或 `--pnpm`：

```bash
curl -fsSL https://raw.githubusercontent.com/kedoupi/xiaotaozi-dsh/main/apps/cli/scripts/install.sh | sh -s -- --bun
```

## 第一次启动

```bash
xtz start
```

首次启动时 `xtz` 会：

1. 准备官方 Harness home：`~/.dsh/profiles/web`（只做一次）。
2. 种上全部六个自研插件 —— 模型、IM 数字员工、企业微信办公、小桃子界面、侧边卡片、市场。
3. 在 `127.0.0.1:3080` 后台启动官方 `dsh web` 服务。
4. 打印 URL 并打开浏览器。

![工作台](/workbench.jpg)

## 验证安装

```bash
xtz --help     # 命令总览
xtz status     # 只查看记住的端口，不做任何改动
xtz doctor     # 检查运行时、xtz 标记、profile 和端口
```

`xtz doctor` 是健康检查：验证锁定的 Node 和 DSH 版本、profile 状态和端口，哪里不对会明确告诉你。

## 下一步

- 接入模型厂商：打开 **设置 → 模型**。见[插件介绍](/zh/guide/plugins)。
- 在 IM 里和 Agent 聊天：侧边栏 → **IM bots**。
- 安装更多插件：侧边栏 → **市场**。见[插件市场](/zh/guide/market)。
- 完整命令列表：[CLI 命令参考](/zh/guide/commands)。

## 卸载

用安装时的方式卸载（`npm rm -g xiaotaozi-dsh-cli` 或 `bun remove -g xiaotaozi-dsh-cli`）。Harness home 会留在 `~/.dsh`，需要的话自行删除。
