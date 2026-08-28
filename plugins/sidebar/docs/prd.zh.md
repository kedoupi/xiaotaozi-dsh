# dsh-sidebar 产品需求文档（PRD）

- 产品：dsh-sidebar（右侧工作台）
- 包名：`dsh-sidebar`
- 版本：0.1.0
- 状态：已实现（改编自 DSH-better-sidebar MIT；随小桃子种子 / pack 分发）
- 文档日期：2026-08-27
- 适用范围：`plugins/sidebar` 当前源码。只描述已落地行为。

## 1. 背景与问题

Harness Web 默认没有会话级文件树、编辑器、Git、终端。用户需要在对话右侧：

- 浏览/编辑当前会话工作区文件；
- 看 Git 状态、暂存、提交、diff；
- 开交互终端（用户 Tab 与 Agent 持久终端）；
- 预览图片 / PDF / Markdown / HTML；
- 在设置里选择挂哪些 Tab / Viewer，以及是否把工具交给模型。

小桃子品牌、归档、看板、Git 图谱在 `dsh-xtz-ui`，不在本插件。

## 2. 用户与场景

| 角色 | 场景 |
| --- | --- |
| 桌面用户 | 打开会话后右侧出现 Side card；在「设置 → Side card」开关 Tab、宽度、拦截行为。 |
| 用户（编码） | 点聊天里的路径在侧栏打开；Git 面板 stage/commit；底栏终端。 |
| Agent | 仅当用户打开「模型终端工具 / 模型打开文件」后，才有 `terminal_*` / `sidebar_open`。 |
| 插件作者 | 通过 `ctx.betterSidebar.registerTab/registerFileViewer` 扩展（服务已实现）。 |

## 3. 目标与非目标

### 目标

- 会话隔离的右侧工作台：文件（编辑器即文件窗）、Git、Subagent、Side chat、终端、Diff。
- 所有 `/sidebar` HTTP/WS 必须 loopback，不继承 LAN trusted-host。
- 路径操作限制在会话 cwd 工作区内（realpath）。
- 设置走插件自己的 fenced 路由，不走配置客户端网关。
- node-pty 缺失时降级：无终端、工具不注册、deps 状态可查，不拖垮 Host。

### 非目标

- 不做小桃子品牌 / 归档 / 看板 / Git 图谱（xtz-ui）。
- 不做内置 Office 预览（.docx/.xlsx/.pptx）；注释写明交给独立 office 插件。**已实现：binary-download 对 doc/xls/ppt 提供下载，不预览。**
- 不做内置浏览器 Tab 作为默认；外链仅当某 Tab 声明 `urlTarget` 且拦截开关打开才接管，否则系统浏览器。
- 模型终端工具、`sidebar_open` 默认关闭。
- 不把作者上游 npm 与本包装进同一 profile。

## 4. 用户故事

1. 作为用户，我在设置 → Side card 选择默认是否打开、宽度 20–60%、各 Tab/Viewer 开关。
2. 作为用户，我打开文件 Tab，看到工作区树、搜索文件名、用 CodeMirror 编辑并保存。
3. 作为用户，Git Tab 显示 status/diff，可 stage/unstage/commit/checkout/discard/revert/cherry-pick。
4. 作为用户，我最多开 3 个自己的终端；Agent 终端不受该配额限制。
5. 作为用户，刷新后终端在 reconnectGraceMs（默认 30s）内可重连；切会话时 park，不启动宽限倒计时。
6. 作为用户，子代理出现时（默认）自动打开 Subagent 页；新 job 自动打开 Jobs。
7. 作为用户，我可以开 Side chat 线程（子会话，主列表隐藏）；关 Tab 释放 live agent，历史仍在。
8. 作为用户，HTML 预览默认沙箱；我可临时解锁或在设置里关掉沙箱（有警告）。
9. 作为 Agent（工具已开），我用 `terminal_create` 开持久 shell，`sidebar_open` 打开文件/目录/http(s)。

## 5. 功能需求（FR）

