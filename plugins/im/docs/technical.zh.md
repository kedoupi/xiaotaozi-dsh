# dsh-im 技术设计

- 插件：dsh-im 0.1.1
- 入口：`src/index.ts`（`createImHostPlugin().apply`）、`src/client/index.ts`
- 文档日期：2026-09-01
- 只描述当前已落地行为。产品合同见 [prd.zh.md](./prd.zh.md) FR-13，设计依据见 [`docs/superpowers/specs/2026-09-01-im-bind-existing-project-design.md`](../../../docs/superpowers/specs/2026-09-01-im-bind-existing-project-design.md)。

## 1. 架构

```
Web Hub (shell.overlay)
  每渠道 SettingsTab ── connection.rpc.call('/feishu'|'/weixin'|…)
  session follow UI ── '/im'
Host apply
  inject: connection, credentials, webServer, typertGateway
  installSessionFollowRpc
  inject tools+systemPrompt → dsh_im_return_file
  动态 load 10 个 host/channels/*/apply（office 受开关）
Channel runtime (src/channels + src/host/channels)
  credential-store / config-store / state-store
  connection-supervisor
  harness-client + text-harness-bridge + 命令
  出站 artifact-delivery
```

`name = "im"`。`Config`：rpcAuthority、isolateChannelFailures、replyTimeoutMs、connectTimeoutMs、officeEnabled、language、agentPreset、以及每渠道嵌套对象。

运行时逻辑在 `src/channels/`；Cordis RPC 在 `src/host/`；UI 在 `src/client/`。

## 2. 模块边界

| 层 | 职责 | 禁止 |
| --- | --- | --- |
| `src/index.ts` | 语言、follow RPC、制品工具、按渠道启动 | 不直接碰 SDK |
| `src/host/channels/<id>` | RPC handle、supervisor 装配 | 不把 secret 回传 |
| `src/channels/<id>` | 桥、卡片、运行时 | 不依赖 React |
| `src/channels/shared` | 命令、会话绑定、审批、i18n、artifact | |
| `src/client/channels/<id>` | 设置页 | 只消费脱敏 status |
| `command-executor.ts` | Typert `commands.execute` | 无 gateway 则 undefined |
| `rpc-authority.ts` | loopback \| trusted-host | |

共享 RPC 端点常量：

- `bot.workspace.set`
- `bot.preset.set`
- instruction / displayName 端点（`bot-instruction-rpc` / `bot-display-name-rpc`）

Token 渠道（Discord 等）复用 `TOKEN_BOT_ENDPOINTS`。

## 3. 状态 / 数据 / 凭证流

1. 用户在 Hub 输入 Token 或扫码。
2. Host RPC 校验 payload → 写入 `ctx.credentials`（ref），config-store 只留 botId、workspace、preset、instruction、displayName、策略。
3. 公开 status 剥离 `token` `botToken` `secret` `secretRef` `tokenRef` `platformId` 以及渠道特定密钥字段。
4. 入站消息 → conversation-state-store 绑定 sessionId（带 session-binding-lock）。新绑定的 bot 以 `workspaceId = null`、`workspacePending = true` 开始；`createSession` 先 `whenWorkspaceReady`。用户从项目选择器提交 `{ botId, workspaceId }`，Host 再按当前 `workspace.list().items` 校验；取消不保存、不确认 cwd，pending 期间不建会话。仓库规范：`docs/conventions.zh.md`「接入与第一次真实工作」。
5. 出站文件：工具把源文件 copy 到 `tmpdir()/dsh-im-outbound-*` 快照，哈希后交给渠道投递。
6. Follow 绑定：channel+botId+sessionId，generation 监视。一个 bot 和一个 Web Session 之间是至多一对一关系。会话列表索引读取显式 `BOT_FOLLOW_KEY` 和仍有效的入站 conversation 绑定；bot 存在显式 Follow 时，仅索引它当前 Follow 的 Session，避免旧会话残留渠道图标。

机器人项目绑定以 `workspaceId` 为唯一身份；path 只作执行元数据或 v1 一次性迁移。Agent Preset 来自 Host catalog。

