# dsh-im 产品需求文档（PRD）

- 产品：dsh-im（IM 机器人）
- 包名：`dsh-im`
- 版本：0.1.1
- 状态：已实现（渠道适配来自 xmanrui/dsh-im MIT；小桃子 fork）
- 文档日期：2026-09-01
- 适用范围：`plugins/im` 当前源码。只描述已落地行为；设计依据见 [`docs/superpowers/specs/2026-09-01-im-bind-existing-project-design.md`](../../../docs/superpowers/specs/2026-09-01-im-bind-existing-project-design.md)。

## 1. 背景与问题

用户希望在飞书 / 微信 / 钉钉 / 企业微信 / QQ / Slack / Telegram / Discord / WhatsApp 里直接和本机 DeepSeek Harness 对话，而不必守着 Web。需要：

- 扫码或粘贴凭据接入，每渠道可挂多个机器人；
- 凭据留在 Host credential store，不进客户端 bundle；
- 聊天文件进当前会话；结果文件用渠道原生附件回传；
- 对话内命令（会话、模型、Preset、项目、停止/转向、压缩）。

AI Office 连接器是实验功能，默认关闭。

## 2. 用户与场景

| 角色 | 场景 |
| --- | --- |
| 桌面用户 | 侧栏「新会话」下方点「IM机器人」，按渠道扫码或填 Token，把聊天绑到本机会话。 |
| 群聊用户 | 飞书/钉钉/QQ/Discord 等：@ 或按渠道策略响应；飞书可配群响应模式。 |
| Agent | 调用 `dsh_im_return_file` 把当前项目里的文件发回当前 IM 对话。 |
| 管理员 | 为每个机器人选已创建项目、Agent Preset、职责短文、显示名、访问策略。 |

## 3. 目标与非目标

### 目标

- 九个聊天渠道 + 可选 AI Office。
- 多机器人；RPC 默认 loopback。
- 渠道故障隔离（`isolateChannelFailures` 默认 true）。
- 入站普通文件进会话工作区；出站走 `dsh_im_return_file`。
- 命令：`/help` `/new` `/status` `/models` `/model` `/presetlist` `/preset` `/stop` `/steer` `/compact` `/workspace` `/workspacelist` `/sessionlist` `/session`。
- 文案随 Harness 语言；Host `language: en` 或 `DSH_IM_LANGUAGE=en` 切英文命令帮助（未收录句仍中文）。

### 非目标

- 不把凭据下发到 Web。
- 不在未开 `officeEnabled` 时加载 Office 渠道。
- 不保证 WhatsApp 官方商务 API（实现是非官方关联设备 / Baileys）。
- 不替代 Web 会话 UI；提供 session follow，把 IM 会话钉到 Web 会话列表。
- 不实现小桃子品牌壳、右侧工作台。

## 4. 用户故事

1. 作为用户，我打开 IM 面板，看到微信…WhatsApp；Office 仅实验开关打开后出现。
2. 作为用户，我扫飞书码或填 App ID/Secret，机器人连上后可在飞书里 @ 它。
3. 作为用户，我给机器人选一个已创建项目与 Agent Preset；选完之前第一条消息不得建会话。Preset 只影响之后 `/new` 的会话。
4. 作为用户，我在聊天发 `/models` 再 `/model 2` 切换模型。
5. 作为用户，我发文件，Agent 处理后用附件把结果发回来。
6. 作为用户，Telegram/WhatsApp 可限制只自己或白名单。
7. 作为用户，Web 会话可 follow 某个 IM 机器人会话。
8. 作为开发者，某个渠道启动失败时其他渠道继续（默认）。

## 5. 功能需求（FR）

**FR-01 侧栏入口与 Hub**  
克隆新会话按钮，入口文案「IM机器人」。点开 `shell.overlay` Hub（id `im-hub`），Esc / 点遮罩关闭，焦点循环。不占用设置 overlay（`settings.section`）。

**FR-02 渠道列表**  
微信、飞书、钉钉、企业微信、QQ、Slack、Telegram、Discord、WhatsApp；Office 标注「（实验功能）」，受 `officeEnabled` 或 `office.enabled` 控制。

**FR-03 飞书**  
扫码注册或 bind App 凭据；流式卡片；群 @ / 全量响应；callback repair 与群消息权限授权；会话 follow/归档相关能力由共享层提供。RPC `/feishu`。

**FR-04 微信**  
扫码（腾讯 iLink）；provision 可提交 4–8 位验证码。RPC `/weixin`。

**FR-05 钉钉**  
扫码或 Client ID+Secret；AI Card；发件人 approve/revoke。RPC `/dingtalk`。

**FR-06 企业微信**  
扫码或 Bot ID+Secret。RPC `/wecom`。

**FR-07 QQ**  
扫码或 AppID+AppSecret；最终回答 Markdown；私聊进度收在一个气泡。RPC `/qq`。可选 peer `@tencent-connect/qqbot-connector`。