**FR-01 右侧面板挂载**  
Client 把面板挂到 `document.body`（`data-dsh-better-sidebar`）。渲染错误有边界条，不空白整页。

**FR-02 与 aionui 互斥**  
若 settings 命名空间 `aionui-panel` 的 `rightPanel==='aionui-panel'`，本面板不挂载；设置文档更新时重评。

**FR-03 内置 Tab**  
`editor`（文件窗）、`git`（single）、`subagent`（single）、`sidechat`（每线程一 Tab）、`terminal`（UI 配额 3）、`diff`。

**FR-04 内置 Viewer**  
image、pdf、markdown、html、code（catch-all priority -100）、binary-download（doc/xls/ppt + NUL detect）。

**FR-05 会话 cwd 权威**  
API 的 cwd 来自 `ctx.sessions.get(sessionId).header.cwd`，空白会话回落 `process.cwd()`。渲染器不得指定权威 cwd。

**FR-06 文件系统 API**  
`session.cwd` / `fs.tree` / `fs.search` / `fs.read` / `fs.write`。写走 tmp+rename。读超 `readLimit`（默认 512KiB）截断。二进制返回 kind=binary + head base64。

**FR-07 Git API**  
worktrees/status/diff/stage/unstage/commit/branch/checkout/log/commit-diff/discard/revert/cherry-pick/show。可选 `repoRoot` / `worktree`，经服务端校验。

**FR-08 上传 / 媒体 / HTML 预览**  
`POST /sidebar/upload`（默认 128MiB 上限，超限不落盘）。`GET /sidebar/file` 媒体；html/htm/svg 当 attachment + octet-stream，避免同源内联。`GET /sidebar/html` 沙箱预览。

**FR-09 终端 WS**  
`/sidebar/ws/terminal`：`?tab=&sessionId=` UI 终端；`?uuid=` Agent 终端。输入原文、resize JSON、close JSON。UI close 走 0ms 计划关闭+宽限；Agent close 立即杀。park 帧避免切会话误触发宽限。

**FR-10 Agent 终端推送**  
`/sidebar/ws/agent-terminals?sessionId=` 推列表；客户端同步 `agent:<uuid>` Tab。

**FR-11 Agent 打开推送**  
`/sidebar/ws/agent-opens?sessionId=` consume-on-send 队列。

**FR-12 模型工具（默认关）**  
`terminal_create/list/send/read/wait_for/resize/signal/close`；绑定 `exec.agent.session.id`；跨会话 assertOwned。

**FR-13 sidebar_open（默认关）**  
打开 file/folder/http(s)。目标 Tab 类型若被用户关掉，向模型报错而非静默。

**FR-14 Side chat API**  
`sidechat.start/prompt/cancel/dispose/info`。子会话 `origin:'subagent'`。create 超时 15s。

**FR-15 Jobs / Subagent live**  
`jobs.output` 回放已读输出（不消费模型 cursor）；`jobs.kill`。`subagents.live` 批量。无 registry 时 503。

**FR-16 设置 Side card**  
section id `better-sidebar` order 100。prefs 见技术文档。写入 revision-guarded，冲突 settings-conflict。

**FR-17 拦截**  
默认拦截 `workspaces.openPath` 到侧栏编辑器（需 editor Tab 开）。外链：总开关默认开、http 默认开、https 默认关；Ctrl/Cmd+click 绕过。无 urlTarget 则不接管。

**FR-18 懒加载 chunk**  
`/sidebar/bundle/{terminal,editor,mermaid}.js`，ETag + no-cache。

**FR-19 IME 守卫**  
捕获阶段挡住合成期方向键被第三方 UI 抢走。

**FR-20 标题栏兼容**  
scheme auto/web/preset/custom；custom 可设 strip px 与 CSS。

**FR-21 打开外部**  
`open.external` 走系统浏览器。

**FR-22 浏览器 probe**  
`browser.probe` 探公开 HTTP 头 / frame-ancestors；拒绝不安全目标。

## 6. 非功能需求（NFR）

