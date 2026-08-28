# MAP：仓库与运行流地图

> 先读 `PROJECT.md` 了解怎么跑；本文件回答“入口在哪里、请求怎么走、状态落在哪里”。上游 DeepSeek Harness 不在本仓库，凡无法从本仓库证明的部分都标为“未知”。

## 1. 总体结构

```text
user / browser / IM platform
            │
            ▼
       xtz CLI ──────────────── apps/cli
            │ 启动 pinned @deepseek-ai/dsh web
            ▼
  DeepSeek Harness host + browser shell     ← 上游实现不在本仓库
            │ 加载 Host/Client 入口
            ├─ providers       模型登录、adapter、生成工具
            ├─ im              外部聊天 ↔ Harness Session
            ├─ wecom-office    Harness tool ↔ wecom-cli
            ├─ xtz-ui          品牌、归档、任务板、Git 图谱
            ├─ sidebar         文件、Git、PTY、Side Chat
            └─ market          插件目录与 add/remove
```

关键判断：

- HTTP Server 归上游 `dsh web`，本仓库通过 Cordis/DSH 服务注册路由、RPC、UI slot 和工具；没有 Express/Fastify 主应用。证据：`apps/cli/src/runtime.ts#resolveDshLaunch`、`apps/cli/src/ports.ts#webLaunchArgs`、六个 `plugins/*/src/index.ts#apply`。
- 每个一方插件都是独立安装包，Host 入口构建为 `lib/index.js`，带 UI 的 Client 入口构建为 `lib/client.js`。证据：`plugins/*/package.json#exports/#dsh.client`、`plugins/*/tsdown.config.ts#entry`。
- 本仓库六个插件未发现 ORM、SQL migration、Redis、Kafka、RabbitMQ 或 BullMQ 依赖；业务状态主要是 `$DSH_HOME` 下的 JSON/YAML/目录，以及上游 Harness 的 Session/Settings/Credentials 服务。证据：各 `plugins/*/package.json` 与下文数据表。
- 跨模块最重要的业务标识是 `sessionId`：IM 绑定、侧卡工作区、任务执行、归档记录都围绕 Session。证据：`plugins/im/src/channels/shared/conversation-state-store.ts#ConversationStateStore`、`plugins/sidebar/src/index.ts#sessionCwdOf`、`plugins/xtz-ui/src/board/types.ts#ExecutionRecord`、`plugins/xtz-ui/src/archive/ledger.ts#ArchiveRecord`。

## 2. 顶层目录职责

| 路径 | 职责 | 关键入口/证据 |
| --- | --- | --- |
| `apps/cli/` | 可独立发布的 `xtz` user 产品；封装 pinned DSH、home、端口和进程生命周期 | `apps/cli/package.json#bin.xtz`、`apps/cli/src/cli.ts`、`apps/cli/src/app.ts#runCli/#launchOn` |
| `apps/website/` | 独立 VitePress 占位站点；不属于根 workspace | `apps/website/package.json#scripts`、`apps/website/README.md` |
| `plugins/` | 六个一方 Harness 插件；根 workspace 的唯一成员 | `pnpm-workspace.yaml#packages`、`apps/cli/src/plugin-spec.ts#DEFAULT_PLUGINS` |
| `plugins/providers/` | 模型订阅/API Key、adapter、模型选择、图片/视频工具 | `plugins/providers/src/index.ts#apply`、`plugins/providers/src/rpc.ts#registerProvidersRpc` |
| `plugins/im/` | 九个聊天渠道 + 实验性 AI Office；把外部消息映射为 Harness Session | `plugins/im/src/index.ts#createImHostPlugin`、`plugins/im/src/channels/shared/text-harness-bridge.ts#TextHarnessBridge` |
| `plugins/wecom-office/` | 把外部 `wecom-cli` 包装成 Harness office 工具和设置页 | `plugins/wecom-office/src/index.ts#apply`、`plugins/wecom-office/src/tools.ts#registerOfficeTools` |
| `plugins/xtz-ui/` | 品牌壳、归档、任务板、Git 图谱、identity/settings 路由 | `plugins/xtz-ui/src/index.ts#apply`、`plugins/xtz-ui/src/client/index.ts#apply` |
| `plugins/sidebar/` | 右侧文件/编辑器/Git/PTY/后台任务/子 Agent/Side Chat | `plugins/sidebar/src/index.ts#apply/#buildApi`、`plugins/sidebar/src/client/index.tsx#apply` |
| `plugins/market/` | 一方内置目录、source/intents 文件、当前 profile 的插件增删 | `plugins/market/src/index.ts#apply`、`plugins/market/src/routes.ts#registerMarketRoutes` |
| `templates/` | `pnpm new` 使用的 host/mixed 插件模板 | `scripts/new-plugin.mjs`、`templates/host-plugin`、`templates/mixed-plugin` |
| `scripts/` | 建插件、sandbox、链接、home 诊断、manifest/path-install gate，以及 disposable cold-start smoke | `scripts/sandbox-dev.mjs`、`scripts/link-plugin.mjs`、`scripts/check-manifest.mjs`、`scripts/smoke-sandbox.mjs#main` |
| `docs/` | 规范、工作流、文档索引；中英文成对 | `docs/README.md`、`docs/conventions.md`、`docs/workflow.md` |
| `.github/workflows/` | 插件、三平台 CLI、Website build 与 Ubuntu sandbox smoke CI；没有 deploy/publish job | `.github/workflows/check.yml#jobs.plugins/#jobs.cli/#jobs.website/#jobs.sandbox-smoke` |
| `.grok/skills/` | 本仓库维护流程的 agent skill，不进入产品运行时 | `.grok/skills/xiaotaozi-env/SKILL.md`、`.grok/skills/xtz-cli/SKILL.md` |

