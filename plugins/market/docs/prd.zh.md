# PRD：小桃子市场（dsh-market）

| 项 | 内容 |
| :-- | :-- |
| 产品 | 小桃子 DSH |
| 模块 | `dsh-market`（侧栏「新会话」下方一级入口 → 全屏市场浮层） |
| 文档状态 | 已实现浏览与排队 · **目录为 mock** · 桌面端下载/验签/应用 **未对接** |
| 版本 | 0.1.0 |
| 日期 | 2026-08-27 |
| 作者 | 产研（对照当前源码） |
| 依赖文档 | [技术方案](./technical.zh.md)（实现合同，需求编号以本文为准） |

改交互、范围、验收：先改本文再改代码。技术方案不得擅自扩大范围。未实现能力必须标 **延期 / mock**，不得写成已上线。

---

## 1. 背景与问题

### 1.1 背景

小桃子 Desktop 用户通过签名 pack（`https://s.xiaotaozi.cc/dsh/packs/`）获得官方插件。插件作者在沙箱用 Git path / `link:` 调试。两者之间缺少一个 **用户能看见、能点、但不自己下载** 的市场面：浏览插件与工作流包、管理来源、把安装/移除意图交给桌面端。

`dsh-market` 是这个面的第一期：Web 侧栏入口 + 全屏浮层 + Host 路由。**不**自己拉索引、**不**验签、**不**改 profile。

### 1.2 要解决的问题

| ID | 问题 | 今天（本插件范围外） | 本期目标 |
| :-- | :-- | :-- | :-- |
| P1 | 用户看不到可装的插件/工作流 | 只能靠种子 pack 静默覆盖 | 侧栏打开市场，浏览卡片与详情 |
| P2 | 安装动作若由 Web 插件自己做会污染正式 home | `dsh plugin add` / `link:` 进 `~/.dsh` 被仓库禁止 | 只排队 intent；桌面端以后负责下载验签应用 |
| P3 | 需要第三方源时没有登记处 | 无 | 来源 Tab 可加 https（本机回环 http 供开发） |

### 1.3 机会与约束

- **机会：** 官方索引 URL 已有产品约定（`s.xiaotaozi.cc/dsh/packs/`）；插件先把身份和排队协议钉死。
- **约束：** 正式 home 只有 Desktop 一个写手。本插件不得调用 `dsh plugin`、不得写 `profiles/web`、不得 fetch 未验签的远程目录当真实安装源。
- **当前实现约束：** `indexUrl` 只作来源身份；`mockEntriesFor` 返回假数据。README 已写明。

---

## 2. 用户与场景

### 2.1 用户

| 画像 | 典型状态 |
| :-- | :-- |
| Desktop 用户 | 侧栏点「小桃子市场」，浏览、排队 |
| 插件作者 / 沙箱 | `.dsh-home` :3081，`link:` 本包，可加本机 http 源 |
| 双持（Desktop + xtz） | 市场仍在 Web/桌面；CLI 不消费 intent |

### 2.2 核心场景

| 场景 | 用户做什么 | 系统做什么 |
| :-- | :-- | :-- |
| S1 打开市场 | 点侧栏「新会话」下方市场入口 | 全屏浮层；拉 catalog + intents |
| S2 浏览 | 搜索、点标签、点卡片进详情 | 客户端过滤 mock 条目 |
| S3 排队安装 | 未安装条目点「安装」 | POST intent，status 恒为 `pending` |
| S4 排队移除 | 详情页对已安装条目点「移除」 | 同一 `entryId` 最新请求覆盖 |
| S5 管理来源 | 「来源」Tab 添加/移除第三方源 | 写入 `sources.json`；官方源不可删 |
| S6 关闭第三方 | Config `allowThirdPartySources=false` | 添加返回 403；UI 提示已关闭 |

---

## 3. 目标与非目标

### 3.1 产品目标

用户能在 Web GUI 里 **看见** 市场、**登记** 来源、**排队** 安装/移除。桌面端日后消费队列。当前目录允许是假数据，但协议与安全边界必须是真的。

### 3.2 成功标准（可验收，对照已实现）

| ID | 标准 | 度量 |
| :-- | :-- | :-- |
| G1 | 侧栏「新会话」正下方出现市场入口（与 IM 共用 tools row，市场在左） | 走查 + `sidebar-entry` 单测 |
| G2 | 浮层有「市场」「来源」两 Tab，支持搜索与标签 | 走查 |
| G3 | 安装/移除只写 `$DSH_HOME/plugins/market/intents.json`，最多 100 条，同条目最新覆盖 | 单测 |
| G4 | 路由仅 loopback + 同源 Origin（非 GET/HEAD 必带 Origin） | 单测 |
| G5 | 官方 mock 含 hello / sidebar / providers / memory / im 与两条工作流示例 | 单测 |
| G6 | 不拉取、不验签 `indexUrl` | 代码审查 / README |