**NFR-01 Trust fence**  
loopback peer + loopback Host；写与 WS upgrade 强制同源 Origin；`sec-fetch-site=cross-site` 拒绝。LAN trusted-host **不够**。

**NFR-02 工作区围栏**  
`ensureWorkspacePath` / `ensureWorkspaceWritePath` realpath，禁止逃逸。Git 相对路径先按 session 再 repo root，但仍须落在工作区。

**NFR-03 限额**  
readLimit 512KiB；mediaLimit 20MiB；uploadLimit 128MiB；listLimit 1000；terminalsPerSession 3；reconnectGraceMs 30s。均可 Config。

**NFR-04 媒体安全**  
nosniff、same-origin CORP、sandbox CSP、active 文档 attachment。

**NFR-05 PTY 降级**  
node-pty 不可用：ptyManager/agentPty 为 null，close 返回 ok，WS 1011 `pty-deps-missing`，`terminal.deps` 给修复信息。

**NFR-06 工具约定**  
C1 schema 校验；C4 规范 JSON + 独立 render；C6 abort 检查；C10 规范值无 UI 词汇。

**NFR-07 兼容**  
dsh 0.1.1-rc.2；`@deepseek-ai/*` external。依赖 node-pty、xterm、CodeMirror、ws、mermaid、dompurify。

**NFR-08 无遥测。**

## 7. 流程

### 7.1 打开文件

聊天路径 / produced-files → openPath 拦截（若开）→ editor Tab 去重按 path → fs.read 或 mediaUrl。

### 7.2 保存

编辑器 fs.write → 工作区写路径校验 → tmp rename。

### 7.3 Agent 终端

用户开 agentTerminalTools → Host 注册 8 工具 → 模型 terminal_create → registry 在 session cwd spawn → WS 推列表 → 用户可看可键入；模型 send/read/wait_for。

### 7.4 关 Tab

UI：pty.close 或 WS close。Agent：agent-pty.close / terminal_close。宽限内刷新可重连。

## 8. 验收标准

1. 卸掉本插件后右侧面板消失。
2. 非 loopback 访问 `/sidebar/api` 403。
3. 路径 `../` 逃出 cwd 被拒。
4. 新会话默认不自动打开面板（openByDefault=false），除非设置打开。
5. UI 终端第 4 个不可开；Agent 终端不受 3 限制。
6. 默认模型没有 terminal_* / sidebar_open。
7. html/htm/svg 经 `/sidebar/file` 以附件下载，不以内联 HTML 执行。
8. aionui 右栏选中时本面板不出现。
9. `pnpm --filter dsh-sidebar test` 通过（当前仓库测试集以信任围栏、媒体安全、bundle、probe、name 为主）。

## 9. 风险与待决

| 项 | 说明 |
| --- | --- |
| PTY 原生模块 | 桌面 pack 需对应 darwin-arm64/x64；缺失则终端降级。 |
| htmlViewerNoSandbox / browserNoSandbox | 关闭沙箱等于把预览页放到 GUI origin，可读写会话。仅信任内容。 |
| Side chat 空线程快照 | pendingSnapshots 在 Host 重启后丢失，首次 prompt 只发 boundary（已记录为降级）。 |
| 测试覆盖 | 本 fork 的 tests/ 远小于上游功能面；大量行为靠手工与上游移植测试。**规划：补齐 API/工具单测。** |
| Office 预览 | **已推迟**到独立 office 插件。 |
| 内置 browser Tab | **未作为内置 Tab 实现**；只有 urlTarget 扩展点 + probe。 |
| agent 工具默认关 | 避免模型随意开 shell。 |

## 10. 状态 / 版本 / 日期

| 字段 | 值 |
| --- | --- |
| 状态 | 已实现 / 维护中 |
| 插件版本 | 0.1.0 |
| 上游 | DSH-better-sidebar（MIT），见 NOTICE |
| Host | 0.1.1-rc.2 |
| 文档版本 | 1.0 |
| 日期 | 2026-08-27 |
