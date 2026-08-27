# 技术方案：dsh-memory

| 项 | 内容 |
| :-- | :-- |
| 对应 PRD | [prd.zh.md](./prd.zh.md) **v0.1.0**（产品主合同） |
| 文档状态 | 已交付 · 与现行源码同步 |
| 冲突规则 | 用户可见行为以 PRD 为准；本文只写现行怎么实现。扩大范围先改 PRD |

实现必须覆盖 PRD 的 FR/NFR。禁止在未改 PRD 的情况下让 overlay 改启动命令，或把工作区外 path 当成合法导入根。

### 需求追溯

| PRD | 本文 |
| :-- | :-- |
| FR-SET-* 设置页 | §6 Client、§8 状态路由 |
| FR-TOOL-* 模型工具 | §7 tools.ts / guidance.ts |
| FR-ENG-* 引擎生命周期 | §4 server-manager / mcp-stdio / bundled-binary |
| FR-IMP-* 导入 | §5 import-service / importers |
| NFR-1～8 | §3 配置、§8 安全、§9 测试、§10 部署 |

---

## 1. 包身份

| 位置 | 值 |
| :-- | :-- |
| 目录 | `plugins/memory/` |
| `package.json` `name` | `dsh-memory` |
| `cordis.patch.yml` `name` | `dsh-memory` |
| patch `id` / `export const name` | `memory` |
| Git 安装 | `github:kedoupi/xiaotaozi-dsh#path:plugins/memory` |
| 设置页标题 | 记忆 |
| kind | mixed（Host + `src/client`） |
| 运行时依赖 | `@deepseek-ai/schemastery` |
| 可选依赖 | `@zseven-w/dsh-noema-{darwin,linux,win32}-{arm64,x64}@0.1.0-rc.2` |

四名必须对齐。Host `inject`：`["tools"]`。Client `inject`：`["slots", "locale"]`。`dsh.client.inject` 声明 runtime / locale / ui-slots / ui-settings。`files` 含 `lib`、`cordis.patch.yml`、`LICENSE`、`platforms.json`、`NOTICE`。

本包 **不** import `dsh-noema` TypeScript 源码；只消费其发布的平台二进制。归属见 `NOTICE`。

---

## 2. 架构

```
plugins/memory/
  src/index.ts              # Cordis Host：settings + tools + prompt + 状态路由
  src/names.ts              # plugin id、路由、工具名、guidance section
  src/settings.ts           # Schemastery Config + overlay
  src/tools.ts              # 15 个 noema_* 注册
  src/guidance.ts           # systemPrompt 文本
  src/server-manager.ts     # 子进程生命周期
  src/mcp-stdio.ts          # JSON-RPC stdio 客户端
  src/bundled-binary.ts     # 解析 noema-mcp
  src/import-service.ts     # 读文件、切段、ledger、提交
  src/importers.ts          # 十个源的 candidate 表
  src/status-route.ts       # /_dsh/dsh-memory/status
  src/workspace-boundary.ts # 导入 path 边界
  src/client/index.tsx      # 设置页三 Tab
  platforms.json            # 平台包清单
  tests/index.test.ts
```

```
设置页 Client  ──GET/POST──►  /_dsh/dsh-memory/status  (loopback + same-origin)
对话模型       ──tools──►     registerMemoryTools
                                  │
                                  ▼
                           NoemaServerManager
                                  │  stdio JSON-RPC
                                  ▼
                              noema-mcp
                                  │  NOEMA_ROOT（空则 ~/.agent-memory）
                                  ▼
                              可检查记忆文件
```

`noema_import` **不** 转给 MCP：由 `MemoryImportService` 读外源文件，再 `noema_remember`。

无 Cordis 的逻辑单独文件，测试只 import 那些文件。不要 value-import `@deepseek-ai/dsh-tools`。`@deepseek-ai/*` `neverBundle`。

---

## 3. 数据 / 配置 / 凭据

本插件 **没有** 厂商 OAuth。敏感面是：本机记忆文件、导入时读其它工具家目录、loopback 状态路由。

### 3.1 路径

