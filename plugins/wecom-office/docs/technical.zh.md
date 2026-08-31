# 技术方案：dsh-wecom-office

| 项 | 内容 |
| :-- | :-- |
| 对应 PRD | [prd.zh.md](./prd.zh.md) **v0.5**（产品主合同） |
| 文档状态 | 单入口已实现 · 待真机开通验收 |
| 冲突规则 | 用户可见行为以 PRD 为准；本文只写怎么实现。扩大范围先改 PRD |

实现必须覆盖 PRD 的 FR/NFR。禁止在未改 PRD 的情况下加独立设置 UI、扫码绑定、飞书或 Desktop 捆绑。

### 需求追溯

| PRD | 本文 |
| :-- | :-- |
| FR-ENTRY-*、§4–5 单入口 | §1、§2、§8 |
| FR-ACT-* 开通 / 切换 / 回滚 | §4.1、§6、`office-controller.ts` |
| FR-PERM-1、FR-COMPAT-* | §5、§8.3 |
| FR-TOOL-1～4 | §7、[附录 A](./appendix-cli.zh.md) |
| NFR-1～6 | §3、§5、§9、§10 |
| loopback RPC | [附录 B](./appendix-rpc.zh.md) |

---

## 1. 包身份

| 位置 | 值 |
| :-- | :-- |
| 目录 | `plugins/wecom-office/` |
| `package.json` `name` | `dsh-wecom-office` |
| `cordis.patch.yml` `name` | `dsh-wecom-office` |
| patch `id` / `export const name` | `wecom-office` |
| Git 安装 | `github:kedoupi/xiaotaozi-dsh#path:plugins/wecom-office` |

四名必须对齐。改名等于目录、包名、patch、`$DSH_HOME/plugins/wecom-office` 一起改。

**kind：host-only。** 单入口后本包不再注册 `settings.section`，没有 `src/client`。所有用户界面在 `dsh-im` 的企业微信机器人卡片里。只装本包、不装 `dsh-im` 时没有任何办公 UI。

本包是自研，进默认种子。`wecom-cli` 不是 DSH 插件，不要当成市场上架项。

---

## 2. 架构与所有权划分

`dsh-im` 拥有：机器人绑定 / 删除、聊天连接、机器人卡片，以及唯一的办公用户界面（卡片「办公能力」区）。IM client 通过 loopback HTTP 调本包的状态与变更接口。

`dsh-wecom-office` 拥有：`wecom-cli` 探测、鉴权与调用；`wecom_*` tools 与 systemPrompt guidance；办公身份、CLI 凭据目录和权限设置的持久化；loopback-only、same-origin 的状态与变更接口。

```
plugins/wecom-office/
  src/index.ts              # Cordis Host：tools + prompt + status 路由
  src/names.ts              # 稳定 id / 路由常量
  src/cli.ts                # spawn wecom-cli（无 Cordis，单测只打这里）
  src/auth.ts               # 静默 auth init、auth show
  src/im-bridge.ts          # 只读 IM 企微 config.json + credentials
  src/im-available.ts       # 探测 IM 是否加载
  src/office-controller.ts  # 状态机：snapshot / activate / rollback / configure
  src/office-types.ts       # 路由 payload 类型（含旧字段兼容形状）
  src/status-route.ts       # POST /_dsh/dsh-wecom-office/status
  src/loopback.ts           # loopback + same-origin 校验
  src/tools*.ts             # ctx.tools.register 纯对象
  src/settings.ts           # Schemastery Config + 落盘 overlay
  src/guidance.ts           # systemPrompt 文本
  tests/                    # 不 mock 整个 harness
  docs/                     # 本规格
```

原则（仓库约定）：

- 不依赖 Cordis 的逻辑单独文件，测试只 import 那些文件。
- 不要 value-import `@deepseek-ai/dsh-tools`。在 `ctx.tools` 上注册普通对象。
- `@deepseek-ai/*` `deps.neverBundle: true`；`import type` 除非 `lib/` 真的 value-import。
- 可调超时、路径、开关走导出的 `Config`。
- 不要依赖 `dsh-im` 的 TypeScript 源码。Git path 安装只有这一个目录。读 IM 的 **磁盘约定** 和 `ctx.credentials`。

外面跑 CLI 二进制，插件注册 tools + 状态路由。本包跑 `wecom-cli`。

---

## 3. 官方依赖：wecom-cli

仓库：<https://github.com/WecomTeam/wecom-cli>  
npm：`@wecom/cli`  
二进制名：`wecom-cli`

