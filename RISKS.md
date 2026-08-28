# RISKS：接手风险审计

> 基线日期：2026-08-28。本轮已针对原 BACKLOG 1–10 做小范围修复；本文件明确区分“已缓解”和“仍残余”。没有证据的地方继续标 **未知**，不会因为测试绿色而推断生产状态。

## 先看结论

| 原风险 | 本轮状态 | 仍需警惕 |
| --- | --- | --- |
| Market intent 永久 queued | **已缓解** | mutation 与 intent 结算不是事务；结算写失败必须先修状态文件 |
| `xtz stop/restart` 只按 PID 发信号 | **已缓解** | Linux/Windows/BSD 实机证据不足；旧 PID record 无 identity 会安全拒绝 |
| Board 无 Session 的 orphan running | **已缓解** | Board 普通写操作仍可能出现内存/磁盘失配 |
| Market 执行 PATH 上错误版本 DSH | **已缓解** | Market 的 pinned version literal 必须与 `versions.json` 同步 |
| Board/Archive/Market 损坏 JSON 静默当空 | **已缓解** | XTZ UI `settings.json` 仍静默回退；Archive 多文件删除不具事务性 |
| Sidebar 高权限路径无行为安全网 | **部分缓解** | 真实 WebSocket、真实 PTY、断连与动态 TOCTOU 仍未覆盖 |
| CI 没有 cold start、Website build | **已补 gate** | smoke 只覆盖 Linux 本地 Host 启动，不覆盖浏览器和真实外部集成 |
| IM `@ts-nocheck` 可继续增长 | **已止血** | 生产源码仍有 228 个 directive，主体 typecheck 证明力仍弱 |
| Website dev toolchain audit 告警 | **未消除，明确延期** | 当前仍为 1 high、3 moderate；需单独批准 Vite major 兼容升级 |

最终集成命令和真实退出码见 `PROGRESS.md`。本机 cold-start smoke 只有“安全拒绝被占用端口”的证据，没有启动成功证据。

## 1. 已缓解：Market intent 不再永久卡住

`plugins/market/src/routes.ts#intentFromBody` 为每次请求生成 UUID `requestId`；`plugins/market/src/intents.ts#settleIntent` 只按该身份移除本次 pending，旧记录由 `#legacyRequestId` 安全迁移。因此即使相同请求同毫秒到达，也不会互相结算。`registerMarketRoutes` 在 plugin mutation 成功或失败后都结算并写回；若 mutation 已执行但结算写失败，route 返回 `mutationApplied`、`market-state-*` 和明确的“先修状态、不要盲目重试”错误。测试证据：`plugins/market/tests/intents.test.ts#describe(settleIntent)`、`plugins/market/tests/routes.test.ts#describe(intentFromBody)/#describe(market route lifecycle)`。

**残余：** plugin add/remove 与 `intents.json` 不是原子事务。磁盘满、权限变化或损坏文件会造成“操作结果已知、账本未写成”的恢复场景；发生频率：**未知**。

## 2. 已缓解：CLI 在发信号前验证进程代际

`apps/cli/src/service.ts#WebPidRecord.identity` 保存进程代际；`apps/cli/src/runtime.ts#readProcessIdentity` 读取平台元数据；`#stopProcess` 在 TERM 前、等待期间和 KILL 前重新核对 identity，不匹配或不可读就 fail closed。`#readPsProcessIdentity` 对 `/bin/ps` 固定 C locale 与 UTC，避免调用方 locale/timezone 改变 identity。`apps/cli/tests/process-identity.test.mjs#test(process identity protects...)` 用真实短命 child 验证 mismatch 不杀，`#test(Darwin/BSD ps identity...)` 验证跨 locale/timezone 稳定。

**残余：**

- Linux `/proc`、Windows PowerShell、FreeBSD/OpenBSD `ps` 分支尚无当前本机实跑证据；远端三平台 CLI matrix 尚待 workflow runner。
- Darwin/BSD 的 `lstart` 粒度为秒，理论上的同秒 PID 重用窗口仍不能证明为零；实际概率：**未知**。
- 旧版本留下的 live PID record 没有 `identity`，`apps/cli/src/app.ts#inspectWebPid` 会拒绝接管；这是安全退化，但需要人工确认/停止旧进程。
- 读取 identity 后到发送 signal 之间仍存在极小 TOCTOU；`#stopProcess` 已在 SIGKILL 前再次检查，但 OS 没有在本仓库内提供句柄级 kill 保证。

## 3. 已缓解：Board 启动时结算 orphan execution

`plugins/xtz-ui/src/board/ledger.ts#failOrphanedRuns` 将 status=running 且 active execution 无 `sessionId` 的记录结算为 failed，错误为 `ORPHANED_EXECUTION_ERROR`；`plugins/xtz-ui/src/board/service.ts#BoardService.constructor` 启动时保存恢复结果。它不会自动重放任务，因此不会因为 Host 重启重复 durable work。测试证据：`plugins/xtz-ui/tests/board-service.test.ts`。

