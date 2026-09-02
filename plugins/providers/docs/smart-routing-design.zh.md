# 智能模型路由设计与实施计划

| 项 | 内容 |
| :-- | :-- |
| 模块 | `dsh-providers` |
| 状态 | **已实现 V1**（Phase 0–2） |
| 日期 | 2026-09-02 |
| 目标 | 只在用户已经授权、启用并勾选的模型中，按每个人类 Turn 智能选择模型 |
| 当前基线 | DeepSeek Harness `0.1.1-rc.2` |
| 关联文档 | [现行 PRD](./prd.zh.md) · [现行技术方案](./technical.zh.md) |

> V1 已交付。延期：§7.3–7.4 classifier、§7.6 自动 reasoning effort、§11.2 耐久审计、Phase 3–4 在线学习与 failover。

---

## 1. 结论

推荐在 `dsh-providers` 内实现一个**授权集合之上的轻量混合 Router**：

1. 每个人类 Turn 重新读取已授权候选；
2. 先做授权、用户勾选、模态、上下文和健康状态等确定性门禁；
3. 本地规则能明确判断时直接选择；
4. 只有本地判断不确定且用户允许时，才调用一个同样位于授权集合内的模型做短分类；
5. 用确定性评分从剩余候选中选模型，并对当前模型施加 stay bias；
6. 一个 Turn 内的 Tool 后续 Step 固定同一模型；
7. 同 Provider 的普通重试继续交给 `@deepseek-ai/dsh-llm-retry`；当前 RC **不做同 Step 跨模型回退**。

不采用 LiteLLM、OpenRouter、Not Diamond、Portkey 或 vLLM Semantic Router 作为数据面。它们不能复用本仓库现有的 Codex、Claude、Grok、通义灵码、Kimi 编程订阅授权，还会改变凭据、隐私、账单和故障边界。

第一版不做在线学习、Embedding Router、Python Proxy、向量库或自训练模型。

---

## 2. 不变量

以下约束优先于评分、成本和可用性：

```text
selected ∈ authorizedCandidates
classifier ∈ authorizedCandidates
fallback ∈ authorizedCandidates
```

其中 `authorizedCandidates` 必须同时满足：

```text
已注册 Adapter
∩ Provider 已启用
∩ 订阅会话或 API credential 当前存在
∩ 用户当前勾选
∩ 当前输入的硬能力约束
∩ 未被用户显式禁用
```

补充不变量：

- `selection used by {{provider}}/{{model}} == selection used by agent/request`。
- 人类 Turn 可重新路由；仅含 tool/plugin continuation 的 Step 不重新路由。
- Router 不读取、复制或迁移 credential 值。
- 授权元数据、请求 metadata 和分类器输出都不能扩大候选集。
- 请求前若授权快照已失效，必须 fail closed；不得临时改投另一个模型而不重组装 Prompt。
- 不把原始问题正文写入 Router 文件、Session Router 事件、日志或指标。

---

## 3. 方案比较

| 方案 | 优点 | 缺点 | 结论 |
| :-- | :-- | :-- | :-- |
| A. 纯本地规则 | 无额外调用、无额外 Prompt 暴露、延迟最低 | 模糊任务和中文表达容易误判；规则膨胀后难维护 | 作为 fast path 和 classifier 失败回退 |
| B. 本地规则 + 授权模型短分类 | 符合质量优先；只在不确定时增加一次小调用；输出可被严格约束 | 增加延迟和额度；必须防 Prompt injection；需要正确的 Turn barrier | **推荐** |
| C. 学习型 Router / Bandit | 长期可按真实质量、延迟、额度自适应 | 冷启动无可靠 reward；反馈噪声和分布漂移会放大错误；需要评测与回滚体系 | 数据成熟后再评估 |
| D. 外部 Gateway | 现成的条件路由、熔断和统计 | 无法自然复用订阅 OAuth；新增数据面、凭据面和账单面 | 不采用 |

### 3.1 借鉴什么

- **LiteLLM**：`heuristic_first`、关键词强制分层、`classification_mode: user_turn`、确定性 classifier fallback。
- **vLLM Semantic Router**：先做策略/能力门禁，再做有界候选选择；classifier 只能返回声明标签；metadata 不参与授权。
- **RouteLLM**：把路由理解成“强模型胜率是否超过阈值”，并用离线校准验证阈值，而不是凭感觉调权重。
- **Adaptive Router / Bandit**：只借鉴反馈数据的最小化与不保存 Prompt；不移植其未经本产品校准的 reward 和 Thompson Sampling。

### 3.2 不借鉴什么

- 不把“最便宜模型”作为默认目标。本产品默认 `quality`。
- 不使用 RouteLLM 的固定强/弱二元模型假设；用户候选集是动态多模型集合。
- 不让 LLM classifier 决定授权、凭据、模态或上下文门禁。
- 不把系统 Prompt、Tool Result 或 Harness reminder 当作本轮任务文本评分。
- 不在每次请求上随机探索。

---

## 4. 当前 DSH RC 的真实生命周期

