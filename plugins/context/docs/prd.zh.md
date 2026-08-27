# PRD：会话上下文（dsh-context）

| 项 | 内容 |
| :-- | :-- |
| 产品 | 小桃子 DSH |
| 模块 | `dsh-context`（会话 **上下文** Tab + 客户端 `/context`） |
| 文档状态 | 已实现 Tab、弹层、投影折叠；fork 关闭上游 npm 升级提示 |
| 版本 | 0.1.0 |
| 日期 | 2026-08-27 |
| 作者 | 产研（对照当前源码） |
| 上游 | [bowenliang123/dsh-context](https://github.com/bowenliang123/dsh-context) Apache-2.0，pin `externals/dsh-context` @ bfb99a4（0.21.1）；可安装的是本 fork |
| 依赖文档 | [技术方案](./technical.zh.md) |

改交互、范围、验收：先改本文再改代码。不要和 npm `dsh-context` 装进同一 profile。

---

## 1. 背景与问题

### 1.1 背景

模型每一步看见的上下文（系统提示、工具 schema、用户/注入/助手/工具结果）对排障、压缩和费用判断至关重要。Harness 把这些写在 session log 里，但聊天 UI 默认不展示构成、趋势和事件。

上游 `dsh-context` 做了「上下文」Tab。本仓 fork 钉 host rc、关 npm 升级提示、走 session-projection 而不是自定义 RPC。

### 1.2 要解决的问题

| ID | 问题 | 没有本插件 | 目标 |
| :-- | :-- | :-- | :-- |
| P1 | 看不出当前请求由什么组成 | 只能猜 prompt | 组成条 + 分类 token |
| P2 | 压缩/剪枝/注入发生了但聊天里不明显 | 无时间线 | 事件列表 + 趋势图 |
| P3 | 想看某一步当时组装的表面 | 无 | 上下文浏览器按步重建 |
| P4 | 离开 Chat 才能看洞察 | 必须切 Tab | `/context` 居中弹层 |
| P5 | fork 用户被引去上游 npm | 旧 Plugin info 打 registry | `fetchLatestVersion` 恒 null |

### 1.3 机会与约束

- **机会：** `ctx.sessionProjections` 增量折叠并推送到浏览器 `useProjection`。
- **约束：** Host 半边 `inject: ['sessionProjections']`，没有 registry 则插件 PENDING/inert，不自己轮询 log。
- **口径：** 表面 token 是与 token-meter 相同的固定密度启发式（约 4 字符 ≈ 1 token）；「实际」用量来自供应商。占用读官方 `contextPressure`，不在本插件里镜像（0.11+）。

---

## 2. 用户与场景

### 2.1 用户

| 画像 | 用法 |
| :-- | :-- |
| 对话用户 | 切到「上下文」或输入 `/context` |
| 排障的人 | 看哪类消息占窗口、哪次压缩、某步的系统提示 |
| 插件作者 | 沙箱 link 本 fork，不装 npm |

### 2.2 核心场景

| 场景 | 路径 |
| :-- | :-- |
| S1 看当前构成 | 打开上下文 Tab：系统/工具/用户/注入/助手/工具 条 |
| S2 看历史 | 趋势图按步或按轮；悬停详情 |
| S3 看事件 | 压缩、剪枝、注入、模型切换 |
| S4 浏览器 | 点某步重建当时表面；live = 下一次请求 |
| S5 斜杠 | `/context` 打开同一洞察的弹层，不写 session log |
| S6 费用 | 若有 DeepSeek V4 上报用量，统计板显示刊例价估算 |

---

## 3. 目标与非目标

### 3.1 产品目标

在会话里提供只读的上下文洞察：当前构成、按请求历史、事件、模型可见表面；`/context` 不离开聊天。

### 3.2 成功标准

| ID | 标准 | 度量 |
| :-- | :-- | :-- |
| G1 | 对话 view ring 出现「上下文 / Context」（order 20） | 走查 |
| G2 | Host 注册 `contextTimeline` + `contextHeaders` 双合同投影 | 单测 |
| G3 | 合成 session 能折出构成、事件、节点 | `host-fold.test.ts` |
| G4 | `/context` 不 dispatch Host、不写 Session log、不进入模型可见历史 | 代码 / README |
| G5 | 不请求 npm registry 升级 | `fetchLatestVersion() === null` |
| G6 | 卸载 Host 时两个投影 unregister | `host-contract.test.ts` |

### 3.3 非目标

| ID | 不做 | 说明 |
| :-- | :-- | :-- |
| OOS-1 | 自定义 `/dsh-context` RPC | v0.9 已删除 |
| OOS-2 | 在本插件实现压缩/剪枝 | 只观察 `compaction/*` |
| OOS-3 | 精确计费/账单 | 启发式 + 硬编码刊例价，文案写「仅供参考」 |
| OOS-4 | 指向上游 npm 的升级按钮 | 已关闭 |
| OOS-5 | 修改模型可见上下文 | 只读 |
| OOS-6 | 无 `sessionProjections` 时自己扫 log | 插件 inert |
| OOS-7 | 把 occupancy 再折进 `contextTimeline` | 0.11 起读 `contextPressure` |

**降级（已实现）：**

- 无 `inputTriggers`：Tab 仍在，无 `/context`。
- 无 `contextHeaders`：浏览器系统/工具区只显示 token。
- 无 `contextPressure`：占用用派生锚点。
- 无 `sessions.provide(loadOlderHistory)`：超出窗口的元素预览+提示。

---

## 4. 用户故事

| ID | 故事 |
| :-- | :-- |
| US-1 | 作为用户，我要在 Chat/Trajectory 旁看到「上下文」Tab。 |
| US-2 | 作为用户，我要看到当前窗口里各类 token 估算和剩余窗口。 |
| US-3 | 作为用户，我要按步/轮看历史条，并知道哪次发生了压缩。 |
| US-4 | 作为用户，我要点某步看当时系统提示、工具 schema 和消息列表。 |
| US-5 | 作为用户，我输入 `/context` 打开弹层；关闭后若草稿未改则吃掉该 token。 |
| US-6 | 作为 fork 用户，我不应被引导 `npm i dsh-context@latest`。 |

---

## 5. 功能需求

### 5.1 上下文 Tab

| ID | 需求 | 优先级 | 状态 |
| :-- | :-- | :-- | :-- |
| FR-TAB-1 | `conversation.view` id `context`，order 20，locale `dsh-context`，label `tab` | P0 | 已实现 |
| FR-TAB-2 | 当前构成：system/tools/user/inject/assistant/tool | P0 | 已实现 |
| FR-TAB-3 | 统计：轮次、步数、注入、压缩、剪枝、缓存命中、预估费用 | P0 | 已实现 |
| FR-TAB-4 | 趋势图：步/轮粒度；空态文案 | P0 | 已实现 |
| FR-TAB-5 | 事件列表：inject / compaction / prune / model | P0 | 已实现 |
| FR-TAB-6 | 消息构成：模型可见节点，最新在前；超出窗口提示省略 | P0 | 已实现 |
| FR-TAB-7 | 插件信息卡：名、版本（构建期 define）、本仓 GitHub；**无 npm latest** | P0 | 已实现 |
| FR-TAB-8 | 中英字典；缺 key 回退 zh | P0 | 已实现 |

### 5.2 上下文浏览器

| ID | 需求 | 状态 |
| :-- | :-- | :-- |
| FR-BR-1 | 可选一步或 live（下一次请求） | 已实现 |
| FR-BR-2 | 重建规则：`seq < R.seq && (gone 空 \| gone > R.seq)` | 已实现 |
| FR-BR-3 | `droppedNodes` / `archiveFloor` 时诚实标记 missing / approximate | 已实现 |
| FR-BR-4 | 展示该步 header 纪元的系统提示与工具 schema（有 `contextHeaders` 时） | 已实现 |

### 5.3 `/context`

| ID | 需求 | 状态 |
| :-- | :-- | :-- |
| FR-CMD-1 | 客户端 `inputTriggers` 源，trigger `/`，name `context` | 已实现 |
| FR-CMD-2 | leading 查询前缀匹配；pick/enter 均 `handled` | 已实现 |
| FR-CMD-3 | 打开期间 token 留在输入框；关闭时 span CAS 或 bare-token 消费 | 已实现 |
| FR-CMD-4 | 不向 Host dispatch，不写 session log | 已实现 |
| FR-CMD-5 | 弹层挂 `conversation.input.overlay` | 已实现 |

### 5.4 Host 投影

| ID | 需求 | 状态 |
| :-- | :-- | :-- |
| FR-HOST-1 | 注册 `contextTimeline`：init/apply/view，stateVersion **5** | 已实现 |
| FR-HOST-2 | 注册 `contextHeaders`：仅 `request/header`，最多 50 纪元，stateVersion **1** | 已实现 |
| FR-HOST-3 | 双合同：`schema`+`view`（≤0.1.0-rc.8）与 `stateSchema`+`wire`（≥0.1.1-rc.1） | 已实现 |
| FR-HOST-4 | 无关事件返回同一 state 引用（`Object.is`） | 已实现 |
| FR-HOST-5 | 持久状态纯 JSON，无 `undefined` 值属性 | 已实现 |
| FR-HOST-6 | 配置 bounds：maxRequestSteps 1500、maxKeptTurns 300、maxEvents 400、maxNodes 2000、maxArchiveNodes 400 | 已实现 |
| FR-HOST-7 | 整轮裁剪，不在一轮中间切断；然后才是步数硬顶 | 已实现 |
| FR-HOST-8 | live inject 节点钉在 served 窗口外 | 已实现 |
| FR-HOST-9 | 计量事件武装 `pendingShadowedSeqs`，替换时按 seq 移除（可超出 range end） | 已实现 |
| FR-HOST-10 | DeepSeek V4 用量累进 `cost`（永不按 retention 裁） | 已实现 |

### 5.5 配置

全部可选，zod `.strict()`，未知键加载失败：

| 字段 | 默认 |
| :-- | :-- |
| `maxRequestSteps` | 1500 |
| `maxKeptTurns` | 300 |
| `maxEvents` | 400 |
| `maxNodes` | 2000 |
| `maxArchiveNodes` | 400 |

改 bounds **不** 升 `stateVersion`。改持久形状才升。

---

## 6. 非功能需求

| ID | 需求 | 状态 |
| :-- | :-- | :-- |
| NFR-1 | Host 无自定义 RPC；走投影推送 | 已实现 |
| NFR-2 | Client 不轮询、不自建 cache | 已实现 |
| NFR-3 | 定价启发式与 dsh token-meter 同密度 | 已实现 + 单测 |
| NFR-4 | 空助手消息（仅 usage）定价 0 | 已实现 |
| NFR-5 | Apache-2.0 + NOTICE；fork README 写清不要混装 npm | 已实现 |
| NFR-6 | mixed：Host 投影 + Client UI | 已实现 |
| NFR-7 | 错误边界：投影失败显示文案+重试，不崩 Tab | 已实现（errorBoundary） |

---

## 7. 主流程

### 7.1 数据

1. 会话提交 `session/event`。
2. 框架驱动 `applyTimeline` / headers `apply`。
3. 有变化则 cache + `session/projection` 推到浏览器。
4. Client `useProjection('contextTimeline'|'contextHeaders'|'contextPressure'|'tokenUsage')` 渲染。

### 7.2 `/context`

1. 用户 `/` 或回车 `/context`。
2. `modalStoreOf(sessionId).set(true)`，记录 consume guard。
3. overlay 渲染与 Tab 同源洞察。
4. 关闭：`takePendingConsume`，派发 `slash/input-consume-token`；草稿已改则失败软留。

---

## 8. 验收标准

| ID | 标准 | 对应 |
| :-- | :-- | :-- |
| AC-1 | 插件 `name === "context"`；client inject `slots`, `locale` | `index.test.ts` |
| AC-2 | tsdown client id `dsh-context` + ModuleLoader | `index.test.ts` |
| AC-3 | 不打 npm latest | `index.test.ts` |
| AC-4 | 双投影 dual-contract，dispose 双注销 | `host-contract.test.ts` |
| AC-5 | 合成 log 产生 current / events / nodes | `host-fold.test.ts` |
| AC-6 | 整轮 trim；header 去重 cap 50 | `host-contract.test.ts` |
| AC-7 | Tab 与弹层均只读；`/context` 无 host command | 走查 |
| AC-8 | `pnpm --filter dsh-context test` 绿 | 测试 |

---

## 9. 风险与未决

| ID | 项 | 说明 |
| :-- | :-- | :-- |
| R1 | 启发式 token ≠ 供应商账单 | UI 已标注估算 vs 实际 |
| R2 | 刊例价写死，DeepSeek 调价会偏 | `cost.ts` 注释「revisit」 |
| R3 | 长会话超出 maxNodes/archive 时重建 approximate | 浏览器提示 |
| R4 | 无 projection registry 则 Tab 一直 loading | 能力缺失 |
| R5 | `compaction/*` 不在核心 SessionEvent 联合里 | fold 用结构信封 |
| Q1 | headers cap 50 是否配置化 | 现写死 HEADERS_MAX |
| Q2 | 费用是否支持非 V4 模型 | 当前只 flash/pro 按名字匹配 |

---

## 10. 状态 / 版本 / 日期

| 项 | 值 |
| :-- | :-- |
| 包版本 | 0.1.0（本仓）；上游对照 0.21.1 / bfb99a4 |
| 文档版本 | 0.1.0 |
| 日期 | 2026-08-27 |
| 许可 | Apache-2.0 |
| 投影 stateVersion | timeline 5；headers 1 |
