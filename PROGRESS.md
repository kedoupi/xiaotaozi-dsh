# PROGRESS：BACKLOG 1–10 执行记录

> 日期：2026-08-28。范围来自 user 的“全部”：执行 `BACKLOG.md` 原 1–10。最终自动 gate 已完成；本机 cold-start smoke 因另一个 checkout 占用固定 3081 而安全拒绝，不能声称 cold start 成功。

## 总体状态

| 项目 | 实现 | 分项验证 | 最终集成 |
| --- | --- | --- | --- |
| 1 Market intent 结算 | 已落地 | Market 9 files / 49 tests | 集成 gate exit 0 |
| 2 Board orphan 恢复 | 已落地 | XTZ UI 83 tests | 集成 gate exit 0 |
| 3 CLI PID identity | 已落地 | CLI 64 tests | `pnpm check:cli` exit 0 |
| 4 Market pinned DSH | 已落地 | resolver/mutation tests 纳入 Market 49 tests | 集成 gate exit 0；真实 add/remove 未跑 |
| 5 JSON 错误策略 | 四个目标 store 已落地 | XTZ UI/Market 错误 fixtures | 集成 gate exit 0 |
| 6 Sidebar 边界测试 | 已落地 | Sidebar 36 tests | 集成 gate exit 0 |
| 7 sandbox cold start | 脚本与 CI 已落地 | scripts 54 tests | 本机 smoke 安全拒绝；clean-runner 成功仍待 CI |
| 8 Website CI/build | 已落地 | frozen install/build exit 0；audit exit 1 | workflow 已配置，远端 runner 待观察 |
| 9 Market Sources 降级 | 已落地 | route/UI contract 纳入 Market 49 tests | 集成 gate exit 0 |
| 10 IM type ratchet | 已落地 | IM 1020 tests | 集成 gate exit 0 |

最终根 `pnpm check` 为 exit 0：六插件共 1331 tests（IM 1020 / Market 49 / Providers 95 / Sidebar 36 / WeCom Office 48 / XTZ UI 83），另有 scripts 54 tests。

## 1. Market intent 结算

**根因。** POST route 把 pending intent 写入 `intents.json` 后等待同步 mutation，却没有成功/失败的终态或清理；Client 只要看到 intent 就永久禁用 entry。

**改动文件与符号。**

- `plugins/market/src/intents.ts#settleIntent/#loadIntents/#saveIntents`
- `plugins/market/src/routes.ts#registerMarketRoutes`
- `plugins/market/src/client/api.ts#queueIntent`
- `plugins/market/src/client/MarketPanel.tsx#MarketPanel`
- `plugins/market/tests/intents.test.ts#describe(settleIntent)/#describe(intent store)`
- `plugins/market/tests/routes.test.ts#describe(intentFromBody)/#describe(market route lifecycle)`

**结果。** success/failure 都结算；每次请求有 UUID `requestId`，`settleIntent` 只移除该身份，同毫秒相同请求不会互相结算；旧记录生成稳定 legacy ID。reload/retry 恢复可用。结算写失败时返回 `mutationApplied` 与 `market-state-*`，明确提示是否已经执行 plugin mutation。

**验收。** Market 9 个 test file、49 个 test 通过，且进入 exit 0 的根 `pnpm check`：

```bash
pnpm --filter dsh-market test
pnpm --filter dsh-market build
```

**残余。** mutation 与 intent write 不是事务；Host 在 append 后崩溃会留下 orphan pending，当前无恢复协议。

## 2. Board orphan running 恢复

**根因。** `BoardService.run` 先写 running execution，异步 Session 创建后才 attach；两步间 Host 退出会让无 `sessionId` execution 永久 running。

**改动文件与符号。**

- `plugins/xtz-ui/src/board/ledger.ts#ORPHANED_EXECUTION_ERROR/#failOrphanedRuns`
- `plugins/xtz-ui/src/board/service.ts#BoardService.constructor`
- `plugins/xtz-ui/tests/board-service.test.ts#describe(BoardService)`

**结果。** remount 时将 orphan 结算为 failed 并保存；不会自动重放任务。

**验收。**

```bash
pnpm --filter dsh-xtz-ui test
pnpm --filter dsh-xtz-ui build
```

状态：XTZ UI 83 tests，根 `pnpm check`、`check:build` 均 exit 0。

**残余。** Board 一般 mutation 仍会先改内存再写盘；constructor 恢复写失败可能阻止插件挂载，降级合同未知。

## 3. CLI PID 代际身份

**根因。** 旧 PID record 不能区分原进程与 OS 后来复用同一 PID 的进程。