### 3.3 非目标（本期不做 / 明确延期）

| ID | 不做 | 状态 |
| :-- | :-- | :-- |
| OOS-1 | 从 `indexUrl` fetch 真实签名索引 | **延期**（桌面端） |
| OOS-2 | 下载 tarball、Ed25519 验签、覆盖 profile | **延期**（桌面端） |
| OOS-3 | 真实「已安装」探测（读 pack / profile） | **mock**：官方条目 `installed: true` 写死 |
| OOS-4 | 把市场意图交给 `xtz` / `dsh plugin add` | 禁止 |
| OOS-5 | 设置页配置市场 | 未做；Config 走 loader 行 |
| OOS-6 | 上架本仓库全部插件（agent-teams、context、market 自身等） | mock 未列入 |
| OOS-7 | 工作流包真实执行 | 两条工作流是示例假数据 |

---

## 4. 用户故事

| ID | 故事 |
| :-- | :-- |
| US-1 | 作为用户，我要点侧栏市场入口打开浮层，Esc 或点遮罩关闭。 |
| US-2 | 作为用户，我要按名称/摘要/标签搜索，并用标签芯片筛选。 |
| US-3 | 作为用户，我要点卡片看版本、来源、安装/移除，并看到「已安装 / 已排队」。 |
| US-4 | 作为用户，我排队后应看到「请求已排队，将由小桃子DSH桌面端在后台完成」，按钮禁用。 |
| US-5 | 作为用户，我要添加信任的 https 源；开发时允许 127.0.0.1/localhost/[::1] 的 http。 |
| US-6 | 作为管理员，我要能关掉第三方源，面板只显示官方源。 |

---

## 5. 功能需求

### 5.1 入口与浮层

| ID | 需求 | 优先级 | 实现状态 |
| :-- | :-- | :-- | :-- |
| FR-NAV-1 | 在「新会话」按钮后插入 tools row（`data-dsh-sidebar-tools`），市场按钮为左格，`data-dsh-market-entry` | P0 | 已实现 |
| FR-NAV-2 | 识别中英「新会话 / 新建会话 / New Session / New session」；图标描边跟随桃色 accent | P0 | 已实现 |
| FR-NAV-3 | MutationObserver 在 React 重绘后保持入口；卸载时移除按钮，空 row 删除 | P0 | 已实现 |
| FR-UI-1 | 全屏 overlay + dialog；Esc / 点遮罩 / 关闭按钮关闭 | P0 | 已实现 |
| FR-UI-2 | 中英 locale 命名空间 `market.panel` | P0 | 已实现 |

### 5.2 目录浏览

| ID | 需求 | 优先级 | 实现状态 |
| :-- | :-- | :-- | :-- |
| FR-CAT-1 | GET `/api/dsh-market/catalog` 返回官方源 + 用户源及各自条目 | P0 | 已实现（mock 条目） |
| FR-CAT-2 | 官方 mock：hello、sidebar、providers、memory、im（installed true）+ wf-weekly-ppt、wf-excel-report（workflow，installed false） | P0 | 已实现 |
| FR-CAT-3 | 第三方源返回一条「{label} 示例插件」演示条目 | P1 | 已实现（mock） |
| FR-CAT-4 | 客户端 `searchCatalog` / `tagsOf`：名称、摘要、标签包含匹配 | P0 | 已实现 |
| FR-CAT-5 | 详情展示版本、来源标签（官方源附加「官方」） | P0 | 已实现 |

### 5.3 来源

| ID | 需求 | 优先级 | 实现状态 |
| :-- | :-- | :-- | :-- |
| FR-SRC-1 | 官方源 id = `sourceIdFor(indexUrl)`，builtin，不可移除 | P0 | 已实现 |
| FR-SRC-2 | POST `/api/dsh-market/sources`：`{add:{label,indexUrl}}` 或 `{remove:id}` | P0 | 已实现 |
| FR-SRC-3 | label 1–64 字；URL ≤2048；禁止 userinfo/hash；仅 https，或 loopback http | P0 | 已实现 |
| FR-SRC-4 | 与官方或已有源 id 冲突 → 409 `source exists` | P0 | 已实现 |
| FR-SRC-5 | `allowThirdPartySources=false` → 403；UI 隐藏添加表单 | P0 | 已实现 |
| FR-SRC-6 | 用户源落盘 `$DSH_HOME/plugins/market/sources.json`（只存 label + indexUrl） | P0 | 已实现 |

### 5.4 安装意图

| ID | 需求 | 优先级 | 实现状态 |
| :-- | :-- | :-- | :-- |
| FR-INT-1 | GET/POST `/api/dsh-market/intents` | P0 | 已实现 |
| FR-INT-2 | body：`entryId`、`sourceId`、`action` ∈ {install, remove}；`status` 恒 `pending` | P0 | 已实现 |
| FR-INT-3 | 同 `entryId` 最新覆盖；队列 `slice(-100)` | P0 | 已实现 |
| FR-INT-4 | 原子写：目录 0700，文件 0600，tmp + rename | P0 | 已实现 |
| FR-INT-5 | 列表卡片仅未安装条目显示安装按钮；详情已安装显示移除 | P0 | 已实现 |

