# 技术方案：dsh-market

| 项 | 内容 |
| :-- | :-- |
| 对应 PRD | [prd.zh.md](./prd.zh.md) **v0.1.0**（产品主合同） |
| 文档状态 | 对照当前源码 · 官方目录 `MARKET_PLUGINS` · 点安装写入当前 profile · 远程索引 **不拉** |
| 冲突规则 | 用户可见行为以 PRD 为准；本文只写怎么实现。扩大范围先改 PRD |

实现必须覆盖 PRD 已实现的 FR/NFR。禁止把远程索引或桌面 pack 应用写成已交付。

### 需求追溯

| PRD | 本文 |
| :-- | :-- |
| FR-NAV-*、FR-UI-* | §6 Client |
| FR-CAT-* | §4 catalog、§5 路由 |
| FR-SRC-* | §4 sources-store、§5 |
| FR-INT-* | §4 intents、§5 |
| FR-CFG-* | §3 Config、§4 dsh-home |
| NFR-1～3 | §5 http / loopback |
| NFR-4 | §1、§2 |
| 测试 | §8 |

---

## 1. 包身份

| 位置 | 值 |
| :-- | :-- |
| 目录 | `plugins/market/` |
| `package.json` `name` | `dsh-market` |
| `cordis.patch.yml` | `id: market`，`name: dsh-market` |
| `export const name` | Host/Client 均为 `market` |
| Git 安装 | `github:kedoupi/xiaotaozi-dsh#path:plugins/market` |
| 许可 | MIT |
| kind | **mixed**（Host 路由 + Web UI） |

自研插件。第三方能力写在 `MARKET_PLUGINS`，不要 vendor 上游源码。不要和任何第三方 market npm 混装（当前也没有）。

Client inject：`@deepseek-ai/dsh-client-runtime`、`dsh-client-locale`、`dsh-client-ui-slots`。Host 运行时依赖仅 `@deepseek-ai/schemastery`；cordis / client 包为 devDependencies（`import type` 或测试）。

---

## 2. 架构

```
plugins/market/
  src/index.ts              # Host apply：inject webServer，注册路由
  src/schema.ts             # Schemastery Config（禁止被 client import）
  src/config.ts             # 默认值与 resolveMarketConfig
  src/names.ts              # 路由与 locale 常量
  src/catalog.ts            # 源校验、搜索、MARKET_PLUGINS（无 Cordis）
  src/intents.ts            # intents.json 读写
  src/sources-store.ts      # sources.json 读写
  src/state-store.ts        # ENOENT / 损坏 / 原子写错误策略
  src/plugin-mutate.ts      # 校验并复用当前 pinned DSH Host bin
  src/dsh-home.ts           # DSH_HOME / ~/.dsh
  src/http.ts               # JSON、RouteError、安全头
  src/loopback.ts           # 信任判定
  src/routes.ts             # 三个 exact 路由
  src/client/               # overlay / panel / sidebar DOM / api
  tests/                    # vitest，不 mock 整个 harness
```

原则：

- 无 Cordis 的纯函数单独文件，单测只打那些文件。
- 不 value-import `@deepseek-ai/dsh-tools`（本包无 model tools）。
- `@deepseek-ai/*` `neverBundle: true`。
- 可调值走 Config：`indexUrl`、`officialLabel`、`allowThirdPartySources`。

数据面：

```
Client MarketPanel  --fetch-->  Host routes  --fs-->  $DSH_HOME/plugins/market/
                                      |
                                      +-- catalogEntriesFor(source)  （官方 MARKET_PLUGINS；不访问网络）
```

安装动作由 Host 用启动自身的同一份 `@deepseek-ai/dsh@0.1.1-rc.2` bin 调 `dsh plugin --profile web`；不查找 PATH，也不依赖 `apps/cli` 的相对路径。不读远程索引，不做桌面 pack。

---

## 3. 配置与家目录

`MARKET_CONFIG_DEFAULTS`（`src/config.ts`）：

| 字段 | 默认 |
| :-- | :-- |
| `indexUrl` | `https://s.xiaotaozi.cc/dsh/packs/market.json` |
| `officialLabel` | `小桃子市场` |
| `allowThirdPartySources` | `true` |

`pickConfigPatch` 忽略空字符串与非法类型。`indexUrl` **不会被 fetch**。
`allowThirdPartySources` 为兼容保留；当前能力常量关闭远程来源，因此 API/UI 不会开放添加入口。

