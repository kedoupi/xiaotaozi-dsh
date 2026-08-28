# BACKLOG：本轮执行状态与后续边界

> 排序仍按 **影响 × 确定性 ÷ 改动面**。2026-08-28 user 已批准原 1–10 全部执行；下列“完成”指对应小范围实现已落地，最终集成验证状态以 `PROGRESS.md` 为准。风险证据见 `RISKS.md`。

## 1. 结算 Market intent，让失败可重试

- **本轮状态：已完成；Market 49 tests 与根集成 gate 通过。**
- **原现象/根因：** `plugins/market/src/routes.ts#registerMarketRoutes` 在 mutation 前保存 pending intent，却没有成功/失败后的结算，Client 因此会持续显示 queued。
- **为何高杠杆：** 一个很小的状态结算缺口会锁住每次后续安装/卸载与重试；修正 intent 身份和结算即可恢复整条 Market 主路径。
- **落地：** `plugins/market/src/routes.ts#intentFromBody` 生成 UUID `requestId`，`plugins/market/src/intents.ts#settleIntent` 只按该身份精确移除本次 intent，旧记录由 `#legacyRequestId` 迁移；`registerMarketRoutes` 在 mutation 成功或失败后都写回结算状态，结算文件写失败时返回明确的 `mutationApplied` 和 `market-state-*` 错误。证据：`plugins/market/tests/routes.test.ts#describe(intentFromBody)/#describe(market route lifecycle)` 与 `plugins/market/tests/intents.test.ts#describe(settleIntent)`。
- **验收命令：**

  ```bash
  pnpm --filter dsh-market test
  pnpm --filter dsh-market build
  pnpm check
  ```

- **预估/残余风险：低。** mutation 与 intent 文件不是事务；结算写失败后仍需 user 先修复状态文件，不能盲目重试。

## 2. 恢复 Board 的 orphan running execution

- **本轮状态：已完成；XTZ UI 83 tests 与根集成 gate 通过。**
- **原现象/根因：** `plugins/xtz-ui/src/board/service.ts#BoardService.run` 先落盘 running、再异步创建 Session；两步间崩溃会留下无 `sessionId` 的永久 running。
- **为何高杠杆：** 这是定时任务的持久状态入口；一次启动期恢复就能消除永久卡住与人工猜测是否应重放的问题，同时避免自动重复 durable work。
- **落地：** `plugins/xtz-ui/src/board/ledger.ts#failOrphanedRuns` 把这种 execution 结算为可见 failed；`BoardService.constructor` 启动时恢复并保存，不自动重放 durable work。证据：`plugins/xtz-ui/tests/board-service.test.ts` 的重启 fixture。
- **验收命令：**

  ```bash
  pnpm --filter dsh-xtz-ui test
  pnpm --filter dsh-xtz-ui build
  pnpm check
  ```

- **预估/残余风险：中。** 自动重放风险已避开；但恢复状态写盘若失败，构造会显式失败，且 Board 的一般写操作仍有内存先变、磁盘后写的问题，见文末新发现。

## 3. `xtz stop/restart` 发信号前验证进程身份

- **本轮状态：已完成；CLI 64 tests 与 `pnpm check:cli` 通过。**
- **原现象/根因：** PID 可被操作系统复用，原 `apps/cli/src/service.ts#WebPidRecord` 没有进程代际身份，单凭 PID 发送 SIGTERM/SIGKILL 可能误伤。
- **为何高杠杆：** stop/restart 是所有 user 都会走的进程边界，误杀其他进程的影响极高；给 PID record 增加代际并在 signal 前复核，改动面集中且可 fail closed。
- **落地：** `WebPidRecord.identity` 保存启动代际；`apps/cli/src/runtime.ts#readProcessIdentity` 分平台读取 Linux boot-id/starttime、Windows StartTime ticks 或 BSD/macOS `ps lstart`，其中 `#readPsProcessIdentity` 固定 C locale/UTC；`#stopProcess` 在 TERM 前、等待期间和 KILL 前都重新校验并 fail closed。`apps/cli/tests/process-identity.test.mjs#test(process identity protects...)` 验证 mismatch 不杀，`#test(Darwin/BSD ps identity...)` 验证跨 locale/timezone 稳定。
- **验收命令：**

  ```bash
  pnpm check:cli
  ```

- **预估/残余风险：中。** Darwin 已实跑；Linux/Windows/BSD 分支的真实平台行为仍待 CI/实机证据。旧版遗留的 live PID record 没有 identity 时会安全拒绝停止，需要人工确认。

## 4. 让 Market 使用与 `xtz` 同版本的 pinned DSH runtime