根目录没有 `pyproject.toml`、`go.mod`、Dockerfile、docker-compose 或 Makefile；这是 Node/pnpm 仓库。

## 3. 启动入口往下追

### 3.1 `xtz start`

```text
apps/cli/package.json#bin.xtz
  → apps/cli/src/cli.ts（解析 global flags、创建依赖）
  → apps/cli/src/app.ts#runCli
  → #startCommand → #launchOn
  → #ensureOfficialProfile
       ├─ 调 pinned DSH dump default config
       └─ 按 DEFAULT_PLUGINS 安装六个 Git path 插件
  → apps/cli/src/runtime.ts#spawnDshDetached/#spawnDshForeground
  → pinned @deepseek-ai/dsh web
```

关键安全/身份点：

- official home 由 `apps/cli/src/home.ts#officialDshHome/#officialDshEnv` 固定为 `~/.dsh`。
- Web 参数由 `apps/cli/src/ports.ts#webLaunchArgs` 生成，host 是 loopback。
- CLI 用 `$DSH_HOME/xiaotaozi-xtz-web.pid` 记录其启动进程的 PID 与代际 identity。`apps/cli/src/runtime.ts#readProcessIdentity/#stopProcess` 在 TERM/KILL 前复核 identity，PID 被复用或元数据不可读时 fail closed。证据：`apps/cli/src/service.ts#WebPidRecord/#WEB_PID_FILE`、`apps/cli/src/app.ts#inspectWebPid/#writeWebPid`。
- 健康/身份探测访问 `/.well-known/xiaotaozi-dsh/identity/v1`。调用端：`apps/cli/src/status.ts#probeService`；提供端：`plugins/xtz-ui/src/host-routes.ts#registerIdentityRoute`。
- sandbox 改走 `.dsh-home`/3081，并通过 `scripts/sandbox-web.mjs#spawnSandboxWeb` 运行同一 CLI 的 `--sandbox` 分支。

CI cold start 复用了这条真实入口：根 `package.json#scripts.smoke:sandbox` → `scripts/smoke-sandbox.mjs#main` → `ensureXtzCli`/root build/CLI build → `spawnSandboxWeb` → `waitForSandboxReady` + `waitForPluginMounts` + `validateDoctorReport` + `validateSandboxProfile` → `cleanupSmokeRun`。它只接受新建 `.dsh-home` 和空闲 3081；清理会先读取 `readSandboxPidRecord`，停止 wrapper 后无条件走 identity-safe CLI stop，再由 `waitForRecordedProcessGone` 确认原代际消失。端口只用于最终“必须为空”的断言，不用于选择 kill 目标。

### 3.2 浏览器页面/API 的通用流

```text
plugins/<name>/src/client/*#apply
  → 注册 Harness slot / 页面 / service
  ├─ 同源 fetch → 插件 Host route
  ├─ ctx.connection.rpc.call → 插件 Host RPC
  └─ ctx.apiProxy → Harness Host 的 llm/settings/credentials 等服务
  → Harness service / 本地文件 / 外部 API / 外部 CLI
```