## 4. API / 工具契约

### 4.1 管理 RPC 通道

| 通道 | 典型端点 |
| --- | --- |
| `/feishu` | connection.status, provision.*, bot.callback-repair.begin, bot.group-message-permission.begin, bot.bind-credentials, bot.reconnect/disconnect/delete, workspace/preset/instruction/displayName, bot.group-response-mode.set；保留 connection.test/disconnect 兼容旧客户端 |
| `/weixin` | status, provision.begin/poll/verify/cancel, reconnect, delete, 共享 set* |
| `/dingtalk` | 扫码 provision + bind-credentials + sender.approve/revoke |
| `/wecom` `/qq` | 扫码或 bind + 共享 set* |
| `/slack` | bind botToken+appToken |
| `/telegram` `/discord` | TOKEN_BOT + Telegram access-policy |
| `/whatsapp` | provision QR + access policy |
| `/office` | connection.status, connector.configure/reconnect/test/remove |
| `/im` | session.follow.list/index/watch/set/clear |

统一结果：`{ ok:true, value }` 或 `{ ok:false, error:{ code, message } }`。取消：`cancelled`。

Office HTTP hooks（相对 Office base origin）：

- `/api/harness/connector/stream`
- `/api/harness/connector/heartbeat`
- `/api/harness/connector/jobs/:id` 及 accept/renew/progress/approval/result/fail

### 4.2 模型工具 `dsh_im_return_file`

注册于 `installOutboundArtifactTool`。把当前回合的工作区文件登记为出站制品，渠道投递层消费。规范值不含 UI 词。文件变化 / 非文件 → 错误码 `artifact-changed` 等。

### 4.3 对话命令（text-harness-bridge）

| 命令 | 行为 |
| --- | --- |
| `/help` | 列出命令（无图无文件） |
| `/status` | 连接状态 |
| `/new` | 清绑定，下一条开新会话 |
| `/models` `/model` | 目录与切换；序号或 `provider/model`；忙则拒绝 |
| `/presetlist` `/preset` | 列表快照 TTL 15min、最多 256 条；`id:` 纯数字；`--default` |
| `/workspace` `/workspacelist` | 按已创建项目序号或唯一名称切换 / 列出项目名；不接受 path |
| `/sessionlist` `/session` | 列/绑定；`/sessionlist N` 按项目序号列会话，`/session N` 仅当前项目序号；不接受任意绝对路径 |
| `/stop` `/steer` | stopActiveTurn / steerActiveTurn |
| `/compact` | typertGateway commands.execute `/compact` |

### 4.4 Host Config 默认

rpcAuthority=loopback；isolateChannelFailures=true；replyTimeoutMs=600000；connectTimeoutMs=20000；officeEnabled=false。

## 5. 生命周期 / 错误 / 安全

**启动**

1. `setImHostLanguage(config.language ?? DSH_IM_LANGUAGE)`。
2. 装 follow RPC（若 `connection.rpc.handle` 存在）。
3. inject tools+systemPrompt 装出站工具。
4. 对 CHANNELS 顺序：office 检查开关 → load apply → 失败则 warn 或 throw。

**Client**

注册 locale、各渠道 CSS、Hub overlay、sidebar entry、session follow。`officeEnabled` 控制 Office Tab。

**错误**

- 未知 endpoint：bad-request。
- 渠道操作失败：`<channel>-operation-failed` 或公开映射（飞书 registration_*）。
- 命令：返回用户可读中文/英文，不把内部 TypeError 原文丢到聊天（部分路径会映射）。

**安全**

- RPC authority 默认 loopback。
- Payload 白名单与凭据长度限制（token 20–4096 等）。
- 公开 JSON 删除密钥键。
- 公开 `bot.workspace.set` payload exact keys `{ botId, workspaceId }`；id 必须存在于当前 `workspace.list().items`。制品仍 realpath + 精确读。
- WhatsApp 非官方协议：产品层风险，不是漏洞绕过。

## 6. 测试与可观测性

