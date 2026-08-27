# PRD：记忆（dsh-memory）

| 项 | 内容 |
| :-- | :-- |
| 产品 | 小桃子 DSH |
| 模块 | `dsh-memory`（设置 → **记忆**） |
| 文档状态 | 已交付 · 与现行源码同步 |
| 版本 | 0.1.0 |
| 日期 | 2026-08-27 |
| 作者 | 产研（本仓库规格，从 README / 源码归纳） |
| 依赖文档 | [技术方案](./technical.zh.md)（实现合同，需求编号以本文为准） |

改交互、范围、验收：先改本文再改代码。技术方案不得擅自扩大范围。未在源码或 README 中出现的能力，不得写成已交付。

---

## 1. 背景与问题

### 1.1 背景

对话默认不跨会话。用户说过的部署约定、禁提交时间、项目偏好，新开一轮就会丢。

本插件占用设置 → **记忆**（三个 Tab：对话中使用、已记下的内容、从其他工具导入）。模型侧是 Noema 的 `noema_*` 工具。引擎是 [Noema](https://github.com/ZSeven-W/noema)（`noema-mcp`），与 [dsh-noema](https://github.com/ZSeven-W/dsh-noema) 同一套。本包是 DSH 接线 + 中文设置页。平台二进制来自 `@zseven-w/dsh-noema-<platform>` 可选依赖（见 NOTICE）。

### 1.2 要解决的问题

| ID | 问题 | 今天（无本插件） | 目标 |
| :-- | :-- | :-- | :-- |
| P1 | 跨会话想不起约定 | 用户每轮重说 | 对话里「记住…」→ `noema_remember`；新开一轮 `noema_recall` |
| P2 | 人要能看见、改、删笔记 | 只有模型工具、无设置页 | 设置页搜索 / 添加 / 删除 |
| P3 | 已有 Cursor / Claude Code / Codex 等笔记 | 各工具各写各的文件 | 可导入，去重，不覆盖未知路径 |
| P4 | 引擎对用户太重 | 要自己装 MCP | 默认 `command=bundled` 拉可选原生包 |

### 1.3 机会与约束

- **机会：** Noema 已把记忆落成可检查文件；本包只做 Harness 生命周期与设置页。
- **约束：** 不 vendor Noema 源码。`command` / `workingDirectory` / `noemaRoot` 是进程启动配置，只能放 profile / Config，写进 `$DSH_HOME/plugins/memory/settings.json` 会被忽略。状态路由仅 loopback + 同源浏览器。显式导入 path 必须落在工作区根内。

---

## 2. 目标用户

| 画像 | 说明 |
| :-- | :-- |
| 主用户 | 用对话写代码的人。希望模型记住长期事实，并在设置里自己搜/删。 |
| 从别的工具迁来的人 | 已有 Codex / Claude Code / Cursor 等 AGENTS.md、规则或 memory 文件。 |
| 插件作者 | 沙箱 `.dsh-home` :3081。可选平台包装得上，`bundled` 才能找到 `noema-mcp`。 |

不假设用户会配 MCP 或读 `NOEMA_ROOT`。

---

## 3. 目标与非目标

### 3.1 产品目标

让用户在对话里跨会话使用长期笔记，并在设置 → 记忆里查看、增删、从其它 AI 编程工具导入。成功标准是：新开一轮能召回上次记住的约定；设置页能搜到同一条；关掉总开关后面具工具失败且说明去设置打开。

### 3.2 本期成功标准（可验收）

| ID | 标准 | 度量 |
| :-- | :-- | :-- |
| G1 | 设置 → 记忆能打开，三个 Tab 可切换 | 走查 |
| G2 | 对话「记住本项目用 pnpm」后，新会话 `noema_recall` 能召回 | 真机 |
| G3 | 设置页可搜索、添加、删除笔记 | 走查 |
| G4 | 可从十个内置源导入；重复内容跳过 | 走查 + 单测 split/ledger |
| G5 | `enabled=false` 时工具抛中文「记忆已关闭…」 | 单测 / 走查 |
| G6 | 状态路由拒绝非 loopback 与跨站 | 单测 `status-route` |
| G7 | 磁盘 overlay 不能改 `command` / `workingDirectory` / `noemaRoot` | 单测 `sanitizeOverlay` |

### 3.3 非目标（现行不做）

| ID | 不做 | 原因 / 证据 |
| :-- | :-- | :-- |
| OOS-1 | 自研另一套记忆引擎 | 只用 Noema MCP |
| OOS-2 | 在设置 overlay 里改启动命令或 NOEMA_ROOT | 防磁盘文件重定向二进制 |
| OOS-3 | 导入任意用户指定的工作区外路径 | `WorkspaceBoundaryError` |
| OOS-4 | 递归导入跟随指向根外的符号链接 | `collectItems` 拒绝 |
| OOS-5 | 把 Codex `raw_memories.md` 当输入 | importers 注释：那是未精炼源 |
| OOS-6 | Hermes 具名 profile 目录 | 只收默认 `~/.hermes`，避免种子 skills |
| OOS-7 | headless 强制挂设置 HTTP | 无 webServer 时仍注册 tools |
| OOS-8 | 用户必须把记忆根设进 `$DSH_HOME` | 默认空 = `~/.agent-memory` |

---

## 4. 用户故事

| ID | 故事 | 验收 |
| :-- | :-- | :-- |
| US-1 | 作为用户，我要在对话里说「记住 21 点不能提交」，以便以后轮次仍遵守 | 模型调 `noema_remember`；默认 `acceptByDefault=true` 立刻落盘 |
| US-2 | 作为用户，我新开一轮希望模型先召回相关笔记 | systemPrompt 在 `guidance=true` 时要求先 `noema_recall` |
| US-3 | 作为用户，我要在设置里搜索并删除一条记错的笔记 | Tab「已记下的内容」 |
| US-4 | 作为用户，我要把 Cursor 规则和 Codex AGENTS.md 导进来 | Tab「从其他工具导入」；ledger 去重 |
| US-5 | 作为用户，我要暂时关掉记忆工具 | `enabled` 关闭后工具失败，子进程可停 |
| US-6 | 作为用户，我要把记忆文件放进 harness home | 在 **profile/Config** 设 `noemaRoot=$DSH_HOME/plugins/memory`，不是 overlay |
| US-7 | 作为用户，当 `acceptByDefault` 关闭时，我要在设置高级区审核候选 | `noema_review_list` / 决定接受或拒绝 |

---

## 5. 范围

### 5.1 在范围内

- mixed 插件：Host 拉起 `noema-mcp`、注册 15 个 `noema_*` 工具、可选 systemPrompt；Client 占用 `settings.section` id = `memory`（order 40）。
- 设置页三 Tab：对话中使用（状态与开关）、已记下的内容、导入。
- 配置：Schemastery Config + `$DSH_HOME/plugins/memory/settings.json` overlay（不含启动三字段）。
- 导入十源：`codex`、`claude-code`、`opencode`、`cursor`、`grok`、`workbuddy`、`antigravity`、`trae`、`qoder`、`hermes`。
- 工作区 `AGENTS.md` / `CLAUDE.md` 等按各 importer 的 `workspaceCandidates`；`importWorkspaceFiles` 可关。
- 平台可选依赖：darwin/linux/win32 的 arm64 与 x64，`platforms.json`。

### 5.2 不在范围内

见 §3.3。Noema 引擎内部的图谱/策略语义以 MCP 工具为准，本 PRD 不重新定义 Noema 存储格式。

---

## 6. 功能需求

### 6.1 设置页

| ID | 优先级 | 需求 | 验收要点 |
| :-- | :-- | :-- | :-- |
| FR-SET-1 | P0 | 占用设置 → **记忆**，中文标签（英文 locale 显示 Memory） | slot id `memory` |
| FR-SET-2 | P0 | 三 Tab：对话中使用、已记下的内容、从其他工具导入 | 左右方向键切换 |
| FR-SET-3 | P0 | 状态点：运行中 / 已停止 / 不可用；失败展示 lastError | GET status |
| FR-SET-4 | P0 | 总开关 `enabled`；关则 stop 子进程 | POST configure |
| FR-SET-5 | P0 | 高级：guidance、autoStart、acceptByDefault、召回预算、空闲超时、保活、调用超时、重启延迟、导入开关 | 仅 WRITABLE_FIELDS |
| FR-SET-6 | P0 | 高级里可 restart / stop / refresh；不可写会话提示 | `writable === false` → 409 |
| FR-SET-7 | P0 | 笔记 Tab：搜索（走 recall）、按主题浏览、添加（tag `ui-added`）、删除 | POST memory ops |
| FR-SET-8 | P0 | 导入 Tab：十源多选、立即导入、展示 lastImport | POST import |

### 6.2 模型工具

| ID | 优先级 | 需求 | 验收要点 |
| :-- | :-- | :-- | :-- |
| FR-TOOL-1 | P0 | 注册 15 个工具：recall / search / browse / catalog / recall_graph / neighbors / explain / remember / review_list / review_decide / forget / policy_get / policy_set / status / import | `NOEMA_TOOL_NAMES` |
| FR-TOOL-2 | P0 | `enabled=false` 时所有工具失败：「记忆已关闭。在设置 → 记忆里打开。」 | tools.ts |
| FR-TOOL-3 | P0 | `noema_recall` 未传 `budget_tokens` 则用 `recallBudgetTokens`（默认 1200） | buildArgs |
| FR-TOOL-4 | P0 | `noema_remember` 未传 `accept` 则用 `acceptByDefault`（默认 true） | buildArgs |
| FR-TOOL-5 | P0 | `noema_import` 由本包 ImportService 执行，不直接转 MCP；`path` 必须在工作区根内 | workspace-boundary |
| FR-TOOL-6 | P0 | `guidance=true` 且 enabled 时注入 systemPrompt 段 `memory-guidance`（order 120） | 关则空串 |
| FR-TOOL-7 | P0 | `acceptByDefault=false` 时 guidance 增加审核队列说明 | guidance.ts |

### 6.3 引擎生命周期

| ID | 优先级 | 需求 | 验收要点 |
| :-- | :-- | :-- | :-- |
| FR-ENG-1 | P0 | 默认 `command=bundled` 解析当前平台 `noema-mcp` | 缺包给出重装 optionalDependencies 的说明 |
| FR-ENG-2 | P0 | `enabled && autoStart` 时 apply 后 `ensureRunning` | 失败 logger.warn，不崩 Host |
| FR-ENG-3 | P0 | `keepAlive=true` 时子进程异常退出后按 `restartDelayMs` 后台拉起；手动 stop 保持 stopped | keep-alive 不对抗 idle/manual stop |
| FR-ENG-4 | P0 | `idleTimeoutMs>0` 且无进行中调用则停子进程；0 表示不停 | 默认 0 |
| FR-ENG-5 | P0 | 调用超时 `callTimeoutMs` 默认 30000；保活间隔默认 5000（≥1000） | 校验 |
| FR-ENG-6 | P0 | 插件 dispose 停止 keep-alive 并杀掉子进程 | server-manager.dispose |
| FR-ENG-7 | P0 | 无 web 服务的 profile 仍注册 tools；webServer/httpServer 晚绑定时再挂路由 | index.ts |

### 6.4 导入

| ID | 优先级 | 需求 | 验收要点 |
| :-- | :-- | :-- | :-- |
| FR-IMP-1 | P0 | 十个内置 id，稳定顺序 | IMPORTERS |
| FR-IMP-2 | P0 | markdown 按 h1–h3 切段；Cursor `.mdc` 抽 frontmatter | splitMarkdown / ruleItem |
| FR-IMP-3 | P0 | ledger `$DSH_HOME/storages/dsh-memory-imports.json`（0600），按 path+heading+body 哈希去重 | force 可重导 |
| FR-IMP-4 | P0 | 默认 `importMaxBytes=65536`，硬顶 8MiB；按 UTF-8 字节截断 | limitUtf8Bytes |
| FR-IMP-5 | P0 | 目录 walk 深度 ≤3；拒绝根外 symlink；递归根本身不得是 symlink | collectItems |
| FR-IMP-6 | P0 | `importOnStartup=true` 时启动跑一遍（默认 false） | apply |
| FR-IMP-7 | P0 | 导入项 tag `imported` + `source:<id>`，accept true | ImportService |
| FR-IMP-8 | P0 | `importEnabled=false` 时导入失败并写入 lastSummary | 不假装成功 |

### 6.5 非功能

| ID | 优先级 | 需求 |
| :-- | :-- | :-- |
| NFR-1 | P0 | overlay 文件 0600，目录 0700；启动三字段不可经 overlay / 设置路由改写 |
| NFR-2 | P0 | 状态路由 `/_dsh/dsh-memory/status` 仅 loopback + 同源；POST 要 Origin；拒绝 cross-site |
| NFR-3 | P0 | mixed；`@deepseek-ai/*` 不打进 bundle；`prepare` / tsdown 自包含 |
| NFR-4 | P0 | 可调值走 Schemastery Config；不要 value-import `dsh-tools` |
| NFR-5 | P0 | 纯逻辑可单测；CI 不依赖真实 Noema 账号 |
| NFR-6 | P0 | Git path `#path:plugins/memory`；可选平台包装不上则 bundled 失败并说明 |
| NFR-7 | P0 | MCP stdio 单条消息上限 8MiB；初始化握手默认 15s |
| NFR-8 | P0 | 沙箱开发挂 `.dsh-home` :3081，不挂日常 `~/.dsh` |

---

## 7. 用户流程

### 7.1 对话中记住 / 召回

1. 用户说长期事实。模型在 guidance 提示下调用 `noema_remember`。
2. 默认立刻接受。若关闭「默认接受」，进入待审，设置高级区或 `noema_review_*` 处理。
3. 新会话开始：模型应 `noema_recall`。文件在 `NOEMA_ROOT`（空则 `~/.agent-memory`）。

### 7.2 设置页管笔记

1. 打开设置 → 记忆 → 已记下的内容。
2. 搜索走 recall；不搜时按 catalog/browse 主题列表。
3. 添加写入并打 `ui-added`；删除走 `noema_forget`。

### 7.3 从其它工具导入

1. 导入 Tab 勾选源（默认十个全开，可改 `importSources`）。
2. 点立即导入。全局文件按各工具家目录；工作区文件仅当 `importWorkspaceFiles` 且有 workspace 根。
3. 已在 ledger 的段落跳过。结果可跳转笔记 Tab。

### 7.4 关掉或重启引擎

1. 对话中使用 Tab 关总开关 → 子进程 stop，工具不可用。
2. 高级可重启 / 停止。`autoStart` 只影响 DSH 启动是否拉起，不替代总开关。

---

## 8. 验收标准

发布 / 回归本版本前：

- [ ] FR-SET-1～8
- [ ] FR-TOOL-1～7
- [ ] FR-ENG-1～7
- [ ] FR-IMP-1～8
- [ ] NFR-1～8
- [ ] `pnpm --filter dsh-memory test` 通过
- [ ] 真机：bundled 能启动；对话记住一条并能召回；导入至少一源（本机有对应文件时）
- [ ] README 配置表与本文默认值一致

---

## 9. 风险与开放问题

| ID | 风险 / 问题 | 用户感受 | 缓解 / 状态 |
| :-- | :-- | :-- | :-- |
| R1 | 可选原生包装不上 | 记忆不可用 | 失败文案要求重装 optionalDependencies 或改 Config `command` |
| R2 | 默认记忆根在 `~/.agent-memory`，跨 home 共享 | 沙箱与正式可能读到同一份笔记 | README 说明可把 noemaRoot 设到插件目录（须改 profile） |
| R3 | 导入读家目录下其它工具文件 | 隐私面扩大 | 仅列明的 candidate；工作区 path 有边界 |
| R4 | Noema MCP 协议变更 | 工具失败 | 本包只做 stdio JSON-RPC 透传；协议版本钉 `2024-11-05` |
| Q1 | 是否默认把 noemaRoot 改到 `$DSH_HOME/plugins/memory` | 与 Harness home 对齐 vs 与其它 Noema 客户端共享 | **现行默认空**；未改代码前保持 |

---

## 10. 状态 / 版本 / 日期

| 项 | 值 |
| :-- | :-- |
| 状态 | 已交付 |
| 包版本 | 0.1.0（`plugins/memory/package.json`） |
| 宿主 pin | DeepSeek Harness `0.1.1-rc.2` |
| Noema 平台包 | `@zseven-w/dsh-noema-*` `0.1.0-rc.2` |
| 文档版本 | 0.1.0 |
| 日期 | 2026-08-27 |
| 证据 | `README.md` / `README.zh.md` / `NOTICE` / `src/**` / `tests/index.test.ts` / `platforms.json` |