市场、Xiaotaozi UI、Sidebar、WeCom Office 的 HTTP 面都有 loopback/origin 信任检查：

- `plugins/market/src/http.ts#rejectUntrusted`
- `plugins/xtz-ui/src/http.ts#rejectUntrusted`
- `plugins/sidebar/src/trust-fence.ts#isTrustedApiRequest`
- `plugins/wecom-office/src/loopback.ts#isLoopbackRequest/#isTrustedBrowserRequest`

IM 和 Providers 的订阅登录主要走 Connection RPC，其默认 authority 也限制 loopback。Providers 的 API-key 厂商、模型目录和设置则直接使用 `ctx.apiProxy` 露出的 `HostApi.llm/settings/credentials`。证据：`plugins/im/src/rpc-authority.ts#resolveRpcAuthority`、`plugins/providers/src/rpc.ts#registerProvidersRpc`、`plugins/providers/src/client/host-api.ts#HostApi`、`plugins/providers/src/client/index.ts#apply`。

## 4. 主要请求/任务流

### 4.1 IM 入站消息

```text
平台 SDK/WebSocket 事件
  → 渠道 Runtime
  → TextHarnessBridge.accept（校验、去重、按 conversation 串行）
  → 本地命令，或 askInWorkspaceSession
  → ConversationStateStore 查/写 conversation → sessionId
  → HarnessClient.createSession / ask
  → 本机 DSH /api/respond 与 /api/events.mux
  → 流式回复/制品经渠道 adapter 发回平台
```

证据：`plugins/im/src/channels/feishu/feishu-runtime.ts#FeishuRuntime`、`plugins/im/src/channels/wecom/wecom-runtime.ts#WecomRuntime`、`plugins/im/src/channels/qq/qq-runtime.ts#QqRuntime`、`plugins/im/src/channels/shared/text-harness-bridge.ts#TextHarnessBridge.accept/#process`、`plugins/im/src/channels/shared/workspace-session.ts#askInWorkspaceSession`、`plugins/im/src/channels/shared/harness-client.ts#HarnessClient`、`plugins/im/src/channels/shared/semantic/artifact-delivery.ts#deliverOutboundArtifacts`。

`/new`、`/workspace`、`/model`、`/preset`、`/stop` 在 bridge 内先处理。首次绑定后要等 user 确认工作区，避免把第一条 durable work 写进本仓库的 `process.cwd()`。证据：`plugins/im/src/channels/shared/bot-workspace-store.ts#BotWorkspaceStore`、`docs/conventions.md#Onboarding-and-first-work`。

### 4.2 模型与生成工具

```text
插件启动
  → providers.apply
  ├─ 为启用的厂商创建 TokenManager + Adapter
  ├─ ctx.llm.registerAdapter
  └─ 注册 image_generate / video_generate Harness tools

Models UI（登录与设置）
  → RPC /providers-auth
  → registerProvidersRpc.dispatch
  ├─ login/logout/status/usage/catalog/setModels/custom provider
  └─ image/video 端点只读取已生成媒体字节

Models UI（API-key 厂商/模型发现）
  → ctx.apiProxy
  → HostApi.llm/settings/credentials
  → 上游 Harness 可配置 provider

Harness 对话
  → 已注册的 vendor Adapter
  → Codex / Claude / Grok / Qwen / Kimi endpoint

模型调用 image_generate / video_generate
  → 对应厂商生成接口
  → 本地 images/ 或 videos/
```

证据：`plugins/providers/src/client/ModelsWorkspace.tsx#ModelsWorkspace`、`plugins/providers/src/client/host-api.ts#HostApi/#loadApiVendors/#saveApiKey/#saveHostModels`、`plugins/providers/src/rpc.ts#registerProvidersRpc/#dispatch`、`plugins/providers/src/index.ts#apply/#ProvidersAuthController.readImage/#ProvidersAuthController.readVideo`、`plugins/providers/src/providers/common.ts#TokenManager`、各 `plugins/providers/src/providers/*.ts#*Adapter`。

