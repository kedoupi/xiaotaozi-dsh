# 技术方案：dsh-context

| 项 | 内容 |
| :-- | :-- |
| 对应 PRD | [prd.zh.md](./prd.zh.md) **v0.1.0** |
| 文档状态 | 对照当前源码 |
| 上游 | bowenliang123/dsh-context Apache-2.0；`externals/dsh-context` 只读对照 |
| 冲突规则 | 用户可见行为以 PRD 为准 |

### 需求追溯

| PRD | 本文 |
| :-- | :-- |
| FR-TAB-* / FR-BR-* | §6 Client |
| FR-CMD-* | §6 command / modalStore |
| FR-HOST-* | §4 折叠、§5 投影合同 |
| FR-HOST-6 配置 | §3 |
| NFR-1～2 | §2 数据面 |
| NFR-3～4 | §4 pricing |
| 测试 | §8 |

---

## 1. 包身份

| 位置 | 值 |
| :-- | :-- |
| 目录 | `plugins/context/` |
| 包名 | `dsh-context`（与上游 npm 同名，卸 npm 再装 fork 才能对上） |
| patch | `id: context`，`name: dsh-context` |
| Host `export const name` | `context` |
| Host inject | `sessionProjections`（硬依赖） |
| Client inject | `slots`, `locale` |
| 软依赖 | `inputTriggers`（`/context`）、`sessions.provide`（loadOlderHistory） |
| Git 安装 | `github:kedoupi/xiaotaozi-dsh#path:plugins/context` |
| 许可 | Apache-2.0 + NOTICE |

运行时依赖：`@deepseek-ai/dsh-scope`、`dsh-session`、`zod`。Client 包为 devDependencies。`dsh-session-projection` 在 Host 以 `import type` + 运行时 `ctx.sessionProjections`（由宿主注入）。

fork 改动（相对上游产品行为）：`latestVersion.ts` 永不打 npm；`PLUGIN_REPO` 指向本仓。

---

## 2. 架构

```
src/index.ts                 # re-export host apply / Config
src/host/index.ts            # 注册两个投影 effect
src/host/config.ts           # zod Config + DEFAULT_BOUNDS
src/host/compat.ts           # 双合同类型
src/host/fold.ts             # timeline apply + view
src/host/timeline.ts         # contextTimeline definition
src/host/headers.ts          # contextHeaders definition
src/host/pricing.ts          # 启发式计价
src/shared/types.ts          # SessionProjectionMap 合并（type-only）
src/client/index.ts          # Tab + overlay + locale + styles
src/client/command.ts        # /context
src/client/modalStore.ts     # 每会话开关 + consume guard
src/client/assemble.ts       # 逐步重建
src/client/cost.ts           # 刊例价
src/client/latestVersion.ts  # 恒 null
src/client/components/*      # UI
```

v0.9 之后的数据面（已实现，不是规划）：

```
session/event  →  sessionProjections.apply  →  projection cache
                         ↓ view()
              session/projection push  →  Client useProjection
```

**没有** `/dsh-context` HTTP/RPC。Client **没有** 轮询 Host。

`shared/types.ts` 只被 `import type`，不进 runtime bundle。

---

## 3. 配置

`Config` = zod preprocess `undefined→{}` + strict object。Cordis 用 Standard Schema 在 apply 前校验。

`resolveBounds` → `FoldBounds = Required<Config>`。bounds 只影响 retention/slice，不改变持久形状，故不升 stateVersion。

`HEADERS_MAX = 50` 在 `headers.ts` **写死**，不是 Config 字段（PRD Q1）。

---

## 4. 状态 / 折叠 / 计价

### 4.1 TimelineState（持久）

纯 JSON。可选字段用**缺席**不用 `undefined` 值（stateVersion 4 的原因：否则整 session 的 projection cache 写入失败，连 title 投影都饿死）。

主要字段：`surface`, `sums`, `systemTokens`, `toolsTokens`, `toolList`, `model?`, `provider?`, `lastModel?`, `contextWindow?`, `requests`, `events`, `archived`, `cost?`, `archiveFloor?`, `callNames`, `pendingShadowedSeqs?`。

`cost` 为会话累计，**不被** maxKeptTurns/maxEvents 裁剪。

### 4.2 apply 要点

结构信封 `TimelineEvent`（type/seq/time/data/surfaceOp），因为 `compaction/*` 不在核心 union。

表面分类：`assistant/message` → assistant；`tool/result` → tool；injection（plugin / skill-invocation / 有 form）→ inject；其余 user。

`request/header`：更新 system/tools token 与 toolList。  
模型切换 → events kind `model`。  
计量（summary/prune）武装 `pendingShadowedSeqs`；随后 replace 按 seq 集合移除并 archive 拷贝（stamp `gone`，不改共享旧对象）。消费后 **delete** 该字段。

`trimState`：先整轮 `trimToLastTurns`，再步数 slice，再 events 尾，再 archive（相对最旧 retained request + maxArchiveNodes），记录 `archiveFloor`。

无关事件：返回原 state 引用。

### 4.3 view（ContextTimeline / Snapshot）

`ok: true` 恒真。`current` 为各类 token。`nodes` = 最新 maxNodes 尾 **加上** 更早的 live inject。`droppedNodes` / `surfaceFloor` 描述未送达的 live 节点。`archive` 为带 `gone` 的移除节点。