**改动文件与符号。**

- `apps/cli/src/service.ts#WebPidRecord/#parseWebPidRecord`
- `apps/cli/src/runtime.ts#readProcessIdentity/#stopProcess/#spawnDshDetached/#spawnDshForeground`
- `apps/cli/src/app.ts#inspectWebPid/#writeWebPid/#stopCommand/#restartCommand`
- `apps/cli/src/index.ts#readProcessIdentity/#stopProcess`
- `apps/cli/tests/cli.test.mjs#test(stop refuses a reused pid...)/#test(stop rechecks identity...)`
- `apps/cli/tests/process-identity.test.mjs#test(process identity protects...)/#test(Darwin/BSD ps identity...)`

**结果。** Linux 使用 boot-id + `/proc/<pid>/stat` starttime，Windows 使用 PowerShell StartTime ticks，Darwin/BSD 使用固定 C locale/UTC 的 `ps lstart`；发送 TERM、等待和 KILL 前均复核。真实短命 Node child 测试证明 mismatch 不杀、匹配才停，并证明调用方切换 locale/timezone 不改变 Darwin/BSD identity。

**验收。** 在 exact Node 22.19.0 下，`pnpm check:cli` exit 0、64/64 tests：

```bash
pnpm check:cli
```

**残余。** Linux/Windows/BSD 分支尚缺本轮实机结果；旧 live PID record 无 identity 时会安全拒绝停止；仍有极小的 identity-read → signal TOCTOU。

## 4. Market 使用当前 Host 的 pinned DSH

**根因。** 原实现执行 PATH 上的 `dsh`，与 `xtz` 启动的 pinned Host 形成版本和可执行文件分叉。

**改动文件与符号。**

- `plugins/market/src/plugin-mutate.ts#PINNED_DSH_VERSION/#resolvePinnedDshLaunch/#spawnDshPluginMutate`
- `plugins/market/tests/plugin-mutate.test.ts#describe(resolvePinnedDshLaunch)/#describe(spawnDshPluginMutate)`
- `scripts/check-manifest.mjs#checkVersionsAndDocs`

**结果。** 从当前 `process.argv[1]` 解析所属 `@deepseek-ai/dsh` package，验证 exact version 和 package bin，使用 `process.execPath` 启动，并继续固定当前 `DSH_HOME`。manifest gate 要求 literal 与 `versions.json#dshRc` 相等。

**验收。** Resolver/error/mutation 用例纳入 Market 49 tests；`pnpm test:scripts`、`pnpm check:path` 均 exit 0：

```bash
pnpm --filter dsh-market test
pnpm --filter dsh-market build
pnpm test:scripts
pnpm check:path
```

**残余。** 真实 sandbox add/remove 未跑。timeout 只 SIGTERM 后就返回，child 是否结束/是否部分执行 durable mutation未知。

## 5. JSON 持久化错误策略

**根因。** ENOENT、读取失败、JSON 损坏与 schema 错误都曾被当作空状态，后续保存会无声覆盖可恢复数据。

**改动文件与符号。**

- `plugins/xtz-ui/src/archive/store.ts#JsonStoreError/#readJsonFile/#rejectJsonSchema/#writeJsonFile`
- `plugins/xtz-ui/src/archive/ledger.ts#readWorkspace/#readProjcache/#checkpointRow`
- `plugins/xtz-ui/src/board/store.ts#loadBoard/#saveBoard`
- `plugins/xtz-ui/src/dsh-home.ts#adoptLegacyPluginFileOnce/#legacyHelloBoardMigrationMarkerPath`
- `plugins/xtz-ui/src/client/ArchivePanel.tsx#ArchivePanel`
- `plugins/xtz-ui/tests/store.test.ts#describe(JSON store diagnostics)`
- `plugins/market/src/state-store.ts#MarketStateError/#loadMarketState/#saveMarketState`
- `plugins/market/src/intents.ts#loadIntents/#saveIntents`
- `plugins/market/src/sources-store.ts#loadSources/#saveSources`
- `plugins/market/tests/intents.test.ts#describe(intent store)`
- `plugins/market/tests/sources-store.test.ts#describe(source store)`
- `plugins/market/tests/routes.test.ts#describe(market route lifecycle)`

**结果。** 只有 ENOENT 为空；损坏 JSON/schema 显式报错，XTZ UI 会隔离为唯一 `.corrupt-*`；projection cache 先验证通用 row envelope，仅当前 stateVersion 解析值，合法 stale row 保留但不误读。原子 commit 失败保留原文件，Market 保留原状态并返回可操作错误。