图片/视频工具由 `plugins/providers/src/tools/image-generate.ts#createImageGenerateTool` 和 `plugins/providers/src/tools/video-generate.ts#createVideoGenerateTool` 创建，并由 `plugins/providers/src/index.ts#apply` 注册；产物默认写本地插件目录。可用的 Harness `AttachmentStore` 实现来自上游，实际后端：**未知**。

### 4.3 插件市场安装

```text
MarketPanel
  → POST /api/dsh-market/intents
  → registerMarketRoutes
  → intentFromBody 生成 randomUUID requestId
  → appendIntent + save intents.json
  → spawnDshPluginMutate
  → resolvePinnedDshLaunch（当前 Host 的 exact @deepseek-ai/dsh package/bin/version）
  → process.execPath <dsh-bin> plugin --profile web add/remove
  → settleIntent + save intents.json（成功/失败都结算）
  → readProfileDependencies 推导 installed 状态
```

证据：`plugins/market/src/client/api.ts#queueIntent`、`plugins/market/src/routes.ts#registerMarketRoutes`、`plugins/market/src/intents.ts#appendIntent/#settleIntent/#saveIntents`、`plugins/market/src/plugin-mutate.ts#resolvePinnedDshLaunch/#spawnDshPluginMutate`、`plugins/market/src/profile-deps.ts#readProfileDependencies`。

这不是异步消费队列：同一 HTTP 请求会等待子进程结束，`InstallIntent.status` 仍只有 `pending`，只是 mutation 后按唯一 `requestId` 立即移除；同一毫秒的相同请求不会互相结算。旧记录由 `plugins/market/src/intents.ts#legacyRequestId` 得到稳定迁移身份。若结算状态文件写失败，route 会返回 `mutationApplied` 和 `market-state-*`，要求先修复再重试；Host 在两次写之间崩溃时的 orphan pending 恢复仍是**未知**。第三方 source add 会由 `plugins/market/src/routes.ts#mutateSources` 返回 501；本 build 不拉取远端 index，历史 source 只能移除。

### 4.4 任务板与定时任务

```text
Board client route
  → BoardService create/update/move/run/cancel
  → board.json
  → Host 重启时 failOrphanedRuns 将无 sessionId 的 running 结算 failed
  → 每 30 秒 tick 到期 schedule
  → runner.launchTask 创建/命名/prompt Harness Session
  → 每 5 秒 poll Session 状态
  → execution 结算 succeeded/failed/cancelled
```

证据：`plugins/xtz-ui/src/board/routes.ts#registerBoardRoutes`、`plugins/xtz-ui/src/board/service.ts#BoardService.constructor/#start/#tick/#poll`、`plugins/xtz-ui/src/board/ledger.ts#failOrphanedRuns/#ORPHANED_EXECUTION_ERROR`、`plugins/xtz-ui/src/board/runner.ts#launchTask`、`plugins/xtz-ui/src/board/types.ts#TaskRecord/#ExecutionRecord/#ScheduleRule`。恢复不会自动重放 durable work；`BoardService.tick` 通过 `skipMissed` 跳过停机期间错过的 cron，不做补跑。

### 4.5 Sidebar 文件/Git/终端

Client 的 `BetterSidebarService` 调 Host 的 `/sidebar/api/<method>`，覆盖：

- `session.cwd` 与 `fs.tree/search/read/write`
- `git.status/diff/stage/unstage/commit/branch/checkout/log/...`
- `jobs.output/kill`、`subagents.live`
- `settings.get/update`、`browser.probe`、`open.external`
- `sidechat.start/prompt/cancel/dispose/info`

文件上传/原始文件/HTML 预览分别走 `/sidebar/upload`、`/sidebar/file`、`/sidebar/html`；终端和 agent 事件走 `/sidebar/ws/terminal`、`/sidebar/ws/agent-terminals`、`/sidebar/ws/agent-opens`。证据：`plugins/sidebar/src/index.ts#buildApi/#apply`、`plugins/sidebar/src/client/index.tsx#apply`、`plugins/sidebar/src/pty-manager.ts#PtyManager`、`plugins/sidebar/src/agent-pty.ts#AgentPtyRegistry`、`plugins/sidebar/src/sidechat-routes.ts#buildSidechatApi`。

### 4.6 企业微信办公

```text
设置页 / Harness tool
  → OfficeController（CLI 探测、bot 选择、绑定、授权）
  → executeOfficeTool（service/allowWrite 检查）
  → runWecomCli
  → 外部 wecom-cli，强制 WECOM_CLI_CONFIG_DIR
  → 企业微信 API
```

