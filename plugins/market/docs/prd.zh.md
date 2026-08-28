# PRD：小桃子市场（dsh-market）

| 项 | 内容 |
| :-- | :-- |
| 产品 | 小桃子 DSH |
| 模块 | `dsh-market`（侧栏「新会话」下方一级入口 → 全屏市场浮层） |
| 文档状态 | 官方目录 `MARKET_PLUGINS`；点安装写入当前 profile。不拉远程索引。Desktop 已废弃 |
| 版本 | 0.1.0 |
| 日期 | 2026-08-28 |
| 作者 | 产研（对照当前源码） |
| 依赖文档 | [技术方案](./technical.zh.md)（实现合同，需求编号以本文为准） |

改交互、范围、验收：先改本文再改代码。技术方案不得擅自扩大范围。未实现能力必须标 **延期 / mock**，不得写成已上线。

---

## 1. 背景与问题

### 1.1 背景

用户入口改为 `xtz`；Desktop 已废弃。自研插件第一次 `xtz start` 就种上。额外第三方插件需要一个能看见、能点安装的面。

`dsh-market`：Web 侧栏入口 + 全屏浮层 + Host 路由。官方目录是代码里的 `MARKET_PLUGINS`。点安装对当前 `DSH_HOME` 跑 `dsh plugin --profile web add`。**不**拉远程索引、**不**验签、**不**从本仓库 `link:` 进正式 home。

### 1.2 要解决的问题

| ID | 问题 | 今天（本插件范围外） | 本期目标 |
| :-- | :-- | :-- | :-- |
| P1 | 用户看不到可装的插件/工作流 | 默认由第一次 `xtz start` 种好；额外走市场点安装 | 侧栏打开市场，浏览卡片与详情 |
| P2 | 用户要能装第三方，但不能从本仓库 `link:` 进正式 home | 额外走 `dsh plugin --profile web add` 上游规格 | 市场按钮对当前 home 跑同一条命令 |
| P3 | 远程来源尚无 fetch、验签和缓存合同 | 误导 user 添加后只得到空目录 | 来源 Tab 明示尚未支持，add route 返回 501；历史记录只允许移除 |

### 1.3 机会与约束

- **约束：** 正式 home 禁止从本仓库 `link:`。市场安装只用上游 Git/npm。`indexUrl` 只作官方源身份，不 fetch。
- **当前实现：** `catalogEntriesFor` 对官方源返回 `MARKET_PLUGINS`，`installed` 看当前 profile `package.json`。第三方源条目暂空。

---

## 2. 用户与场景

### 2.1 用户

| 画像 | 典型状态 |
| :-- | :-- |
| 用户 | 侧栏点「小桃子市场」，浏览；未装点安装，已装显示已安装 |
| 插件作者 / 沙箱 | `.dsh-home` :3081，`link:` 本包；可查看/移除历史来源记录，但本版本不能新增来源 |
| 遗留 Desktop | 若仍打开，市场仍在 Web；不是产品路径 |

### 2.2 核心场景

| 场景 | 用户做什么 | 系统做什么 |
| :-- | :-- | :-- |
| S1 打开市场 | 点侧栏「新会话」下方市场入口 | 全屏浮层；拉 catalog + intents |
| S2 浏览 | 搜索、点标签、点卡片进详情 | 客户端过滤目录条目 |
| S3 安装 | 未安装条目点「安装」 | `dsh plugin --profile web add` 该行 `installSpec`；成功后卡片变已安装 |
| S4 移除 | 已安装条目点「移除」 | `dsh plugin --profile web remove` 包名 |
| S5 管理来源 | 「来源」Tab 查看来源并清理历史记录 | 添加入口停用；官方源不可删 |
| S6 兼容旧配置 | Config 仍保留 `allowThirdPartySources` | 当前能力无论配置值都关闭；添加返回 501，UI 提示尚未支持 |

---

## 3. 目标与非目标

### 3.1 产品目标

用户能在 Web GUI 里看见市场目录里的第三方插件：已装显示已安装，未装可点安装，写入当前 home 的 web profile。