| 路径 | 内容 |
| :-- | :-- |
| `$DSH_HOME/plugins/memory/settings.json` | overlay（0600）；**不含** command / workingDirectory / noemaRoot |
| `$DSH_HOME/storages/dsh-memory-imports.json` | 导入 ledger（0600，最多 2000 键） |
| `NOEMA_ROOT` 或 `~/.agent-memory` | Noema 引擎自己的文件；本包不解析其内部格式 |
| 可选包 `bin/noema-mcp` | bundled 命令 |

`DSH_HOME` 空则 `~/.dsh`。`expandHome` 处理 `~`。

### 3.2 Config 与 overlay

`settings.ts` 默认值与 README 表一致：

| 字段 | 默认 |
| :-- | :-- |
| enabled / autoStart / keepAlive / guidance / acceptByDefault / importEnabled / importWorkspaceFiles | true（`importOnStartup` **false**） |
| command | `bundled` |
| workingDirectory / noemaRoot | `""` |
| idleTimeoutMs | 0 |
| keepAliveIntervalMs | 5000 |
| callTimeoutMs | 30000 |
| restartDelayMs | 1000 |
| recallBudgetTokens | 1200 |
| importMaxBytes | 65536 |
| importSources | 十个内置 id |

解析：`defaults ← entry(profile Config) ← overlay`。`sanitizeOverlay` 丢掉未知键和启动三字段。`validateNoemaMemorySettings`：callTimeout ≥1；recallBudget ≥1；keepAliveInterval ≥1000；importMaxBytes ≥1024；importSources 必须是已知 id。

设置路由可写字段 = `WRITABLE_FIELDS`（无 command / workingDirectory / noemaRoot）。改 `enabled=false` 时 Host 立刻 `manager.stop()`。

### 3.3 启动环境

`resolveNoemaLaunch`：`command==="bundled"` 则 argv = `[resolveBundledNoemaBinary()]`，否则按引号切分（**无 shell**）。非空 `workingDirectory` → cwd；非空 `noemaRoot` → 子进程 env `NOEMA_ROOT`。

---

## 4. 引擎生命周期

### 4.1 `bundled-binary.ts`

平台键 `process.platform-process.arch`，对照 `platforms.json`。候选顺序：optional 包 `bin/<binaryName>`，然后插件内 `noema/target/{rustTarget,}/release|debug`（仅开发树）。没有该平台或文件缺失：抛错，提示重装 optionalDependencies 或改 Config `command`。

### 4.2 `mcp-stdio.ts`

- spawn 后 `initialize`（protocol `2024-11-05`，clientInfo `dsh-memory` + 包版本）再 `notifications/initialized`。
- 握手默认 15s；失败 dispose 子进程，不孤儿。
- `tools/call` → 拼接 text content。`isError` 抛 `McpStdioError`。
- 单条消息上限 `MAX_MCP_MESSAGE_BYTES = 8MiB`。stderr 逐行给 logger，不当协议。
- 子进程退出：reject 全部 in-flight。

### 4.3 `NoemaServerManager`

状态：stopped / starting / running / unavailable（`enabled=false`）。`ensureRunning` 合并并发 spawn。`call` 计 activeCalls，结束后按 `idleTimeoutMs` 武装空闲停止。keep-alive：1s tick，间隔 `keepAliveIntervalMs`，仅当 client.state===`exited`（不对抗手动 stopped）。`dispose`：disposed=true，停 keep-alive，杀子进程。

status() 在 running 时额外 `noema_status`，解析 JSON 放进 `server`。

---

## 5. 导入

### 5.1 源（`importers.ts`）

稳定顺序：codex、claude-code、opencode、cursor、grok、workbuddy、antigravity、trae、qoder、hermes。