- **本轮状态：已完成自动 gate；Market 49 tests、build/path gate 通过，真实 sandbox add/remove 未跑。**
- **原现象/根因：** Market 原来执行 PATH 上的 `dsh`，可能缺失或与启动 Host 的 DSH 版本不同。
- **为何高杠杆：** 插件变更直接写当前 profile，运行错版本会把环境带到不可预测状态；绑定当前 Host 的 exact runtime 能一次消除 PATH 与版本两类漂移。
- **落地：** `plugins/market/src/plugin-mutate.ts#resolvePinnedDshLaunch` 从当前 Host 的 `process.argv[1]` 向上解析 `@deepseek-ai/dsh` package，校验版本 `PINNED_DSH_VERSION` 和 package bin，再用 `process.execPath` 启动；不依赖 PATH，也不跨 package 耦合 `apps/cli`。`#spawnDshPluginMutate` 仍强制当前 `DSH_HOME`。
- **验收命令：**

  ```bash
  pnpm --filter dsh-market test
  pnpm --filter dsh-market build
  pnpm check:path
  pnpm smoke:sandbox
  ```

- **预估/残余风险：中。** `scripts/check-manifest.mjs#checkVersionsAndDocs` 已要求该 literal 与 `versions.json#dshRc` 同步；真实 add/remove 仍只能在 disposable sandbox 验证，不能拿 official home 做实验。

## 5. 区分“文件不存在”和“持久化 JSON 已损坏”

- **本轮状态：核心四个 store 已完成并通过 XTZ UI/Market/根集成 gate；`settings.json` 残余另列。**
- **原现象/根因：** Board、Archive、Market intents/sources 把 parse/read/schema 错误和 ENOENT 一起降级为空状态，后续写入可能覆盖可恢复数据。
- **为何高杠杆：** 同一个错误策略覆盖四个关键状态入口；区分“缺失”和“损坏”能直接阻断静默数据丢失，并把恢复线索保留下来。
- **落地：** `plugins/xtz-ui/src/archive/store.ts#readJsonFile/#writeJsonFile/#JsonStoreError` 区分 ENOENT、read、invalid-json、schema、serialize、write、commit，损坏文件隔离到 `.corrupt-*`；`plugins/xtz-ui/src/archive/ledger.ts#readProjcache/#checkpointRow` 对 projection 先验 envelope、只解析当前 stateVersion，合法 stale row 不隔离且不误读。`plugins/market/src/state-store.ts#loadMarketState/#saveMarketState/#MarketStateError` 让 Market intents/sources 仅把 ENOENT 当空状态，并保留原文件、原子替换。
- **验收命令：**

  ```bash
  pnpm --filter dsh-xtz-ui test
  pnpm --filter dsh-market test
  pnpm check:build
  ```

- **预估/残余风险：中。** `plugins/xtz-ui/src/settings-store.ts#loadSettings` 仍静默回退；Windows 上 rename/原子替换的具体失败模式未知。

## 6. 给 Sidebar 的权限边界补集成测试

- **本轮状态：已完成本轮测试范围；Sidebar 36 tests、build/path gate 通过。**
- **原现象/根因：** 文件写入、Git 和 PTY 是高权限组合路径，但此前缺少真实临时目录/子进程级行为测试。
- **为何高杠杆：** 这些路径能写 user 文件并启动进程，事故半径大；仅增加边界测试就能覆盖多个安全不变量，不必冒险改生产实现。
- **落地：** `plugins/sidebar/tests/boundary-integration.test.ts#describe(workspace filesystem boundary)/#describe(PTY process lifecycle boundary)/#describe(Git child-process boundary)` 用临时 workspace 验证 canonical child 与 symlink escape、上传原子性/大小/路径边界；用 fake node-pty 验证 reuse/respawn/park/quota/close；用临时 Git repo 验证 `plugins/sidebar/src/git.ts#stage/#diff/#commit/#status/#resolveWorktree` 和拒绝无关 worktree。
- **验收命令：**

  ```bash
  pnpm --filter dsh-sidebar test
  pnpm --filter dsh-sidebar build
  pnpm check:path
  ```

- **预估/残余风险：低（本轮仅测试）。** 真实 WebSocket route、真实 `node-pty`、断连与动态 symlink TOCTOU 尚未覆盖，不能把本项写成“Sidebar 已安全证明”。

## 7. 建一个 disposable sandbox cold-start smoke