`dshHome(env)`：`env.DSH_HOME` 非空则用之，否则 `join(homedir(), ".dsh")`。状态路径：

```
<dshHome>/plugins/market/sources.json
<dshHome>/plugins/market/intents.json
```

沙箱 `.dsh-home` 与正式 `~/.dsh` 因此天然隔离。

---

## 4. 状态与数据流

### 4.1 来源

内存中的 `MarketSource`：`{ id, label, indexUrl, builtin }`。
落盘只写 `{ label, indexUrl }[]`；加载时严格校验每一行并用 `sourceIdFor` 恢复 id。只有 ENOENT 返回空列表；非法 JSON/schema 会保留原文件并抛出可操作诊断。

`sourceIdFor`：djb2 无符号 32 位，格式 `src-<hex>`。同一 URL 稳定。

### 4.2 目录

`catalogEntriesFor`：

- `builtin === false`：空数组（第三方源还没有真实索引）；API payload 固定把添加能力报告为关闭。
- 官方：`MARKET_PLUGINS`（Agent Teams / 会话 Context / OpenContext）。`installed` 来自当前 profile `package.json`。

`searchCatalog(entries, query, tag?)`：tag 精确包含；query 对 name/summary/tags 小写包含。空 query 不过滤文本。

### 4.3 意图

`InstallIntent`：`requestId`、`entryId`、`sourceId`、`action`、`requestedAt`、`status: "pending"`。新请求的 `requestId` 由 `randomUUID` 生成；旧记录在读取时得到稳定的 `legacy:<sha256>` 身份，并在下一次保存时固化。
没有 `completed` / `failed` 状态机。mutation 进行前写入 pending，结束后（成功、返回失败或抛错）用 `settleIntent` 按 `requestId` 精确删除本次请求，因此同一毫秒到达的相同请求也不会互相结算，响应与再次加载都不会把已结束操作当作仍在排队。落盘加载严格校验；非法 JSON/schema、空或重复 `requestId` 保留原文件并报错。

`appendIntent`：滤掉相同 `entryId` 后追加，再 `slice(-MAX_INTENTS)`，`MAX_INTENTS = 100`。

### 4.4 凭据

本插件 **无** OAuth、API key、签名私钥。不要把 pack 签名密钥放进本包。

---

## 5. API / 路由合同

均 `kind: "exact"`。入口 `rejectUntrusted`：非 loopback 或跨站 → 403 `{ ok:false, error:"loopback-only" }`。

| 方法 | 路径 | 行为 |
| :-- | :-- | :-- |
| GET/HEAD | `/api/dsh-market/catalog` | 200 `catalogPayload` |
| POST | `/api/dsh-market/sources` | `remove` 可清理历史记录；`add` 返回 501（远程目录未实现） |
| GET/HEAD | `/api/dsh-market/intents` | 200 `{ ok, intents }` |
| POST | `/api/dsh-market/intents` | mutation 前写 pending，结束后删除并返回已结算队列 |

错误：`RouteError` → `{ ok:false, error }`；未知 → 500 `internal`。方法不对 → 405。

`catalogPayload`：

```json
{
  "ok": true,
  "allowThirdPartySources": false,
  "sources": [{ "id": "src-…", "label": "小桃子市场", "indexUrl": "https://…", "builtin": true }],
  "entries": [{ "id": "agent-teams", "name": "Agent Teams", "version": "0.1.11", "summary": "…", "tags": ["协作"], "kind": "plugin", "sourceId": "src-…", "installed": false }]
}
```

`mutateSources`：

- `remove: string`：按 id 过滤；官方源不在 userSources 里，remove 官方 id 是空操作。
- `add`：501 `third-party source catalogs are not supported in this build`。
- 无 add/remove → 400 `add or remove required`。

Client `src/client/api.ts`：`fetch` 同路径；`ok !== true` 抛错。不带自定义 Origin 头（浏览器同源会带）。

---

## 6. 生命周期 / Client / 错误 / 安全

### 6.1 Host

`apply(ctx, config)`：`resolveMarketConfig` → `ctx.inject(["webServer"])` → `ctx.effect(registerMarketRoutes, "dsh-market host routes")`。fiber 卸载时三个 `off*()` 取消注册。

无 webServer 的 headless profile：inject 挂起，插件不提供 UI 路由（符合「市场是 Web 面」）。

### 6.2 Client

`apply`：

1. 注入 `<style data-plugin-css="dsh-market">`（已存在则跳过）。
2. `locale.register("market.panel", { zh, en })`。
3. `overlayOpener` + `mountMarketEntry`。第二次 open 若未关闭则忽略。

