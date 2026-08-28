# dsh-sidebar 技术设计

- 插件：dsh-sidebar 0.1.0
- 入口：`src/index.ts`（Host）、`src/client/index.tsx`（Web）
- 文档日期：2026-08-27

## 1. 架构

```
Web
  betterSidebar service (tabs/viewers registry)
  Sidebar portal on document.body
  intercept: openPath / turn-tail / links / IME
  settings.section id=better-sidebar
        │ POST /sidebar/api  JSON method dispatch
        │ GET  /sidebar/file|/html|/bundle/*
        │ POST /sidebar/upload
        │ WS   /sidebar/ws/terminal|agent-terminals|agent-opens
Host
  inject: webServer, sessions, tools
  optional: settings, jobs, subagent, node-pty
  PtyManager (UI) + AgentPtyRegistry + AgentOpenRegistry
  path-security + git + sidechat + jobs + subagent-live
```

`name = 'sidebar'`。`Config` 为 host 限额；用户偏好在 settings 命名空间 `dsh-better-sidebar`，经 `/sidebar/api` 的 `settings.get/update` 读写。

## 2. 模块边界

| 模块 | 路径 | 职责 |
| --- | --- | --- |
| Host 入口 / API 表 | `src/index.ts` | 路由、dispatch、媒体头、sessionCwd |
| Config / Prefs | `config.ts` `prefs-shared.ts` | 限额与 Side card 偏好 |
| 围栏 | `trust-fence.ts` `loopback.ts` `path-security.ts` | 网络与 FS |
| FS | `fs-tree.ts` `fs-operations.ts` `fs-search.ts` | 列表/上传/搜索 |
| Git | `git.ts` | porcelain 封装 |
| PTY | `pty-manager.ts` `agent-pty.ts` `pty-deps.ts` | UI/Agent 终端 |
| 工具 | `tools.ts` `agent-opens.ts` `tool-define.ts` | 模型工具 |
| Side chat | `sidechat-routes.ts` `sidechat-core.ts` | 子会话 |
| Jobs / live | `jobs-routes.ts` `subagent-live-route.ts` | 回放与预览 |
| Bundle / HTML | `bundle-route.ts` `html-route.ts` | 懒加载与预览 |
| Client 状态 | `client/state.ts` `service.ts` | store + 扩展缝 |
| 内置 | `client/builtins/tabs.tsx` `viewers.tsx` | 6 tab + 6 viewer |
| 设置 UI | `SideCardSection.tsx` | 声明式开关 |

外部插件可 `ctx.betterSidebar.registerTab/registerFileViewer`。Office 预览 **不在本包**。

## 3. 状态 / 数据 / 凭证流

无第三方云凭证。

- 会话 cwd：Host session store，不信客户端。
- 终端进程：按 `sessionId:tab` 或 agent uuid Keyed；transcript 约 1MiB。
- Prefs：settings 服务文档；无服务时客户端用 `SIDEBAR_PREFS_DEFAULTS`。
- Side chat 子会话：AgentRegistry.create/resume，preset 继承父会话；`threadDisposers` / `pendingSnapshots` 为进程内状态。
- Agent opens：每会话队列，有订阅者则立即消费，否则重放。
- 上传写入工作区（`writeWorkspaceUpload`）。

模型从不传 sessionId；工具从 `exec.agent.session.id` 取。

## 4. API / 工具契约

### 4.1 HTTP

| 路径 | 方法 | 说明 |
| --- | --- | --- |
| `/sidebar/api` | POST JSON | `{ method, ...payload }` 或等价 dispatch |
| `/sidebar/upload` | POST | 工作区上传，超 uploadLimit 拒 |
| `/sidebar/file` | GET | 媒体；sessionId+path |
| `/sidebar/html` | GET | HTML 预览 |
| `/sidebar/bundle/:name.js` | GET | name ∈ terminal,editor,mermaid |
| `/sidebar/ws/terminal` | upgrade | 见 FR-09 |
| `/sidebar/ws/agent-terminals` | upgrade | 需 sessionId |
| `/sidebar/ws/agent-opens` | upgrade | 需 sessionId |

fence 失败：HTTP 403，WS `socket.destroy()`。

### 4.2 `/sidebar/api` methods

`session.cwd`, `fs.tree`, `fs.search`, `fs.read`, `fs.write`,  
`git.worktrees|status|diff|stage|unstage|commit|branch|checkout|log|commit-diff|discard|revert|cherry-pick|show`,  
`pty.close`, `agent-pty.close`, `terminal.deps`,  
`jobs.output`, `jobs.kill`, `subagents.live`,  
`shell.get`, `settings.get`, `settings.update`,  
`browser.probe`, `open.external`,  
以及 sidechat.*（由 `buildSidechatApi` 并入）。

错误：`SidebarError` 码如 `not-found` / `fs-error`，HTTP 400/404/503。

### 4.3 模型工具（prefs.agentTerminalTools）