- **本轮状态：脚本、54 个 scripts tests 和 CI job 已落地；本机真实 smoke 因另一 checkout 占用 3081 而安全拒绝，cold-start 成功待 clean runner。**
- **原现象/根因：** path-install 与 fake-home 测试不会真实启动 pinned DSH、seed 六插件、探测 identity 和验证 Host mount。
- **为何高杠杆：** 一条可丢弃的真实启动链能同时覆盖构建、CLI、profile seed、六插件挂载与清理边界，是最接近 user 首次启动的单个 gate。
- **落地：** 根 `package.json#scripts.smoke:sandbox` 调 `scripts/smoke-sandbox.mjs#main`；脚本拒绝已有 `.dsh-home` 或被占用的 3081，构建 CLI/插件、启动 `xtz --sandbox`、等待 identity、六个 ready/mount trace（Sidebar 必须 `ready pty=ok`）、doctor 与 profile link/bundle。`#cleanupSmokeRun` 无条件按 PID identity stop 并由 `#waitForRecordedProcessGone` 验证，即使尚未 bind 3081 也不会漏掉已记录 child。`.github/workflows/check.yml#jobs.sandbox-smoke` 在 Ubuntu runner 独立执行。
- **验收命令：**

  ```bash
  pnpm smoke:sandbox
  pnpm check:path
  pnpm check:cli
  ```

- **预估/残余风险：中。** 只覆盖 Linux CI 的 cold start，不覆盖浏览器交互、真实外部平台或三平台 native path install；必须保持“不按端口杀进程”和“不触碰 `~/.dsh`”的清理约束。

## 8. 把 Website build 加入 CI，并评估兼容升级

- **本轮状态：CI/build 与文案已完成；Vite major 安全升级按约束延期。**
- **原现象/根因：** 网站是独立 workspace，原 CI 不构建；Vite/VitePress/esbuild 的审计告警不能在当前 major 内全部消除，且站点文案误称 Desktop。
- **为何高杠杆：** frozen build job 成本低，却能在每次改动时阻止独立 workspace 悄悄失效；把 major 安全升级拆开则避免以修告警之名扩大回归面。
- **落地：** `.github/workflows/check.yml#jobs.website` 做 frozen install + build；`apps/website/.vitepress/config.mts#defineConfig.description` 改为 `xtz` CLI/browser 定位。本轮没有跨 major 升级。
- **验收命令：**

  ```bash
  cd apps/website
  pnpm install --frozen-lockfile
  pnpm build
  pnpm audit
  ```

- **预估/残余风险：低（CI）/中（未来升级）。** 当前 audit 仍预期报告 1 high、3 moderate，均来自 dev toolchain；生产是否运行 dev/preview server仍是**未知**。要消除告警需单独批准 Vite major 兼容升级与回归验证。

## 9. 对未实现的第三方 Market Sources 诚实降级

- **本轮状态：已完成诚实降级；Market 49 tests 与 build gate 通过。**
- **原现象/根因：** UI/route 允许添加 source，但 `plugins/market/src/catalog.ts#catalogEntriesFor` 不会读取远端 index，造成“可配置但永远空”的误导。
- **为何高杠杆：** 关闭一个未实现入口即可消除错误产品承诺和空状态排障成本，同时避免仓促引入远端代码执行与供应链风险。
- **落地：** `plugins/market/src/routes.ts#mutateSources` 对新增返回 501；历史已保存 source 仍可移除。`plugins/market/src/client/MarketPanel.tsx#Sources` 和 `plugins/market/src/client/locales.ts#sourcesHint/#thirdPartyDisabled` 明示本 build 不支持远端 source。
- **验收命令：**

  ```bash
  pnpm --filter dsh-market test
  pnpm --filter dsh-market build
  ```

- **预估/残余风险：低。** 真正实现远端 fetch、验签、缓存和供应链策略仍是高风险独立项目，本轮没有暗中实现。

## 10. 阻止 IM 的 `@ts-nocheck` 继续增长

- **本轮状态：ratchet 已完成并迁移 1 个共享文件；IM 1020 tests 与根集成 gate 通过。**
- **原现象/根因：** IM 主体大量 `@ts-nocheck`，原 typecheck 无法阻止豁免继续增长。
- **为何高杠杆：** 一个精确计数 gate 就能立刻阻止类型债继续扩张，并让后续每次小步下降都不可回退，改动面远小于全量迁移。
- **落地：** `scripts/check-manifest.mjs#IM_TS_NOCHECK_MAX/#tsNoCheckDirectiveCount/#checkImTsNoCheckBudget` 用 TypeScript parser 识别真实 pragma，并要求生产源码 directive 数精确等于 228；`//`、`///`、大小写或前置 block 不能绕过，实际减少时也会要求同步降低基线。`plugins/im/src/channels/shared/session-binding-lock.ts#withSessionBindingLock` 已移除一个 `@ts-nocheck`，仅补类型而不改语义。
- **验收命令：**

  ```bash
  pnpm --filter dsh-im typecheck
  pnpm --filter dsh-im test
  pnpm test:scripts
  pnpm check
  ```

