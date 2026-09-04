# PRD：模型（dsh-providers）

| 项 | 内容 |
| :-- | :-- |
| 产品 | 小桃子 DSH |
| 模块 | `dsh-providers`（设置 → **模型**） |
| 文档状态 | 已交付 · 与现行源码同步（含 FORGE-003 智能选择体验合同） |
| 版本 | 0.2.1 |
| 日期 | 2026-09-04 |
| 作者 | 产研（本仓库规格，从 README / PRODUCT.md / 源码归纳） |
| 依赖文档 | [技术方案](./technical.zh.md)（实现合同，需求编号以本文为准） |

改交互、范围、验收：先改本文再改代码。技术方案不得擅自扩大范围。未在源码或 README 中出现的能力，不得写成已交付。

---

## 1. 背景与问题

### 1.1 背景

DeepSeek Harness 自带官方 Models 页。用户实际要做的是：把已经付费的官方订阅（OAuth / 设备码）和 API Key 接到对话选择器里。官方页按协议堆表单，不是「本机抽屉」。

本插件占用设置 → **模型**。左侧只列出已接上的服务商，右侧登录或填密钥，并勾选对话里要用的模型。没接上的在「添加服务商」。官方 Models 页故意不用。隐藏官方导航格发生在 `dsh-xtz-ui`（`hide-official.ts`），不是本包稳定 API。

