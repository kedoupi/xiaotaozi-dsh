# 小桃子 CLI（`xtz`）

[English](README.md) | 中文

`xtz` 是小桃子 DSH 的命令行主产品，面向熟悉终端和配置的用户。`apps/cli/` 是独立、可发布的 pnpm workspace，不是 Harness 插件，也不加入根目录的 `plugins/*` workspace。

首版定位是**只读安全基础**：它只检查正式环境 `~/.dsh` 和 `127.0.0.1:3080`，不会启动 DSH、执行任务、打开身份未验证的服务，或修改正式 profile；也不会探测或回退到仓库沙箱 `.dsh-home` / `3081`。

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
xtz doctor
```

## 当前开放命令

```bash
xtz --help               # 显示帮助
xtz --version            # 显示 CLI 版本
xtz version              # 显示 CLI、Node 和固定 DSH 版本
xtz status               # 只读检查 3080
xtz config path          # 显示正式 web profile 的补丁路径
xtz plugin list          # 直接读取 package.json 中的插件依赖
xtz doctor               # 只读检查运行时、Desktop 种子、profile 和端口元数据
```

`xtz` 只有在 loopback-only、带版本的小桃子身份端点返回精确 v1 契约时才判断服务健康。3080 上的其他 HTTP 响应只会报告“端口已占用但身份未验证”，不会打开或接管。

## 有意禁用

首版中，`start`、`web`、`open`、`run`、`ask`、`config dump`、`config defaults`、`stop`、`update` 都会安全拒绝。只有 Desktop 与 CLI 共同具备下面三项能力后才会开放：

1. 能证明引擎归属并管理生命周期的可信跨进程 supervisor；
2. 在现有产品级身份端点之上的实例归属认证；
3. 对正式 profile 准备和插件包更新加锁的事务边界。

因此首版也不承诺与 Desktop/Web 插件环境等价的 headless 任务能力。DSH 层看似只读的命令也可能准备或重写生成态 profile；当前 `xtz` 不会对 `~/.dsh` 调用它们。正式插件更新仍由 Desktop 验签并事务应用。

## 本仓库开发

`apps/cli/` 是独立 workspace，根目录 `pnpm install` 不会装它。Node 必须精确等于 `.node-version`。然后：

```bash
cd apps/cli
pnpm install
pnpm check
node lib/cli.js --help
node lib/cli.js version --json
node lib/cli.js doctor
```

`pnpm check` 做类型检查、重建 `lib/`，并用假 home 跑单测。`node lib/cli.js` 只读检查真实的正式环境 `~/.dsh` / `3080`。不要把 CLI 指到 `.dsh-home` / `3081`。正式 home 不干净时 `doctor` 失败是预期行为，不要为了变绿而放宽检查。

同时装了 Desktop 和 `xtz` 也不会多出写入命令：插件权仍归 Desktop，`plugin add` 保持拒绝。

`pnpm link --global` 是可选步骤，只在需要像用户一样在 `PATH` 上有 `xtz` 时使用。

## 退出码

- `0`：请求的只读操作成功。
- `1`：服务未运行或就绪检查失败。
- `2`：参数错误、端口监听者身份未验证，或操作被安全策略拒绝。
