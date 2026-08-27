# 技术方案：dsh-providers

| 项 | 内容 |
| :-- | :-- |
| 对应 PRD | [prd.zh.md](./prd.zh.md) **v0.2.1**（产品主合同） |
| 文档状态 | 已交付 · 与现行源码同步 |
| 冲突规则 | 用户可见行为以 PRD 为准；本文只写现行怎么实现。扩大范围先改 PRD |

实现必须覆盖 PRD 的 FR/NFR。禁止在未改 PRD 的情况下把 `soon` 厂商写成可登录，或给 Claude / 通义灵码 / Kimi 接线出图出片。

### 需求追溯

| PRD | 本文 |
| :-- | :-- |
| FR-SET-* 设置页 | §6 Client、§8 RPC |
| FR-SUB-* 订阅登录 | §4 鉴权、§5 Token / Adapter |
| FR-KEY-* API Key / 自定义 | §5.2、`custom-provider.ts`、`host-api.ts` |
| FR-PICK-* 勾选 | §5.3 `selection.ts` |
| FR-IMG-* / FR-VID-* | §7 工具 |
| NFR-1～8 | §3 数据、§8 RPC、§9 安全、§10 测试、§11 部署 |

---

## 1. 包身份

| 位置 | 值 |
| :-- | :-- |
| 目录 | `plugins/providers/` |
| `package.json` `name` | `dsh-providers` |
| `cordis.patch.yml` `name` | `dsh-providers` |
| patch `id` / `export const name` | `providers` |
| Git 安装 | `github:kedoupi/xiaotaozi-dsh#path:plugins/providers` |
| 设置页标题 | 模型 |
| kind | mixed（Host + `src/client`） |
| 运行时依赖 | `@deepseek-ai/dsh-llm@0.1.1-rc.2`、`@deepseek-ai/schemastery` |

四名必须对齐。改名等于目录、包名、patch、磁盘 `$DSH_HOME/plugins/providers/` 一起改。旧目录 `plugins/passport/` 仅作一次性迁移源。

Host `inject`：`["llm", "settings", "credentials"]`。Client `inject`：`["slots", "connection", "locale"]`。`dsh.client.inject` 声明 runtime / locale / ui-slots / ui-settings。

---

## 2. 架构

```
plugins/providers/
  src/index.ts                 # Cordis Host：adapter + RPC + tools + disposer
  src/catalog.ts               # 订阅产品表（live / soon）
  src/paths.ts                 # $DSH_HOME/plugins/providers + passport 迁移
  src/display.ts               # 厂商/模型显示名、隐藏路由、自定义 slug
  src/rpc.ts                   # /providers-auth
  src/custom-provider.ts       # 自定义 openai-completions 写入 llm-pi-ai
  src/device.ts                # 本机显示名
  src/auth/store.ts            # auth.json
  src/auth/selection.ts        # selection.json
  src/auth/oauth-flow.ts       # 授权码 + 临时 loopback
  src/auth/device-flow.ts      # RFC 8628
  src/auth/pkce.ts / jwt.ts
  src/auth/explain.ts          # 失败 → 中文
  src/providers/*.ts           # Codex / Claude / Grok / Qwen / Kimi adapter
  src/tools/image-generate.ts
  src/tools/video-generate.ts
  src/client/index.ts          # settings.section + toolviews
  src/client/ModelsWorkspace.tsx
  src/client/host-api.ts       # 宿主 llm/settings/credentials 封装
  tests/                       # 不 mock 整个 harness
```

原则（仓库约定）：

- 不依赖 Cordis 的逻辑单独文件，测试只 import 那些文件。
- 不要 value-import `@deepseek-ai/dsh-tools`。在 `ctx.tools` 上注册普通对象。
- `@deepseek-ai/*` `deps.neverBundle: true`。
- 可调超时与启用列表走导出的 `Config`。

```
设置页 Client
    │  connection.rpc  /providers-auth   (loopback)
    │  connection.api  llm / settings / credentials
    ▼
Host apply()
    ├─ OAuthFlowManager / DeviceFlowManager
    ├─ auth.json + selection.json
    ├─ ctx.llm.registerAdapter(codex|claude|grok|qwen|kimi)
    ├─ CustomProviderStore → settings.mutate(llm-pi-ai) + credentials
    └─ ctx.tools.register(image_generate, video_generate)
```

---

## 3. 数据 / 配置 / 凭据

### 3.1 插件数据目录

`paths.ts`：`process.env.DSH_HOME ?? ~/.dsh`，再拼 `plugins/providers`。`ensurePluginDir` mkdir 0700（chmod 失败不阻断）。