包名 `dsh-providers`。界面文案中文为主（locale 同时注册 `zh` / `en`，产品原则仍是对用户讲中文操作句）。授权实现参考 [dsh-plugin-subscriptions](https://github.com/V1ki/dsh-plugin-subscriptions)（MIT）。

### 1.2 要解决的问题

| ID | 问题 | 今天（无本插件） | 目标 |
| :-- | :-- | :-- | :-- |
| P1 | 订阅和密钥分散 | 官方 Models 页 + 各自厂商控制台 | 同一页连接官方会员和 API Key |
| P2 | 对话选择器列出太多模型 | 厂商全部模型都进 picker | 只显示用户勾选过的 |
| P3 | 授权必须在本机浏览器完成 | 回调绑死当前标签 | 可复制链接 / 设备码，在另一台设备完成 |
| P4 | 已登录 ChatGPT / Grok 仍不能出图出片 | 无对应 tool | 登录后对话可调 `image_generate` / `video_generate` |

### 1.3 机会与约束

- **机会：** 用户已经付过 ChatGPT Plus/Pro、Claude Pro/Max、X Premium、通义灵码、Kimi 编程。本页只做「接上 + 勾选」。
- **约束：** 不 vendor `deepseek-harness`。不复制、不依赖官方 Models UI。密钥保存后不得再以明文出现。启动环境带来的密钥只读。智谱 GLM、豆包、MiniMax、讯飞星火、腾讯混元在添加列表里已列出，官方会员授权 **未接线**。

---

## 2. 目标用户

| 画像 | 说明 |
| :-- | :-- |
| 主用户 | 坐在自己机器前、用 DeepSeek Harness 写代码或调试的人。任务是接上已付费的模型，再在对话里勾选。 |
| 次用户 | 帮同事搭 Harness 的人。同一屏、同一任务，不是第二个产品。 |
| 插件作者 | 沙箱 `.dsh-home` :3081，`link-plugin` / `pnpm dev`。不把本仓挂进日常 `~/.dsh`。 |

不假设用户会读 OAuth 规格或自己改 `$DSH_HOME/.credentials.yaml`。

---

## 3. 目标与非目标

### 3.1 产品目标

让用户在 **设置 → 模型** 一页完成：连接官方订阅或 API Key，勾选可用模型。手动模式下列入对话选择器；智能选择开启后对话区不再选手动模型，系统对每个人类提问从已勾选池自动选定。成功标准是：有一个能用的模型已接上，且不必打开宿主官方 Models 页。

### 3.2 本期成功标准（可验收）

| ID | 标准 | 度量 |
| :-- | :-- | :-- |
| G1 | 设置里能打开「模型」，左侧只显示已接上或正在添加的服务商 | 走查 |
| G2 | 通义灵码 / Kimi 编程设备码登录成功后，对话可选其模型 | 真机 |
| G3 | ChatGPT Codex / Claude / Grok OAuth 登录成功后，对话可选其模型 | 真机 |
| G4 | 勾选立刻生效，不必再点保存 | 走查 |
| G5 | 已保存密钥只显示星号；启动环境密钥只读并说明原因 | 走查 + 单测 |
| G6 | 登录 ChatGPT 或 Grok 后 `image_generate` 可出图并内联显示 | 真机 / 单测 |
| G7 | 登录 Grok 后 `video_generate` 可出 1–15 秒 MP4 并内联播放 | 真机 / 单测 |
| G8 | 授权失败对用户只说中文操作句，不展示原始 HTTP 码 | 单测 `explain.ts` |
| G9 | 智能选择默认关闭；开启后只使用已授权且勾选的模型 | 走查 + `router-*.test.ts` |
| G10 | 智能选择开启后对话区看不到模型选择器；池为空时发送被拦截并引导去设置勾选 | 走查 + `smart-ux.test.ts` |

### 3.3 非目标（现行不做）

| ID | 不做 | 原因 / 证据 |
| :-- | :-- | :-- |
| OOS-1 | 智谱 / 豆包 / MiniMax / 讯飞 / 混元的官方会员登录 | `catalog.ts` `login: "soon"`；README 写「官方会员授权接入中」 |
| OOS-2 | 把官方 Models 页当回退或参考实现 | PRODUCT.md 明确禁止 |
| OOS-3 | Claude / 通义灵码 / Kimi 编程订阅出图 | 这些登录没有图片生成 API |
| OOS-4 | ChatGPT / Claude / 通义灵码 / Kimi 编程订阅出视频 | 这些登录没有视频生成 API |
| OOS-5 | 视频走附件系统 | `video-generate.ts` 写明 videos 无 attachment surface |
| OOS-6 | 用户可见英文主文案或原始 HTTP 状态码 | PRODUCT.md；`explain.ts` 映射为中文 |
| OOS-7 | 在本包隐藏官方 Models 导航格 | 耦合在 `dsh-xtz-ui`，不是本包 API |
| OOS-8 | 自定义服务商手填模型名 | 模型从 OpenAI 兼容接口拉取 |
| OOS-9 | 授权模型短分类 / classifier | V1 只用本地规则；默认关闭且无开关 |
| OOS-10 | 在线学习、Bandit、随机探索 | 无可靠质量标签 |
| OOS-11 | 按会话独立 manual/smart | 需 Host selection owner 扩展点 |
| OOS-12 | 自动调整 reasoning effort | 未评测 |
| OOS-13 | 同 Step 跨模型 failover | 当前 RC retry 不重组装 system |

---

## 4. 用户故事

| ID | 故事 | 验收 |
| :-- | :-- | :-- |
| US-1 | 作为用户，我要在设置 → 模型用设备码登录通义灵码，以便对话里用官方模型 | 页上显示本机、授权链接、设备码；完成后左侧出现通义灵码 |
| US-2 | 作为用户，我要在另一台手机完成 ChatGPT / Claude / Grok 授权 | 可复制链接；也可粘贴回调链接或授权码 |
| US-3 | 作为用户，我要粘贴 DeepSeek 等 API Key，且保存后看不到明文 | 星号罩；更换时才出现输入框 |
| US-4 | 作为用户，我要从启动环境带来的密钥不能被本页改掉 | 只读说明；不提供更换/清除 |
| US-5 | 作为用户，我要勾选某厂商若干模型，对话选择器立刻只显示这些 | 全选 = 清除挑选记录（全部广告模型都开） |
| US-6 | 作为用户，我要添加自定义 OpenAI 兼容接口（名称、地址、密钥） | 模型从接口发现，不手填 |
| US-7 | 作为用户，我要在对话里让模型出图 | 已登录 ChatGPT 或 Grok；图保存在插件目录并内联 |
| US-8 | 作为用户，我要在对话里让模型出短视频 | 已登录 Grok；MP4 保存在插件目录并内联 |
| US-9 | 作为用户，我要从添加服务商看到未接线的国内会员，但不被诱导去点一个会失败的登录 | 状态「接入中」，无登录按钮 |
| US-10 | 作为用户，我要可选地让对话按问题在已勾选模型里自动选一个，且不必在对话里再选手动模型 | 设置 → 模型有智能选择开关，默认关；开启后对话区隐藏选择器，下一人类提问由系统选定 |

---

## 5. 范围

### 5.1 在范围内

- mixed 插件：Host 注册 LLM adapter + tools；Client 占用 `settings.section` id = `models`。
- 直播订阅：`qwen`（设备码）、`kimi`（设备码）、`codex` / `claude` / `grok`（OAuth）。
- 内置 API 厂商：走宿主 `credentials` + `llm-pi-ai` 设置命名空间；添加页按 `CATALOG_API_IDS` 展示，隐藏路由不出现。
- 自定义 OpenAI 兼容服务商：id 必须以 `custom-` 开头，写入 `llm-pi-ai` providers。
- 对话模型勾选：订阅走 `$DSH_HOME/plugins/providers/selection.json`；API 厂商走宿主模型配置。
- 智能路由 V1：全局 `routing.json` 的 `manual`/`smart`；smart 时每个人类 Turn 在已勾选模型中质量优先选择，Tool continuation 固定。
- 智能选择体验合同：smart 时隐藏对话模型选择器；空池发送前拦截并引导去设置勾选；开关即时生效。V1 路由算法不变。
- `image_generate`、`video_generate` 及对应 toolview。
- 旧包名 `plugins/passport/` 的 `auth.json` / `selection.json` / `models.json` / `device-id` 首次加载拷到 `plugins/providers/`。

### 5.2 不在范围内

见 §3.3。Desktop 打包路径、两套 home、官方 Models 隐藏，由仓库级约定与 `dsh-xtz-ui` 负责，不在本 PRD 扩写。

---

## 6. 功能需求

优先级：P0 现行必须保持；P1 已实现但属增强；P2 未交付。

### 6.1 设置页与信息架构

| ID | 优先级 | 需求 | 验收要点 |
| :-- | :-- | :-- | :-- |
| FR-SET-1 | P0 | 占用设置 → **模型**（slot id `models`，order 10，priority -1） | 设置里能打开本页 |
| FR-SET-2 | P0 | 页名是「模型」，不是通行证 / 会籍 / 包名 | 导航文案 `nav` |
| FR-SET-3 | P0 | 左侧只放已接上或正在添加的服务商；其余在「添加服务商」 | 空态引导先添加 |
| FR-SET-4 | P0 | 分组标签：订阅、密钥、自定义 | locales `groupSubscriptions` / `groupApi` / `groupCustom` |
| FR-SET-5 | P0 | 添加弹层：常用卡通义灵码、Kimi 编程、Claude、DeepSeek 密钥；其余可搜索 | `FEATURED_SUB_IDS` + `RECOMMENDED_API_IDS` |
| FR-SET-6 | P0 | Claude 一张卡两种接法（会员或 Anthropic Key），对话里只勾一份模型 | `SUB_API_PAIR` claude → anthropic |
| FR-SET-7 | P0 | 用户可见失败映射为中文操作句 | `explainAuthError` / `explainHostError` |

### 6.2 订阅登录

| ID | 优先级 | 需求 | 验收要点 |
| :-- | :-- | :-- | :-- |
| FR-SUB-1 | P0 | 通义灵码、Kimi 编程：RFC 8628 设备码；页上展示本机名、授权链接、设备码 | `DeviceFlowManager` |
| FR-SUB-2 | P0 | ChatGPT Codex、Claude、Grok：授权码 + PKCE；本机临时 loopback 收回调 | `OAuthFlowManager` |
| FR-SUB-3 | P0 | 可复制链接 / 设备码；浏览器没跳回时可粘贴回调链接或授权码 | RPC `manual` |
| FR-SUB-4 | P0 | 同一服务商同时只允许一次登录；可取消 | 进行中再点登录 →「正在登录中…」 |
| FR-SUB-5 | P0 | 登录成功写入 `auth.json`（0600，原子写）；登出删除会话并清空勾选 | `store.ts` / `selection.ts` |
| FR-SUB-6 | P0 | 令牌在发消息前按 preempt 窗口刷新；永久失败则移除会话 | `TokenManager` |
| FR-SUB-7 | P0 | 智谱 / 豆包 / MiniMax / 讯飞 / 混元仅展示「官方会员授权接入中」 | `login: "soon"` |
| FR-SUB-8 | P0 | 插件卸载 / 热重载取消全部进行中登录，关掉 loopback 与轮询 | `apply` disposer |

### 6.3 API Key 与自定义

| ID | 优先级 | 需求 | 验收要点 |
| :-- | :-- | :-- | :-- |
| FR-KEY-1 | P0 | 内置 API 厂商密钥走宿主 credentials；已保存只显示掩码 | 不明文回显 |
| FR-KEY-2 | P0 | 启动环境提供的同名密钥只读，本页不更换不清除 | `writable === false` + 说明 |
| FR-KEY-3 | P0 | 自定义：名称、https 地址、密钥；模型 `discoverModels` 拉取 | 列表空则不能创建 |
| FR-KEY-4 | P0 | 自定义 id 必须 `custom-` 前缀，不得占用保留路由 | `CustomProviderStore` |
| FR-KEY-5 | P0 | 自定义写入 `llm-pi-ai` `providers.<id>`（`api: openai-completions`）；失败则回滚 credentials | 补偿 `unset` |
| FR-KEY-6 | P0 | 非 loopback 的 http 地址提升为 https；禁止 URL 用户名密码和 fragment | `normalizeBaseUrl` |

### 6.4 模型勾选与对话

| ID | 优先级 | 需求 | 验收要点 |
| :-- | :-- | :-- | :-- |
| FR-PICK-1 | P0 | 已登录订阅展示模型清单；勾选立刻生效 | RPC `setModels` |
| FR-PICK-2 | P0 | 未写挑选记录 = 全部广告模型开启；空数组 = 全部关闭；全选 = 清除记录 | `advertisedModels` |
| FR-PICK-3 | P0 | Host 按挑选结果注册 / 替换 LLM adapter 可见模型 | `authChanged` → `handle.replace` |
| FR-PICK-4 | P0 | Codex / Grok 支持发现目录；Claude / 通义灵码为内置表 | 见技术方案 §7 |

### 6.5 智能路由 V1

| ID | 优先级 | 需求 | 验收要点 |
| :-- | :-- | :-- | :-- |
| FR-ROUTE-1 | P1 | 设置 → 模型提供全局智能选择开关；默认 `manual` | locales `routeTitle` / `routeHint`；`routing.json` `{ mode }` |
| FR-ROUTE-2 | P1 | `smart` 只从已授权、已启用、已勾选模型中选；质量优先 | `selected ∈ authorizedCandidates` |
| FR-ROUTE-3 | P1 | 每个人类 Turn 重判；Tool continuation 与同 Step retry 固定 | `router-runtime.test.ts` |
| FR-ROUTE-4 | P1 | 请求前授权失效则拒绝，不临时改投 | `当前模型已不再授权` |
| FR-ROUTE-5 | P1 | 决策元数据只走可选 `onDecision` 观察者，不写入 Session 日志 | `router-privacy.test.ts`；耐久 `router/decision` 事件等上游 ignorable/注册 |
| FR-ROUTE-6 | P1 | 失败健康只影响下一人类 Turn；request-error 必须委托 `next()` | 内存 health；无跨模型 failover |

### 6.5.1 智能选择体验合同（FORGE-003）

本小节只改对话与设置的体验，**不改** V1 路由决策算法、权重或 `profiles.ts` 冷启动分。未交付能力见 §3.3，不得写成已上线。

| ID | 优先级 | 需求 | 验收要点 |
| :-- | :-- | :-- | :-- |
| FR-ROUTE-UX-1 | P1 | `smart` 开启时对话区模型选择器 **隐藏**（不是灰掉仍可点） | 占用宿主 `conversation.input.model`，组件返回 `null` |
| FR-ROUTE-UX-2 | P1 | 设置里切换 `routing` / `setRouting` 后选择器显隐即时生效，不要求重启 | `routing-live` 发布；`installSmartUx` 注入 / 卸下席位 |
| FR-ROUTE-UX-3 | P1 | `smart` 且已勾选已授权候选为空时，发送前拦截并给出中文引导，禁止静默发出或落到未知默认 | 文案含「设置 → 模型」与「勾选」；`RouterEmptyPoolError` 作 Host 兜底 |
| FR-ROUTE-UX-4 | P1 | `manual` 时恢复宿主选择器，零回归 | 卸下 `conversation.input.model` 占用；runtime 仍整段 `next()` |
| FR-ROUTE-UX-5 | P2 | 输入区可弱展示「本轮模型：xxx」，默认可收起，不挡输入 | `conversation.input.dock` 的 `<details>`；无上次决策则不展示 |

本票 **不在范围**：辅助模型 classifier、按会话 manual/smart、同 Step 跨模型 failover、reasoning effort 路由、在线学习、改评分权重。

### 6.6 生成工具

| ID | 优先级 | 需求 | 验收要点 |
| :-- | :-- | :-- | :-- |
| FR-IMG-1 | P0 | 已配置 Codex 或 Grok token 管理器时注册 `image_generate` | ChatGPT `gpt-image-2`；Grok `grok-imagine-image-2.0` |
| FR-IMG-2 | P0 | `provider` 默认 `gpt`；优先后端未登录则用另一个 | 都未登录则明确失败 |
| FR-IMG-3 | P0 | 图片写入 `$DSH_HOME/plugins/providers/images/`；当前路由声明 image 输入时附加 attachment | toolview 内联 |
| FR-VID-1 | P0 | 已配置 Grok token 时注册 `video_generate`（`grok-imagine-video-1.5`，1–15 秒） | 可选 `image_url` 图生视频 |
| FR-VID-2 | P0 | MP4 写入 `$DSH_HOME/plugins/providers/videos/`；无附件面，toolview 经 RPC 读字节播放 | 轮询默认 3s，最长 10 分钟 |

### 6.7 非功能

| ID | 优先级 | 需求 |
| :-- | :-- | :-- |
| NFR-1 | P0 | 订阅令牌只落 `auth.json`，目录 0700，文件 0600，原子 rename |
| NFR-2 | P0 | 设置 RPC 通道 `/providers-auth`，authority `loopback` |
| NFR-3 | P0 | mixed 插件；`@deepseek-ai/*` 不打进 bundle；`prepare` / tsdown 自包含 |
| NFR-4 | P0 | 可调值走 Schemastery `Config`：`providers`、`streamIdleTimeoutMs`、路由权重与 `routeSwitchMargin` |
| NFR-5 | P0 | 不依赖 Cordis 的逻辑单独文件，测试只测那些文件 |
| NFR-6 | P0 | 界面打开授权 URL 拒绝 `javascript:` / `data:` 及其他非 http(s) |
| NFR-7 | P0 | Git path 安装 `github:kedoupi/xiaotaozi-dsh#path:plugins/providers`；不要对仓库根 `dsh plugin add` |
| NFR-8 | P0 | 沙箱开发挂 `.dsh-home` :3081，不挂日常 `~/.dsh` |
| NFR-9 | P1 | `routing.json` 0600，tmp+rename；只存 `mode` |

---

## 7. 用户流程

### 7.1 设备码登录（通义灵码 / Kimi 编程）

1. 设置 → 模型 → 添加服务商 → 选择通义灵码或 Kimi 编程。
2. 点登录。页上显示本机名、授权链接、设备码。
3. 用户可在本机打开链接，或复制到另一台设备输入设备码。
4. Host 轮询 token 端点；成功则写入 `auth.json`，左侧出现该服务商，右侧可勾模型。
5. 可取消。超时或拒绝显示中文失败句。

### 7.2 OAuth 登录（Codex / Claude / Grok）

1. 点登录。Host 在 loopback 起临时回调服务（Codex 尝试 1455–1457 等），打开授权 URL。
2. 浏览器可跳回本机；若没有，用户粘贴回调链接或授权码，点继续。
3. 用授权码 + PKCE verifier 换 token，写入 `auth.json`。
4. 进行中不可并行再登录同一服务商；卸载插件会取消全部尝试。

### 7.3 保存 API Key

1. 添加服务商 → 选内置密钥厂商（如 DeepSeek）。
2. 粘贴密钥并保存。已保存显示不可选中星号。
3. 若密钥来自启动环境：说明只读，无更换/清除。

### 7.4 自定义接口

1. 添加服务商 → 添加自定义。填名称、地址、密钥。
2. Host/Client 从接口发现模型；列表为空则不能创建。
3. 成功后出现在左侧「自定义」分组；可移除（只允许真正的自定义 id）。

### 7.5 勾选模型

1. 打开已接上的服务商。
2. 勾选「对话里显示」。立刻生效。
3. 全选等于不限制；全不选则对话里不出现该厂商模型。

### 7.6 对话出图 / 出片

1. 已登录 ChatGPT 或 Grok 后，模型可调 `image_generate`。
2. 已登录 Grok 后，模型可调 `video_generate`。
3. 对话内联预览；文件落在插件数据目录。

---

## 8. 验收标准

发布 / 回归本版本前：

- [ ] FR-SET-1～7
- [ ] FR-SUB-1～8
- [ ] FR-KEY-1～6
- [ ] FR-PICK-1～4
- [ ] FR-IMG-1～3、FR-VID-1～2
- [ ] FR-ROUTE-1～6
- [ ] FR-ROUTE-UX-1～4（FR-ROUTE-UX-5 为弱展示，已实现则勾）
- [ ] NFR-1～9
- [ ] `pnpm --filter dsh-providers test` 通过
- [ ] 真机：至少一条设备码、一条 OAuth、一条 API Key、一条自定义（若有测试账号）
- [ ] README 与本文对「soon」厂商、出图出片范围陈述一致

---

## 9. 风险与开放问题

| ID | 风险 / 问题 | 用户感受 | 缓解 / 状态 |
| :-- | :-- | :-- | :-- |
| R1 | 厂商 OAuth 客户端策略变更 | 登录失败 | 中文失败句；不把 HTTP 码甩给用户 |
| R2 | loopback 回调 IPv4/IPv6 不一致 | 浏览器跳不回来 | 同时听 127.0.0.1 与 ::1；提供粘贴回调 |
| R3 | 启动环境密钥与本页保存冲突 | 用户以为保存成功 | 只读说明 |
| R4 | 自定义 id 撞保留路由 | 覆盖内置厂商 | 静态保留集 + live/declared 检查 |
| Q1 | 更多国内会员（智谱 / 豆包 / 讯飞 / 混元）下一步做官方登录还是继续只提供 API | 添加页已占位 | **未定**；未接线前不得写成已交付 |
| Q2 | 官方 Models 导航隐藏与 xtz-ui 的耦合 | 卸 xtz-ui 可能露出官方页 | 已知，不作为本包稳定 API |

---

## 10. 状态 / 版本 / 日期

| 项 | 值 |
| :-- | :-- |
| 状态 | 已交付 |
| 包版本 | 0.2.1（`plugins/providers/package.json`） |
| 宿主 pin | DeepSeek Harness `0.1.1-rc.2` |
| 文档版本 | 0.2.1 |
| 日期 | 2026-09-04 |
| 证据 | `README.md` / `README.zh.md` / `PRODUCT.md` / `src/**` / `tests/**` |