### 5.5 配置

| ID | 需求 | 优先级 | 实现状态 |
| :-- | :-- | :-- | :-- |
| FR-CFG-1 | Schemastery Config：`indexUrl` 默认 `https://s.xiaotaozi.cc/dsh/packs/market.json`；`officialLabel` 默认 `小桃子市场`；`allowThirdPartySources` 默认 true | P0 | 已实现 |
| FR-CFG-2 | Host 家目录：`DSH_HOME` 非空则用它，否则 `~/.dsh` | P0 | 已实现 |

---

## 6. 非功能需求

| ID | 需求 | 实现状态 |
| :-- | :-- | :-- |
| NFR-1 | 路由 loopback-only；非 GET/HEAD 要求同源 Origin；拒绝 `sec-fetch-site: cross-site` | 已实现 |
| NFR-2 | JSON 响应：`cache-control: no-store`、`x-content-type-options: nosniff`、`cross-origin-resource-policy: same-origin`、`referrer-policy: no-referrer` | 已实现 |
| NFR-3 | POST body 上限 16KiB；非 JSON → 415 | 已实现 |
| NFR-4 | mixed 插件：Host 路由 + Client UI；`@deepseek-ai/*` 不打进 `lib/` | 已实现 |
| NFR-5 | 不把 secret 写入 Config / intents / sources | 已实现（无凭据面） |
| NFR-6 | 中英 UI；用户可见中文默认 | 已实现 |
| NFR-7 | `prefers-reduced-motion` 关闭动画 | 已实现 |

---

## 7. 主流程

### 7.1 打开并浏览

1. Client `apply` 注入 CSS、locale，挂侧栏入口。
2. 用户点击 → `MarketOverlay` 挂到 `document.body`。
3. `MarketPanel` 并行 `GET catalog` 与 `GET intents`。
4. 失败 → 「市场加载失败，请稍后重试。」
5. 成功 → 网格；搜索/标签为客户端过滤。

### 7.2 排队

1. 未排队条目触发 `queueIntent(entryId, sourceId, action)`。
2. Host 校验 loopback → 解析 body → `appendIntent` → 写盘 → 返回全队列。
3. UI 显示「已排队」并禁用按钮。**没有**后续状态轮询：桌面端尚未消费。

### 7.3 添加来源

1. 表单提交 label + URL。
2. Host `validateSourceInput`；失败 400；第三方关闭 403；重复 409。
3. 写 `sources.json`，返回新 catalog（含该源的 mock 示例插件）。

---

## 8. 验收标准

| ID | 标准 | 对应 |
| :-- | :-- | :-- |
| AC-1 | 新会话按钮存在时，其下方 tools row 左格为市场按钮 | FR-NAV-* |
| AC-2 | 官方 catalog 7 条；第三方源 +1 演示插件 | FR-CAT-2/3 |
| AC-3 | 连续安装同一条目只留一条最新 intent | FR-INT-3 |
| AC-4 | 第 101 条挤掉最旧 | FR-INT-3 |
| AC-5 | 非 loopback 或跨站 Origin → 403 `loopback-only` | NFR-1 |
| AC-6 | http 非回环 URL 拒绝 `https required` | FR-SRC-3 |
| AC-7 | 文档与 UI 不得声称「已从官方索引安装成功」 | OOS-1/2 |
| AC-8 | `pnpm --filter dsh-market test` 绿 | 测试 |

---

## 9. 风险与未决

| ID | 项 | 说明 |
| :-- | :-- | :-- |
| R1 | mock 与真实索引形状可能不一致 | 桌面端对接时需冻结 envelope |
| R2 | `installed` 写死，与真实 profile 脱节 | 对接后应由桌面/Host 报告 |
| R3 | intent 无过期、无 ack | 桌面端需定义消费协议 |
| R4 | DOM 插入依赖「新会话」文案 | 上游改文案会丢入口 |
| R5 | 与 dsh-im 抢同一 tools row | 约定市场左、IM 右 |
| Q1 | `market.json` 信封是否与 `latest.json` 相同？ | 未实现，待桌面规格 |
| Q2 | 工作流包装入后由谁执行？ | 非本插件 |

---

## 10. 状态 / 版本 / 日期

| 项 | 值 |
| :-- | :-- |
| 包版本 | 0.1.0（`package.json`） |
| 文档版本 | 0.1.0 |
| 日期 | 2026-08-27 |
| 实现阶段 | Phase 1：浏览 + 来源 + 排队。Phase 2（桌面）：拉索引、验签、应用 pack —— **未开工** |