**不再** 折叠 occupancy；Client 读 `contextPressure`。`Snapshot.occupancy?` 仅旧客户端兼容。

### 4.4 HeadersState

`headers: HeaderRecord[]`。仅 `request/header` 产生纪元；同 seq 去重；超 50 留尾。view 浅拷贝。无 headers 键时 Client 只显示 token。

### 4.5 计价

`CHARS_PER_TOKEN=4`, `BLOCK_OVERHEAD=4`, `ROLE_OVERHEAD=4`。text/reasoning/tool-call/tool-result/default JSON。空助手且 `emptyIsZero` → 0。

Client `cost.ts`：USD/CNY，flash/pro，peak（UTC 01:00–04:00 与 06:00–10:00）/ off（半价）。cacheRead=hit；uncached+cacheWrite=miss；output 含思考。无 V4 用量 → UI 破折号。

### 4.6 凭据

无。只读 session log。不把 prompt 内容写到本插件磁盘（投影 cache 由宿主管）。

---

## 5. 投影 / 类型合同

`SessionProjectionMap` 增加：

- `contextTimeline: ContextTimeline`
- `contextHeaders: ContextHeaders`

另外 Client **读取但不注册**：

- `contextPressure`（dsh-token-meter）
- `tokenUsage`（缓存命中份额，与输入框下统计同一公式）

每个 definition 同时带：

| 合同 | 字段 |
| :-- | :-- |
| ≤0.1.0-rc.8 | `schema`（校验 **wire**）、顶层 `view` |
| ≥0.1.1-rc.1 | `stateSchema`（校验 **持久状态**）、`wire.viewSchema` + `wire.view` |

缺 `wire` 时 0.1.1+ 把单元当 host-only，Tab 会永远 loading。单测锁住双合同。

timeline `stateVersion: 5`（cost 加入）。headers `stateVersion: 1`。

---

## 6. 生命周期 / Client / 错误 / 安全

### 6.1 Host

`apply`：`ctx.effect` 注册 timeline + headers，disposer 两者 off。fiber 卸掉则 key 从 registry 消失，Client 视为能力缺失。

无 `sessionProjections`：Cordis 保持 PENDING，不跑 apply。

### 6.2 Client apply

1. locale NS `dsh-context`（zh/en）。
2. `<style data-plugin="dsh-context">`（boot loader 卸插件时按 data-plugin 撕掉）。
3. 可选 `sessions.provide({ props:['loadOlderHistory'] })`，失败软。
4. `conversation.view` ContextView。
5. `registerContextCommand`；`conversation.input.overlay` ContextModal，hooks `contextModal: modalStoreOf(sessionId)`。

### 6.3 浏览器重建

`assemble(data, headers, seq|null)`：live 用 `data.nodes`；历史合并 live nodes 与 archive。`headerAt` 取 seq 之前最后纪元。

### 6.4 错误

投影未就绪：loading 文案。失败：`error` + retry。`errorBoundary` 包 UI。`/context` 无 inputTriggers 则命令不存在。

### 6.5 安全

只读洞察。`/context` 不把命令送进模型历史（避免「看上下文」本身污染上下文）。系统提示全文在 headers 投影里，仅 loopback Web GUI 同源推送（宿主管道）。本插件不新开 HTTP 路由。

---

## 7. 兼容性

| 项 | 说明 |
| :-- | :-- |
| dsh | 0.1.1-rc.2；定义同时满足 rc.8 与 rc.1+ 投影合同 |
| 上游 npm `dsh-context` | 禁止同 profile |
| occupancy | 旧 Snapshot 字段保留可选；新 Client 不用 |
| 包名 | 保持 `dsh-context` 以便替换 npm |

---

## 8. 测试与可观测性

| 文件 | 覆盖 |
| :-- | :-- |
| `index.test.ts` | name、client inject、无 npm latest、tsdown id |
| `pricing.test.ts` | 启发式、格式化、semver、headerAt |
| `host-fold.test.ts` | 双注册、合成折叠、引用稳定、shadow 超 range、Config cap |
| `host-contract.test.ts` | dispose、dual-contract、事件归属、空助手 0、钉 inject、header cap、整轮 trim、model+cost、无 undefined 属性 |

无可观测后端。费用与 token 仅 UI。

`pnpm --filter dsh-context test` / `build`。

截图（已有，非本文生成）：`docs/context-overview.png`、`context-events.png`、`context-command.png` 等。

---

## 9. FR/NFR → 代码 / 测试

| PRD | 代码 | 测试 |
| :-- | :-- | :-- |
| FR-TAB-1～8 | `client/index.ts` `components/*` `i18n.ts` `meta.ts` | 走查 + index.test |
| FR-BR-* | `assemble.ts` browser 组件 | pricing.test headerAt；fold 单测 archive |
| FR-CMD-* | `command.ts` `modalStore.ts` | 走查（无独立 command 单测） |
| FR-HOST-1～5 | `timeline.ts` `headers.ts` `compat.ts` | host-contract / host-fold |
| FR-HOST-6～7 | `config.ts` `fold.ts` trim | host-contract trim；host-fold caps |
| FR-HOST-8～10 | `fold.ts` | host-fold shadow；host-contract cost/inject |
| FR-TAB-7 / G5 | `latestVersion.ts` | index.test |
| NFR-3～4 | `pricing.ts` | pricing.test；host-contract 空助手 |
| NFR-1 | 无 routes；host/index 只注册投影 | host-fold 注册测试 |