侧栏策略（`sidebar-entry.ts`）：官方 sidebar 在 New Session 与工作区列表之间无 slot。与 xtz-ui chrome / dsh-im 一样改 DOM。`dsh-im` 注释约定同一 `data-dsh-sidebar-tools`：市场左、IM 右。

### 6.3 错误

| 情况 | 行为 |
| :-- | :-- |
| catalog/intents 首次 fetch 失败 | `loadError` 后附 Host 返回的诊断 |
| mutation / 移除来源失败 | 保留当前面板并显示错误，可再次操作 |
| mutation 已成功但 intent 结算写盘失败 | 500 明示 `mutationApplied:true` 与状态错误；响应不再报 queued，并警告修复状态前不要重复 mutation |
| 状态文件不存在 | `loadSources` / `loadIntents` 返回 `[]` |
| 状态文件非法 JSON/schema 或读写失败 | 保留原文件；route 返回 `market-state-*` 诊断与修复动作 |

### 6.4 安全

`isTrustedRouteRequest`（`loopback.ts`）：

1. `socket.remoteAddress` 为 127/8、`::1`、或 IPv4-mapped / 十六进制 mapped 的 127。
2. `Host` 解析为 loopback hostname，pathname 必须是 `/`，禁止 userinfo/search/hash。
3. `sec-fetch-site !== cross-site`。
4. 无 Origin：仅 GET/HEAD 放行；有 Origin：必须与 Host origin 相同。

写盘：`mkdirSync(..., 0o700)`，`writeFileSync(tmp, …, 0o600)`，`renameSync`。

第三方 URL 禁止嵌入凭据。**不**服务端 fetch 用户 URL（避免 SSRF）。当前连官方 `indexUrl` 也不 fetch。

---

## 7. 兼容性

| 项 | 说明 |
| :-- | :-- |
| Host pin | mutation 只接受启动当前 Host 的 `@deepseek-ai/dsh@0.1.1-rc.2` bin；PATH 不参与 |
| webServer | 需要 `register({ kind:"exact", path, handler })` |
| 家目录 | 尊重 `DSH_HOME`；正式/沙箱不要混 intent 文件 |
| 上游 sidebar | 依赖「新会话」按钮文案；无 slot API |

---

## 8. 测试与可观测性

| 文件 | 覆盖 |
| :-- | :-- |
| `tests/index.test.ts` | `name === "market"` |
| `tests/catalog.test.ts` | URL 校验、sourceId、目录条目、搜索 |
| `tests/intents.test.ts` | 覆盖、settle、严格读取、损坏保留、原子写失败 |
| `tests/sources-store.test.ts` | ENOENT、严格 schema、损坏保留、原子写失败 |
| `tests/plugin-mutate.test.ts` | pinned Host runtime、错误/缺失 PATH、正式与沙箱 home 隔离 |
| `tests/routes.test.ts` | catalog/source 合同、intent success/failure/reload/retry、状态诊断 |
| `tests/loopback.test.ts` | 路由信任 |
| `tests/sidebar-entry.test.ts` | 新会话文案、coalesce、tools row 位置 |

无结构化 metrics。Host 无专用 logger 调用。Client 失败只换文案，不 `console.error`。

命令：`pnpm --filter dsh-market test` / `build`。

---

## 9. FR/NFR → 代码 / 测试

| PRD | 代码 | 测试 |
| :-- | :-- | :-- |
| FR-NAV-1～3 | `src/client/sidebar-entry.ts` | `sidebar-entry.test.ts` |
| FR-UI-1～2 | `MarketOverlay.tsx`、`locales.ts`、`client/index.ts` | 走查 |
| FR-CAT-1～5 | `catalog.ts`、`routes.ts`、`MarketPanel.tsx` | `catalog.test.ts`、`routes.test.ts` |
| FR-SRC-1～6 | `catalog.ts`、`sources-store.ts`、`routes.ts` | `catalog.test.ts`、`routes.test.ts` |
| FR-INT-1～6 | `intents.ts`、`routes.ts`、`api.ts` | `intents.test.ts`、`routes.test.ts` |
| FR-CFG-1～2 | `config.ts`、`schema.ts`、`dsh-home.ts` | 间接 |
| NFR-1～3 | `loopback.ts`、`http.ts` | `loopback.test.ts` |
| OOS-1～3 | `catalogEntriesFor` 对非官方源返回空；`indexUrl` 不 fetch | README / 本文件标明延期 |
