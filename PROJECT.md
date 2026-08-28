# PROJECT：30 分钟接手指南

> 基线日期：2026-08-28。本文描述当前 checkout（含本轮 BACKLOG 1–10 的小范围修复）；所有结论都附仓库证据。更细的模块关系见 `MAP.md`，残余风险见 `RISKS.md`，执行记录见 `PROGRESS.md`。

## 一句话定位

**小桃子 DSH 是一个本地优先的 DeepSeek Harness 发行层：用户产品是 `xtz` CLI，它启动上游 `dsh web`，并首次安装本仓库的 6 个一方插件。** 它不是一套自带数据库的独立 Web/API 服务，也没有桌面客户端。证据：`README.md#xtz-cli`、`apps/cli/src/cli.ts`、`apps/cli/src/app.ts#runCli/#launchOn`、`apps/cli/src/plugin-spec.ts#DEFAULT_PLUGINS`、`AGENTS.md`。

## 谁会用、拿它做什么

主要有两类人：

- **user**：安装 `xiaotaozi-dsh-cli`，用 `xtz start` 在本机浏览器使用 Harness。证据：`apps/cli/package.json#bin.xtz`、`apps/cli/README.md#Install`。
- **插件作者/维护者**：在仓库沙箱里开发、链接并验证 6 个一方插件。证据：`CONTRIBUTING.md`、`docs/workflow.md#Dev-environment`。

核心用例：

1. 用 `xtz start` 启动本地 Harness Web，并在第一次启动时种下所有一方插件。证据：`apps/cli/src/app.ts#startCommand/#ensureOfficialProfile`、`apps/cli/src/plugin-spec.ts#DEFAULT_PLUGINS`。
2. 登录 Codex、Claude、Grok、Qwen、Kimi，选择对话模型，或生成图片/视频。证据：`plugins/providers/src/index.ts#apply`、`plugins/providers/src/rpc.ts#registerProvidersRpc`、`plugins/providers/src/tools/image-generate.ts#createImageGenerateTool`。
3. 把 Feishu、微信、钉钉、企业微信、QQ、Slack、Telegram、Discord、WhatsApp 等会话桥接到本机 Harness Session。证据：`plugins/im/src/index.ts#createImHostPlugin`、`plugins/im/src/channels/shared/text-harness-bridge.ts#TextHarnessBridge`。
4. 让模型通过外部 `wecom-cli` 使用企业微信日历、文档、表格、会议、通讯录、待办、微盘和邮件。证据：`plugins/wecom-office/src/tools.ts#registerOfficeTools`、`plugins/wecom-office/src/cli.ts#runWecomCli`。
5. 在 Web UI 中使用任务板/归档/Git 图谱、右侧文件/Git/终端面板和第三方插件市场。证据：`plugins/xtz-ui/src/index.ts#apply`、`plugins/sidebar/src/index.ts#apply`、`plugins/market/src/index.ts#apply`。

## 先建立正确的运行心智

这个仓库有且只有两套运行环境，不能混用：

| 环境 | 用途 | Home | 端口 | 入口 |
| --- | --- | --- | --- | --- |
| official | user 日常使用 | `~/.dsh` | 首选 `3080` | `xtz start` |
| sandbox | 本仓库插件开发 | `<repo>/.dsh-home` | 固定 `3081` | `pnpm dev` |

证据：`docs/conventions.md#Homes`、`scripts/sandbox-home.mjs#sandboxHome/#SANDBOX_PORT`、`apps/cli/src/home.ts#officialDshHome`。

最重要的边界：

- 不要把本仓库用 `link:` 挂到 official home；插件源码只在 sandbox 验证。
- 不要为了重置而删除整个 `~/.dsh`；其中有凭据和会话。
- `pnpm check-home` 只诊断 official 是否误链，不会修复。
- `pnpm dev` 只会在确认 3081 的监听者属于本仓库沙箱后才停止它；不会碰 3080。