| 工具 | 入参 | 出参要点 |
| --- | --- | --- |
| terminal_create | title, command | uuid, title |
| terminal_list | — | 快照数组 |
| terminal_send | uuid, text, submit? | uuid, bytes |
| terminal_read | uuid, offset?, count? | text, totalLines, lineBegin, lineEnd, truncated；256KiB 上限，count 硬顶 500 |
| terminal_wait_for | uuid, needle, timeout_ms? 默认 10s | found / timeout / exited |
| terminal_resize | uuid, cols, rows | 钳制 2..1024 |
| terminal_signal | uuid, SIGINT|SIGTERM|SIGKILL|SIGHUP|SIGTSTP | |
| terminal_close | uuid | closed bool，幂等 |

无 initiating agent → throw。

### 4.4 sidebar_open（prefs.agentOpenTools）

`target` 必填（绝对/相对路径或 http(s) URL），`title?`。  
返回 `kind, target, title, delivered`。拒绝 `file:` / `javascript:` 等 scheme。Windows 盘符当路径。

### 4.5 Host Config 默认

readLimit 512KiB，mediaLimit 20MiB，uploadLimit 128MiB，listLimit 1000，terminalsPerSession 3，reconnectGraceMs 30000，shell `''`（自动），shellArgs `[]`。

设置页 `terminalShell` / `terminalShellArgs` 覆盖之后新开的终端。

### 4.6 Prefs 默认（节选）

openByDefault false；width 35%（20–60）；autoOpenSubagent/Jobs true；agentTerminalTools/agentOpenTools false；bottomPanelAutoTerminal true；interceptOpenPath true；editorExplorer false；https 拦截 false；html/browser 沙箱默认开；tabsEnabled/viewersEnabled 缺省=开。

## 5. 生命周期 / 错误 / 安全

**Host apply**

1. resolve Config；尝试 loadNodePty。
2. 注册 HTTP/WS/bundle；构 API 表。
3. 订阅 settings：开关 agent 工具时 register/unregister。
4. dispose：卸工具、disposeAll pty、关 WS server。

**Client apply**

1. locale 字典；createSidebarStore + provide betterSidebar；registerBuiltins。
2. loadPrefs（2s 超时回落默认）→ 评 aionui 互斥 → mount。
3. 拦截与 IME、设置图标、Side card section。

**错误**

- 客户端 fail()：固定底栏诊断条 + console.error 前缀 `[dsh-better-sidebar]`。
- 设置冲突：不静默覆盖。
- PTY 缺：1011 + terminal.deps。

**安全**

- 文件系统 realpath 围栏；写路径允许尚未存在的子路径但父必须在区内。
- 媒体 CSP sandbox；active 文档强制下载。
- HTML/browser 默认 opaque-origin iframe。
- loopback allowlist 默认空：浏览 Tab 不能探本机服务，除非用户填 `browserAllowedLoopback`。
- 工具所有权：assertOwned(sessionId)。

## 6. 测试与可观测性

当前仓库测试（vitest）：

| 文件 | 覆盖 |
| --- | --- |
| `tests/sidebar-trust-fence.test.ts` | loopback fence |
| `tests/media-security.test.ts` | 媒体头 / 附件 |
| `tests/browser-probe.test.ts` | probe 拒绝不安全目标 |
| `tests/client-bundle.test.ts` | chunk 名 / 路由 |
| `tests/name.test.ts` | 插件名 |

**规划（未在本包 tests/ 齐套）**：fs 围栏、Git、PTY、terminal_*、sidechat、设置冲突。上游 DSH-better-sidebar 有更广 spec，本 fork 未全部迁入。

可观测：console 前缀；无遥测。PTY 缺依赖通过 `terminal.deps` 给出可粘贴修复命令。

## 7. 兼容

- Host 0.1.1-rc.2。`ctx.modules`（rc.8+）解析 chunk 外部；缺则回落 rc.7 全局。
- 与 xtz-ui 分工：xtz-ui 不管右侧面板。
- 与 aionui-panel 互斥。
- Git path：`#path:plugins/sidebar`，prepare 自建 lib 与 client chunks。
- **已推迟**：内置 Office viewer、内置 browser Tab。
- **默认关闭**：模型终端与 sidebar_open。

## 8. FR/NFR → 代码 / 测试

| ID | 代码 | 测试 |
| --- | --- | --- |
| FR-01/02 挂载与互斥 | `client/index.tsx` | 无专项（规划） |
| FR-03/04 Tab/Viewer | `builtins/tabs.tsx` `viewers.tsx` | 无专项 |
| FR-05 cwd | `index.ts` sessionCwdOf | 无专项 |
| FR-06 FS | `index.ts` `path-security.ts` | 规划 |
| FR-07 Git | `git.ts` | 规划 |
| FR-08 上传/媒体 | `index.ts` mediaResponseHeaders | `media-security.test.ts` |
| FR-09–11 WS | `index.ts` attachTerminal | 规划 |
| FR-12/13 工具 | `tools.ts` `agent-opens.ts` | 规划 |
| FR-14 sidechat | `sidechat-routes.ts` | 规划 |
| FR-16 设置 | `config.ts` PrefsSchema `SideCardSection.tsx` | 规划 |
| NFR-01 fence | `trust-fence.ts` | `sidebar-trust-fence.test.ts` |
| NFR-04 媒体 | `index.ts` | `media-security.test.ts` |
| FR-18 bundle | `bundle-route.ts` | `client-bundle.test.ts` |
| FR-22 probe | `browser-probe.ts` | `browser-probe.test.ts` |