vitest 覆盖面大，按目录：

- `tests/index.test.ts` `host.test.ts` `rpc-authority.test.ts` `client-ui.test.ts` `sidebar-entry.test.ts`
- 命令：`control-command` `model-command` `preset-command` `compact-command` `session-bind-command` `workspace.test.ts`（含 pending + 第一次 `ask` 等项目确认、取消继续 pending、旧 path 唯一迁移与 stale id 失效）
- 制品：`outbound-artifact` `artifact-delivery` `inbound-file` `delivery-receipt`
- 每渠道：`tests/channels/<id>/*`（rpc、runtime、client-ui、supervisor、bridge）
- 共享：`text-harness-bridge` `harness-approval` `harness-control` `i18n` `session-follow`

可观测：`logger("dsh-im")` warn 渠道启动失败。无遥测。连接测试走 `publicConnectionTestResult`，不回传密钥。

## 7. 兼容

- Host 0.1.1-rc.2。inject 需 connection/credentials/webServer/typertGateway。
- 飞书保留 `connection.test` / `connection.disconnect` 供滚动升级，多机器人 UI 不再调用。
- Git path：`#path:plugins/im`。
- 不要与上游 npm `dsh-im` 同 profile。
- **实验**：Office，需显式 enabled。
- **可选**：QQ connector peer。
- **非目标实现**：官方 WhatsApp Cloud API。

## 8. FR/NFR → 代码 / 测试

| ID | 代码 | 测试 |
| --- | --- | --- |
| FR-01 Hub 入口 | `client/index.ts` `sidebar-entry.ts` | `sidebar-entry.test.ts` `client-ui.test.ts` |
| FR-02 渠道可见性 | `client/index.ts` CHANNELS + officeChannelEnabled | `index.test.ts` / client-ui |
| FR-03–11 渠道 | `host/channels/*` `channels/*` | `tests/channels/<id>/*` |
| FR-12 Office | `channels/office/protocol.ts` `host/channels/office` | `channels/office/office.test.ts` |
| FR-13 Preset/instruction | shared agent-preset / bot-instruction RPC | `bot-instruction.test.ts` `preset-command.test.ts` `agent-preset-session-lifecycle.test.ts` |
| FR-13 / 13a / 13b 已创建项目 | 见 §9 | 见 §9 测试 |
| FR-14 命令 | `text-harness-bridge.ts` + *-command.ts | 对应 `*-command.test.ts` |
| FR-15 文件 | `semantic/artifact.ts` | `outbound-artifact.test.ts` `inbound-file.test.ts` |
| FR-16 follow | `host/session-follow-rpc.ts` | `session-follow.test.ts` |
| FR-17 隔离 | `src/index.ts` isolate | `index.test.ts` `host.test.ts` |
| FR-19 authority | `rpc-authority.ts` | `rpc-authority.test.ts` |
| NFR-01 脱敏 | 各 `rpc.ts` FORBIDDEN_PUBLIC_KEYS | 各 rpc.test / client-api.test |

## 9. 已实现：只绑定已创建项目

产品合同：[prd.zh.md](./prd.zh.md) FR-13 / 13a / 13b。设计依据：[`docs/superpowers/specs/2026-09-01-im-bind-existing-project-design.md`](../../../docs/superpowers/specs/2026-09-01-im-bind-existing-project-design.md)。

### 9.1 对象

Host 没有独立的「工作区容器 → 项目」父子层。Web 侧栏项目本身就是 Workspace 注册记录：

```text
项目（产品名）= workspace.list().items[]
  ├── workspaceId  稳定身份
  ├── title        项目名
  ├── path         项目根路径，仅内部执行与同名消歧使用
  └── sessionIds   项目里的会话
```

客户端同一份投影是 `ctx.workspaces.list.items`。候选只取这些记录，以 `workspaceId` 为身份；列表为空时 IM 空态。任意目录或 provisional cwd 即使存在，只要未登记，就不是项目。

### 9.2 客户端

