# 小桃子 CLI（`xtz`）

[English](README.md) | 中文

`xtz` 是小桃子 DSH 的**用户产品**：钉死版本的 dsh 外壳。`apps/cli/` 是独立、可发布的 pnpm workspace，不是 Harness 插件，也不加入根目录的 `plugins/*` workspace。

用户路径：直接运行 `xtz` / `xtz start` 会在第一次备好正式 `~/.dsh/profiles/web`，后台拉起官方 `dsh web`（默认 `127.0.0.1:3080`），打印地址并打开浏览器。额外插件在应用内市场安装。不会探测或回退到仓库沙箱 `.dsh-home` / `3081`。

CLI 运行时精确固定为 Node.js `22.19.0` 和 `@deepseek-ai/dsh` `0.1.1-rc.2`，其他 Node 或 DSH 版本都不视为兼容。npm 和 bun 只负责装包，`xtz` 始终用 Node 运行。

## 安装

先把 Node.js `22.19.0` 放到 `PATH`，然后任选一种：

```bash
curl -fsSL https://raw.githubusercontent.com/kedoupi/xiaotaozi-dsh/main/apps/cli/scripts/install.sh | sh
curl -fsSL https://raw.githubusercontent.com/kedoupi/xiaotaozi-dsh/main/apps/cli/scripts/install.sh | sh -s -- --bun
npm install -g xiaotaozi-dsh-cli
bun add -g xiaotaozi-dsh-cli
```

脚本在 npm 和 bun 都在时默认走 npm；`--bun` 或 `--pnpm` 可指定安装器。装完：

```bash
xtz --help
xtz
xtz doctor
```

## 当前开放命令

```bash
xtz                      # 等同 start
xtz start [--port N]     # 缺省时先种自研插件，后台启动，打印地址并打开浏览器
xtz stop                 # 停止 xtz 自己拉起的进程
xtz restart              # 先停再启
xtz open                 # 打开当前地址
xtz status               # 只读检查记下的端口
xtz doctor               # 检查运行时、xtz 戳、profile 和端口
xtz version              # 显示 CLI、Node 和固定 DSH 版本
xtz help                 # 显示帮助
```

默认地址是 `127.0.0.1:3080`。若该端口被其他程序占用，交互式 `xtz start` 可以改用 `3082+`（永远不用 `3081`）。非交互运行不会换端口，除非指定 `--port`。xtz 不会结束自己没拉起的进程。

`xtz` 只有在 loopback-only、带版本的小桃子身份端点返回精确 v1 契约时才判断服务健康。

额外插件：打开小桃子后在市场里安装。不要用 `xtz plugin`。

## 有意禁用

`init`、`plugin`、`run`、`ask`、`config dump`、`config defaults`、`update` 都会安全拒绝。

## 本仓库开发

`apps/cli/` 是独立 workspace，根目录 `pnpm install` 不会装它。Node 必须精确等于 `.node-version`。然后：

```bash
cd apps/cli
pnpm install
pnpm check
node lib/cli.js --help
node lib/cli.js version --json
```

`pnpm check` 做类型检查、重建 `lib/`，并用假 home 跑单测。真实 `~/.dsh` / `3080` 是用户环境。正式命令不会用 `.dsh-home` / `3081`。在本仓库里，`pnpm dev` 会跑 `node apps/cli/lib/cli.js --sandbox start --foreground`，沙箱和正式共用同一套 CLI。正式 home 不干净时 `doctor` 失败是预期行为，不要为了变绿而放宽检查。

正式 home 的默认种子由第一次 `xtz start` 写；额外插件走应用内市场。不要把本仓库 `link:` 进正式 web。

`pnpm link --global` 是可选步骤，只在需要像用户一样在 `PATH` 上有 `xtz` 时使用。

## 退出码

- `0`：请求的操作成功。
- `1`：服务未运行或就绪检查失败。
- `2`：参数错误、端口监听者身份未验证，或操作被安全策略拒绝。