`@deepseek-ai/dsh-agent-loop@0.1.1-rc.2` 的关键顺序是：

```text
turn/start
  → inbox.claim(...)
      → agent/inbox/claimed（同步通知）
  → systemPrompt.assemble(...)（可等待 waterfall）
  → agent/pre-step
  → step/start
  → renderPrompt(assembly)
  → agent/request
  → llm.stream
  → tool calls
  → 下一 Step
```

失败重试发生在 `step()` 内部：

```text
同一个 assembly / system
  → buildRequest
  → stream failure
  → agent/request-error
  → { kind: "retry" }
  → buildRequest again
```

### 4.1 为什么不能在 `agent/pre-step` 决策

`systemPrompt.assemble()` 早于 `agent/pre-step`。`installModelSelection()` 在 assemble 时把 `selection.current` 快照到 `selection.assembled`；随后 `agent/request` 只读取 `assembled`。

因此在 `agent/pre-step` 改 `current` 只会影响后续 Step，不能正确路由当前人类 Turn。手改 `assembled` 又会造成已经渲染的 `{{model}}` 与真实请求不一致。

### 4.2 当前 RC 的纯插件 barrier

`inbox.claim()` 在 assemble 前同步发出每个 `agent/inbox/claimed`。Router 可以：

1. 在 `agent/inbox/inserted` 时记录哪些 message id 进入 `next-turn`；恢复 Agent 时从 `agent.inbox.nextTurn` 补种；
2. 在 `agent/inbox/claimed` 中只把 `source.kind === "user"` 且来自 `next-turn` 的消息记为本轮待分类输入；监听器只做同步赋值；
3. 在紧随其后的 `system-prompt/assemble` waterfall 中等待本地/LLM 分类；
4. 再调用 `next()` 完成 Host 原有 assembly；
5. 最外层覆盖 assembly 的 `provider` / `model` 变量并保存同一快照；
6. 在 `agent/request` waterfall 最外层调用 `next()`，然后用该快照覆盖请求配置。

Cordis waterfall 是 outermost-first；`ctx.on(..., { prepend: true, global: true })` 可让 Router 成为最外层。这样 Host API Proxy 现有的 `installModelSelection()` 仍负责手动基础选择，Router 只在 smart mode 下覆盖最终 assembly/request 结果。

概念代码：

```ts
ctx.on("system-prompt/assemble", async (assembly, context, next) => {
  const agent = context.agent;
  if (agent === undefined || !routingEnabled(agent)) return next();

  const state = states.get(agent);
  if (state?.pendingHumanTurn !== undefined) {
    state.current = await route(state.pendingHumanTurn, context.signal);
    state.pendingHumanTurn = undefined;
  }

  const assembled = await next();
  state.assembled = state.current;
  return applyPromptVariables(assembled, state.assembled);
}, { prepend: true, global: true });

ctx.on("agent/request", async (payload, next) => {
  const base = await next();
  const selected = states.get(payload.agent)?.assembled;
  return selected === undefined ? base : applyRequestSelection(base, selected);
}, { prepend: true, global: true });
```

这段代码只是时序合同，不是建议直接粘贴的实现。实现必须先用真实 AgentLoop 集成测试证明：

- claimed human input 在 assembly 前可见；
- Router 的变量与请求路由相等；
- Host 手动选择 listener 在 smart mode 下不会覆盖 Router；
- Tool continuation 不触发新决策。

任一合同在升级后的 DSH 中不成立，立即停止并改走上游扩展点；不得靠 listener 注册偶然顺序继续运行。

### 4.3 为什么暂不做跨模型 failover

当前 `{ kind: "retry" }` 只重建 request，不重组装 system。若在 `agent/request-error` 改模型：

- `{{model}}` 仍是失败模型；
- model-specific system section / tools 仍来自失败模型的 assembly；
- context-window 约束也不会重新计算；
- `dsh-llm-retry` 的同 Provider policy 统计会和 Router failover 混在一起。

第一版只观察失败并降低该模型在**下一人类 Turn**的健康分。透明跨模型回退必须等待 DSH 提供“以新 selection 重新 assemble 并形成新 attempt/step”的正式动作。

建议上游合同：

```ts
type RequestErrorAction =
  | { kind: "retry" }                  // 原模型、原 assembly
  | { kind: "reroute"; selection: ModelSelection }; // 重新 assembly 后再请求
```

在该合同落地前，不宣传“自动故障切换”。

---

## 5. 授权候选清单

### 5.1 统一结构

```ts
interface AuthorizedModel {
  ref: `${string}/${string}`;
  provider: string;
  model: string;
  source: "subscription" | "api";
  displayName: string;
  inputModalities?: readonly ("text" | "image")[];
  contextWindow?: number;
  reasoningEfforts?: readonly string[];
  profile: {
    quality: 1 | 2 | 3 | 4 | 5;
    speed: 1 | 2 | 3 | 4 | 5;
    cost: 1 | 2 | 3 | 4 | 5;
    code?: boolean;
    tools?: boolean;
  };
}

interface AuthorizedModelInventory {
  capturedAt: number;
  generation: string;
  candidates: readonly AuthorizedModel[];
}
```