命令模型（服务目录由服务端 discovery 下发，TTL 约 60s）：

```text
wecom-cli auth <init|show>
wecom-cli <service> [resource...] <method> [--json '...'] [flags]
```

常见 service：`message`、`mail`、`doc`、`sheet`、`smartsheet`、`smartpage`、`calendar`、`meeting`、`todo`、`disk`、`contact`、`media`、`identity`。

本插件 **不** 自己打企业微信 REST，不解析 discovery 自己组 HTTP。一律 spawn CLI，stdout 当 JSON。

### 3.1 鉴权（已核实）

`wecom-cli auth init`：

| 方式 | 行为 |
| :-- | :-- |
| 默认 TTY | 交互选扫码或手动 |
| `--noninteractive` | 扫码 |
| `--manual` | TTY 里手填 |
| `--bot-id` + `--secret` 且 stderr **不是** TTY | 静默验证并写入凭据（hidden flags） |

插件 `spawn` 默认非 TTY，可用：

```bash
wecom-cli auth init --bot-id <remoteBotId> --secret <secret>
```

引导换 token：`sha256(secret + bot_id + time + nonce)` → `https://qyapi.weixin.qq.com/cgi-bin/aibot/cli/get_cli_config`。  
凭据：`<config_dir>/credentials.enc`（AES-256-GCM）。  
状态：`wecom-cli auth show --status` → `authorized` / `unauthorized`。

环境变量：

| 变量 | 用途 |
| :-- | :-- |
| `WECOM_CLI_CONFIG_DIR` | 覆盖配置目录。**必须设。** |
| `WECOM_CLI_TMP_DIR` | 可选，落到本插件目录下的 tmp |

**禁止** 默认使用 `~/.config/wecom`。钉死：

```text
$DSH_HOME/plugins/wecom-office
```

沙箱 `.dsh-home` 与正式 `~/.dsh` 不会抢同一份凭据。

### 3.2 本机二进制

**PATH 解析 + Config `cliPath`**，默认 `wecom-cli`。
不要把 `@wecom/cli` 的多平台 optionalDependencies 塞进本包：和 `neverBundle` / `check:path` 冲突，也和「不打进桌面 runtime」一致。

探测：`cliPath --version`，超时走 `Config.callTimeoutMs`。失败 = 卡片「未安装 wecom-cli」。

---

## 4. 账号从哪来

### 4.1 IM 的磁盘约定（只读复用）

`dsh-im` 企微生产路径（`plugins/im/src/host/channels/wecom/production.ts`）：

```text
$DSH_HOME/integrations/dsh-wecom/config.json
$DSH_HOME/integrations/dsh-wecom/bots/<botId>/state.json
```

`config.json` bot 形状（只读我们需要的字段）：

| 字段 | 含义 |
| :-- | :-- |
| `botId` | 本地 id，`wecom_` + sha256(remoteBotId) 前 24 hex |
| `remoteBotId` | 腾讯 Bot ID，交给 `wecom-cli --bot-id`；**永远不进路由响应、日志或 UI** |
| `secretRef` | `DSH_WECOM_BOT_SECRET_` + 同一 digest 大写，交给 `ctx.credentials.resolve` |
| `name` | 可选显示名 |

`deriveWecomBotIdentity` 必须能对上，对不上的条目丢弃，当无效。

Secret：`ctx.credentials.resolve(secretRef)`。**禁止** 写入本插件 Config / 设置 overlay / git / 路由响应。响应与 UI 只带 `botId`、显示名和打码后的 `remoteBotIdMasked`。

### 4.2 开通与切换（`office-controller.ts`）

开通流程（IM client POST `activate` + 卡片 `botId`）：

1. 校验该 `botId` 仍在 IM `config.json` 列表里。
2. `resolve(secretRef)`；没有 secret → 失败「凭据缺失，请在 IM 里重新绑定」。
3. `WECOM_CLI_CONFIG_DIR=...` spawn `auth init --bot-id --secret`。
4. `auth show --status` 必须为 `authorized`。
5. 全部成功后才写 overlay `activeBotId` / `activeIdentity`（不含 secret）。

**切换回滚：** 切换前保存原 active identity。目标 bot 的 `auth init` 失败时，用原 identity 的 credential store Secret 重新执行 `auth init` 回滚 CLI 身份，不写新 `activeBotId`。回滚成功：原办公机器人继续可用，错误展示在目标卡片；回滚也失败：明确报告办公鉴权不可用（`cli-failed`），不伪称原身份仍正常。