**残余：Board 内存/磁盘失配。** `plugins/xtz-ui/src/board/service.ts#BoardService.create/#update/#move/#remove/#run` 先替换 `this.tasks` 再调用 `#persist`；若原子写失败，当前进程内存已改变而磁盘仍是旧状态。下一次请求看到哪个版本、是否造成重复操作取决于调用序列，生产发生率：**未知**。

## 4. 已缓解：Market 不再依赖 PATH 上的 `dsh`

`plugins/market/src/plugin-mutate.ts#resolvePinnedDshLaunch` 从当前 Host 入口 `process.argv[1]` 向上寻找 `@deepseek-ai/dsh/package.json`，同时校验 `PINNED_DSH_VERSION` 与 package bin，再用 `process.execPath` 启动；`#spawnDshPluginMutate` 强制当前 `DSH_HOME`。这保持插件自包含，也没有依赖独立发布的 `apps/cli`。

`scripts/check-manifest.mjs#checkVersionsAndDocs` 已把 `PINNED_DSH_VERSION` 与 `versions.json#dshRc` 纳入同步 gate。

**残余：** `plugins/market/src/plugin-mutate.ts#spawnDshPluginMutate` timeout 时发送 SIGTERM 后立即返回，子进程是否真正结束、是否已经完成部分 durable mutation：**未知**。Host 若在 intent 落盘后、结算前崩溃也会留下 orphan pending，目前没有启动恢复协议。真实 add/remove 的外部 Git/npm 可用性、代理和供应链结果同样：**未知**。

## 5. 部分缓解：持久化错误不再全部静默降级

已覆盖：

- `plugins/xtz-ui/src/archive/store.ts#readJsonFile/#rejectJsonSchema/#writeJsonFile`：只有 ENOENT 是空状态；read、invalid JSON、schema、serialize、write、commit 分开报错，损坏文件移到唯一 `.corrupt-*`，commit 失败保留原目标和临时新数据。
- `plugins/xtz-ui/src/board/store.ts#loadBoard` 与 `plugins/xtz-ui/src/archive/ledger.ts#readProjcache/#checkpointRow`：使用上述 JSON store 并做 schema 校验。projection row 先验证通用 `{ver, seq, val}` envelope，仅当前 `stateVersion` 校验/读取值；旧/未知版本合法保留但不进入 archive view，不再误隔离整个 cache。
- `plugins/market/src/state-store.ts#loadMarketState/#saveMarketState`：Market intents/sources 仅对 ENOENT 返回空，损坏/权限/写入错误显式失败并尽可能保留旧文件。

仍有两条确定性残余：

1. `plugins/xtz-ui/src/settings-store.ts#loadSettings` 仍把损坏 JSON 当默认配置；下一次保存可能覆盖原内容。
2. `plugins/xtz-ui/src/archive/ledger.ts#deleteSessions` 先在内存修改 workspace/projcache、逐个删除 Session 目录，最后分别写两个 JSON；任何一步失败都可能只完成部分删除。没有 WAL/事务/回滚，恢复步骤：**未知**。

Windows rename 的原子性和锁文件失败方式没有当前实机证据：**未知**。

临时文件 + rename 也不是掉电级事务：`plugins/xtz-ui/src/archive/store.ts#writeJsonFile` 和 `plugins/market/src/state-store.ts#saveMarketState` 没有对文件、目录执行 `fsync`；断电后旧/新状态的耐久性：**未知**。此外 read 到 quarantine rename 之间若路径被另一个进程替换，可能隔离错误版本的文件；当前没有 inode/handle 复核。

`BoardService.constructor` 对 orphan 的恢复保存是同步且 fail closed；如果恢复时磁盘不可写，构造抛错可能让整个插件 remount 失败。应选择只读降级还是拒绝挂载：当前产品合同 **未知**。

## 6. 部分缓解：Sidebar 有了临时目录与子进程安全网

`plugins/sidebar/tests/boundary-integration.test.ts#describe(workspace filesystem boundary)/#describe(PTY process lifecycle boundary)/#describe(Git child-process boundary)` 现在覆盖：

- `plugins/sidebar/src/path-security.ts#ensureWorkspacePath/#ensureWorkspaceWritePath` 的 canonical child 与 symlink escape；
- `plugins/sidebar/src/fs-operations.ts#writeWorkspaceUpload` 的原子成功、超限清理、旧目标保留和路径拒绝；
- `plugins/sidebar/src/pty-manager.ts#PtyManager` 的复用、cwd respawn、park、quota、scheduled close 和退出回收（使用 fake node-pty）；
- `plugins/sidebar/src/git.ts#stage/#diff/#commit/#status/#resolveWorktree` 在真实临时 Git repo 的组合行为，以及拒绝无关 worktree。

**仍未覆盖的高权限路径：**

- `plugins/sidebar/src/index.ts#apply/#buildApi` 的真实 HTTP/WebSocket 组合；
- 实际 `node-pty` 子进程、WebSocket 断连、背压和异常清理；
- 检查路径后、实际打开/写入前被替换 symlink 的动态 TOCTOU；
- Side Chat 启动真实 Harness Session 的组合路径。