`generation` 是候选 ref、勾选状态和 credential configured 状态的稳定 hash，不包含 credential、Prompt 或账号标识。

### 5.2 订阅 Provider

订阅候选由插件自己拥有的事实构造：

```text
enabledProviders(config.providers)
∩ getSession(provider) 存在
∩ adapter.availableModels()/listModels()
∩ advertisedModels(..., selection.json)
```

现有语义保持不变：

- `selection.json` 无该 Provider：全部广告模型开启；
- `[]`：全部关闭；
- 非空数组：仅列出的模型开启；
- 未登录 Adapter 返回空模型，Router 不得凭静态表补回。

### 5.3 API Provider

API 候选使用宿主目录，不读取密钥正文：

```text
ctx.llm.listProviders()
∩ ctx.llm.listConfigurableProviders()
∩ 对应 settings profile
∩ ctx.credentials.describe(ref).configured === true
∩ profile.models 的用户勾选
∩ ctx.llm.listModels(provider)
```

复用 `host-api.ts` 已有的 profile path、`apiKeyEnv` ref 和 `pickedIds()` 语义；把纯解析函数抽到 Host/Client 都能 import 的模块，不复制第二套规则。

`LlmAdapter.listModels()` 在 DSH 中是 advisory，不是全局请求白名单。这里将它作为 **Router 可主动选择的目录**，但不改变手动请求行为，也不因某模型未列出就禁止 Host 的其他调用。

### 5.4 能力解析

质量/速度/成本/code 来自 `src/router/profiles.ts` 的版本化冷启动启发式（`PROFILE_VERSION`），不是评测事实。未知模型保持中性。

对候选调用 `ctx.llm.resolveModelInfo(provider, model, signal)` 获取已知的：

- `inputModalities`；
- `context.contextWindow`；
- `reasoning.efforts`；
- adapter default。

未知能力不伪造：

- 图片输入要求明确包含 `image`，未知即不能通过图片硬门禁；
- 已知 context 小于保守估算时排除；未知 context 可保留，但低于已知足够的候选；
- DSH 当前没有通用 tool/structured-output capability 字段，第一版只对已维护 profile 做软偏好，不把未知值当授权事实。

每个人类 Turn 重建一次清单。第一版不加第二层 cache；Adapter 自己已有的目录缓存继续生效。`llm/adapters-updated`、登录/登出、勾选或 credential 变更自然在下一 Turn 被重新读取。

### 5.5 请求前二次门禁

`agent/request` 使用 assembly 快照前，重新验证：

- selected ref 仍在最新 authorized inventory；
- Provider route 仍注册；
- credential/session 仍 configured。

失效时抛 Router 自有的稳定错误并 fail closed。因为 system 已组装，此处只允许“继续原模型”或“拒绝请求”，不允许换模型。

---

## 6. 路由输入与输出

### 6.1 输入

Router 只分析本轮 `next-turn` 中 `source.kind === "user"` 的 message：

- 文本 block；
- 是否带图片；
- 文本长度和结构特征；
- 当前模型 ref；
- 当前会话历史的保守字符/token 估算；
- authorized inventory；
- 内存健康状态；
- 用户策略。

不把 system Prompt、Tool Result、plugin snapshot、历史 assistant 正文或 Harness reminder 拼进 classifier 输入。

### 6.2 输出

```ts
type RouteReason =
  | "only-candidate"
  | "capability-image"
  | "capability-context"
  | "forced-quality"
  | "local-clear"
  | "classifier"
  | "stay-bias"
  | "classifier-fallback"
  | "current-unavailable";

interface RouteDecision {
  selected: AuthorizedModel;
  objective: "quality" | "balanced" | "economy";
  taskClass: "simple" | "standard" | "complex" | "code";
  confidence: "high" | "medium" | "low";
  reason: RouteReason;
  classifierUsed: boolean;
  candidates: readonly string[];
  inventoryGeneration: string;
  latencyMs: number;
}
```

`reason` 是有限枚举，不保存自然语言 chain-of-thought。

---

## 7. 决策算法

### 7.1 阶段一：硬门禁

按顺序执行：

1. authorization / enabled / checked；
2. 用户输入模态；
3. 已知上下文容量；
4. 请求前健康硬失败（credential/auth/quota）；
5. Router 虚拟项、隐藏 route 和 classifier 自身辅助 route 永不进入候选。

门禁结果为空时 fail closed，并给出“没有满足当前任务且已授权的模型”；不得退回未勾选模型。

### 7.2 阶段二：本地特征

只维护少量、可解释的信号：

- `simple`：翻译、改写、格式整理、短问答、单一明确操作；
- `code`：代码块、diff、堆栈、文件路径、测试/调试/重构语义；
- `complex`：多约束、多文件/架构、安全、长推理、研究比较、不可逆决策；
- `standard`：其余；
- 图片和超长上下文已在硬门禁处理，不靠关键词猜能力。

显式高风险词只可升级质量层，不能绕过授权门禁。