证据：`plugins/wecom-office/src/status-route.ts#registerOfficeStatusRoute`、`plugins/wecom-office/src/office-controller.ts#OfficeController`、`plugins/wecom-office/src/tools.ts#registerOfficeTools/#executeOfficeTool`、`plugins/wecom-office/src/cli.ts#runWecomCli`。

## 5. API / RPC 面

| 模块 | 入口 | 证据 |
| --- | --- | --- |
| CLI identity | `/.well-known/xiaotaozi-dsh/identity/v1` | `plugins/xtz-ui/src/host-routes.ts#PRODUCT_IDENTITY_ROUTE/#registerIdentityRoute` |
| Providers | RPC `/providers-auth` | `plugins/providers/src/rpc.ts#PROVIDERS_CHANNEL` |
| IM | 聊天渠道 RPC `/feishu`、`/weixin`、`/dingtalk`、`/wecom`、`/qq`、`/slack`、`/telegram`、`/discord`、`/whatsapp`；实验性、默认关闭的 AI Office `/office`；另有 Session-follow RPC `/im` | `plugins/im/src/host/channels/*/rpc.ts#*_RPC_CHANNEL`、`plugins/im/src/index.ts#Config.officeEnabled/#channelEnabled`、`plugins/im/src/host/session-follow-rpc.ts#IM_FOLLOW_RPC_CHANNEL` |
| Market | `/api/dsh-market/catalog`、`sources`、`intents` | `plugins/market/src/names.ts#*_ROUTE` |
| WeCom Office | `/_dsh/dsh-wecom-office/status` | `plugins/wecom-office/src/names.ts#OFFICE_STATUS_ROUTE` |
| Xiaotaozi UI | identity、settings、archive、board、git graph | `plugins/xtz-ui/src/names.ts#*_PREFIX/#*_ROUTE` |
| Sidebar | `/sidebar/api`、upload/file/html/bundle + 3 条 WebSocket | `plugins/sidebar/src/index.ts#apply`、`plugins/sidebar/src/bundle-route.ts#registerBundleRoute` |

上游 Harness 完整 HTTP API、Session event schema 以及 Settings/Credentials 的落盘实现不在本仓库：**未知**。

## 6. 模型可见工具面

| 插件 | 工具 | 注册与开关证据 |
| --- | --- | --- |
| IM | `dsh_im_return_file`，让模型把现有文件/生成媒体送回聊天渠道 | `plugins/im/src/channels/shared/semantic/artifact.ts#OUTBOUND_ARTIFACT_TOOL/#installOutboundArtifactTool`、`plugins/im/src/index.ts#createImHostPlugin` |
| Providers | `image_generate`、`video_generate` | `plugins/providers/src/tools/image-generate.ts#createImageGenerateTool`、`plugins/providers/src/tools/video-generate.ts#createVideoGenerateTool`、`plugins/providers/src/index.ts#apply` |
| Sidebar | `terminal_create/list/send/read/wait_for/resize/signal/close` 与 `sidebar_open`；两组设置默认关闭 | `plugins/sidebar/src/tools.ts#registerTools`、`plugins/sidebar/src/agent-opens.ts#registerOpenTool`、`plugins/sidebar/src/prefs-shared.ts#SidebarPrefs/#SIDEBAR_PREFS_DEFAULTS`、`plugins/sidebar/src/index.ts#syncToolsGate/#syncOpenToolsGate` |
| WeCom Office | `OFFICE_TOOL_NAMES` 中的日历、文档、表格、会议、通讯录、待办、微盘、邮件、媒体和消息工具 | `plugins/wecom-office/src/names.ts#OFFICE_TOOL_NAMES`、`plugins/wecom-office/src/tools.ts#registerOfficeTools/#executeOfficeTool` |

Market 和 Xiaotaozi UI 未注册模型工具。Sidebar 工具会操作 user 工作区或启动进程；WeCom 写操作还受 `enabledServices/allowWrite` 检查。证据：`plugins/sidebar/src/tools.ts#registerTools`、`plugins/wecom-office/src/tools.ts#executeOfficeTool`。

## 7. 关键模型与持久化