| 路径 | 内容 | 权限 |
| :-- | :-- | :-- |
| `$DSH_HOME/plugins/providers/auth.json` | 订阅会话（按 provider id 分键） | 0600，tmp+rename |
| `$DSH_HOME/plugins/providers/selection.json` | 订阅模型勾选 | 0600，tmp+rename |
| `$DSH_HOME/plugins/providers/images/` | `image_generate` 文件 | 目录按需创建 |
| `$DSH_HOME/plugins/providers/videos/` | `video_generate` MP4 | 目录按需创建 |
| `$DSH_HOME/plugins/passport/*` | 旧包名残留 | 首次 `migrateLegacyPluginData` 拷 `auth.json` / `selection.json` / `models.json` / `device-id`（目的已存在则跳过） |

`auth.json` 缺文件 = 空店；JSON 坏或条目缺 `accessToken` / `refreshToken` / `expiresAt` **抛错**，不静默丢令牌。`selection.json` 坏文件当空对象。

### 3.2 宿主凭据与设置

- API Key：宿主 `$DSH_HOME/.credentials.yaml`（`ctx.credentials`）。进程环境已提供同名变量则以环境为准，Client 标 `writable: false`。
- 内置 / 自定义 API 厂商配置：设置命名空间 `llm-pi-ai`，路径 `providers.<id>`。
- 自定义密钥引用：`<ID>_API_KEY`（id 大写，非字母数字变 `_`）。

### 3.3 Config

`src/index.ts`：

| 字段 | 默认 | 含义 |
| :-- | :-- | :-- |
| `providers` | `liveProviderIds()` = `qwen,kimi,codex,claude,grok` | 实际启用的直播订阅；`soon` 与未知 id 被丢掉 |
| `streamIdleTimeoutMs` | `300000`（min 1） | 各 adapter 流空闲超时 |

---

## 4. 模块边界：鉴权

### 4.1 产品表 `catalog.ts`

| id | 中文名 | login |
| :-- | :-- | :-- |
| qwen | 通义灵码 | device |
| kimi | Kimi 编程 | device |
| glm / doubao / minimax / spark / hunyuan | 智谱 GLM / 豆包 / MiniMax / 讯飞星火 / 腾讯混元 | soon（无 adapter） |
| codex | ChatGPT Codex | oauth |
| claude | Claude | oauth |
| grok | Grok | oauth |

`requireEnabledProvider` 在 RPC 边界拒绝未启用 id。

### 4.2 OAuth（`oauth-flow.ts`）

- 每 provider 同时一个 attempt；已有则抛「正在登录中，请稍等或先点取消」。
- PKCE + state；临时 HTTP 回调。`localhost` 同时绑 127.0.0.1 与 ::1，避免单栈拒绝。
- 默认超时 180s。`manual(input)` 接受完整回调 URL（校验 state）或裸 code。
- `cancelAll` 关闭全部回调服务（插件 disposer 调用）。

### 4.3 设备码（`device-flow.ts`）

- 通义：`QWEN_DEVICE`（chat.qwen.ai oauth2 device/token，PKCE，scope `openid profile email model.completion`）。
- Kimi：`KIMI_DEVICE`（由 `providers/kimi.ts` 提供 spec）。
- 轮询 `urn:ietf:params:oauth:grant-type:device_code`；取消/换代 attempt 不得提交会话（`isLatest` + `commitLatest` 串行写）。

### 4.4 会话形状（`store.ts`）

`ProviderId = 'codex' | 'claude' | 'grok' | 'qwen' | 'kimi'`。各会话至少含 access/refresh/expiresAt；Codex 另有 `accountId`（chatgpt-account-id 头）。

---

## 5. 模块边界：LLM adapter 与自定义

`index.ts` 按 `enabledProviders(config.providers)` 注册：

| Provider | Adapter | 模型来源 | 用量 |
| :-- | :-- | :-- | :-- |
| codex | `CodexAdapter` | 种子 `gpt-5.1-codex` + discovery | `fetchCodexUsage` |
| claude | `ClaudeAdapter` | 固定 Opus/Sonnet/Haiku 4.5 | `fetchClaudeUsage` |
| grok | `GrokAdapter` | 种子 `grok-4` + discovery | `fetchGrokUsage` |
| qwen | `QwenAdapter` | `QWEN_MODELS` | 无 |
| kimi | `KimiAdapter` | `loadKimiModels` | 无 |

`TokenManager`（`providers/common.ts`）：load/save/remove/refresh/preemptMs；永久刷新错误则删会话并 `onRemoved`。登录状态变化 `handle.replace([provider])`。

可选 `attachments`：`ctx.get("attachments", false)`，给出图附件。卸载 disposer：`flows.cancelAll`、`devices.cancelAll`、token abort、adapter handle。

### 5.2 自定义 `CustomProviderStore`