### 7.3 阶段三：是否调用 classifier

**延期（Phase 3）。** V1 只用本地规则。

满足任一条件才调用：

- 本地分类置信度低；
- 前两名分差小于 `classifierUncertaintyMargin`；
- 信号冲突，例如“很短但要求跨模块安全审计”。

明显 simple、明确 image、只有一个候选、classifier 关闭或没有合格 helper 时不调用。

### 7.4 Classifier 合同

**延期（Phase 3）。**

Classifier 只返回任务标签，不直接返回 Provider/model：

```json
{"taskClass":"complex","confidence":"high"}
```

约束：

- helper 必须来自同一 authorized inventory；
- 优先当前 Provider 内的合格 helper，避免把 Prompt 扩散到另一个已授权厂商；
- 没有同 Provider helper 时走本地确定性 fallback，不自动跨厂商分类；
- 只发本轮用户文本，明确标记为不可信待分类材料；
- 无 tools、低输出上限、固定 temperature、短 timeout；
- 严格 JSON 和枚举校验；任何额外 model id、指令或非法字段都丢弃；
- 不带当前 Session 的 replay state；不写 Session 消息；不保存原文；
- timeout、拒绝、额度、非法 JSON 都回到本地选择。

这比“让 classifier 从候选 model id 中直接选”更窄：分类器不能影响授权和排序规则。

### 7.5 阶段四：评分

每个目标使用固定、版本化权重：

```text
score = taskFit
      + qualityWeight × quality
      + speedWeight × speed
      - costWeight × cost
      + stayBonus
      - healthPenalty
```

建议初始目标：

| 目标 | quality | speed | cost | 说明 |
| :-- | --: | --: | --: | :-- |
| `quality` | 0.70 | 0.15 | 0.05 | 默认；其余留给 task fit / stay |
| `balanced` | 0.45 | 0.25 | 0.20 | 后续可选 |
| `economy` | 0.25 | 0.25 | 0.40 | 用户显式选择才启用 |

这些是冷启动假设，不是事实。实现时进入导出的 Schemastery `Config`，并由离线评测校准；不得散落硬编码。

切换规则：当前模型仍满足硬门禁时，challenger 必须超过 `current + switchMargin` 才切换。若当前模型不满足能力/授权/健康硬门禁，则不应用 stay bias。

平分顺序固定：当前模型 → 配置 profile 顺序 → `provider/model` 字典序。相同输入与候选快照必须得到相同结果。

### 7.6 Reasoning effort

**延期：不自动调 reasoning effort。** V1 在所选 provider/model 与 Host 基线相同时保留 Host effort；路由到不同模型时清除继承 effort。

---

## 8. Turn 固定与并发

每个 Agent 使用 `WeakMap<Agent, AgentRoutingState>`：

```ts
interface AgentRoutingState {
  nextTurnMessageIds: Set<string>;
  pendingHumanTurn?: { turn: number; message: UserMessage };
  current?: ModelSelection;
  assembled?: ModelSelection;
  decision?: RouteDecision;
  loggedStep?: `${number}/${number}`;
}
```

规则：

- `next-turn` 人类消息：产生新决策；
- `next-step` steering：本 Turn 不切换；
- tool/plugin context：不切换；
- classifier 未完成时 assembly 等待，受 turn signal 和 timeout 约束；
- 并发手动切换只改变 Host 基础选择；smart mode 当前 Turn 的 assembly 快照不变；
- 下一人类 Turn 重新读取基础选择、候选和策略；
- Agent dispose 后 WeakMap 状态和 classifier AbortController 一并释放。

插件启动时先遍历 `ctx.agents.list()` 附着已存在 Agent，再监听 `agent/created`；恢复 Agent 的 `nextTurn` id 从 `agent.inbox.nextTurn` 补种。

---

## 9. 手动/智能模式与设置

第一版采用**全局 opt-in**，避免伪造 `smart/auto` Adapter，也避免修改 Host 私有 `selectionFor()`：

- `manual`（默认）：Router listener 完整委托 `next()`，现有模型选择行为不变；
- `smart`：Router 在每个人类 Turn 覆盖 Host 的基础 provider/model；模型选择器中的当前选择作为初始 current/stay baseline，而不是授权扩展；
- 设置页明确说明：开启后，对话模型选择器仍显示实际执行模型，但下一人类 Turn 可能重新选择；要固定模型需关闭智能路由。

设置项：

| 设置 | 默认 | 位置 |
| :-- | :-- | :-- |
| 模式 `manual/smart` | `manual` | 设置 → 模型 → 智能选择 |
| 目标 | `quality` | 同上 |
| 允许授权模型辅助分类 | `false` | 同上；开启时展示 Prompt 会发送给 helper 的说明 |
| classifier timeout、switch margin、health cooldown、权重 | 见 Config | 部署 Config；UI 不暴露专家参数 |

模型排除不新增第二套列表：用户现有的模型勾选就是 Router allowlist。这样不会出现“对话已勾选但 Router 又单独排除”的双重真相。