证据：`AGENTS.md#Rules`、`docs/workflow.md#Dev-environment`、`scripts/sandbox-web.mjs#freeSandboxListenPort`。

## 本地启动：维护者路径

### 1. 工具链

建议直接使用仓库锁定版本，先确认：

```bash
node --version   # v22.19.0
pnpm --version   # 11.22.0
```

若本机使用仓库现有流程里的 fnm，可切换为：

```bash
fnm install 22.19.0   # 已安装可跳过
fnm use 22.19.0
```

版本唯一事实源是 `versions.json`：Node `22.19.0`、pnpm `11.22.0`、DSH `0.1.1-rc.2`、CLI `0.2.0`。根 workspace 声明 Node `>=22.19.0`，但 `apps/cli` 和 sandbox 启动要求精确 Node `22.19.0`。证据：`versions.json`、`package.json#engines`、`apps/cli/package.json#engines/#dependencies`、`scripts/sandbox-web.mjs#pinnedNodePath`。

### 2. 首次安装和检查

根 workspace 只包含 `plugins/*`；CLI 与网站是两个独立 workspace：

```bash
# 仓库根：六个插件
pnpm install --frozen-lockfile
pnpm check
pnpm check:build
pnpm check:path

# CLI：独立安装
cd apps/cli
pnpm install --frozen-lockfile
pnpm check
node lib/cli.js --help
node lib/cli.js version --json
cd ../..

# 文档站：独立安装
cd apps/website
pnpm install --frozen-lockfile
pnpm build
cd ../..
```

证据：`pnpm-workspace.yaml`、`package.json#scripts`、`apps/cli/package.json#scripts`、`apps/website/package.json#scripts`、`.github/workflows/check.yml#jobs`。

### 3. 启动开发沙箱

```bash
pnpm dev
```

它会构建/监听插件；当独立 `apps/cli` 的 DSH 依赖或 `lib/cli.js` 缺失时才安装/构建 CLI，然后执行 `xtz --sandbox start --foreground --no-open`。浏览器访问 `http://127.0.0.1:3081`；需要自动打开可用：

```bash
pnpm dev -- --open
```

只构建并启动一次、不监听/自动重启（服务仍在前台常驻，占用当前终端，按 Ctrl-C 正常停止）：

```bash
pnpm dev -- --once
```

只监听一个插件，例如 IM：

```bash
pnpm dev -- --filter im
```

证据：`scripts/sandbox-dev.mjs#usage/#parseSandboxDevArgs`、`scripts/sandbox-web.mjs#ensureXtzCli/#spawnSandboxWeb`。

> 本次接手审计没有执行 `pnpm dev`：它会创建/更新 `.dsh-home` 并启动服务，不属于只读状态检查。命令来自实现和现有开发流程，不是推测。

### 4. 可丢弃 cold-start smoke

在**没有 `.dsh-home`、且 3081 未被占用**的 checkout 中，可以运行：

```bash
pnpm smoke:sandbox
```

`scripts/smoke-sandbox.mjs#main` 会构建当前插件与 CLI，启动 pinned DSH sandbox，等待 exact identity、六个一方插件 ready/mount trace、`xtz doctor` required checks 与 profile 的 link/bundle；Sidebar 必须报告 `ready pty=ok`，degraded PTY 不算通过。`#cleanupSmokeRun` 无论 3081 是否已经监听都会按 PID identity 调用 `xtz --sandbox stop`，确认该进程代际消失且端口为空后才删除它创建的 `.dsh-home`。它拒绝复用已有 sandbox home，也不会读写 `~/.dsh` 或 3080。本轮本机实跑因 3081 已被另一个 checkout 的 sandbox 占用而在任何写入/构建前安全拒绝；因此 cold start 成功仍待 clean runner，见 `PROGRESS.md`。

## 本地启动：user 路径

发布后的 user 安装/启动命令是：