**验收。**

```bash
pnpm --filter dsh-xtz-ui test
pnpm --filter dsh-market test
pnpm check:build
```

状态：XTZ UI 83、Market 49 tests；根 `pnpm check`、`check:build` 均 exit 0。

**残余。** `settings-store.ts#loadSettings` 仍静默回退；Archive delete 非事务；临时写 + rename 没有 fsync；Windows rename 与 read→quarantine 路径替换竞态未知。

## 6. Sidebar 高权限边界测试

**根因。** 文件写、Git 与 PTY 过去主要靠单元 seam，缺少真实临时目录和 Git 子进程的组合行为证据。

**改动文件与符号。**

- `plugins/sidebar/src/path-security.ts#ensureWorkspacePath/#ensureWorkspaceWritePath`
- `plugins/sidebar/src/fs-operations.ts#writeWorkspaceUpload`
- `plugins/sidebar/src/pty-manager.ts#PtyManager`
- `plugins/sidebar/src/git.ts#stage/#diff/#commit/#status/#resolveWorktree`
- `plugins/sidebar/tests/boundary-integration.test.ts#describe(workspace filesystem boundary)/#describe(PTY process lifecycle boundary)/#describe(Git child-process boundary)`

**结果。** 覆盖 symlink escape、canonical path、原子 upload、大小/路径拒绝、fake PTY 生命周期与 quota、真实临时 Git repo 的 stage/diff/commit/status/worktree 边界。

**验收。** Sidebar 36 tests，typecheck/build 及根 `pnpm check:path` 均 exit 0：

```bash
pnpm --filter dsh-sidebar test
pnpm --filter dsh-sidebar build
pnpm check:path
```

**残余。** 没有真实 WebSocket route、真实 node-pty、断连、背压或动态 symlink TOCTOU。

## 7. Disposable sandbox cold-start smoke

**根因。** `check:path` 与 CLI fake-home 都不会启动真实 pinned Host 并验证六插件 mount。

**改动文件与符号。**

- 根 `package.json#scripts.smoke:sandbox`
- `scripts/smoke-sandbox.mjs#assertFreshSandboxHome/#waitForSandboxReady/#waitForPluginMounts/#validateDoctorReport/#validateSandboxProfile/#readSandboxPidRecord/#waitForRecordedProcessGone/#cleanupSmokeRun/#main`
- `scripts/smoke-sandbox.test.mjs#test(cleanup stops a PID-recorded child before bind...)/#test(mount verification requires...)`
- `.github/workflows/check.yml#jobs.sandbox-smoke`

**结果。** 脚本只允许新建 `.dsh-home` 和空闲 3081，验证 identity、六 ready/mount marker、doctor 与 profile links/bundles；Sidebar degraded PTY 不算 ready，Market marker 只在 routes 注册成功后出现。TERM/KILL 有界，清理不依赖端口是否已经监听：先捕获 PID generation，无条件走 identity-safe `xtz --sandbox stop`，确认原代际消失且端口为空后才删 home。SIGINT/SIGTERM listener 在 spawn 前安装并走同一 cleanup。

**验收。**

```bash
pnpm test:scripts
pnpm smoke:sandbox
```

状态：script unit tests 已进入 exit 0 的 scripts 54 tests。本机真实 `pnpm smoke:sandbox` 为 exit 1：当前 checkout 的 `.dsh-home` 不存在，但 3081 已被另一 checkout 的 sandbox 占用；脚本在任何写入/构建前拒绝，未杀该进程，也未触碰 official home/3080。**因此本轮没有 cold-start 成功证据**；clean GitHub runner 的 `sandbox-smoke` job 已配置，尚待远端运行。

**残余。** Linux-only CI；不验证浏览器 UI、外部平台、真实 Market add/remove。

## 8. Website CI 与依赖评估

**根因。** Website 是独立 workspace，原 root CI 不会安装或构建；描述还残留 Desktop。audit 修复线跨 Vite major。

**改动文件与符号。**

- `.github/workflows/check.yml#jobs.website`
- `apps/website/.vitepress/config.mts#defineConfig.description`

**结果。** CI 做 frozen install + build，文案改为 `xtz` CLI/browser。没有违反约束做 major upgrade。

**验收。** frozen install/build exit 0；`pnpm audit` exit 1，仍为 1 high、3 moderate：

```bash
cd apps/website
pnpm install --frozen-lockfile
pnpm build
pnpm audit
```

**残余/延期。** Vite major 升级需独立批准；生产是否运行 dev/preview server未知。

## 9. 第三方 Market Sources 诚实降级