用户偏好可写 `$DSH_HOME/plugins/providers/routing.json`，沿用 0600 + tmp/rename；导出的 `Config` 提供部署默认值和算法上限。文件只包含模式、目标和 classifier 开关，不含 Prompt、decision 或 credential。

若产品后来要求每 Session 独立 smart/manual，应先在 DSH Host 暴露正式的 selection owner / route mode 扩展点；不要通过推断 Host 私有 `picked` 状态实现。

---

## 10. 失败、重试与健康

### 10.1 责任分离

| 层 | 责任 |
| :-- | :-- |
| Adapter | 规范化 `LlmFailure`、声明 retry policy |
| `dsh-llm-retry` | 同 Provider/model、同 Step 的可重试错误和 backoff |
| Router | 下一人类 Turn 的候选健康分；未来正式 reroute action |

Router 的 `agent/request-error` listener 必须调用 `next()`，不抢占 `dsh-llm-retry`。

### 10.2 第一版健康状态

条目带 `expiresAt` 与 inventory `generation`。每个人类 Turn 决策前丢弃过期或 generation 不符的条目；硬/软失败只影响后续人类 Turn。被换走的模型在 cooldown 或 generation 变化后重新入选，不必先成功一次。

只放内存，不新增数据库：

- `RATE_LIMIT` / `SERVER` / `TIMEOUT` / `EMPTY_RESPONSE`：短期 health penalty；
- `AUTH` / `MISSING_CREDENTIAL` / `INVALID_CREDENTIAL` / `QUOTA_EXCEEDED`：下一 Turn 排除，直到 inventory generation 改变或 cooldown 后重新验证；
- `CONTEXT_WINDOW_EXCEEDED`：给当前模型/上下文档位加 penalty，下一 Turn 优先更大已知窗口；
- 成功 `assistant/message` 清除对应短期失败。

错误码只按 provider-neutral code 判断，不解析 message 文本。

### 10.3 当前失败边界

- classifier 失败：本地 fallback，主请求继续；
- inventory 构造局部失败：剔除该 Provider 并记录 reason；
- inventory 全失败：保留当前模型仅当能重新证明已授权，否则 fail closed；
- 主请求失败：按现有 retry；耗尽后结束本 Turn；
- 不在已有 chunk 后重放请求；
- 不在同 Step 换 Provider/model。

---

## 11. 隐私、安全与审计

### 11.1 Prompt 数据

| 数据 | 内存 | Session event | Router 文件 | 日志/指标 |
| :-- | :--: | :--: | :--: | :--: |
| 原始用户文本 | 本 Turn | 否 | 否 | 否 |
| classifier 输入 | 调用期间 | 否 | 否 | 否 |
| 候选 model ref | 是 | 否 | 否 | 可计数 |
| 选择结果 / reason | 是 | 否 | 否 | 是 |
| credential / token | 否 | 否 | 否 | 否 |

V1 不把候选 / reason 写入 Session event；见 §11.2。生产只走 opt-in `pluginTrace`。耐久审计等上游 ignorable/注册。

Classifier 开启后，原始本轮文本会发送给 helper 所属的已授权 Provider；UI 必须明确说明。默认关闭，先通过 shadow/offline 评测证明本地规则不足再由用户开启。

### 11.2 Durable Router event

**rc.2 延期：** `Session.append` 不能设置 `ignorable`，`KNOWN_SESSION_EVENT_TYPES` 不含 `router/decision`，未知 required 事件会破坏 restore。V1 不写 Session 事件，只用可选 `onDecision` 观察者（生产走 opt-in `pluginTrace`）。上游支持 ignorable 或插件事件注册后再落耐久审计。

原提案形状：

```ts
"router/decision": {
  turn: number;
  step: number;
  selected: { provider: string; model: string };
  objective: "quality" | "balanced" | "economy";
  taskClass: "simple" | "standard" | "complex" | "code";
  confidence: "high" | "medium" | "low";
  reason: RouteReason;
  classifierUsed: boolean;
  candidates: string[];
  inventoryGeneration: string;
  latencyMs: number;
}
```

该事件不进入 model surface。候选快照让后续审计能证明 `selected ∈ candidates`；不记录 Prompt 和 classifier rationale。

### 11.3 Prompt injection

- 用户文本在 classifier system prompt 中被标记为 quoted/untrusted material；
- classifier 只能输出 task class；
- JSON schema 之外全部拒绝；
- classifier 输出不能改变 candidates、policy 或健康门禁；
- 最终选择后再次检查 allowlist；
- 任何请求 metadata 都只能降低候选，不能添加候选。

---

## 12. 模块边界

建议最小文件布局：

```text
plugins/providers/src/router/
  inventory.ts     # 授权候选与 capability 解析
  decision.ts      # 纯本地特征、门禁、评分、stay bias
  classifier.ts    # 有界 one-shot 分类与严格解析
  runtime.ts       # Agent hooks、Turn pin、request guard、health、event
  preferences.ts   # routing.json 原子读写与 RPC shape
```

共享纯函数：

```text
plugins/providers/src/provider-profile.ts
  getPath / keyRef / pickedIds
```