| id | 全局（摘要） | 工作区 |
| :-- | :-- | :-- |
| codex | `~/.codex/AGENTS.md`、`memories/MEMORY.md`、`memory_summary.md`、rollout_summaries、ad_hoc/notes；**不**收 raw_memories.md | AGENTS.md、AGENTS.local.md |
| claude-code | `~/.claude/CLAUDE.md` 等 | CLAUDE.md / MEMORY.md |
| opencode | `~/.config/opencode/AGENTS.md` | AGENTS.md |
| cursor | `~/.cursorrules`、`~/.cursor/rules`（rules/mdc） | `.cursorrules`、`.cursor/rules` |
| grok | `~/.grok/AGENTS.md`、`~/.grok/memory` | AGENTS.md |
| workbuddy | `~/.codebuddy` / `~/.workbuddy` 等 | AGENTS.md、CODEBUDDY.md |
| antigravity | 常见 config 目录 AGENTS.md（best-effort） | AGENTS.md、AGENTS.local.md |
| trae | `~/.trae` 与 `~/.trae-cn` 的 AGENTS.md / memory / rules | AGENTS.md、`.trae/rules` |
| qoder | `~/.qoder-cn` 与 `~/.qoder` | AGENTS.md、AGENTS.local.md、`.qoder/rules` |
| hermes | `~/.hermes/memories`、`SOUL.md`（默认 home only） | `.hermes.md`、HERMES.md、AGENTS.md、CLAUDE.md |

`resolveImporters(['all'] | 空)` = 全部，且保持表顺序。

### 5.2 `MemoryImportService`

对每个 candidate：`existsSync` 才读。`collectItems`：realpath + 根内检查；目录 walk 深 3，跳过 `.git`，去重 canonical 目录。文件 > 8MiB 记 error 不读。内容按 `importMaxBytes` 截断。

切段：markdown 在 h1–h3 且当前段已有内容时 flush；rules 一种一项。展示文本 = `源 · 文件 · heading` + body，**不含绝对路径**。ledger key = sha256(path + heading + **body**)，因此多工具共享同一 AGENTS.md 只导一次。提交 `noema_remember({ text, tags:['imported','source:id'], accept:true })`。

显式 `path`：`resolveAllowedWorkspacePath`，两侧 realpath；无 workspace 根则拒绝。工具侧 workspace 默认 session cwd。

---

## 6. Client

`src/client/index.tsx`：

- CSS `data-plugin-css=dsh-memory`。
- `settings.section` id `memory`，order 40，label 随 locale。
- GET `NOEMA_STATUS_ROUTE` 拉快照；POST JSON `{ action }`。
- Tab status / notes / import。高级折叠含 ReviewQueue（`memory`/`review`、`review_decide` 仅 accept/reject）。
- 笔记搜索走 `op: search` → Host 调 `noema_recall`（不是 `noema_search`）。添加强制 `accept: true` + tag `ui-added`。
- 导入源文案中英各一套；勾选写 `importSources`。

Client **不**读记忆文件、不读 secret、不 spawn。

---

## 7. 工具合同

`tools.ts` `SPECS` 与 `NOEMA_TOOL_NAMES` 对齐（15 个）。每个：JSON Schema parameters、`output.schema` string、`render` 文本。`execute`：关总开关即抛中文错；`noema_import` 走 ImportService；其余 `manager.call(name, builtArgs)`。空结果写成 `Noema <tool> returned an empty result.`；能 parse JSON 则 pretty-print。

参数以源码 description 为准（英文，给模型）。`noema_policy_set.write` 枚举 `manual|review|auto-safe|auto`。`noema_review_decide.decision` 枚举 `accept|reject|edit|merge`。

guidance：`enabled && guidance` 才输出 `<noema-memory>…</noema-memory>`。不包含状态路由路径。

---

## 8. 状态路由 / 安全

路径 `/_dsh/dsh-memory/status`（`names.ts`）。挂在 `webServer` 或 `httpServer`（先试再 `internal/service` 重试）。headless 无 web 则不注册路由。

信任：

1. `remoteAddress` 为 loopback（含 `::ffff:127.x`）。
2. `Host` 为 localhost / 127.x / ::1，无 userinfo/path/query。
3. `sec-fetch-site !== cross-site`；POST 必须 Origin 与 Host origin 相同。
4. POST `Content-Type: application/json`；body ≤ 16KiB。

响应：`cache-control: no-store`、`x-content-type-options: nosniff`、`cross-origin-resource-policy: same-origin`。