`create`：校验 id `/^custom-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/`，长度上限见源码常量。保留集 = `RESERVED_API_PROVIDER_IDS` ∪ 订阅产品 id ∪ live/declared provider。先 `credentials.set` 再 `settings.mutate`；mutate 失败则 `unset` 补偿。

`remove`：只删除 `declared === true` 的自定义（含历史无 `custom-` 前缀但已声明者）；静态保留与其它 adapter 占用拒绝。

### 5.3 勾选 `selection.ts`

`getPicked`：`undefined` = 全部广告模型开启。`setModels`：空数组写入 `[]`；若勾选数量 ≥ 可用数量则 `clearPicked`。Adapter 用 `advertisedModels` 过滤。

---

## 6. Client

`src/client/index.ts`：

- 注入 CSS（`data-plugin-css=dsh-providers`）。
- `locale.register("settings.providers", { zh, en })`。
- `settings.section` id `models`，组件 `ModelsWorkspace`。
- `tool.call.toolview` key `image_generate` / `video_generate`；经 RPC `image` / `video` 拉 base64。

`host-api.ts` 封装宿主 `llm.providers` / `llm.models` / `llm.discoverModels`、`settings.describe|mutate`、`credentials.describe|set|unset`。折叠隐藏路由与家族别名（`collapseApiVendors`）。

打开授权 URL：`open-url.ts` 只允许 http(s)；拒绝 javascript/data；授权 URL 还要求 `response_type=code` 与 `client_id`。

---

## 7. 工具合同

注册时机：`ctx.inject(["tools"], …)`。仅当对应 TokenManager 已创建。

### 7.1 `image_generate`

| 项 | 值 |
| :-- | :-- |
| 参数 | `prompt`（必填）；`size` 1024x1024 / 1024x1536 / 1536x1024 / auto；`quality` low/medium/high/auto；`provider` gpt/grok |
| ChatGPT | POST `https://chatgpt.com/backend-api/codex/images/generations`，模型 `gpt-image-2`，Bearer + `chatgpt-account-id` |
| Grok | POST `https://api.x.ai/v1/images/generations`，模型 `grok-imagine-image-2.0`，`response_format: b64_json` |
| 路由 | 默认 gpt；gpt 未登录且 grok 已登录则 grok（`preferGrok ? grokReady : grokReady && !codexReady`） |
| 输出 | `{ paths, images?, revisedPrompt? }`；image 模态路由才写 attachments |

### 7.2 `video_generate`

| 项 | 值 |
| :-- | :-- |
| 参数 | `prompt`；`duration` 1–15 整数；`aspect_ratio` 枚举；`resolution` 480p/720p/1080p；`image_url` |
| API | POST `https://api.x.ai/v1/videos/generations` 模型 `grok-imagine-video-1.5`；轮询 `/v1/videos/{request_id}` |
| 默认 | poll 3s，最长 10 分钟；下载 MP4 到 `videos/` |
| 输出 | `{ path, url, duration? }`；`url` 为厂商临时地址 |

---

## 8. RPC 合同

通道 `PROVIDERS_CHANNEL = "/providers-auth"`，`authority: "loopback"`。结果 `{ ok: true, value } | { ok: false, error: { code, message, details } }`。异常走 `explainHostError`。

| endpoint | payload | 行为 |
| :-- | :-- | :-- |
| `status` | — | 全部 enabled provider 的 `ProviderStatus` |
| `login` | `{ provider }` | 启动 OAuth 或设备码，返回 `authorizeUrl` + 可选 `userCode` |
| `manual` | `{ provider, input }` | 粘贴回调 |
| `cancel` / `logout` | `{ provider }` | 取消 / 删会话+勾选 |
| `usage` | `{ provider }` | 不支持则 `{ supported: false }` |
| `catalog` | — | 已登录订阅的模型 + selected |
| `setModels` | `{ provider, ids }` | 见 §5.3 |
| `image` | ImageAttachmentRef | 读附件 → base64 |
| `video` | 文件名 | 读 `videos/` → `video/mp4` base64；找不到中文错 |
| `custom-create` / `custom-remove` | 自定义输入 / `{ id }` | `CustomProviderStore` |

`ProviderStatus`：`loggedIn`、`busy`、可选 `expiresAt`、`account`、`detail`、`deviceName`、`deviceDetail`、`authorizeUrl`、`userCode`。

---

## 9. 生命周期 / 错误 / 安全

- **挂载：** 读 Config → 建 flow/device/token/adapter → 注册 RPC → 条件注册 tools。
- **卸载：** 取消登录、abort token、释放 adapter。
- **错误：** 用户面只中文。`explain.ts` 把 timeout / 401 / 5xx / invalid_grant 等映射为固定句；已是中文且无拉丁字母则原样。
- **安全：** 令牌文件 0600；密钥不明文回显；自定义 URL 无 userinfo；RPC loopback；打开 URL 白名单；视频文件名经 `readVideoName` 校验。

