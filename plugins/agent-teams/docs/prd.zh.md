# PRD：Agent Teams（dsh-agent-teams）

| 项 | 内容 |
| :-- | :-- |
| 产品 | 小桃子 DSH |
| 模块 | `dsh-agent-teams`（自然语言 / `/agent-teams` → 队长 + 可续成员） |
| 文档状态 | 已实现建队、任务、调度、信箱、活动面板 |
| 版本 | 0.1.0 |
| 日期 | 2026-08-27 |
| 作者 | 产研（对照当前源码） |
| 上游 | [NanmiCoder/dsh-agent-teams](https://github.com/NanmiCoder/dsh-agent-teams)（MIT）；本仓 fork，包名 `dsh-agent-teams` |
| 依赖文档 | [技术方案](./technical.zh.md) |

改交互、范围、验收：先改本文再改代码。不要和 `@nanmicoder/dsh-agent-teams` 装进同一 profile。

---

## 1. 背景与问题

### 1.1 背景

单会话 Agent 难以并行多角色审查、调研、实现。Claude Code 的 AgentTeams 用队长 + 信箱 + 依赖任务解决这个分工。DeepSeek Harness 有 continuable subagent，但默认会话不会自动变成团队。

本插件把 **当前会话变成队长（显示名默认「张老板」，协议键永远是 `captain`）**，成员是可唤醒的持久子代理，状态落在工作区 `<stateDir>/<teamId>/`。

### 1.2 要解决的问题

| ID | 问题 | 没有本插件 | 目标 |
| :-- | :-- | :-- | :-- |
| P1 | 多角色工作挤在一轮里 | 用户靠提示词硬拆 | 建队、加成员、带依赖任务 |
| P2 | 子任务做完队长看不到 | 子代理最终回复程序读不到 | 信箱 + `status` + 活动面板 |
| P3 | 重分配与迟到结果互相覆盖 | 无 attempt 能力 | `attempt_id`；先撤销再打断 |
| P4 | 用户不知团队在干什么 | 只能看聊天 | 右上角活动浮层 + 会话内卡片 |

### 1.3 机会与约束

- **机会：** `ctx.subagents.startContinuable` + persona + toolFilter。
- **约束：** 队长同时只能带一支队；成员禁止建队/加人/删人/建任务/重分配/删队；状态目录必须在工作区内且禁止符号链接。
- **fork 约束：** 关闭指向上游 npm 的安装路径；README 写明 Git path。

---

## 2. 用户与场景

### 2.1 用户

| 画像 | 怎么用 |
| :-- | :-- |
| 对话用户 | 「用 AgentTeams 做 X」或 `/agent-teams <目标>` |
| 队长模型 | 按 system prompt 协议调 `agent_teams_*` |
| 成员模型 | 认领任务、更新、给队长/队友发信 |
| 观察者 | 活动面板看成员、任务 DAG、报告 |

不要求用户会写工具名。协议由 usage section 教给模型。

### 2.2 核心场景

| 场景 | 路径 |
| :-- | :-- |
| S1 自然语言 | 用户说「用 AgentTeams 从三方面审查」→ 队长建队 |
| S2 斜杠命令 | `/agent-teams 调研竞品定价` → 可见用户行 + 激活指令 |
| S3 预设花名册 | Config `members` 非空：`create` 时立即 spawn |
| S4 依赖任务 | 先研后写：写任务 deps 研究任务 |
| S5 重分配 | 卡住 → `reassign_task`；队长接管 `assignee=captain` |
| S6 结束 | 向用户汇报后 `delete`（归档到 `archive/`，不是物理 rm 掉记录） |
| S7 回顾 | 活动面板看归档队；点成员打开子会话转录 |

---

## 3. 目标与非目标

### 3.1 产品目标

一句话把会话变成可续上的协作团队：队长分工、成员持久、任务有依赖、调度自动认领、信箱直达、面板可观察。

### 3.2 成功标准

| ID | 标准 | 度量 |
| :-- | :-- | :-- |
| G1 | 队长 `create` 后成为唯一队长；再 `create` 失败 | 走查 / 工具错误文案 |
| G2 | 成员是 continuable；重启后可 followup（未退休） | 实现 + members 路径 |
| G3 | 依赖未全部 `completed` 不能 claim | 状态机 |
| G4 | 空闲成员由调度器派就绪任务并带 `attempt_id` | scheduler |
| G5 | 重分配先 `invalidateTaskAttempt` 再 interrupt，旧 attempt 更新被拒 | tools |
| G6 | 面板轮询 `/plugins/dsh-agent-teams/state` 展示磁盘真源 | Client |
| G7 | 路由 loopback + 同源 | route-trust 单测 |

### 3.3 非目标

| ID | 不做 | 说明 |
| :-- | :-- | :-- |
| OOS-1 | 通用多队长 / 跨工作区一只队 | 一队长一队；state 在各自 workspace |
| OOS-2 | 成员直接改 `team.json` / inbox | persona 只读诊断，变更必须走工具 |
| OOS-3 | 保证 `agent-teams/*` 写入每种 dsh 版本的 session log | 宿主不识别则省略；面板不依赖这些事件 |
| OOS-4 | 与上游 npm 双装 / 升级提示去 NanmiCoder | 禁止 |
| OOS-5 | 设置页编辑花名册 | 走 Config / cordis 行 |
| OOS-6 | 无 subagent provider 时降级成单 agent 假装成功 | spawn 时响亮失败 |

**部分降级（已实现，不是缺陷）：**

- 无 `commands` 服务：不注册斜杠，手势边界仍可装。
- 无 webServer / workspace registry：工具仍可用，无面板路由。
- `slashCommand: false`：只靠自然语言。

---

## 4. 用户故事

| ID | 故事 |
| :-- | :-- |
| US-1 | 作为用户，我说「用 AgentTeams 做 X」，模型应建队而不是自己做完全部活。 |
| US-2 | 作为用户，我输入 `/agent-teams <目标>`，聊天里能看到这条，队长按协议启动。 |
| US-3 | 作为用户，我要在右上角看到成员是否在干活、任务依赖、队长收件箱预览。 |
| US-4 | 作为队长模型，我要加/删成员、建带依赖任务、发信、看 status、结束团队。 |
| US-5 | 作为成员模型，我只能 claim/update 自己的任务并发信；不能建队。 |
| US-6 | 作为用户，点面板成员应打开该成员转录（rc.8 `openSubagent`，旧运行时 fallback `open`）。 |

---

## 5. 功能需求

### 5.1 激活

| ID | 需求 | 优先级 | 状态 |
| :-- | :-- | :-- | :-- |
| FR-ACT-1 | systemPrompt 段 `agent-teams:usage`（默认 order 117）写入协议与工具列表 | P0 | 已实现 |
| FR-ACT-2 | 队长显示名 Config `captainName`，默认 `张老板`；路由 `to=captain` | P0 | 已实现 |
| FR-ACT-3 | 可选预设 `members[]`；非空则 create 时加入，usage 文案禁止擅自发明英文名 | P1 | 已实现 |
| FR-ACT-4 | `/agent-teams`：空目标返回 usage 错误；有目标则 `followup` 用户行并 success | P0 | 已实现（需 commands） |
| FR-ACT-5 | `agent/pre-step`：仅 `source.kind==='user'` 且行首 `/agent-teams` 注入激活消息 | P0 | 已实现 |
| FR-ACT-6 | `slashCommand===false` 时不注册命令、不装手势 | P1 | 已实现 |

### 5.2 工具（模型合同）

| ID | 工具 | 谁能调 | 状态 |
| :-- | :-- | :-- | :-- |
| FR-TOOL-1 | `agent_teams_create` | 将成队长的会话 | 已实现 |
| FR-TOOL-2 | `agent_teams_add_member` | 队长 | 已实现 |
| FR-TOOL-3 | `agent_teams_remove_member` | 队长 | 已实现 |
| FR-TOOL-4 | `agent_teams_create_task` | 队长 | 已实现 |
| FR-TOOL-5 | `agent_teams_reassign_task` | 队长 | 已实现 |
| FR-TOOL-6 | `agent_teams_claim_task` | 队长或成员 | 已实现 |
| FR-TOOL-7 | `agent_teams_update_task` | 参与者；成员必须当前 `attempt_id` | 已实现 |
| FR-TOOL-8 | `agent_teams_send_message` | 参与者；`from` 只能是自己 | 已实现 |
| FR-TOOL-9 | `agent_teams_status` | 参与者；队长看全部信箱，成员只看自己 | 已实现 |
| FR-TOOL-10 | `agent_teams_delete` | 队长 | 已实现（归档） |

成员 toolFilter **deny**：create / add_member / remove_member / reassign_task / create_task / delete。

### 5.3 任务与调度

| ID | 需求 | 状态 |
| :-- | :-- | :-- |
| FR-TSK-1 | 任务 id `t{seq}`；状态 pending → claimed → in_progress → completed\|failed\|cancelled | 已实现 |
| FR-TSK-2 | 依赖必须存在；未全部 completed 则 claim 失败 | 已实现 |
| FR-TSK-3 | 成员不能同时拥有第二件未完成任务 | 已实现 |
| FR-TSK-4 | 终态不可变；失败/取消重试走 reassign | 已实现 |
| FR-TSK-5 | 队长改成员名下任务前必须 `reassign_task(assignee=captain)` | 已实现 |
| FR-SCH-1 | 成员 idle 边与任务图变化时 kick：先投未读信箱，再派就绪任务 | 已实现 |
| FR-SCH-2 | 投递失败则回滚本次 attempt（若 attemptId 未变） | 已实现 |

### 5.4 成员与 LLM 路由

| ID | 需求 | 状态 |
| :-- | :-- | :-- |
| FR-MEM-1 | spawn continuable，label `agent-teams:{teamId}:{name}` | 已实现 |
| FR-MEM-2 | 默认同队长 provider/model/effort；换路由则用目标默认 effort | 已实现 |
| FR-MEM-3 | 显式 `reasoning_effort` 或 `"default"` | 已实现 |
| FR-MEM-4 | `maxMembers` 默认 8；名字不能为 captain | 已实现 |
| FR-MEM-5 | 删除/删队：退休 id 写入 deny-list，followup 拒绝 | 已实现 |
| FR-MEM-6 | provider 必须支持 continuable + persona + toolFilter，否则失败 | 已实现 |

### 5.5 活动面板与卡片

| ID | 需求 | 状态 |
| :-- | :-- | :-- |
| FR-UI-1 | `shell.overlay` 活动浮层：停靠/拖动/缩放/折叠徽章 | 已实现 |
| FR-UI-2 | GET `/plugins/dsh-agent-teams/state`；`?archived=1` 归档 | 已实现 |
| FR-UI-3 | 1s 轮询；无目标且无发现会话则不扫盘 | 已实现 |
| FR-UI-4 | 会话卡片锚在 `agent_teams_create` 的 tool/call+result | 已实现 |
| FR-UI-5 | 隐藏 `/agent-teams` command view，避免与回放用户行重复 | 已实现 |
| FR-UI-6 | 角色鲸图 allowlist 静态资源；禁止路径穿越 | 已实现 |

### 5.6 配置

| 字段 | 默认 | 含义 |
| :-- | :-- | :-- |
| `stateDir` | `.agent-teams` | 工作区相对目录；绝对路径 / `..` 在挂载时抛错 |
| `memberProvider` | `spawn` | subagent provider |
| `memberModel` | 空 | 可选覆盖 |
| `memberMaxDepth` | 1 | 成员再委派上限；0 禁止 |
| `maxMembers` | 8 | 在册上限 |
| `promptSectionOrder` | 117 | usage 段顺序 |
| `slashCommand` | true | 斜杠 + 手势 |
| `captainName` | 张老板 | 显示名 |
| `members` | [] | 预设花名册 |

---

## 6. 非功能需求

| ID | 需求 | 状态 |
| :-- | :-- | :-- |
| NFR-1 | 状态路径每次 IO 前 lstat，禁止符号链接；inode 钉死防替换 | 已实现 |
| NFR-2 | 进程内 per-team 锁串行 read-modify-write | 已实现 |
| NFR-3 | 活动/资源路由 loopback + 同源；安全响应头 | 已实现 |
| NFR-4 | 资源路由文件名 allowlist | 已实现 |
| NFR-5 | 会话事件 append 失败不得打断工具 | 已实现 |
| NFR-6 | 不 value-import `@deepseek-ai/dsh-tools`；`defineTool` 本地 | 已实现 |
| NFR-7 | mixed：Host 工具 + Client 面板 | 已实现 |

---

## 7. 主流程

1. 激活（自然语言或 `/agent-teams`）。
2. `agent_teams_create` → 目录 + `team.json`；预设成员 spawn。
3. `add_member` / `create_task`（可 deps + assignee）。
4. 调度器对空闲成员：未读信箱优先，否则 claim 就绪任务并 followup 任务说明。
5. 成员 `claim_task` → 工作 → `update_task` + `send_message(to=captain)`。
6. 队长 `status` 汇总；需要时 `reassign_task`。
7. 向用户呈现结果；`delete`：退休成员、interrupt、归档目录。

---

## 8. 验收标准

| ID | 标准 | 对应 |
| :-- | :-- | :-- |
| AC-1 | 空 `captainName` 显示 张老板；usage 含 `to=captain` | FR-ACT-2 |
| AC-2 | 行首以外的 `/agent-teams` 不激活 | FR-ACT-5 |
| AC-3 | 成员 persona 要求 `to=captain` 而非显示名当协议键 | FR-MEM / persona |
| AC-4 | `stateDir` 含 `..` 或绝对路径 → 插件拒绝挂载 | NFR-1 |
| AC-5 | 状态树中的 symlink → 操作失败 | `state-symlink.test.ts` |
| AC-6 | 非 loopback 访问 state 路由 403 | NFR-3 |
| AC-7 | 卡片只在 create 成功（无 tool error）后出现 | FR-UI-4 |
| AC-8 | `pnpm --filter dsh-agent-teams test` 绿 | 测试 |

---

## 9. 风险与未决

| ID | 项 | 说明 |
| :-- | :-- | :-- |
| R1 | 模型不遵守协议（自己干活、不删队） | 只能靠 prompt + 面板观察 |
| R2 | `agent-teams/*` 事件在部分宿主被省略 | 面板以磁盘为准 |
| R3 | 卡片 `captainSessionId` 在 fold 里先空，靠轮询快照补 | 冷启动发现路径 |
| R4 | 删队是归档不是用户以为的粉碎删除 | 文档需说清 |
| R5 | 调度依赖 `agent/status` idle | 宿主不发事件则不自动派活 |
| Q1 | 是否提供设置页编辑花名册 | 未做 |
| Q2 | 是否把团队事件并入官方 session 词汇表 | 上游 |

---

## 10. 状态 / 版本 / 日期

| 项 | 值 |
| :-- | :-- |
| 包版本 | 0.1.0 |
| 文档版本 | 0.1.0 |
| 日期 | 2026-08-27 |
| 许可 | MIT（NOTICE 保留上游版权） |