| 数据/模型 | 落盘位置或所有者 | 代码证据 |
| --- | --- | --- |
| CLI Web 进程记录 `WebPidRecord`（PID、时间、代际 identity） | `$DSH_HOME/xiaotaozi-xtz-web.pid` | `apps/cli/src/service.ts#WebPidRecord/#WEB_PID_FILE`、`apps/cli/src/app.ts#writeWebPid`、`apps/cli/src/runtime.ts#readProcessIdentity` |
| IM bot 配置 | `$DSH_HOME/integrations/dsh-<channel>/config.json` | `plugins/im/src/host/channels/shared/production.ts#pluginPaths` |
| IM 工作区 `BotWorkspaceStore` | 同目录 `workspaces.json` | `plugins/im/src/channels/shared/bot-workspace-store.ts#BotWorkspaceStore` |
| conversation → Session、去重、cursor | `bots/<botId>/state.json`；微信为 `accounts/<botId>/state.json` | `plugins/im/src/channels/shared/conversation-state-store.ts#ConversationStateStore` |
| WhatsApp 登录态 | `$DSH_HOME/integrations/dsh-whatsapp/auth/*` | `plugins/im/src/host/channels/whatsapp/production.ts#createProductionController` |
| Provider OAuth `SessionMap` | `$DSH_HOME/plugins/providers/auth.json` | `plugins/providers/src/auth/store.ts#SessionMap/#authFilePath` |
| Provider 模型选择/发现缓存 | `selection.json` / `models.json` | `plugins/providers/src/auth/selection.ts#SelectionMap`、`plugins/providers/src/providers/catalog-store.ts#CatalogFile` |
| Provider 生成媒体 | `$DSH_HOME/plugins/providers/images/`、`videos/` | `plugins/providers/src/tools/image-generate.ts#imagesDirectory`、`plugins/providers/src/tools/video-generate.ts#videosDirectory` |
| 自定义 OpenAI-compatible provider | 配置交给上游 Settings namespace `llm-pi-ai`，API Key 交给上游 Credentials；具体文件未知 | `plugins/providers/src/custom-provider.ts#SETTINGS_NS/#CustomProviderStore.create` |
| Market source / `InstallIntent` | `$DSH_HOME/plugins/market/sources.json`、`intents.json`；仅 ENOENT 当空，损坏显式失败 | `plugins/market/src/state-store.ts#loadMarketState/#saveMarketState`、`plugins/market/src/sources-store.ts#saveSources`、`plugins/market/src/intents.ts#InstallIntent/#settleIntent/#saveIntents` |
| WeCom Office overlay | `$DSH_HOME/plugins/wecom-office/settings.json` | `plugins/wecom-office/src/settings.ts#WecomOfficeSettings/#settingsPath` |
| Board `TaskRecord/ExecutionRecord/ScheduleRule` | `$DSH_HOME/plugins/xtz-ui/board.json` | `plugins/xtz-ui/src/board/types.ts`、`plugins/xtz-ui/src/board/store.ts#saveBoard` |
| UI flags | `$DSH_HOME/plugins/xtz-ui/settings.json` | `plugins/xtz-ui/src/settings-store.ts#saveSettings` |
| Archive | `$DSH_HOME/storages/workspace.json`、`session_projcache.json`、`sessions/**` | `plugins/xtz-ui/src/archive/paths.ts#workspacePath/#projcachePath/#sessionsDir` |
| Sidebar 偏好 | 上游 settings namespace `dsh-better-sidebar`；具体文件未知 | `plugins/sidebar/src/prefs-shared.ts#SIDEBAR_PREFS_NS/#SidebarPrefs` |
| Sidebar PTY/open registry | 仅进程内存 | `plugins/sidebar/src/agent-pty.ts#AgentPtyRegistry`、`plugins/sidebar/src/agent-opens.ts#AgentOpenRegistry` |

本仓库未定义“关键 SQL 表”；如果在事故中找本仓库状态，应先确认正确的 `$DSH_HOME`，再看上表，而不是先找数据库。上游 Harness 是否使用其他存储实现：**未知**。

## 8. 定时器、队列与事件

本仓库未接入集中式 broker。实际并发/异步机制是：