Client 与 Host 共同 import；`host-api.ts` 不再拥有第二套 profile 解析。

`src/index.ts` 只负责组装：

- 现有 Adapter/TokenManager/catalog；
- `AuthorizedModelInventory` 所需 callbacks；
- Router runtime；
- RPC 和 disposer。

不创建通用 policy engine、DI 容器、数据库 abstraction 或 gateway adapter。

依赖变化：

- Host `inject` 增加 `agents`；
- `@deepseek-ai/dsh-agent`、`dsh-session`、`dsh-system-prompt` 仅按实际 runtime/type import 放到正确 dependency/devDependency，并全部 pin 到 `versions.json.dshRc`；
- 不新增第三方运行时依赖；
- `@deepseek-ai/*` 继续 `deps.neverBundle: true`。

---

## 13. 测试

### 13.1 纯单元测试

`router-inventory.test.ts`：

- 未登录订阅不出现；
- `undefined` 勾选 = 全开，`[]` = 全关；
- API credential 未 configured 不出现；
- API profile 只保留勾选模型；
- 图片输入排除明确 text-only 与 unknown 模态；
- 已知 context 不足被排除；
- selected 永远属于候选。

`router-decision.test.ts`：

- simple/code/complex 中英文 fixture；
- 质量/均衡/节省目标的确定性排序；
- stay margin 防抖；
- 当前模型不满足硬门禁时不 stay；
- 平分稳定；
- classifier fallback 稳定；
- 不读取 system/tool/plugin 文本。

`router-classifier.test.ts`：

- helper 必须已授权；
- 严格接受有限 JSON；
- model id、额外指令、Markdown fence、非法枚举被拒；
- timeout/abort/provider failure 回本地；
- 调用无 tools、无 session replay、输出上限正确；
- 测试 trace 和 store 不含原始 Prompt。

### 13.2 生命周期集成测试

用真实 RC AgentLoop seam，而不是只测 mock callback：

1. `next-turn` human claim 在 Router assembly listener 前可见；
2. classifier 可阻塞 assembly，但受 turn abort 控制；
3. assembly `{{provider}}/{{model}}` 与 `agent/request` 完全一致；
4. Host 基础 `installModelSelection` 与 Router prepend listener 共存，smart mode 下 Router 最终胜出；
5. manual mode 完整委托 Host；
6. Tool Result / plugin context / next-step steering 不重新分类；
7. 下一 human Turn 可切换；
8. 同 Step retry 仍使用原 selection；
9. 授权在 assembly 后撤销时 request guard fail closed；
10. `onDecision` 每 step 一次且不含 Prompt；不写未知 required Session 事件。

第 1、3、4 项是 release blocker。若 DSH 升级破坏其中任一项，Router 必须拒绝启动并提示版本不兼容，不能静默降级成 Prompt/request 不一致。

### 13.3 离线评测

仓库加入不含真实用户数据的合成 fixture：

- 中文/英文各半；
- simple、standard、code、complex；
- 图片、长上下文、多约束、安全/权限；
- Prompt injection 和 quoted instructions；
- 模糊边界样本。

核心指标：

| 指标 | 门槛 |
| :-- | :-- |
| allowlist violation | 0 |
| Prompt/request mismatch | 0 |
| Tool continuation switch | 0 |
| 同输入/同快照非确定性 | 0 |
| classifier 非法输出影响最终选择 | 0 |
| 高风险任务降到最低质量档 | 0 |
| classifier 调用比例 | 先观测，目标 < 30% |

质量评测以“总是使用候选中最强模型”为 baseline；在没有可靠人工/任务完成标签前，不启用在线学习。

### 13.4 仓库门禁

```bash
pnpm --filter dsh-providers test
pnpm --filter dsh-providers typecheck
pnpm --filter dsh-providers build
pnpm check
pnpm check:build
pnpm check:path
pnpm check:cli
git diff --check
```

Sandbox 验证只用本 checkout 的 `.dsh-home` 和 3081，且必须先确认端口归属。不得触碰官方 `~/.dsh` / 3080。

---

## 14. 发布策略

### Phase 0：生命周期 Spike

只写集成测试，证明 §4.2 的 claimed → assembly barrier、prepend precedence 和 Prompt/request 一致性。失败则停止，向 DSH 上游提正式 pre-assembly routing hook。

### Phase 1：Shadow

- 构造 inventory 和本地 decision；
- 记录 `wouldSelect` 到 debug trace，不覆盖请求；
- classifier 关闭；
- 用合成 fixture 和自用 sandbox 校准；
- 不展示为用户功能。

### Phase 2：Smart opt-in

- 设置页提供全局 manual/smart；
- 默认 manual；
- smart 默认 quality；
- classifier 默认关闭；
- 无跨模型 failover；
- durable decision metadata 开启。

### Phase 3：辅助分类

- 用户显式开启；
- 只在本地不确定时调用；
- 先限制同 Provider helper；
- 评估额外延迟、额度和分类收益。

### Phase 4：学习与 failover（条件式）