**FR-08 Slack**  
App Manifest + xoxb Bot Token + xapp App Token。需要 `files:read` 与 `files:write`。RPC `/slack`。

**FR-09 Telegram**  
BotFather Token；可选私聊白名单；Rich Message（私聊 Draft，群/Topic 原位更新）。RPC `/telegram` + `bot.access-policy.set`。

**FR-10 Discord**  
Bot Token；需 Message Content Intent；服务器文字/公告频道 @ 后开 Public Thread；发文件需 Attach Files。RPC `/discord`（token-bot 端点集）。

**FR-11 WhatsApp**  
关联设备扫码（非官方 Web；建议专用号码）。默认仅自己，可改指定联系人或开放。RPC `/whatsapp`。

**FR-12 AI Office（实验，默认关）**  
本机向外 heartbeat + SSE。RPC `/office`：status/configure/reconnect/test/remove。Hook 路径见技术文档。URL 必须 HTTPS，或 loopback HTTP。

**FR-13 共享机器人字段**
每机器人：当前**已创建项目**（稳定 id + 对用户显示的项目名）、Agent Preset、instruction（职责短文，每次入站带上）、display name。项目 `AGENTS.md` 仍共用。

用户只选已经创建好的项目，即 Host `workspace.list().items` 中、带稳定 `workspaceId` 和项目名的 Workspace 注册记录。不直接选文件夹。绑定和以后换目标是同一件事：选择项目 / 切换项目。卡片主文案是项目名，不是绝对路径。

**FR-13a 新绑定项目待确认**
新接入的机器人没有当前项目，对用户显示「未选择项目」。不要先把 `process.cwd()` / 仓库目录当成已选项。选择器列出 `workspace.list().items` 中的已创建项目，不以主目录或仓库 cwd 为起点，禁止系统选文件夹；项目 baseline 未 ready 时显示加载，不能把暂时的 `items=[]` 当成真空态。Host `workspacePending` 在初始状态、页面重载、渠道仍 connecting、丢失一次 provisioning poll 后都要恢复弹层，不等待 status=connected。确认 RPC 完成前，第一条入站不得建 DSH 会话；`session.create` 必须显式传已验证 `workspaceId`，不得传/回退/省略成 Host cwd。**取消第一次选择 ≠ 确认默认 cwd**；目标仍未选择，不得干活。已有绑定后再取消选择器 = 保持原项目。重启后：只有仍存在于项目列表的 `workspaceId` 才是确认态；旧数据只有 path 时，可在它精确匹配当前唯一项目后一次性迁移，否则视为未选择。仓库规范：`docs/conventions.zh.md`「接入与第一次真实工作」。设计：上述 spec。

**FR-13b 切换项目**
卡片「切换项目」、`/workspacelist` + `/workspace N` 或项目名、飞书下拉，切的是同一个 `workspaceId`。不在列表里就不能切。IM 禁止 `workspace.create`。项目被删或 id 失效：机器人回到未选择，不回退到默认 cwd。命令名 `/workspace` `/workspacelist` 可保留，帮助写成列出项目 / 切换项目。`/sessionlist` 不得跟任意绝对路径。Follow 按 `workspaceId` 匹配，空态说「切换到这个项目」。

**FR-14 对话命令**  
见目标列表。`/preset` 只影响之后新建会话。`/stop` `/steer` 纯文字。`/compact` 走 Typert `commands.execute`。`/workspace` `/workspacelist` `/sessionlist` 的语义以 FR-13b 为准。

**FR-15 文件双向**  
入站普通文件进当前会话工作区。出站工具 `dsh_im_return_file`：读工作区文件快照，按渠道原生附件投递。

**FR-16 Session follow**  
RPC 通道 `/im`：list/index/watch/set/clear。Web 可把会话钉到某 bot。一个 bot 同时最多 follow 一个 Web Session，一个 Web Session 同时最多由一个 bot follow。仍有效的入站 IM 会话绑定也在 Web 会话列表显示渠道图标；bot 显式 follow 后，只在当前 follow 的 Session 显示图标，不保留旧会话图标。只列出已绑在**这个项目**上的机器人；空态引导把机器人切换到这个项目，不说切到这个目录。项目匹配使用 `workspaceId`，不比较 path。

**FR-17 故障隔离**  
默认一渠道 apply 失败 warn 后继续。`isolateChannelFailures=false` 则抛出。

**FR-18 超时**  
`replyTimeoutMs` 默认 600000；`connectTimeoutMs` 默认 20000。下发到各渠道 config。

**FR-19 RPC 权威**  
默认 `loopback`；可配 `trusted-host`。非法值启动失败。

**FR-20 按需加载**  
QQ / WhatsApp / Office 动态 import。Office 未启用则不 load。

## 6. 非功能需求（NFR）