```bash
npm install -g xiaotaozi-dsh-cli
xtz --help
xtz start
xtz status
xtz doctor
```

也有 `apps/cli/scripts/install.sh` 和 bun 安装方式；入口最终都是 `apps/cli/package.json#bin.xtz`。第一次 `xtz start` 会从 `apps/cli/src/plugin-spec.ts#DEFAULT_PLUGINS` 的 Git tag/path 规格安装 6 个插件。official 默认监听 3080；若该端口属于无法确认的进程，CLI 应拒绝抢占。证据：`README.md#xtz-cli`、`apps/cli/src/app.ts#startCommand`、`apps/cli/src/flags.ts#resolveStartPort`、`apps/cli/src/ports.ts#alternatePorts`。

> 开发时不要用这个路径替代 sandbox，也不要把 checkout 链进 `~/.dsh`。

Sandbox 的 `link:` 指向当前 checkout；official 的 `DEFAULT_PLUGINS` 当前固定到 Git tag `v0.2.0`。因此不要拿 official `xtz start` 验证尚未发布的 HEAD 修改。证据：`scripts/link-plugin.mjs`、`apps/cli/src/plugin-spec.ts#DEFAULT_PLUGINS`。

CLI 的 PID 文件现在除 `pid/startedAt` 外还保存 `apps/cli/src/service.ts#WebPidRecord.identity`。`apps/cli/src/runtime.ts#stopProcess` 在 SIGTERM 前、等待期间和 SIGKILL 前重新读取进程代际；identity 不匹配或不可读时 fail closed，不按端口杀进程。Darwin/BSD 的 `#readPsProcessIdentity` 固定 `LC_ALL=C`、`LANG=C`、`TZ=UTC`，避免跨终端 locale/timezone 把同一进程误判为 PID 复用。旧版无 identity 的 live PID 记录需要人工确认，见 `RISKS.md`。

## 环境变量、配置与密钥从哪来

仓库没有 `.env.example`，也没有一个统一 `.env` 加载入口；配置来自 Harness Config/Settings、`$DSH_HOME` 下的文件和少量环境变量。

| 内容 | official | sandbox | 证据 |
| --- | --- | --- | --- |
| Harness home | `~/.dsh` | `<repo>/.dsh-home` | `apps/cli/src/home.ts#officialDshEnv`、`scripts/sandbox-home.mjs#sandboxEnv` |
| API Key | `$DSH_HOME/.credentials.yaml`，同名进程环境变量优先 | 如需真密钥，只复制该文件 | `plugins/providers/README.md#Data`、`docs/workflow.md#Dev-environment` |
| 模型 OAuth token | `$DSH_HOME/plugins/providers/auth.json`，权限 `0600` | 同相对路径 | `plugins/providers/src/auth/store.ts#SessionMap/#saveSession` |
| IM bot 配置/状态 | `$DSH_HOME/integrations/dsh-<channel>/...` | 同相对路径 | `plugins/im/src/host/channels/shared/production.ts#pluginPaths` |
| 企业微信办公 | `$DSH_HOME/plugins/wecom-office`；`cliPath` 默认是 PATH 上的 `wecom-cli`，也可配置其他可执行文件路径 | 同相对路径 | `plugins/wecom-office/src/cli.ts#runWecomCli`、`plugins/wecom-office/src/settings.ts#OFFICE_SETTINGS_DEFAULTS/#Config` |
| Sandbox trace | official 默认关闭 | `DSH_PLUGIN_TRACE=1`，设为 `0` 可静音 | `scripts/sandbox-home.mjs#sandboxEnv` |

其他明确入口：`DSH_IM_LANGUAGE` 控制 IM 文案；`DSH_SIDEBAR_SHELL` 覆盖 Windows 终端 shell；合法的 `XIAOTAOZI_DSH_INSTANCE_TOKEN` 是 64 位小写 hex，用于 identity 响应。证据：`plugins/im/src/channels/shared/i18n.ts#setImHostLanguage`、`plugins/sidebar/src/pty-manager.ts#defaultShell`、`plugins/xtz-ui/src/host-routes.ts#registerIdentityRoute`。