只有同时满足以下条件才进入：

- 有稳定任务完成/人工偏好标签；
- 有离线 replay 和 canary；
- DSH 提供正式 reroute + reassembly attempt；
- 能按策略版本回滚；
- 证明收益超过规则误差和额外成本。

回滚开关是 `mode: manual`。Router 任何异常不得影响手动路径。

---

## 15. 可执行任务

### Task 1：锁定现行 RC 生命周期合同

#### Files

- Create: `plugins/providers/tests/router-runtime-contract.test.ts`
- Modify: `plugins/providers/package.json`

#### 步骤

- [ ] 加入测试所需的 pinned DSH dev dependencies，不新增第三方库。
- [ ] 用真实 AgentLoop 建立 Host 基础 selection + Router prepend selection。
- [ ] 写 claimed-before-assembly、Prompt/request equal、tool pin、retry pin 四个失败测试。
- [ ] 运行 focused test，确认测试先因 Router 不存在而红，而不是 harness fixture 错。
- [ ] 若无法证明 prepend ownership，停止实现并记录上游需求。

### Task 2：统一 Provider profile 与授权 inventory

#### Files

- Create: `plugins/providers/src/provider-profile.ts`
- Create: `plugins/providers/src/router/inventory.ts`
- Create: `plugins/providers/tests/router-inventory.test.ts`
- Modify: `plugins/providers/src/client/host-api.ts`
- Modify: `plugins/providers/src/index.ts`

#### 步骤

- [ ] 先写 subscription/API credential/selection/capability 失败测试。
- [ ] 从 `host-api.ts` 移出 `getPath`、`keyRef`、`pickedIds`，保持 Client 行为不变。
- [ ] 实现每 Turn fresh inventory，不加新 cache。
- [ ] 加 selected-in-candidates assertion 和 request-time credential guard。
- [ ] 跑 selection、host-catalog 和 inventory tests。

### Task 3：实现纯本地决策

#### Files

- Create: `plugins/providers/src/router/decision.ts`
- Create: `plugins/providers/tests/router-decision.test.ts`
- Modify: `plugins/providers/src/index.ts`

#### 步骤

- [ ] 先写中英文合成 fixture 和 hard-gate/stay/tie tests。
- [ ] 实现最小 feature set 与三目标权重。
- [ ] 未匹配 profile 使用中性值，不猜厂商能力。
- [ ] 权重、margin 进入 Config。
- [ ] 验证相同输入和候选快照完全确定。

### Task 4：接入 Turn barrier 和 smart override

#### Files

- Create: `plugins/providers/src/router/runtime.ts`
- Modify: `plugins/providers/src/index.ts`
- Modify: `plugins/providers/package.json`
- Modify: `plugins/providers/cordis.patch.yml`（仅当 inject 元数据确需声明）
- Modify: `plugins/providers/tests/router-runtime-contract.test.ts`

#### 步骤

- [ ] 跟踪 next-turn ids、claimed human input 和恢复 Agent。
- [ ] 注册成对 prepend/global assembly/request listener。
- [ ] manual mode 完整 `next()`；smart mode 应用一次 assembly snapshot。
- [ ] 清除继承 reasoning effort，保留目标 Adapter default。
- [ ] Tool continuation 和 same-step retry 固定。
- [ ] dispose/abort 清理全部 Agent state。

### Task 5：实现有界 classifier

#### Files

- Create: `plugins/providers/src/router/classifier.ts`
- Create: `plugins/providers/tests/router-classifier.test.ts`
- Modify: `plugins/providers/src/router/runtime.ts`

#### 步骤

- [ ] 先写 strict JSON、injection、timeout、abort、unauthorized helper tests。
- [ ] 用现有 `ctx.llm.stream` 做 one-shot；不加 Gateway/SDK。
- [ ] helper 仅选同 Provider 已授权模型，否则本地 fallback。
- [ ] classifier 只输出 task class/confidence。
- [ ] 证明所有持久化和日志都不含 classifier 输入。

### Task 6：设置、RPC 与本地偏好

#### Files

- Create: `plugins/providers/src/router/preferences.ts`
- Create: `plugins/providers/tests/router-preferences.test.ts`
- Modify: `plugins/providers/src/rpc.ts`
- Modify: `plugins/providers/src/client/ModelsWorkspace.tsx`
- Modify: `plugins/providers/src/client/locales.ts`
- Modify: `plugins/providers/src/client/styles.ts`
- Modify: `plugins/providers/src/index.ts`

#### 步骤

- [ ] 先写 0600 原子存储、坏 JSON fallback 和 RPC validation tests。
- [ ] 添加 manual/smart、objective、classifier 开关。
- [ ] 默认 manual、quality、classifier off。
- [ ] 明示 classifier Prompt 会发给同 Provider helper；不写“本地判断”误导。
- [ ] 复用现有模型勾选，不新增 exclusion UI。

### Task 7：观测、健康与文档合同

#### Files