因此“有测试安全网”不等于“Sidebar 无漏洞”；是否存在可利用问题：**未知**。

## 7. 部分缓解：CI 有 Website 与 cold-start smoke

`.github/workflows/check.yml#jobs.website` 在独立 website workspace 做 frozen install/build；`#jobs.sandbox-smoke` 安装根与 CLI 依赖并运行根 `package.json#scripts.smoke:sandbox`。

`scripts/smoke-sandbox.mjs#main` 会：

- 拒绝已有 `.dsh-home` 和被占用的固定 3081；
- 构建当前插件/CLI并启动 pinned DSH sandbox；
- 等待 exact Xiaotaozi identity、六个 `REQUIRED_MOUNT_MARKERS`、doctor required checks 和 profile link/bundle；
- Sidebar 必须达到 `ready pty=ok`，Market 必须在 routes 注册后报告 `ready`；degraded/提前 marker 不算通过；
- `scripts/smoke-sandbox.mjs#cleanupSmokeRun` 无条件执行 PID identity 保护的 CLI stop，并由 `#waitForRecordedProcessGone` 确认原代际消失；即使 3081 尚未 bind 也不会只看端口删 home。不按端口杀，不读写 `~/.dsh`/3080。

**残余：** 该 smoke 不打开浏览器、不验证 UI slot、WebSocket、Provider OAuth、真实 IM gateway、`wecom-cli` 或第一次绑定后的 durable action。六插件 macOS/Windows native path install 仍没有同等 smoke；真实平台成功率：**未知**。

## 8. 部分缓解：IM typecheck 先止血

`scripts/check-manifest.mjs#IM_TS_NOCHECK_MAX/#tsNoCheckDirectiveCount/#checkImTsNoCheckBudget` 通过当前 TypeScript parser 识别 `//`、`///`、大小写和前置 block 后的真实 pragma，并要求 `plugins/im/src` 的 directive 数精确等于 228：增加会失败，减少也会要求同步降低基线。`plugins/im/src/channels/shared/session-binding-lock.ts#withSessionBindingLock` 已移除一个 directive 且只补类型。

**残余：** 228 个生产文件仍跳过主体类型检查，外部 SDK、Host API 和共享消息结构漂移仍可能延迟到运行时发现。全量迁移的改动面与隐藏语义：**未知且很大**，不能一次性清理。

## 9. 未消除：Website 审计告警与生产暴露未知

本轮已经把 build 加入 CI，并把 `apps/website/.vitepress/config.mts#defineConfig.description` 从 Desktop 改为 `xtz` CLI/browser；没有做 major upgrade。

当前 `apps/website/pnpm-lock.yaml` 仍包含 `vitepress@1.6.4`、`vite@5.4.21`、`esbuild@0.21.5`，`pnpm audit` 仍报告 1 high、3 moderate。修复所需 Vite 版本跨 major，违反本轮“禁止 major upgrade”边界，已明确延期。若生产只发布 `.vitepress/dist`，暴露面与 dev/preview server 不同；生产托管方式、是否运行 dev server：**未知**。

## 10. 配置与产品边界陷阱

- **两个 home 不能混。** official `~/.dsh:3080` 与 sandbox `.dsh-home:3081` 的规则见 `docs/conventions.md#Homes`、`scripts/sandbox-home.mjs#sandboxEnv`。
- **首次 durable work 必须先确认 cwd。** `pnpm dev` 的 `process.cwd()` 是仓库；证据：`docs/conventions.md#Onboarding-and-first-work`、`plugins/im/src/channels/shared/bot-workspace-store.ts#BotWorkspaceStore`。
- **第三方 Market source 未实现。** `plugins/market/src/routes.ts#mutateSources` 已对新增返回 501，Client 明示 unsupported；历史记录仅可移除。远端 fetch/验签/缓存均不存在。
- **发布说明可能漂移。** `versions.json#cliApp`、CLI manifest 和 plugin specs 可核对版本，但实际 npm 发布状态、渠道和签名流程：**未知**。
- **外部协议可能漂移。** Provider 固定端点/客户端标识、九个 IM SDK 与全局 `wecom-cli` 均主要靠 mock/unit gate；当前厂商接受状态和支持版本范围：**未知**。

## 11. 疑似死代码：只能标未知

`plugins/sidebar/src/invariant.ts`、`plugins/wecom-office/src/docs-methods.ts`、`plugins/xtz-ui/src/workbench/paths.ts` 只有“未见生产入口引用”的静态迹象，可能是兼容 seam 或对外 surface。仓库没有覆盖率/运行时追踪，是否死代码：**未知**。现在不要删除。

## 12. 仓库无法回答的生产问题

- 实际 user 数、请求量、错误率、数据量、SLO/RTO/RPO：**未知**。
- npm 包真实发布状态、签名、供应链审批和回滚：**未知**。
- 网站生产托管、域名、密钥、备份和回滚：**未知**。
- 上游 Harness Settings/Credentials/AttachmentStore 的精确存储和灾备：**未知**。
- 外部平台 webhook/gateway 的生产基础设施、限流和告警：**未知**。