**删除当前办公 bot：** 下一次 `snapshot` 发现 `activeBotId` 不在 IM 列表 → 清 CLI 凭据（`credentials.enc` + cache），`activeBotId=""`，不自动接管剩余 bot。

IM 是否在线（WebSocket）与 CLI 是否 authorized 是两回事，分开显示。

`im-bridge.ts` 只做：读 JSON、校验形状、列出摘要（打码 remoteBotId）。不 import `dsh-im`。

---

## 5. Config 与旧数据兼容

导出 Schemastery `Config`。字段：

| 字段 | 默认 | 含义 |
| :-- | :-- | :-- |
| `cliPath` | `wecom-cli` | 可执行文件 |
| `configDir` | `""`（空则 `$DSH_HOME/plugins/wecom-office`） | `WECOM_CLI_CONFIG_DIR` |
| `callTimeoutMs` | `30000` | 单次 spawn 超时 |
| `enabledServices` | `["calendar","doc","meeting","contact"]` | 允许的 CLI service |
| `allowWrite` | `false` | 写方法 |
| `selectedBotId` | `""` | 旧设置页遗留字段，兼容读取 |
| `activeBotId` | `""` | 已开通成功的办公身份 |
| `activeIdentity` | `null` | 开通成功时的展示快照（`source: im \| standalone`） |
| `guidance` | `true` | 是否挂 systemPrompt |

超时、路径、开关禁止硬编码在 spawn 调用里。

可写字段落盘 overlay `$DSH_HOME/plugins/wecom-office/settings.json`。Secret 永不进此文件。

**旧数据兼容：** 现有 `activeBotId` / `activeIdentity` / `allowWrite` / `guidance` 不迁移路径，升级后直接在对应卡片显示已开通。`activeIdentity.source === "standalone"`（独立设置页时代遗留）兼容读取、不清数据，但不再提供新增、扫码、手动绑定或清理 standalone 身份的 UI 和路由动作。

---

## 6. Host 行为

`inject`：`["tools", "credentials"]`。状态路由需要 web 服务时再 `ctx.get("webServer")`，headless 没有 web 也能注册 tools。

`apply`：

1. 解析 Config + overlay。
2. `registerOfficeTools`。
3. `ctx.inject(["systemPrompt"], …)` 挂 guidance。
4. 注册 `POST /_dsh/dsh-wecom-office/status`，动作与 payload 见 [附录 B](./appendix-rpc.zh.md)。

工具 `execute` 每次：

1. 解析 `cliPath`，不存在则返回结构化错误 `cli-missing`。
2. `auth show --status`，非 `authorized` 则 `unauthorized`。
3. service 不在 `enabledServices` → 拒。
4. 写方法且 `allowWrite === false` → 拒（fail closed）。
5. spawn，stdout JSON 原样或压缩后给模型；非 0 退出把 CLI JSON errcode 放进结果，不要吞成「出错了」。

---

## 7. 工具面

不要把 discovery 全量铺进模型上下文。

### 具名只读工具

| 工具名 | CLI（示意，以 `wecom-cli <service> --help` 为准） | 用户意图 |
| :-- | :-- | :-- |
| `wecom_calendar_list` | `calendar` 列表/议程 | 今天/本周安排 |
| `wecom_calendar_search` | `calendar` 搜索 | 按关键词找日程 |
| `wecom_doc_search` | `doc search --json '{"keywords":[...],"limit":n}'` | 找文档 |
| `wecom_doc_get` | `doc` 读内容 | 打开某篇 |
| `wecom_meeting_list` | `meeting` 列表 | 在线会议 |
| `wecom_contact_search` | `contact` 搜索 | 找人，约人的前置 |

argv **以 [附录 A](./appendix-cli.zh.md) 为准**（实测 1.2.0）。`cli.ts` 用附录中的子命令路径 + `--json`。schema 字段名若与附录 JSON 键不一致，改附录一行，不要在代码里另开一套子命令。

每个 tool：`name`、`description`（英文 description 供模型，可中英）、JSON Schema parameters、`output.schema` + `render`、`execute`。

### 文档全家桶（已落地）

高频：`wecom_doc_create` / `append` / `overwrite` / `rename`，`wecom_sheet_*`，`wecom_smartsheet_get` / `records_*`。  
其余 doc / sheet / smartsheet / smartpage 走 `wecom_docs_run({ service, method, json })`，method 为点号路径（`contents.append`、`records.add`）。写操作看 Config `allowWrite`（当前办公机器人卡片的「允许修改」开关）。

日程/会议创建仍不做。

### 错误码（给模型和 IM 卡片共用）