| action | 行为 |
| :-- | :-- |
| GET | snapshot：lifecycle + config + writable + lastImport |
| POST restart / stop | manager.restart / stop |
| POST configure | field ∈ WRITABLE_FIELDS；无 writer → 409 |
| POST memory | op：search（recall）、catalog、browse（limit 1–50，默认 30）、add、forget、review、review_decide |
| POST import | ImportService；path 越界 403 |

未知 action 400；非 GET/POST 405。

---

## 9. 测试与可观测性

`pnpm --filter dsh-memory test` → `tests/index.test.ts`。不 mock 整个 harness。

| describe / it | 覆盖 |
| :-- | :-- |
| exports name and tools | PLUGIN_NAME、15 个工具名 |
| importers | 十 id、resolve 顺序、home 展开、hermes `.hermes.md` |
| markdown split / mdc | 切段、标题前缀、无绝对路径、frontmatter |
| guidance and settings | 关 guidance 空串；acceptByDefault 控制 review 句；校验；sanitizeOverlay 剥启动字段 |
| launch helpers | tokenizeCommand 无 shell |
| status route trust | loopback 地址、trusted browser |
| workspace import boundary | 根外拒绝 |
| recursive import symlink boundary | 外逃 symlink / 符号链接根 |
| server manager idle calls | 空闲停止与进行中调用 |

日志：`dsh-memory mounted (N memory tools; enabled|disabled)`；keep-alive / idle / import 摘要；MCP stderr → warn。无独立 metrics。

---

## 10. 部署与兼容

- Profile 加载 `lib/`。改源码须 `pnpm --filter dsh-memory build`。
- 沙箱：`link-plugin --profile web memory` + `pnpm dev` → `.dsh-home` :3081。
- Desktop 用户走 pack；optional 原生包必须随 pack 的 darwin 目标带上，否则 bundled 失败。
- 兼容：坏 overlay / 坏 ledger 当空，下次写入覆盖。MCP 协议版本钉死；升级 Noema 须回归 initialize + tools/call。
- 宿主 rc 0.1.1-rc.2 与 client inject pin 一致。

---

## 11. FR / NFR → 实现与测试

| ID | 实现 | 测试 |
| :-- | :-- | :-- |
| FR-SET-1～2 | `client/index.tsx` slot `memory`、三 Tab | 走查 |
| FR-SET-3～6 | `status-route.ts` GET/POST configure/restart/stop | `status route trust`；writable 字段单测 `isWebWritableSetting` |
| FR-SET-7～8 | Client NotesPane / ImportPane + memory/import actions | 走查；Host op 在 status-route |
| FR-TOOL-1 | `tools.ts` SPECS、`names.ts` | `exports the plugin name and Noema tools` |
| FR-TOOL-2 | tools execute 开头 | 需走查 / 可补测；现行无独立 execute 单测 |
| FR-TOOL-3～4 | buildArgs | 与 settings 默认值一致（README） |
| FR-TOOL-5 | import + `resolveAllowedWorkspacePath` | `workspace import boundary` |
| FR-TOOL-6～7 | `guidance.ts` | `guidance and settings` |
| FR-ENG-1 | `bundled-binary.ts` | launch / candidates（测试 import `bundledNoemaCandidates`） |
| FR-ENG-2～6 | `server-manager.ts` | `server manager idle calls` |
| FR-ENG-7 | `index.ts` webServer/httpServer | 代码审查 |
| FR-IMP-1 | `importers.ts` | `importers` |
| FR-IMP-2 | splitMarkdown / ruleItem | `markdown split` |
| FR-IMP-3～5 | import-service collectItems / ledger | symlink + UTF-8 cap 测试 |
| FR-IMP-6～8 | apply + ImportService.run | importEnabled 短路在源码；无独立单测 |
| NFR-1 | sanitizeOverlay + 路由 WRITABLE_FIELDS | overlay 单测 |
| NFR-2 | status-route 信任函数 | `status route trust` |
| NFR-3～4 | package.json / tsdown / Config | `pnpm check` 族 |
| NFR-5 | tests/index.test.ts | 本文件 |
| NFR-6 | README + bundled 错误文案 | 走查 |
| NFR-7 | mcp-stdio 常量 | 代码审查 |
| NFR-8 | README 开发节 | 文档门禁 |
