# 技术方案：dsh-agent-teams

| 项 | 内容 |
| :-- | :-- |
| 对应 PRD | [prd.zh.md](./prd.zh.md) **v0.1.0** |
| 文档状态 | 对照当前源码 |
| 上游 | NanmiCoder/dsh-agent-teams（MIT）；对照 pin 在 `externals/`（只读），可安装的是 `plugins/agent-teams` |
| 冲突规则 | 用户可见行为以 PRD 为准 |

### 需求追溯

| PRD | 本文 |
| :-- | :-- |
| FR-ACT-* | §6 command、§2 usage |
| FR-TOOL-* | §5 工具合同 |
| FR-TSK-* / FR-SCH-* | §4 状态机、§5 scheduler |
| FR-MEM-* | §5 members / persona |
| FR-UI-* | §6 Client、§5 HTTP |
| NFR-1～2 | §4 state.ts |
| NFR-3～4 | §5 route-trust |
| 测试 | §8 |

---

## 1. 包身份

| 位置 | 值 |
| :-- | :-- |
| 目录 | `plugins/agent-teams/` |
| 包名 | `dsh-agent-teams` |
| patch | `id: agent-teams`，`name: dsh-agent-teams`，默认 config `stateDir: .agent-teams`、`memberProvider: spawn`、`captainName: 张老板` |
| `export const name` | `agent-teams` |
| Host inject | `tools`, `llm`, `subagents`, `systemPrompt`, `agents` |
| 可选 inject | `commands`（斜杠）；`webServer`/`httpServer` + `workspaceRegistry`/`workspace`（面板） |
| Client inject | `conversationEvents`, `slots`, `sessions` |
| Git 安装 | `github:kedoupi/xiaotaozi-dsh#path:plugins/agent-teams` |
| 许可 | MIT + NOTICE |

`files` 含 `lib/`、`assets/agent-teams/`、`cordis.patch.yml`、NOTICE、LICENSE。

不要 value-import `@deepseek-ai/dsh-tools`。运行时确实 value-import：`dsh-agent`、`dsh-subagent`、`dsh-session`、`dsh-llm`、`dsh-scope` 等（见 `package.json` dependencies）。

---

## 2. 架构

```
src/index.ts          # apply：校验 stateDir、usage section、tools、command、懒注册 Web
src/tools.ts          # 十个 agent_teams_* 工具
src/tool-define.ts    # 本地 defineTool + JSON Schema required 提升
src/state.ts          # 落盘、锁、任务规则、路径安全
src/types.ts          # TeamState / Task / Member / Message
src/members.ts        # spawn / followup / interrupt / 退休守卫 / LLM 选择
src/persona.ts        # 成员系统提示与欢迎语
src/scheduler.ts      # idle 边自动派活
src/command.ts        # /agent-teams + pre-step 手势
src/names.ts          # 显示名与花名册
src/snapshot.ts       # 面板快照
src/events.ts         # 尝试写入 session 事件（可省略）
src/event-types.ts    # 纯类型，Client 可加载
src/route-trust.ts    # loopback 信任
src/client/           # ActivityPanel、卡片、轮询、DAG、artwork
assets/agent-teams/   # 鲸图 PNG
```

控制面：

```
用户 → 队长会话 ──tools──► 磁盘 <workspace>/<stateDir>/<teamId>/
                │              team.json
                │              inbox/<agentKey>.jsonl
                │              archive/<teamId>/   （delete 之后）
                │              retired-members.json
                ├── subagents.startContinuable / followup
                └── scheduler ← agent/status idle
Client 面板 ──GET──► /plugins/dsh-agent-teams/state  （读磁盘 + 活活动）
```

---

## 3. 模块边界

| 模块 | 可依赖 | 禁止 |
| :-- | :-- | :-- |
| `state.ts` | node:fs、crypto、path、types | Cordis Context |
| `tool-define.ts` | Agent 类型 | dsh-tools 值 |
| `persona.ts` / `names.ts` | types | IO |
| `members.ts` | subagents、state 退休表 | 直接写 team.json（由 tools 持锁写） |
| `scheduler.ts` | state + members.deliverToMember | 自己改协议键 |
| Client | fetch 面板路由；不调工具 | 不写磁盘 |

`event-types.ts` 零 import，避免浏览器程序碰到 Host 的 `Context.sessions` 声明合并冲突。

---

## 4. 状态 / 数据 / 凭据

### 4.1 布局

```
<workspace>/<stateDir>/                 # resolveStateRoot，必须在 workspace 内
  retired-members.json
  <teamId>/
    team.json
    inbox/captain.jsonl
    inbox/<memberName>.jsonl
  archive/<teamId>/                     # delete 后从 live 挪来
```