| code | 含义 |
| :-- | :-- |
| `cli-missing` | PATH 上没有二进制 |
| `unauthorized` | 未开通或凭据失效 |
| `im-bot-missing` | 目标 bot 不在 IM 列表 |
| `im-unavailable` | 路由可用但 IM 未加载（无 bot 可选） |
| `secret-missing` | credentials 里没有 secret |
| `write-disabled` | 写方法且 `allowWrite === false` |
| `service-disabled` | 不在 enabledServices |
| `cli-failed` | CLI 非 0，附带 errcode/errmsg（清洗后） |
| `qr-failed` / `qr-expired` | 仅旧 standalone 数据兼容读取时可能出现；新流程不再产生 |

---

## 8. 路由与 IM 卡片

- 本包唯一对外接口：`POST /_dsh/dsh-wecom-office/status`，loopback-only + same-origin + JSON body。动作只有 `status` / `activate` / `configure`，见附录 B。
- 卡片 UI 在 `dsh-im`（`plugins/im/src/client/channels/wecom/`）。IM client 用自己的 `botId` 调 `activate`，用 `configure` 改 `allowWrite` / `guidance`，用 `status` 刷新卡片。
- 响应永不包含 Secret、secretRef 或完整 `remoteBotId`。

### 8.3 办公身份状态机

| overlay 字段 | 含义 |
| :-- | :-- |
| `activeBotId` | 已对 CLI 开通成功的身份；IM bot 为 `wecom_<digest>`，旧 standalone 为 `office_<digest>` |
| `activeIdentity` | 开通成功时写入的展示快照（`source: im \| standalone`）。standalone 仅兼容读取 |
| `imAvailable` | 运行时探测结果，不落盘。Host = Client hint OR 已加载的 `im` 插件；磁盘 `config.json` 不算 |

有 IM 且列表找不到 `activeBotId`（当前办公 bot 被删）→ 清凭据，`activeBotId=""`，不自动接管。
切换目标鉴权失败 → 用原 identity 回滚 CLI，见 §4.2。

---

## 9. 安全

- Secret 只出现在：DSH credentials → 子进程 argv/env 的极短窗口。优先确认 CLI 是否支持从 stdin / env 读 secret；若必须走 argv，文档化风险，避免打进 logger。
- 日志打码 Bot ID（本包 `maskWecomBotId`，不要 import IM）。
- `configDir` 文件权限 0600（CLI 自己会写 credentials.enc）。
- 状态路由仅 loopback + same-origin；响应无 secret / secretRef / 完整 remoteBotId。
- 不把 `credentials.enc` 提交 git；目录在 `$DSH_HOME` 下，本已 gitignore。
- 沙箱要测真开通：只拷 `~/.dsh/.credentials.yaml` 进 `.dsh-home/`，不要拷 sessions。

---

## 10. 测试

只测无 Cordis 文件：

- `im-bridge`：合法/非法 config.json、identity 对不上则丢弃。`imAvailable` 见附录 B（Client hint OR 已加载 im 插件），不在此文件里猜。
- `cli`：组装 argv、超时、非 JSON stdout、exit code。
- `auth`：非 TTY 参数；不要在单测里打真网。
- 工具层：service-disabled、unauthorized、write-disabled 短路。
- `office-controller`：开通成功；切换失败保留原 active 身份并回滚；回滚失败明确报错；Secret 缺失；删 active bot 后清理且不自动接管。
- `status-route`：动作校验、loopback、same-origin、JSON body、错误清洗；响应无 secret / secretRef / 完整 remoteBotId。
- IM client（在 `dsh-im` 包内）：卡片各状态、提交当前卡片 `botId`、成功后刷新。

e2e（有真 bot 时手动）：卡片开通 + `doc search` 或 `calendar` 列表。CI 不依赖腾讯账号。

---

## 11. 参考链接

- <https://github.com/WecomTeam/wecom-cli>
- <https://github.com/WecomTeam/wecom-unified>（Skill 套件，Cursor 用，DSH 不装这个当运行时）
- <https://github.com/WecomTeam/wecom-openclaw-plugin>（OpenClaw：通道 + 内置 CLI；我们只偷「CLI 给 Agent」这一截）
- IM 企微：`plugins/im/src/host/channels/wecom/production.ts`、`plugins/im/src/channels/wecom/config-store.ts`
- IM 卡片办公区：`plugins/im/src/client/channels/wecom/`
- 工具注册：plain tool object 挂 `ctx.tools`，不要 value-import `dsh-tools`。