- **预估/残余风险：中（gate）/高（后续迁移）。** 228 个生产 directive 仍然很多；必须继续按共享 slice 小步下降，不能一次性清理九个渠道。

## 本轮新发现（未修）

以下不新增编号，也不在本轮顺手修复：

- **Board 内存/磁盘可能失配。** `plugins/xtz-ui/src/board/service.ts#BoardService.create/#update/#move/#remove/#run` 先替换 `this.tasks` 再 `persist`；写盘失败会让当前进程内存领先磁盘，直到重启。建议未来先构造 next、成功保存后再 commit 内存，并补写失败 fixture。
- **Archive 删除不是事务。** `plugins/xtz-ui/src/archive/ledger.ts#deleteSessions` 跨 Session 目录、`workspace.json` 与 `session_projcache.json` 多步修改；中途失败可能只完成一部分。建议先定义可恢复日志/幂等顺序，不要直接包一层 catch。
- **Sidebar 组合边界仍未覆盖。** `plugins/sidebar/src/index.ts#apply` 的真实 WebSocket/API route、真实 `node-pty`、断连清理和动态 symlink TOCTOU 没有被 `plugins/sidebar/tests/boundary-integration.test.ts#describe(workspace filesystem boundary)/#describe(PTY process lifecycle boundary)/#describe(Git child-process boundary)` 证明。
- **XTZ UI settings 仍会静默回退。** `plugins/xtz-ui/src/settings-store.ts#loadSettings` 对损坏 JSON 返回默认值，仍有覆盖可恢复数据的风险；本轮 #5 只覆盖 Board/Archive/Market 四个 store。
- **CLI 非 Darwin 身份分支实机证据不足。** `apps/cli/src/runtime.ts#readProcessIdentity` 的 Linux、Windows、FreeBSD/OpenBSD 分支只有静态/模拟证据；行为与权限限制仍需对应平台 CI/实机确认。旧版 live PID record 没有 identity 时只能安全拒绝操作。
- **Market 子进程结局仍可能不确定。** `plugins/market/src/plugin-mutate.ts#spawnDshPluginMutate` timeout 时只发 SIGTERM 并立即返回；子进程是否已退出、是否已完成部分 durable mutation：**未知**。Host 在 intent 落盘后、结算前崩溃也会留下 orphan pending；目前没有启动恢复协议。
- **Market mutation 缺少全局串行合同。** `plugins/market/src/client/MarketPanel.tsx#MarketPanel` 的 `busyId` 只限制当前条目，不阻止 user 对不同条目并发操作；`plugins/market/src/routes.ts#registerMarketRoutes` 会在各请求中分别启动 `spawnDshPluginMutate`，因此可能同时有多个 `dsh plugin` 子进程修改同一 profile。单次 intent 的同步 read/write 不会在 Node 事件循环内被另一请求插入，但 DSH/pnpm 是否自行加锁、并发修改是否安全，仓库证据不足：**未知**。后续应先定义单写者/互斥合同并加并发 route fixture。
- **JSON 落盘仍不是掉电级事务。** `plugins/xtz-ui/src/archive/store.ts#writeJsonFile` 与 `plugins/market/src/state-store.ts#saveMarketState` 使用临时文件 + rename，但没有 file/directory `fsync`；断电耐久性：**未知**。read→quarantine 之间文件被替换的竞态也未防护。
- **Board 启动恢复可能拖垮整个 remount。** `plugins/xtz-ui/src/board/service.ts#BoardService.constructor` 在发现 orphan 后同步保存；若恢复写盘失败，构造抛错可能阻止整个插件正常挂载。应先定义“只读降级还是 fail closed”的产品合同再改。

## 现在不要做

- **不要大重构。** 尤其不要把六个可独立 Git path 安装的插件抽成共享 `packages/`；会破坏自包含安装边界。证据：`AGENTS.md#Rules`。
- **不要换框架。** 当前 Host/Client、Cordis/DSH 注入面已经跨六插件；现有行为覆盖还不足以支持框架迁移。
- **不要统一全仓代码风格。** 它不会降低当前残余风险，却会制造巨大 diff、掩盖行为修改。
- **不要一次性清掉 IM 全部 `@ts-nocheck`，也不要未经单独批准批量升级 Vite/React/xterm/TypeScript 等 major。**
- **不要凭静态引用删除“疑似死代码”。** 当前没有覆盖率和运行时追踪，见 `RISKS.md`。
- **不要复活 Desktop、`.dmg` 或 pack 流程。** 当前 user 产品是 `xtz`；历史只存在于 Git tag `archive/desktop`。证据：`AGENTS.md`。
- **不要把 sandbox 和 official 合并，也不要删除整个 `~/.dsh`。** 这会污染或丢失 user 的凭据、会话和 profile。