- Modify: `plugins/providers/src/router/runtime.ts`
- Create: `plugins/providers/tests/router-privacy.test.ts`
- Modify: `plugins/providers/docs/prd.zh.md`
- Modify: `plugins/providers/docs/technical.zh.md`
- Modify: `plugins/providers/docs/README.md`
- Modify: `plugins/providers/README.md`
- Modify: `plugins/providers/README.zh.md`

#### 步骤

- [ ] 增加 `router/decision` Session event 和 no-prompt tests。
- [ ] 观察 `agent/request-error`，但始终委托 `next()`。
- [ ] 实现内存 health penalty 与成功恢复。
- [ ] PRD 增加需求编号、非目标和用户验收；技术方案写成已交付前保持 proposal 标记。
- [ ] README 只在功能实际交付后增加用户说明。

### Task 8：全量验证与 Sandbox

- [ ] 跑 §13.4 全部门禁。
- [ ] 检查 bundle 没有 `@deepseek-ai/*`。
- [ ] 跑 Git path 隔离安装。
- [ ] 在确认 3081 归属后做 manual/smart、两个 human Turns、tool continuation、logout-race 验证。
- [ ] classifier 测试只用可控授权账号；不得把真实 Prompt 加入 fixture。
- [ ] 记录 shadow 与 canary 结果；未达零违规/零撕裂门槛不得启用 smart default。

---

## 16. 非目标

- 不迁移或代理 OAuth/API credential。
- 不接入外部 Router Gateway。
- 不自动授权、自动勾选或偷偷启用模型。
- 不创建第二套模型排除列表。
- 不在同 Tool loop 中换模型。
- 不在同 Step 做跨模型 fallback。
- 不保存原始 Prompt 或 classifier rationale。
- 不在线训练、不随机探索、不做 Bandit。
- 不自动调整 reasoning effort。
- 不修改官方 3080 home，不 vendor DeepSeek Harness。
- 普通实现提交不 bump 产品或插件版本。

---

## 17. 主要风险与止损线

| 风险 | 防线 |
| :-- | :-- |
| Host selection 与 Router listener 顺序漂移 | 真实 RC contract test；不满足即拒绝启动 |
| 路由到未授权模型 | 双重 inventory + request-time fail closed + 事件审计 |
| classifier Prompt injection | 只返回标签、严格 JSON、候选/策略不可由模型修改 |
| Tool protocol 跨模型破坏 | Turn 内固定 |
| Prompt cache 命中下降 | stay margin；只在人类 Turn 评估 |
| 目录/credential 在决策后变化 | request-time revalidation，不临时改投 |
| classifier 增加隐私面 | 默认关闭；同 Provider；UI 明示；不落盘 |
| 冷启动 profile 错误 | shadow、合成 fixture、默认 quality、无在线学习 |
| 同 Step failover 撕裂 | 第一版明确不做；等待正式 reassembly action |

必须立即回滚到 manual 的条件：

- 任意 allowlist violation；
- 任意 Prompt/request mismatch；
- Tool continuation 发生模型切换；
- Router 异常阻断 manual 模式；
- classifier 输入进入本地持久化或日志；
- canary 的任务完成率相对 always-strong baseline 明显下降。

---

## 18. 研究依据

研究时核对的源码版本：

| 项目 | Commit | License | 采用结论 |
| :-- | :-- | :-- | :-- |
| LiteLLM | `e2c3f51c46aa2a11a930b6c19bc28e4144a38a1e` | 根许可证说明 enterprise 外为 MIT | 借鉴 heuristic-first、user-turn pin、fallback；不采用 Proxy |
| RouteLLM | `0b64fdafe049e596a3f5657c219329f24af24198` | Apache-2.0 | 借鉴阈值校准；不采用固定强弱二元模型 |
| vLLM Semantic Router | `b189fee39a16504f3fc57914077ef42c59c6529f` | Apache-2.0 | 借鉴门禁/选择分层和 bounded selector；不采用 Gateway |

主要资料：

- LiteLLM Auto Routing: <https://docs.litellm.ai/docs/proxy/auto_routing>
- RouteLLM paper: <https://arxiv.org/html/2406.18665>
- RouteLLM source: <https://github.com/lm-sys/RouteLLM>
- vLLM Semantic Router: <https://github.com/vllm-project/semantic-router>
- OpenRouter Auto Router: <https://openrouter.ai/docs/guides/routing/routers/auto-router>
- Not Diamond: <https://docs.notdiamond.ai/docs/what-is-model-routing>
- AWS Bedrock Prompt Routing: <https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-routing.html>
- Portkey Conditional Routing: <https://portkey.ai/docs/product/ai-gateway/conditional-routing>

本仓库时序依据：

- `@deepseek-ai/dsh-agent-loop`：`preStep()` / `step()` / `buildRequest()`；
- `@deepseek-ai/dsh-agent`：`installModelSelection()` 与 Agent events；
- `@deepseek-ai/dsh-llm-retry`：`agent/request-error` 同 Step retry；
- `plugins/providers/src/auth/selection.ts`：订阅勾选语义；
- `plugins/providers/src/client/host-api.ts`：API profile、credential 与模型勾选语义。