团队 id = `sanitizeKey(name)`（小写、非字母数字变 `-`）。保留名 `archive` 不能当 team id。`CAPTAIN_KEY = "captain"`。

### 4.2 TeamState（摘要）

- `name`, `id`, `description?`, `captainSessionId`, `captainName?`, `createdAt`
- `members[]`: `id`（子会话）、`name`, `role?`, `provider?`, `model?`, `reasoningEffort?`, `status` idle\|working\|removed
- `tasks[]`: `id`, `subject`, `description?`, `status`, `assignee?`, `dependencies`, `output?`, `attempt?`, `attemptId?`, `handoffId?`, `reassigning?`
- `taskSeq`

任务状态推进由 `transitionError` 约束。`beginTaskAttempt` 递增 attempt 并生成 UUID 能力。`invalidateTaskAttempt` 清 attemptId、可标 reassigning。

### 4.3 信箱

JSONL。字段含 `deliveryClaimedAt` / `deliveredAt` / `readAt`。投递租约 `MAILBOX_DELIVERY_LEASE_MS = 60000`。畸形行跳过并计入 status 警告（最多展示 10 条）。

### 4.4 路径安全

挂载：`stateDirError` 拒绝空、绝对路径、`..`, 反斜杠等。  
每次 IO：从 workspace 走到目标 `lstat`，符号链接失败；钉 `dev/ino/birthtimeMs`，运行中被换目录则失败。禁止把团队状态指到工作区外（delete/archive 的 `rm` 边界）。

### 4.5 锁

`withTeamLock(team:${stateRoot}:${teamId})` 与 `captain:${stateRoot}:${captainId}` promise 链。create 先占队长锁再占团队锁。

### 4.6 凭据

无独立 OAuth。成员 LLM 走队长会话已解析的 provider/model。不要把 API key 写入 team.json。

---

## 5. 工具 / HTTP / 调度合同

### 5.1 工具行为要点

**create**：已参加任何队则失败；team id 被占用失败。预设成员逐个 `resolveMemberLlmSelection` + `spawnMember`。返回 `team_id`, `team_name`, `state_dir`。

**add_member**：锁内校验重名与 cap → spawn → write；write 失败则退休孤儿子代理并 interrupt。成功后 `scheduler.kickMember`。

**remove_member**：未完成任务 `invalidateTaskAttempt` 回 pending 池；成员 `removed`；退休 + interrupt + `waitForMemberIdle`；`kickTeam`。

**create_task**：依赖必须已存在；assignee 若给则必须是在册成员。`kickTeam`。

**reassign_task**：completed 不可；已在 reassigning 不可；目标成员不能另有 open 任务。先 invalidate+handoff，interrupt 旧成员并等待 idle，再清 reassigning；目标是 captain 则 `beginTaskAttempt`。等待失败抛错且不覆盖更新的 handoff。

**claim_task**：成员不能设 assignee；不能领别人的。已 claimed/in_progress 且是自己则幂等返回当前 attempt_id。

**update_task**：队长改成员任务必须先接管。成员 `attempt_id` 不匹配 → stale。终态相同 status/output 幂等返回。

**send_message**：先落盘再 live。到队长：成员发送时 `steerCaptainReport`（`agent.steer`），成功 live 否则 mailbox。到成员：`deliverToMember`，成功 wake。`from` 冒充失败。

**status**：队长会先 `kickTeam`。返回成员活动、任务、信箱预览；读取后 **acknowledge** 可见未读（副作用：轮询 status 会清未读）。

**delete**：全员 removed + 未完成 invalidate；退休；interrupt；尽力 quiesce；`archiveTeamDir`。返回 `deleted: true`（目录在 archive/，面板 `?archived=1` 仍可见）。工具描述仍写 “deletes”，实现是归档 —— 以代码为准。

### 5.2 HTTP

| 路径 | 说明 |
| :-- | :-- |
| `GET /plugins/dsh-agent-teams/state` | `{ teams: TeamActivitySnapshot[] }`；`archived=1` 走归档 |
| `GET /plugins/dsh-agent-teams/assets/<file>` | prefix；文件名 allowlist；image/png；max-age=86400 |

服务键兼容：`webServer` 否则 `httpServer`；`workspaceRegistry` 否则 `workspace`。`internal/service` 上延迟注册，webless 不挡启动。

快照：磁盘 team + `memberActivity` + 未读计数 + 任务 `taskVisualState`（blocked/open/running/completed）+ 依赖深度。归档 `historic: true` 活动视为 idle。

### 5.3 调度

`installTeamScheduler`：`agent/status` 同步成员 working/idle；idle 则 `kickMember`。成员队列串行。mailbox fallback 先于新任务。派活 prompt 要求本回合只做该任务并带 attempt_id。