**根因。** Source add UI/route 曾接受数据，但 `catalogEntriesFor` 对非 builtin 永远为空，没有远端 fetch/security contract。

**改动文件与符号。**

- `plugins/market/src/routes.ts#mutateSources`
- `plugins/market/src/catalog.ts#catalogEntriesFor`
- `plugins/market/src/client/MarketPanel.tsx#Sources`
- `plugins/market/src/client/locales.ts#sourcesHint/#thirdPartyDisabled`
- `plugins/market/src/client/api.ts#addSource/#removeSource`
- `plugins/market/src/config.ts#resolveMarketConfig`
- `plugins/market/tests/routes.test.ts#describe(mutateSources)/#describe(market route lifecycle)`
- `plugins/market/README.md`、`plugins/market/README.zh.md`、`plugins/market/docs/prd.zh.md`、`plugins/market/docs/technical.zh.md`

**结果。** 新增 source 返回 501，Client 明示 unsupported；旧 source 记录仍可移除。没有实现远程 fetch。

**验收。** Contract 用例纳入 Market 49 tests；Market test/build 与根集成 gate exit 0。

**残余。** 真正的 fetch、验签、缓存、供应链策略不在本轮；PRD 与技术示例已明确当前 3 条 `MARKET_PLUGINS`、source add 501，以及 profile-derived `installed` 的边界。

## 10. IM `@ts-nocheck` ratchet

**根因。** 生产源码的大量 directive 会削弱 typecheck，且原 gate 不阻止数量继续增长。

**改动文件与符号。**

- `plugins/im/src/channels/shared/session-binding-lock.ts#withSessionBindingLock`
- `scripts/check-manifest.mjs#IM_TS_NOCHECK_MAX/#tsNoCheckDirectiveCount/#checkImTsNoCheckBudget`
- `scripts/check-manifest.test.mjs#test(IM ts-nocheck budget...)`

**结果。** 一个共享文件移除 directive；生产基线从 229 降到 228。gate 使用当前 TypeScript parser 识别 `//`、`///`、大小写和前置 block 后的真实 pragma，并要求精确相等：增长失败，下降也要求立即降低常量，避免回升。

**验收。** IM typecheck、109 files/1020 tests 与根集成 gate均 exit 0：

```bash
pnpm --filter dsh-im typecheck
pnpm --filter dsh-im test
pnpm test:scripts
pnpm check
```

**残余。** 228 个 directive 仍在；后续只能逐 slice 迁移，不得批量改九个渠道语义。

## 验证过程中已修正的测试/环境问题

- Sidebar path test 首次在 macOS 因 `/var` 与 `/private/var` 的 canonical path 不同失败；fixture 改为用 `realpath` 比较后通过。它不是业务行为修复，证据：`plugins/sidebar/tests/boundary-integration.test.ts#describe(workspace filesystem boundary)`。
- smoke unit test 曾遗漏导入 `waitForPluginMounts`，导致单个 script test ReferenceError；当前 `scripts/smoke-sandbox.test.mjs#test(mount verification requires...)` 已覆盖该路径，scripts 54 tests 最终通过。
- Website audit 非测试偶发：当前 lock 对应的 advisory 需要跨 major 升级，故保留 exit 1 并记录为延期风险。

## 最终验收

在 exact Node `22.19.0`、pnpm `11.22.0` 下，从当前完整 checkout 依次运行：

| 命令 | 真实结果 |
| --- | --- |
| `pnpm check` | exit 0；插件 1331 tests + scripts 54 tests |
| `pnpm check:build` | exit 0 |
| `pnpm check:path` | exit 0；6/6 isolated Git path install/build |
| `pnpm check:cli` | exit 0；64 tests |
| `pnpm smoke:sandbox` | exit 1；3081 被另一 checkout sandbox 占用，preflight 安全拒绝；未写入/未杀进程/未碰 official |
| `cd apps/website && pnpm install --frozen-lockfile && pnpm build` | exit 0 |
| `cd apps/website && pnpm audit` | exit 1；1 high、3 moderate，Vite/esbuild dev toolchain；修复需 Vite `>=6.4.3` major，延期 |
| 根/CLI `pnpm audit` | exit 0 |
| `pnpm check-home` | exit 0 |
| workflow YAML parse、`node --check` | exit 0 |
| tracked `git diff --check` + untracked trailing-whitespace scan | exit 0 |

本轮未以 official `~/.dsh` 或 3080 作为测试目标。真实 external Provider/IM/WeCom、浏览器 UI/WebSocket、Market add/remove、cold-start 成功与生产部署没有当前本机验收，继续明确标 **未知**。
