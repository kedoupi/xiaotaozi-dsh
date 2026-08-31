# dsh-im 技术设计

- 插件：dsh-im 0.1.1
- 入口：`src/index.ts`（`createImHostPlugin().apply`）、`src/client/index.ts`
- 文档日期：2026-08-27

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
4. 入站消息 → conversation-state-store 绑定 sessionId（带 session-binding-lock）。新绑定的 bot：`createRuntime` 里 `ensure(..., { confirmWorkspace: false })`，工作区 pending；`createSession` 先 `whenWorkspaceReady`。用户 `bot.workspace.set`（含选中当前目录或取消确认默认）后才建会话。绑定后的目录选择器 `startPath` 为空（主目录 / 未设置），不以 `process.cwd()` 为起点。重启后磁盘已有的绑定视为已确认。仓库规范：`docs/conventions.zh.md`「接入与第一次真实工作」。
5. 出站文件：工具把源文件 copy 到 `tmpdir()/dsh-im-outbound-*` 快照，哈希后交给渠道投递。
6. Follow 绑定：channel+botId+sessionId，generation 监视。一个 bot 和一个 Web Session 之间是至多一对一关系；会话列表索引只读取显式 `BOT_FOLLOW_KEY`，不把入站 conversation 路由历史当作 Follow。

Workspace 路径必须是绝对路径（RPC 校验）。Agent Preset 来自 Host catalog。

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
| `/workspace` `/workspacelist` | 绝对路径 / 列表 |
| `/sessionlist` `/session` | 列/绑定；`/session N` 仅当前工作区序号 |
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
- 工作区绝对路径；制品 realpath + 精确读。
- WhatsApp 非官方协议：产品层风险，不是漏洞绕过。

## 6. 测试与可观测性

vitest 覆盖面大，按目录：

- `tests/index.test.ts` `host.test.ts` `rpc-authority.test.ts` `client-ui.test.ts` `sidebar-entry.test.ts`
- 命令：`control-command` `model-command` `preset-command` `compact-command` `session-bind-command` `workspace.test.ts`（含未确认绑定 + 第一次 `ask` 等到 `setWorkspace`；绑定选择器从主目录打开、取消会确认默认）
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
| FR-14 命令 | `text-harness-bridge.ts` + *-command.ts | 对应 `*-command.test.ts` |
| FR-15 文件 | `semantic/artifact.ts` | `outbound-artifact.test.ts` `inbound-file.test.ts` |
| FR-16 follow | `host/session-follow-rpc.ts` | `session-follow.test.ts` |
| FR-17 隔离 | `src/index.ts` isolate | `index.test.ts` `host.test.ts` |
| FR-19 authority | `rpc-authority.ts` | `rpc-authority.test.ts` |
| NFR-01 脱敏 | 各 `rpc.ts` FORBIDDEN_PUBLIC_KEYS | 各 rpc.test / client-api.test |