### 5.4 成员运行时

`MEMBER_DENIED_TOOLS` 见 PRD。`installRetiredMemberGuard` 包装 `subagents.followup`。目录行故意保留以便 rc.8 历史转录。`installMemberSelectionRuntime`：新鲜 spawn 用 pending map；冷恢复从 team.json 校验与 descriptor 一致。

Artwork allowlist（与 `index.ts` 一致）：`team-lead-v2.png`，`member-{researcher,engineer,qa,designer,security,docs,data,operator}-v2.png`，`action-{working,thinking,reporting,celebrating,sleeping,sending}-v2.png`。

---

## 6. 生命周期 / Client / 错误 / 安全

### 6.1 Host apply

1. `displayCaptainName` / `normalizeRoster`（去空、去重、去掉名为 captain 的项）。
2. 非法 `stateDir` throw，插件加载失败。
3. usage section + `registerAgentTeamsTools`（内含 scheduler 与退休守卫）。
4. 若 slashCommand：`inject(['commands'])` 注册命令；始终 `installAgentTeamsGestureBoundary`（在 slash 开启时）。
5. 尝试注册 Web；否则等 service 事件。

### 6.2 Client

- Overlay：`ActivityPanel`，几何 `panel-geometry.ts`，localStorage 布局。
- 轮询 `ACTIVITY_POLL_MS = 1000`，`startActivityPolling`：无 monitor target 且无 discoverySessionId 则 inert。
- 卡片：`agentTeamsCardDefinition` 只折叠 `agent_teams_create`；`accepted` 需无 error 的 tool/result。`buildViewNode` 里 `captainSessionId: ''`、`members: []`，运行时靠快照补（**已知限制**）。
- `HiddenAgentTeamsCommand`：commandview 渲染 null。
- `openAgentTeamMember`：有 `openSubagent`+`refreshSubagents` 走 rc.8 地址，否则 `sessions.open`。

### 6.3 错误

工具 throw 字符串 Error，模型可见。路由 403 JSON。artwork 未知/读失败 404。session.append 失败只 warn。

### 6.4 安全

- 状态逃逸 / symlink：NFR-1。
- 路由信任同 market 口径（`route-trust.ts`）。
- 成员不能冒充 from。
- 资源路径 `decodeURIComponent` 后只允许 basename allowlist。

---

## 7. 兼容性

| 项 | 说明 |
| :-- | :-- |
| dsh | 0.1.1-rc.2 |
| web 服务改名 | webServer / httpServer 双键 |
| 子代理导航 | rc.8 openSubagent；旧 open() |
| 会话事件词汇 | 不识别则跳过写入 |
| 与上游 npm | 禁止同 profile |

---

## 8. 测试与可观测性

| 文件 | 覆盖 |
| :-- | :-- |
| `names.test.ts` | 默认张老板、花名册、usage 文案 |
| `command.test.ts` | 手势边界 |
| `tool-define.test.ts` | required 提升 |
| `state.test.ts` | sanitizeKey、任务图、落盘 |
| `state-dir.test.ts` | stateDirError / resolveStateRoot |
| `state-symlink.test.ts` | 符号链接拒绝 |
| `route-trust.test.ts` | loopback |
| `members.test.ts` | persona 协议键 captain |
| `artwork.test.ts` | 角色关键词含 CJK、QA 先于 engineer |
| `activity-model.test.ts` | DAG / 关系 |
| `panel-geometry.test.ts` | 停靠几何 |

无独立 metrics。`ctx.logger.warn/debug`：artwork、followup、调度、省略的 session 事件。

`pnpm --filter dsh-agent-teams test`（含 client tsconfig）/ `build`。

---

## 9. FR/NFR → 代码 / 测试

| PRD | 代码 | 测试 |
| :-- | :-- | :-- |
| FR-ACT-1～3 | `index.ts` usage、`names.ts` | `names.test.ts` |
| FR-ACT-4～6 | `command.ts` | `command.test.ts` |
| FR-TOOL-1～10 | `tools.ts` | 行为由 state/members 单测 + 走查 |
| FR-TSK-* | `state.ts` transition/attempt | `state.test.ts` |
| FR-SCH-* | `scheduler.ts` | 走查 |
| FR-MEM-* | `members.ts` `persona.ts` | `members.test.ts` |
| FR-UI-* | `client/*` `snapshot.ts` `index.ts` 路由 | `activity-model` `artwork` `panel-geometry` |
| NFR-1 | `state.ts` | `state-dir` `state-symlink` |
| NFR-3 | `route-trust.ts` | `route-trust.test.ts` |
| NFR-6 | `tool-define.ts` | `tool-define.test.ts` |