### 3.2 成功标准（可验收，对照已实现）

| ID | 标准 | 度量 |
| :-- | :-- | :-- |
| G1 | 侧栏「新会话」正下方出现市场入口（与 IM 共用 tools row，市场在左） | 走查 + `sidebar-entry` 单测 |
| G2 | 浮层有「市场」「来源」两 Tab，支持搜索与标签 | 走查 |
| G3 | 点安装对当前 `DSH_HOME` 跑 `dsh plugin --profile web add` 上游规格；已装显示已安装 | 单测 + 走查 |
| G4 | 路由仅 loopback + 同源 Origin（非 GET/HEAD 必带 Origin） | 单测 |
| G5 | 官方目录是 MARKET_PLUGINS（Agent Teams / Context / OpenContext） | 单测 |
| G6 | 不拉取、不验签 `indexUrl` | 代码审查 / README |

### 3.3 非目标（本期不做 / 明确延期）

| ID | 不做 | 状态 |
| :-- | :-- | :-- |
| OOS-1 | 从 `indexUrl` fetch 真实索引 | **延期**（`xtz`） |
| OOS-2 | 从本仓库路径安装第三方 | 禁止；规格是上游 Git/npm |
| OOS-3 | 设置页配置市场 | 未做；Config 走 loader 行 |
| OOS-4 | 工作流包 | 商城只列 MARKET_PLUGINS |

---

## 4. 用户故事

| ID | 故事 |
| :-- | :-- |
| US-1 | 作为用户，我要点侧栏市场入口打开浮层，Esc 或点遮罩关闭。 |
| US-2 | 作为用户，我要按名称/摘要/标签搜索，并用标签芯片筛选。 |
| US-3 | 作为用户，我要点卡片看版本、来源、安装/移除，并看到「已安装」或「安装」。 |
| US-4 | 作为用户，点安装后当前 profile 写入该插件；失败时看到错误。 |
| US-5 | 作为用户，我要在来源页明确看到远程目录尚未支持，而不是添加后得到空目录。 |
| US-6 | 作为管理员，我要能清理旧版本留下的来源记录；兼容配置开关当前不应误报为已启用。 |

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
| FR-CAT-1 | GET `/api/dsh-market/catalog` 返回官方源 + 用户源及各自条目 | P0 | 已实现 |
| FR-CAT-2 | 官方目录是 MARKET_PLUGINS（Agent Teams / Context / OpenContext），installed 来自当前 profile | P0 | 已实现 |
| FR-CAT-3 | 用户自加源暂无条目 | P1 | 已实现 |
| FR-CAT-4 | 客户端 `searchCatalog` / `tagsOf`：名称、摘要、标签包含匹配 | P0 | 已实现 |
| FR-CAT-5 | 详情展示版本、来源标签（官方源附加「官方」） | P0 | 已实现 |

### 5.3 来源

| ID | 需求 | 优先级 | 实现状态 |
| :-- | :-- | :-- | :-- |
| FR-SRC-1 | 官方源 id = `sourceIdFor(indexUrl)`，builtin，不可移除 | P0 | 已实现 |
| FR-SRC-2 | POST `/api/dsh-market/sources`：历史 `{remove:id}` 可用；`add` 在远程目录实现前返回 501 | P0 | 已实现 |
| FR-SRC-3 | 未来 add 输入：label 1–64 字；URL ≤2048；禁止 userinfo/hash；仅 https，或 loopback http | P1 | **延期**；校验 helper 已保留，但 route 当前先返回 501 |
| FR-SRC-4 | 未来 add 与官方或已有源 id 冲突 → 409 `source exists` | P1 | **延期**；route 当前先返回 501 |
| FR-SRC-5 | payload 诚实报告 `allowThirdPartySources=false`；UI 隐藏添加表单并提示尚未支持 | P0 | 已实现 |
| FR-SRC-6 | 用户源落盘 `$DSH_HOME/plugins/market/sources.json`（只存 label + indexUrl） | P0 | 已实现 |