| 文件 | 行为 |
| --- | --- |
| `src/client/workspace-editor.ts` | 按钮「选择项目 / 切换项目」；主文案项目名；未选「未选择项目」；取消不保存；Host `workspacePending` 可在初始快照、重载和 connecting 阶段恢复弹层 |
| `src/client/workspace-project-picker.ts` | 只消费 `ctx.workspaces.list`；loading 与 ready 空态分开；无面包屑、手输路径或 `pickDirectory` 兜底 |
| 各渠道卡片（共用 `WorkspaceEditor`） | 所有调用方提交 `{ botId, workspaceId }`，不提交 path 或额外键 |
| `src/client/usage-guide-card.ts` `usage-guide.ts` `i18n.ts` | 用户文案统一为选择 / 切换项目 |
| `src/client/session-follow.ts` | 按同一 `workspaceId` 匹配；空态「切换到这个项目」 |

### 9.3 Host

| 文件 | 行为 |
| --- | --- |
| 各渠道生产装配 | 新机器人不把 `config.workspace ?? process.cwd()` 当成已选项目；pending = 未选择项目 |
| `channels/shared/bot-workspace-store.ts` | schema v2 持久化 `workspaceId` 身份并缓存 path/title；当前 id 不在 `workspace.list().items` 时 pending |
| `host/channels/shared/workspace-rpc.ts` 及各渠道 RPC | `bot.workspace.set` exact payload 为 `{ botId, workspaceId }`，并校验当前项目 id |
| `channels/shared/harness-client.ts` | 普通 bot 会话直接把已验证 `workspaceId` 传给 `session.create`，不调用 `workspace.create`，不省略目标或回退 cwd |
| `channels/shared/workspace-command.ts` | `/workspacelist` 列项目名；`/workspace` 只接受序号或唯一名称；`/sessionlist` 不接受绝对路径 |
| 飞书 `feishu-cards.ts` `bridge.ts` | 下拉 / 列表卡 / `/status` / 帮助用项目名；交互 payload 传 `workspaceId` |
| 各渠道 `/help`、Telegram `TELEGRAM_COMMAND_MENU` | 「切换项目 / 列出项目」 |
| `channels/shared/message-failure.ts` | `WORKSPACE_UNAVAILABLE`：请选择一个已有项目 |
| `channels/shared/session-follow.ts` | 按 `workspaceId` 匹配，不用裸 path 当身份 |

重启迁移：旧记录只有 path 时，规范化后若精确匹配当前列表中唯一项目，则写回该 `workspaceId`；否则 pending。完成迁移后，删除并以同路径重建的项目不得自动继承旧绑定。

### 9.4 禁止

- IM 创建项目（`workspace.create`）
- 系统选文件夹、手输路径保存、逛子文件夹
- 把未登记的 provisional cwd 当默认项目或可选项
- 取消第一次选择时确认默认路径
- 只改某一个渠道的卡片
- 新增 `packages/` 或跨插件共享包来传项目列表

### 9.5 不动

入站 `.dsh-im/inbound`、`dsh_im_return_file`、DSH_HOME、企微配置目录、WhatsApp auth、Office `alias=/绝对路径`、职责里的项目 `AGENTS.md`。

### 9.6 测试必须覆盖

ready baseline 的空项目列表（loading 不误报空态）；初始状态 / 重载 / connecting / 丢一次 poll 后由 Host pending 恢复弹层；选已有项目；拒绝任意 path / 未登记文件夹；取消不确认 cwd；旧 path 唯一匹配迁移；项目删除或同路径重建后旧 id 失效；禁止 `workspace.create`；入站 `session.create` 必须显式传已校验 id 且不得带/回退 `cwd`；`/workspace /path` 失败；飞书选项显示项目名且 payload 是 id；Follow 按 id 匹配。

作废且不要为保绿留下：逛子文件夹、手输 UNC、native picker、取消即确认 cwd。

对应测试覆盖 `workspace-editor.test.ts`、`workspace.test.ts`、各渠道 `client-ui` / `client-api`、`session-follow.test.ts`，以及本节写到的命令 / 飞书测试。
