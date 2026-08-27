# dsh-hello 技术设计

- 插件：dsh-hello 0.8.0
- 入口：`src/index.ts`（Host `apply`）、`src/client/index.ts`（Web）
- 文档日期：2026-08-27
- 原则：只记录已实现行为。规划项单独标注。

## 1. 架构

混合插件（host + web client）。

```
Web (src/client)
  slots: brand / hero / hidden official / settings.section / git-graph dock
  DOM: 工具行看板入口、隐藏官方模型导航、欢迎弹框、中间栏看板/归档
  fetch: /api/dsh-hello/* 与 identity
        │ loopback + Origin fence
Host (src/index.ts apply)
  inject webServer → identity + settings + 条件挂载 archive/board/gitGraph
  inject systemPrompt → hello:xiaotaozi（宣告文案）
  持久化 $DSH_HOME/plugins/hello/{settings.json,board.json}
  读 $DSH_HOME/storages/* 与 sessions/（归档）
  git CLI（图谱）
```

Cordis patch：`id: hello`，`name: dsh-hello`。

Client inject：runtime / locale / connection / conversation / layout / settings / sidebar / slots / theme。

Host 无 tools 注册。

## 2. 模块边界

| 模块 | 路径 | 职责 |
| --- | --- | --- |
| Host 入口 | `src/index.ts` | remount 三表面、settings 读写、systemPrompt |
| Config | `src/config.ts` `src/schema.ts` | 四布尔；`FEATURE_SHIPPED`；`surfacesFor` |
| HTTP 公共 | `src/http.ts` `src/loopback.ts` | JSON、fence、RouteError |
| Identity / Settings | `src/host-routes.ts` | 两exact路由 |
| 归档 | `src/archive/*` | ledger、preview、unarchive、delete |
| 看板 | `src/board/*` | service、cron、runner、store |
| Git 图谱 | `src/git-graph/*` | status/branches/log/switch |
| 工作区 cwd | `src/workbench/*` | 从 workspace.json 解析 session cwd |
| 客户端壳 | `src/client/chrome.ts` `peach.ts` `hide-official.ts` | 品牌、色、藏官方 |
| 设置 UI | `src/client/XiaotaoziSettings.tsx` `settings-live.ts` | 开关 |
| 入口/面板 | `sidebar-entry.ts` `BoardPanel.tsx` `ArchivePanel.tsx` `GitGraphChip.tsx` | 表面 |
| 欢迎 | `src/notices.ts` `NoticeHost.tsx` | 队列 |

**不包含**：文件树、CodeMirror、xterm、PTY（sidebar）；IM RPC（im）。

## 3. 状态 / 数据 / 凭证流

无第三方凭证。

| 数据 | 位置 | 权限 |
| --- | --- | --- |
| 功能开关 | `$DSH_HOME/plugins/hello/settings.json` | 0600，目录 0700 |
| 看板任务 | `$DSH_HOME/plugins/hello/board.json` | 同归档 store 的原子写 |
| 欢迎 dismissed | origin localStorage `dsh-hello.dismissed` | 仅本源 |
| 归档源 | `$DSH_HOME/storages/workspace.json`、`session_projcache.json`、`sessions/<id>` | 只在 archive 开时读写 |
| Identity token | 环境变量 `XIAOTAOZI_DSH_INSTANCE_TOKEN` | 仅当匹配 `^[a-f0-9]{64}$` 才回显 |

`dshHome()`：非空 `DSH_HOME`，否则 `homedir()/.dsh`。

看板 runner 通过 Host `apiProxy` 创建会话、`workspaceRegistry` 列工作区。无凭证出进程。

Git 命令在 session cwd 对应仓库 toplevel 执行，不把路径交给浏览器当权威。

## 4. API / 工具契约

无 model-facing tool。HTTP 全部 `kind: exact`。

### 4.1 Identity

- `GET /.well-known/xiaotaozi-dsh/identity/v1`
- 200：`{ product:"xiaotaozi-dsh", protocol:"xiaotaozi-dsh.identity.v1", profile:"web", ready:true, instanceToken? }`
- 405 / 403 见 NFR

### 4.2 Settings

- `GET|HEAD|POST /api/dsh-hello/settings`
- GET：`{ ok:true, config, shipped, surfaces }`
- POST JSON：只接受已知布尔键；返回同上。
- 未知方法 405；非法 JSON 400；非 JSON 415。

### 4.3 Archive（仅 archive 表面）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/dsh-hello/archives` | 列表；顺带 prune ghost ids |
| GET | `/api/dsh-hello/detail?sessionId=` | 预览；404 session not found |
| POST | `/api/dsh-hello/unarchive` | body `sessionIds` 或 `sessionId` |
| POST | `/api/dsh-hello/delete` | 彻底删除 |
| POST | `/api/dsh-hello/delete-all` | 删除当前列表全部 |

### 4.4 Board（仅 board 表面）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/dsh-hello/board` | snapshot：tasks + workspaces |
| POST | `/api/dsh-hello/board/tasks` | create：title/prompt/description/workspaceId/cron/scheduleEnabled |
| PUT/PATCH | 同上 | update，需 id |
| POST | `/api/dsh-hello/board/move` | id + status |
| POST | `/api/dsh-hello/board/run` | id |
| POST | `/api/dsh-hello/board/delete` | id |