**NFR-01 凭据**  
存在 Host credentials；RPC 响应剥离 token/secret/tokenRef 等。Slack/钉钉另有禁止键。

**NFR-02 输入校验**  
endpoint 白名单；payload exact keys；botId 形状（Slack 为 `slack_[a-f0-9]{24}`）。

**NFR-03 出站制品完整性**  
`dsh_im_return_file` 按观测 size 精确读并验证 EOF；变化则 `artifact-changed`。哈希 sha256。

**NFR-04 i18n**  
中文为源文案；英文表不全则回落中文。

**NFR-05 依赖**  
飞书 node-sdk、钉钉 stream、企微 aibot、QQ bot、Baileys、qrcode、sharp、https-proxy-agent 等钉死版本。`@deepseek-ai/*` 不打包。

**NFR-06 无遥测。** Hub 有 GitHub 外链（kedoupi/xiaotaozi-dsh）。

**NFR-07 WhatsApp / QQ native**  
可能缺可选 peer；启动失败被隔离。

## 7. 流程

### 7.1 接入（扫码类）

Hub 选渠道 → `provision.begin` 得二维码 → 用户扫 → poll → 成功写入 credential store 并创建稳定 `botId` / pending 绑定 → Host 状态快照令设置页弹出**项目**选择器；supervisor 连接可并行继续，不必等到 status=connected。页面重载、丢失一次 poll 或运行时仍 connecting 时，Host 的 `workspacePending` 状态仍负责恢复弹层。在用户选中已创建项目、`bot.workspace.set` 成功前保持 pending。选择器是已创建项目列表，不是目录树；取消 ≠ 确认 cwd。

### 7.2 接入（Token 类）

填 Bot Token（Slack 再加 App Token）→ `bot.bind-credentials` 持久化稳定 `botId` / pending 绑定 → Host 状态立即驱动同一项目选择器；reconnect/test 与项目选择互不阻塞，pending、重载恢复及取消规则同 7.1。

### 7.3 入站消息

渠道 webhook/stream → 文本桥：命令优先，否则 `askInWorkspaceSession`（新绑定会等到**已创建项目**确认）→ 流式回渠道（卡片/Rich/Markdown 因渠道而异）→ 工具文件出站。

### 7.4 切 Preset

`/preset N` 或面板 setAgentPreset → 存 bot 配置 → 现有会话不变 → 用户 `/new` 后新会话用新 Preset。

## 8. 验收标准

1. 未开 office 时 Hub 无 Office 页，Host 不 load office 模块。
2. 客户端 bundle 不含 App Secret / Bot Token。
3. 默认 RPC 非 loopback 浏览器不可管凭据。
4. 飞书启动失败时微信仍可连（isolate 默认开）。
5. `/help` 列出已实现命令；带图的控制命令被拒绝。
6. Agent 调 `dsh_im_return_file` 后渠道出现附件（渠道需相应权限）。
7. WhatsApp 文档标明非官方、建议专用号。
8. `pnpm --filter dsh-im test` 通过。
9. 项目列表有已创建项目时，IM 只能选这些记录，不能手输路径或系统选文件夹；0 个项目时是空状态。取消第一次选择后入站仍不在 cwd 建会话。选中项目 A 后第一条消息只进 A，且不 `workspace.create`。`/workspace /未登记/路径` 失败。帮助与飞书不再教「选择目录 / 绝对路径」。
10. 项目删除后绑定回到 pending；即使同一路径重建成新 `workspaceId`，旧绑定也不会复活，必须重新选择。

## 9. 风险与待决

| 项 | 说明 |
| --- | --- |
| WhatsApp 非官方 | 封号风险；产品必须明示专用号。 |
| AI Office | **实验 / 默认关**。协议 `office-harness.v1`，对接方需实现 hook。 |
| QQ connector 可选 | 无 peer 时该渠道可能起不来。 |
| 飞书 DOM/开放平台变更 | 扫码注册依赖官方域名白名单。 |
| Discord Thread 权限 | 缺 Create Public Threads 等会静默失败于渠道侧。 |
| 英文 i18n 不全 | 未收录句发中文。 |
| 已创建项目列表 | Web 侧栏项目就是 `workspace.list().items` / `ctx.workspaces.list.items`。候选以 `workspaceId` 为身份、`title` 为主显示；列表为空时 IM 空态，不降级成选目录。 |
| 不做 | 官方 WhatsApp Cloud API、把 IM 当多用户 SaaS、凭据同步到云、在 IM 里创建项目。 |

## 10. 状态 / 版本 / 日期

| 字段 | 值 |
| --- | --- |
| 状态 | 已实现 / 维护中；Office 实验 |
| 插件版本 | 0.1.1 |
| 上游 | xmanrui/dsh-im MIT，见 THIRD_PARTY_NOTICES.md |
| Host | 0.1.1-rc.2 |
| 文档版本 | 1.1 |
| 日期 | 2026-09-01 |