### 5.4 安装意图

| ID | 需求 | 优先级 | 实现状态 |
| :-- | :-- | :-- | :-- |
| FR-INT-1 | GET/POST `/api/dsh-market/intents` | P0 | 已实现 |
| FR-INT-2 | body：`entryId`、`sourceId`、`action` ∈ {install, remove}；`status` 恒 `pending` | P0 | 已实现 |
| FR-INT-3 | 同 `entryId` 最新覆盖；队列 `slice(-100)` | P0 | 已实现 |
| FR-INT-4 | 原子写：目录 0700，文件 0600，tmp + rename | P0 | 已实现 |
| FR-INT-5 | 列表卡片仅未安装条目显示安装按钮；详情已安装显示移除 | P0 | 已实现 |
| FR-INT-6 | 同步 mutation 结束后无论成功或失败都删除本次 pending；失败保留面板并允许重试 | P0 | 已实现 |

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

### 7.2 安装 / 移除

1. 未安装条目点安装（或已装点移除）触发 `queueIntent(entryId, sourceId, action)`。
2. Host 校验 loopback → 解析 body → 记一条 intent → 用当前 pinned Host runtime 执行 `dsh plugin --profile web add|remove`。
3. 成功或失败后都删除本次 pending；成功后 catalog 带上新的 `installed`，失败显示错误且按钮恢复可重试。

### 7.3 添加来源

1. 本版本隐藏添加表单，并明确提示远程来源尚未支持。
2. 直接调用 add route 返回 501，不写 `sources.json`。
3. 历史来源记录仍可移除；不实现远程 fetch、验签或缓存。

---

## 8. 验收标准

| ID | 标准 | 对应 |
| :-- | :-- | :-- |
| AC-1 | 新会话按钮存在时，其下方 tools row 左格为市场按钮 | FR-NAV-* |
| AC-2 | 官方 catalog 与 `MARKET_PLUGINS` 一致（当前 3 条）；用户源不产生远端条目，add 返回 501 | FR-CAT-2/3、FR-SRC-2 |
| AC-3 | 连续安装同一条目只留一条最新 intent | FR-INT-3 |
| AC-4 | 第 101 条挤掉最旧 | FR-INT-3 |
| AC-5 | 非 loopback 或跨站 Origin → 403 `loopback-only` | NFR-1 |
| AC-6 | `validateSourceInput` 单测拒绝非回环 http；公开 add route 在能力开放前恒返回 501 | FR-SRC-2/3 |
| AC-7 | 文档与 UI 不得声称「已从官方索引安装成功」 | OOS-1/2 |
| AC-8 | `pnpm --filter dsh-market test` 绿 | 测试 |

---

## 9. 风险与未决

| ID | 项 | 说明 |
| :-- | :-- | :-- |
| R1 | 第三方来源目录未实现 | 添加入口与 route 已关闭；等有 fetch、验签、缓存安全设计后另开工作 |
| R2 | `installed` 只代表当前 profile 已声明 dependency | 来自 profile `package.json`，不证明插件已经成功构建或挂载；真实 mount 状态未知 |
| R3 | Host 在 mutation 中途崩溃会留下 pending | 当前同步完成路径会结算；崩溃恢复协议仍未知，不自动重放 durable work |
| R4 | DOM 插入依赖「新会话」文案 | 上游改文案会丢入口 |
| R5 | 与 dsh-im 抢同一 tools row | 约定市场左、IM 右 |
| Q1 | `market.json` 是否还要签名信封？ | 未实现；不要默认搬 Desktop pack 规格 |
| Q2 | 工作流包装入后由谁执行？ | 非本插件 |

---

## 10. 状态 / 版本 / 日期

| 项 | 值 |
| :-- | :-- |
| 包版本 | 0.1.0（`package.json`） |
| 文档版本 | 0.1.0 |
| 日期 | 2026-08-28 |
| 实现阶段 | 浏览 + 来源 + 点安装写入当前 profile。远程索引 / 验签 / 桌面 pack 不做 |