不要把 official 的 `sessions/` 或 `storages/` 复制到 sandbox。证据：`docs/conventions.md#Homes`。

## 生产/发布方式

这里的“生产”主要是 user 机器上的本地进程，不是仓库自带的云服务：`xtz` 启动其依赖里钉死版本的 `@deepseek-ai/dsh web`，并由浏览器访问 loopback。证据：`apps/cli/src/runtime.ts#resolveDshLaunch`、`apps/cli/src/ports.ts#webLaunchArgs`。

- CI 有插件 gate、三平台 CLI gate、Website frozen build 和 Ubuntu disposable sandbox smoke；仍没有 publish/deploy job。证据：`.github/workflows/check.yml#jobs.plugins/#jobs.cli/#jobs.website/#jobs.sandbox-smoke`。
- CLI 的预期发布单元是 npm 包 `xiaotaozi-dsh-cli` + 同版本 Git tag；一方插件通过 Git `#path:plugins/<slug>` 在 user 机器构建。证据：`apps/cli/package.json#publishConfig`、`apps/cli/src/plugin-spec.ts#DEFAULT_PLUGINS`、`docs/workflow.md#First-public-ship`。
- `apps/website` 构建 VitePress 静态文件到 `.vitepress/dist`，CI 现在会验证 frozen install + build；但部署目标仍写着发布时决定。生产站点和回滚方式：**未知**。证据：`apps/website/README.md`、`apps/website/package.json#scripts.build`、`.github/workflows/check.yml#jobs.website`。
- 仓库没有 Dockerfile、docker-compose、Makefile，也没有部署 workflow。因此不存在可从仓库证明的容器部署命令。

## 本轮验证状态

最终集成在 Node `22.19.0` 下得到：

| 命令 | 结果 | 它能证明什么 |
| --- | --- | --- |
| `pnpm check` | exit 0；六插件 1331 tests + scripts 54 tests | manifest/version/typecheck/unit/script gate 通过 |
| `pnpm check:build` | exit 0 | 六插件构建与产物策略通过 |
| `pnpm check:path` | exit 0；6/6 | 六插件隔离 Git path install/build 通过 |
| `pnpm check:cli` | exit 0；64 tests | CLI typecheck/build/fake-home + 真实短命 child identity/locale 测试通过 |
| Website frozen install + build | exit 0 | 当前 VitePress 静态站可 clean build |
| 根/CLI `pnpm audit` | exit 0 | 本次 advisory 数据下未报告已知漏洞 |
| Website `pnpm audit` | exit 1；1 high、3 moderate | Vite/esbuild dev toolchain 告警仍在；修复需 Vite `>=6.4.3` major，按约束延期 |
| `pnpm check-home` | exit 0 | official 没有链接本 checkout |
| workflow YAML parse、`node --check`、tracked `git diff --check` + untracked trailing-whitespace scan | exit 0 | CI/脚本语法与当前 checkout 的 whitespace gate 通过 |
| `pnpm smoke:sandbox` | exit 1；安全前置拒绝 | 当前 checkout 无 `.dsh-home`，但 3081 被另一 checkout 的 sandbox 占用；未写入、未杀进程、未碰 official |

插件测试分布：IM 1020、Market 49、Providers 95、Sidebar 36、WeCom Office 48、XTZ UI 83。详细命令与残余见 `PROGRESS.md`。

仓库没有 lint script/config，现有最接近的静态 gate 是各包 `typecheck`；也没有 coverage threshold。即使本轮自动 gate 绿色，仍不能证明真实 OAuth、九个 IM 渠道、真实 `wecom-cli`、浏览器 WebSocket、Market 真实 add/remove 或 production 外部协议可用。