---

## 10. 测试与可观测性

测试只打无 Cordis 文件。`pnpm --filter dsh-providers test`（vitest）。

| 文件 | 覆盖 |
| :-- | :-- |
| `catalog.test.ts` | live / soon / enabledProviders |
| `store.test.ts` | auth.json 读写、坏 JSON、形状校验 |
| `selection.test.ts` | advertisedModels |
| `explain.test.ts` | 中文映射、不泄露 HTTP 码 |
| `flow-cancel.test.ts` | OAuth/设备码占位、取消、cancelAll |
| `custom-provider.test.ts` | id 规则、保留冲突、补偿 unset |
| `display.test.ts` | 显示名、collapse、隐藏路由 |
| `host-catalog.test.ts` | 宿主模型合并与挑选 |
| `image-generate.test.ts` / `video-generate.test.ts` | 请求体、解析、execute、render |
| `image-ref.test.ts` / `video-ref.test.ts` | RPC 入参校验 |
| `open-url.test.ts` | 拒绝 javascript/data、授权 URL 完整性 |
| `qwen.test.ts` / `kimi.test.ts` / `openai-chat.test.ts` / `device.test.ts` | adapter / 设备名 |

日志：`ctx.logger.warn(`dsh-providers: …`)`。无独立 metrics。用量 RPC 把厂商额度给设置页，不落盘。

---

## 11. 部署与兼容

- Profile 加载 `lib/`，改源码须 `pnpm --filter dsh-providers build`（`prepare` = tsdown --clean）。
- 沙箱：`node scripts/link-plugin.mjs --profile web providers` + `pnpm dev` → `.dsh-home` :3081。
- Desktop 用户走打包 overlay，不 `link:` 进 `~/.dsh`。
- 兼容：首次启动迁移 `passport/`；自定义历史无前缀但 `declared: true` 仍可删。
- 宿主 rc 必须与 `@deepseek-ai/dsh-llm` pin 一致（现行 0.1.1-rc.2）。

---

## 12. FR / NFR → 实现与测试

| ID | 实现 | 测试 |
| :-- | :-- | :-- |
| FR-SET-1～2 | `client/index.ts` slot `models`；locales `nav` | 走查；locale 键存在 |
| FR-SET-3～6 | `ModelsWorkspace.tsx`、`display.ts` FEATURED / PAIR | `display.test.ts` |
| FR-SET-7 | `auth/explain.ts` | `explain.test.ts` |
| FR-SUB-1 | `device-flow.ts` + qwen/kimi | `flow-cancel.test.ts`、`qwen.test.ts`、`kimi.test.ts` |
| FR-SUB-2～4 | `oauth-flow.ts`、RPC login/manual/cancel | `flow-cancel.test.ts` |
| FR-SUB-5 | `store.ts`、`selection.clearPicked` | `store.test.ts`、`selection.test.ts` |
| FR-SUB-6 | `TokenManager` + 各 `isPermanentRefreshError` | kimi 永久错误单测；其余随 adapter |
| FR-SUB-7 | `catalog.ts` login soon | `catalog.test.ts` |
| FR-SUB-8 | `apply` 返回 disposer | `flow-cancel` cancelAll |
| FR-KEY-1～2 | `host-api.ts` credentials.describe writable | `host-catalog.test.ts` |
| FR-KEY-3～6 | `custom-provider.ts` | `custom-provider.test.ts` |
| FR-PICK-1～3 | RPC setModels + advertisedModels + replace | `selection.test.ts` |
| FR-PICK-4 | 各 adapter catalogs | qwen/kimi/host-catalog 测试 |
| FR-IMG-* | `tools/image-generate.ts` + ImageGenerateToolview | `image-generate.test.ts`、`image-ref.test.ts` |
| FR-VID-* | `tools/video-generate.ts` + VideoGenerateToolview | `video-generate.test.ts`、`video-ref.test.ts` |
| NFR-1 | `store.writeStore` mode 0600 + rename | `store.test.ts` |
| NFR-2 | `registerProvidersRpc` authority loopback | 代码审查；无独立单测 harness |
| NFR-3 | package.json / tsdown | `pnpm check` / `check:build` / `check:path` |
| NFR-4 | `Config` Schema | 类型 + 默认 liveProviderIds |
| NFR-5 | tests import src 纯文件 | 本表各 test 文件 |
| NFR-6 | `open-url.ts` | `open-url.test.ts` |
| NFR-7～8 | README 安装/开发节；AGENTS.md 两套 home | 文档门禁，非插件单测 |