| 机制 | 作用 | 持久化 | 证据 |
| --- | --- | --- | --- |
| Board 30s tick / 5s poll | cron 到期、Session 状态结算 | task/execution 写 `board.json` | `plugins/xtz-ui/src/board/service.ts#BoardService.start` |
| `TextHarnessBridge.#queues` | 同一 conversation 的消息串行 | conversation state 落盘，队列本身在内存 | `plugins/im/src/channels/shared/text-harness-bridge.ts#TextHarnessBridge.#queues/#enqueueMessage` |
| Connection supervisor | IM 健康检查与重连 | timer、retry index、running 状态只在内存；账户配置与 conversation state 另行落盘 | `plugins/im/src/host/channels/shared/connection-supervisor.ts#TokenConnectionSupervisor` |
| AI Office job queue | `queued/active/completed`、并发限制、lease renewal | 本地三个集合/Map 不持久；远端 Job 是否持久化未知 | `plugins/im/src/channels/office/office-job-executor.ts#OfficeJobExecutor` |
| AI Office events | `job.available`、`job.cancel`、`approval.reply` | 外部服务事件 | `plugins/im/src/channels/office/office-job-executor.ts#OfficeJobExecutor.handleEvent`、`plugins/im/src/channels/office/office-runtime.ts#OfficeRuntime` |
| Provider device/OAuth flow | 设备码 polling、本机 callback server | token 成功后写 `auth.json` | `plugins/providers/src/auth/device-flow.ts#DeviceFlowManager`、`plugins/providers/src/auth/oauth-flow.ts#OAuthFlowManager` |
| Side Chat maps | live agent disposer、首条消息 snapshot | map 本身不持久；Session 由 Harness 持久化 | `plugins/sidebar/src/sidechat-routes.ts#threadDisposers/#pendingSnapshots` |

## 9. 第三方集成

| 类别 | 集成 | 证据 |
| --- | --- | --- |
| 宿主 | `@deepseek-ai/dsh`、Cordis、DSH tools/session/scope | `versions.json#dshRc`、各插件 `package.json#dependencies` |
| 模型 | OpenAI/ChatGPT、Anthropic Claude、xAI/Grok、Qwen、Kimi；自定义 OpenAI-compatible `baseURL` | `plugins/providers/src/providers/{codex,claude,grok,qwen,kimi}.ts`、`plugins/providers/src/custom-provider.ts#CustomProviderStore` |
| IM | Feishu/Lark、微信、DingTalk、WeCom、QQ、Slack、Telegram、Discord、WhatsApp | `plugins/im/src/index.ts#CHANNELS`、`plugins/im/src/channels/` |
| WeCom Office | 默认使用 PATH 上的 `wecom-cli`（可由 `Config.cliPath` 改写）+ 企业微信接口 | `plugins/wecom-office/src/settings.ts#OFFICE_SETTINGS_DEFAULTS/#Config`、`plugins/wecom-office/src/cli.ts#runWecomCli`、`plugins/wecom-office/src/qr-auth.ts#OfficeQrAuth` |
| 插件分发 | GitHub Git specs、npm、当前 Host exact pinned DSH 的 `plugin --profile web`；远端 Market source 未实现 | `apps/cli/src/plugin-spec.ts#DEFAULT_PLUGINS`、`plugins/market/src/plugin-mutate.ts#resolvePinnedDshLaunch/#spawnDshPluginMutate`、`plugins/market/src/routes.ts#mutateSources` |
| 本机能力 | Git、shell、`node-pty`、文件系统、外部应用 launcher | `plugins/sidebar/src/git.ts#stage/#diff/#commit/#status`、`plugins/sidebar/src/pty-manager.ts#PtyManager`、`plugins/sidebar/src/open-external.ts#launchExternal` |
| 原生/媒体 | `sharp`、Mermaid、xterm | `plugins/im/package.json#dependencies.sharp`、`plugins/sidebar/package.json#dependencies` |

- 支付：未发现实现或依赖。
- 应用自身账号登录：未发现；Provider OAuth 和 IM/WeCom 凭据是对外集成授权，不是本产品的用户账号体系。
- Providers 页面还通过 `plugins/providers/src/client/host-api.ts#HostApi` 管理上游 Harness 声明的 API-key 厂商；这些内置 API-key adapter 的实现不在本仓库，具体行为：**未知**。
- 对象存储：未发现仓库内实现；`AttachmentStore` 的真实后端属于上游 Harness，**未知**。
- 第三方 market source 的远端 index 当前没有真正加载；`plugins/market/src/catalog.ts#catalogEntriesFor` 对非 builtin source 返回空列表。