手动只能把非 running 卡片移到 backlog/todo。running 由 runner 结算。

上限：MAX_TASKS=200，MAX_TITLE=200，MAX_PROMPT=32KiB，EXECUTION_HISTORY_LIMIT=20。

### 4.5 Git graph（仅 gitGraph 表面）

均需合法 sessionId（query 或 body），解析 cwd 失败 404 `no workspace`。

| 方法 | 路径 |
| --- | --- |
| GET | `/api/dsh-hello/gg/status` |
| GET | `/api/dsh-hello/gg/branches` |
| GET | `/api/dsh-hello/gg/log?limit=`（1–400，默认 80） |
| POST | `/api/dsh-hello/gg/switch` body `{ sessionId, branch }` |

非仓库：status/branches/log 返回 `repo:false`。switch 在非仓库 400 `not a git repository`。

### 4.6 System prompt

`systemPrompt.section({ name:"hello:xiaotaozi", order:80, text })`。宣告关或无其他表面时返回空串。

## 5. 生命周期 / 错误 / 安全

**生命周期**

1. `apply(ctx, config)` 用 schema 默认 + settings.json overlay 得到 live。
2. `ctx.inject(["webServer"])` 注册 identity/settings，`remount()`。
3. 关插件或 effect dispose：卸路由、停 BoardService timers。
4. Client：注册 chrome、peach、hideOfficial、settings、条件挂载 archive/board/gitGraph、NoticeHost。

**错误**

- fence 失败：403 `loopback-only`
- RouteError：对应 status + message
- 其余：500 `internal` 或 Error.message
- 看板 launch 失败：execution result=failed，卡片 failed

**安全**

- `isTrustedRouteRequest`：127/8、::1、::ffff:127.*；Host 必须是 loopback hostname；禁止 userinfo/path/query/hash；写操作强制 Origin 同源。
- 归档 id：拒绝 `..`, 分隔符。
- Git 分支名：`invalidBranchReason`；`git switch --no-guess -- <branch>`。
- 无 CORS 开放；无凭据进客户端 bundle。

## 6. 测试与可观测性

`pnpm --filter dsh-hello test`（vitest）。主要用例：

| 文件 | 覆盖 |
| --- | --- |
| `tests/config.test.ts` | 默认、未知键、unshipped 不挂载 |
| `tests/settings-store.test.ts` | DSH_HOME 往返、损坏文件 |
| `tests/host-routes.test.ts` | identity GET-only、token 形状、settings payload |
| `tests/loopback.test.ts` | fence |
| `tests/archive.test.ts` | 列表/预览/zstd/恢复/删除/穿越 |
| `tests/board.test.ts` | cron、ledger、board.json |
| `tests/git-graph.test.ts` | parse、hero 位置、真仓库 status |
| `tests/workbench.test.ts` | cwd 来自 workspace.json |
| `tests/announce.test.ts` | 宣告文案 |
| `tests/chrome.test.ts` `hide-official.test.ts` `peach.test.ts` `welcome.test.ts` `sidebar-entry.test.ts` | 客户端壳 |

无可观测后端。控制台无强制日志。

## 7. 兼容

- Host rc 0.1.1-rc.2。
- Git path 安装：`github:kedoupi/xiaotaozi-dsh#path:plugins/hello`，`prepare` 自建 `lib/`。
- 与 `dsh-sidebar` 并存：hello 不注册右侧面板。
- 与 `dsh-providers` 并存：隐藏官方重复模型导航。
- 规划：`FEATURE_SHIPPED` 可将某表面标未交付；当前全 true。
- 规划：notice 队列可加条目，无需改弹框组件。

## 8. FR/NFR → 代码 / 测试

| ID | 代码 | 测试 |
| --- | --- | --- |
| FR-01 品牌 | `client/chrome.ts` | `chrome.test.ts` |
| FR-02 隐藏官方入口 | `chrome.ts` Hidden | `chrome.test.ts` |
| FR-03 隐藏模型导航 | `hide-official.ts` | `hide-official.test.ts` |
| FR-04 桃色 | `peach.ts` | `peach.test.ts` |
| FR-05 欢迎 | `notices.ts` | `welcome.test.ts` |
| FR-06/07/08 设置 | `schema.ts` `settings-store.ts` `host-routes.ts` `XiaotaoziSettings.tsx` | `config.test.ts` `settings-store.test.ts` `host-routes.test.ts` |
| FR-09 归档 | `archive/routes.ts` `ledger.ts` | `archive.test.ts` |
| FR-10/11 看板 | `board/*` `sidebar-entry.ts` | `board.test.ts` `sidebar-entry.test.ts` |
| FR-12 Git 图谱 | `git-graph/*` `GitGraphChip.tsx` | `git-graph.test.ts` `workbench.test.ts` |
| FR-13 宣告 | `announce.ts` `index.ts` | `announce.test.ts` |
| FR-14 identity | `host-routes.ts` | `host-routes.test.ts` |
| NFR-01/02 fence | `loopback.ts` `http.ts` | `loopback.test.ts` |
| NFR-04 路径 | `archive/encode.ts` `workbench/cwd.ts` `git-graph/parse.ts` | `archive.test.ts` `workbench.test.ts` `git-graph.test.ts` |
| NFR-07 home | `dsh-home.ts` | `dsh-home.test.ts` |
