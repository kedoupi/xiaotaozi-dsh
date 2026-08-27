# 技术方案：dsh-wecom-office

| 项 | 内容 |
| :-- | :-- |
| 对应 PRD | [prd.zh.md](./prd.zh.md) **v0.4**（产品主合同） |
| 文档状态 | 第一刀已实现 · 待沙箱安装与真机开通验收 |
| 冲突规则 | 用户可见行为以 PRD 为准；本文只写怎么实现。扩大范围先改 PRD |

实现必须覆盖 PRD **第一刀** 的 FR/NFR。禁止在未改 PRD 的情况下加写工具、飞书或 Desktop 捆绑。

### 需求追溯

| PRD | 本文 |
| :-- | :-- |
| FR-SET-*、§5–8 设置页 | §6 Host、§8 Client |
| FR-IM-* 复用 IM | §4.0、§4.1、§8.1、§8.3 |
| FR-SOLO-* 无 IM 绑定 | §4.0、§8.2、`qr-auth.ts` |
| FR-SW-* 装/卸 IM | §8.3 |
| FR-TOOL-1～5 | §7、[附录 A](./appendix-cli.zh.md) |
| NFR-1～6 | §3、§5、§9、§10 |
| 设置 RPC / QR / imAvailable | [附录 B](./appendix-rpc.zh.md) |

---

## 1. 包身份

| 位置 | 值 |
| :-- | :-- |
| 目录 | `plugins/wecom-office/` |
| `package.json` `name` | `dsh-wecom-office` |
| `cordis.patch.yml` `name` | `dsh-wecom-office` |
| patch `id` / `export const name` | `wecom-office` |
| Git 安装 | `github:kedoupi/xiaotaozi-dsh#path:plugins/wecom-office` |
| 设置页标题 | 企业微信办公 |

四名必须对齐。改名等于目录、包名、patch、`$DSH_HOME/plugins/wecom-office` 一起改。

**kind：mixed。** 需要设置页才能「点一下开通」。host-only 做不到产品主路径。

不要把本包收进 `externals/`。`wecom-cli` 不是 DSH 插件，不满足 fork 门禁。

---

## 2. 架构

```
plugins/wecom-office/
  src/index.ts              # Cordis Host：tools + prompt + 设置 RPC
  src/client/               # 设置页
  src/names.ts              # 稳定 id / 文案常量
  src/cli.ts                # spawn wecom-cli（无 Cordis，单测只打这里）
  src/auth.ts               # 静默 auth init、auth show
  src/im-bridge.ts          # 探测 IM 是否在跑；只读企微 config.json + credentials
  src/qr-auth.ts            # 无 IM 时的官方扫码（与 IM 同 URL，逻辑复制，不 import dsh-im）
  src/tools.ts              # ctx.tools.register 纯对象
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

对标：`dsh-memory`（外面跑二进制，插件注册 tools + 设置页）。差别：memory 跑 `noema-mcp`；本包跑 `wecom-cli`。

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

第一刀：**PATH 解析 + Config `cliPath`**，默认 `wecom-cli`。  
不要把 `@wecom/cli` 的多平台 optionalDependencies 塞进本包：和 `neverBundle` / `check:path` 冲突，也和「不打进桌面 runtime」一致。

探测：`cliPath --version`，超时走 `Config.callTimeoutMs`。失败 = 设置页「未安装 wecom-cli」。

---

## 4. 有没有 IM、账号从哪来

### 4.0 探测「有 IM」（PRD §6）

`imAvailable` **以 [附录 B.3](./appendix-rpc.zh.md) 为准**：Client 看 `[data-im-hub-entry]`。磁盘有 `integrations/dsh-wecom/config.json` **不算**有 IM。

有 IM：绑定 UI = IM；本包只读列表 + `credentials.resolve`。  
无 IM：本包自己扫码/手动；secret 写入 **本包的** secretRef，不要写进 IM 的 `DSH_WECOM_BOT_SECRET_*` 名字空间（避免以后装 IM 抢同一把钥匙）。建议 `DSH_WECOM_OFFICE_BOT_SECRET_<digest>`。

无 IM 第一刀只存 **一只** 办公 bot（overlay `standaloneBot`：`remoteBotId`、显示名、secretRef）。不要复制整份 IM `config.json` 多 bot 库。

---

## 4.1 有 IM 时的磁盘约定（复用）

`dsh-im` 企微生产路径（`plugins/im/src/host/channels/wecom/production.ts`）：

```text
$DSH_HOME/integrations/dsh-wecom/config.json
$DSH_HOME/integrations/dsh-wecom/bots/<botId>/state.json
```

`config.json` bot 形状（只读我们需要的字段）：

| 字段 | 含义 |
| :-- | :-- |
| `botId` | 本地 id，`wecom_` + sha256(remoteBotId) 前 24 hex |
| `remoteBotId` | 腾讯 Bot ID，交给 `wecom-cli --bot-id` |
| `secretRef` | `DSH_WECOM_BOT_SECRET_` + 同一 digest 大写，交给 `ctx.credentials.resolve` |
| `name` | 可选显示名 |

`deriveWecomBotIdentity` 必须能对上，对不上的条目丢弃，当无效。

Secret：`ctx.credentials.resolve(secretRef)`。**禁止** 写入本插件 Config / 设置 overlay / git。

开通流程（有 IM）：

1. 读 IM `config.json` 列出 bots。
2. 用户选中 `botId`。
3. `resolve(secretRef)`；没有 secret → 失败「凭据缺失，请在 IM 里重新绑定」。
4. `WECOM_CLI_CONFIG_DIR=...` spawn `auth init --bot-id --secret`。
5. `auth show --status` 必须为 `authorized`。
6. overlay：`activeBotId` / `selectedBotId`（不含 secret）。

有 IM 时卸掉当前办公那只：删 `credentials.enc` + cache，`activeBotId=""`。  
卸掉整个 IM 但 CLI 仍 authorized：见 PRD §7.5，**不要**清凭据。

开通流程（无 IM，扫码）：

1. Host 调本包 `qr-auth`（URL/TTL 与 `plugins/im/src/channels/wecom/qr-auth.ts` 相同，源码复制，`source` 可用 `dsh-wecom-office`）。
2. poll 字段以 [附录 B.5](./appendix-rpc.zh.md) 为准（`bot_info.botid` + `bot_info.secret`）。
3. `credentials.set(DSH_WECOM_OFFICE_BOT_SECRET_…)`。
4. 立刻 `auth init --bot-id --secret`。
5. 失败则保留 secretRef，设置页「重试开通」。

手动接入：用户提交的 botId+secret 走 3–5，不经过 QR。

`im-bridge.ts` 只做：读 JSON、校验形状、列出摘要（打码 remoteBotId）。不 import `dsh-im`。

IM 是否在线（WebSocket）与 CLI 是否 authorized 分开显示。聊天断了，办公 token 仍可能可用；反过来也成立。

---

## 5. Config

导出 Schemastery `Config`。建议字段：

| 字段 | 默认 | 含义 |
| :-- | :-- | :-- |
| `cliPath` | `wecom-cli` | 可执行文件 |
| `configDir` | `""`（空则 `$DSH_HOME/plugins/wecom-office`） | `WECOM_CLI_CONFIG_DIR` |
| `callTimeoutMs` | `30000` | 单次 spawn 超时 |
| `enabledServices` | `["calendar","doc","meeting","contact"]` | 允许的 CLI service |
| `allowWrite` | `false` | 写方法 |
| `selectedBotId` | `""` | IM 本地 botId |
| `activeBotId` | `""` | 已开通成功的办公身份 |
| `activeIdentity` | `null` | 开通成功时的展示快照（卸 IM 后仍能标出当前一只） |
| `guidance` | `true` | 是否挂 systemPrompt |

超时、路径、开关禁止硬编码在 spawn 调用里。

设置页可写字段走和 memory 类似的 overlay 文件，例如 `$DSH_HOME/plugins/wecom-office/settings.json`。Secret 永不进此文件。

---

## 6. Host 行为

`inject`：`["tools", "credentials"]`。设置 RPC 需要 web 服务时再 `ctx.get("webServer")` / `httpServer`，headless 没有 web 也能注册 tools。

`apply`：

1. 解析 Config + overlay。
2. `registerOfficeTools`。
3. `ctx.inject(["systemPrompt"], …)` 挂 guidance。
4. 注册 `POST /_dsh/dsh-wecom-office/status`，动作与 payload 见 [附录 B](./appendix-rpc.zh.md)。

工具 `execute` 每次：

1. 解析 `cliPath`，不存在则返回结构化错误 `cli-missing`。
2. `auth show --status`，非 `authorized` 则 `unauthorized`。
3. service 不在 `enabledServices` → 拒。
4. 写方法且 `allowWrite === false` → 拒。
5. spawn，stdout JSON 原样或压缩后给模型；非 0 退出把 CLI JSON errcode 放进结果，不要吞成「出错了」。

---

## 7. 工具面

不要把 discovery 全量铺进模型上下文。

### 第一刀具名只读工具

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
其余 doc / sheet / smartsheet / smartpage 走 `wecom_docs_run({ service, method, json })`，method 为点号路径（`contents.append`、`records.add`）。写操作看 Config `allowWrite`（设置页高级可关）。

日程/会议创建仍不做。

### 错误码（给模型和设置页共用）

| code | 含义 |
| :-- | :-- |
| `cli-missing` | PATH 上没有二进制 |
| `unauthorized` | 未开通或凭据失效 |
| `im-bot-missing` | 有 IM 时选中的 bot 不在了 |
| `im-unavailable` | 页面以为有 IM 并要跳转，但浮层不可用 |
| `secret-missing` | credentials 里没有 secret |
| `write-disabled` | 第一刀所有写意图（预留；无写工具时模型不应调到） |
| `service-disabled` | 不在 enabledServices |
| `cli-failed` | CLI 非 0，附带 errcode/errmsg |

---

## 8. Client / 设置页

- `src/client` + `dsh.client.inject`：`runtime`、`locale`、`ui-slots`、`ui-settings`（与 memory 对齐，实现时按实际占用的设置 API 增减）。
- 占用设置 → **企业微信办公**。不要用包名当页名。
- 调 Host 的 loopback 路由拿状态、触发开通。不要在浏览器里读 secret。
- 开通：有 IM 时 Client 只 POST「用这个 IM botId 开通」；Host 从 IM credentials 取 secret。无 IM 时扫码/手动在 Host 收 secret，Client 只拿 QR 图和状态。

IM 卡片入口与自动回跳是 **P2**，第一刀不改 `dsh-im`。

### 8.1 有 IM：去绑定（第一刀）

产品路径 PRD §7.2、[附录 B.4](./appendix-rpc.zh.md)。

- `imAvailable === false` 时无「去绑定」，走无 IM UI。
- 「去绑定」：`document.querySelector('[data-im-hub-entry]')?.click()`，并展示引导文案（用户须再点浮层里的企业微信）。
- 不调用 `openImHub`（该函数不在本包、也不能选中 wecom tab）。
- 不自动关设置、不自动回跳、不自动 `auth init`。

### 8.2 无 IM：本页 QR

产品路径 PRD §7.3。Host 动作 `qrStart` / `qrPoll` / `qrCancel` 见附录 B。QR 协议见附录 B.5。**不** import `dsh-im`。单测 fake fetch。

### 8.3 多机器人状态机

| overlay 字段 | 含义 |
| :-- | :-- |
| `selectedBotId` | 下拉当前选中（有 IM） |
| `activeBotId` | 已对 CLI 开通成功的身份；有 IM 时为 IM `botId`，无 IM 时为 `office_<digest>` |
| `activeIdentity` | 开通成功时写入的展示快照（`source: im \| standalone`）。卸掉 IM 后用来标「IM 已卸，仅办公」 |
| `imAvailable` | 运行时探测结果，不落盘。Host = Client hint OR 已加载的 `im` 插件；磁盘 `config.json` 不算 |

有 IM：`selectedBotId === activeBotId` 且 authorized →「重新开通」；不等 →「开通这只机器人」才覆盖凭据。  
有 IM 且列表找不到 `activeBotId`（卸的是那只 bot，IM 还在）→ 清凭据，`activeBotId=""`。  
IM 整个卸掉且 CLI 仍 authorized → 不清凭据，见 PRD §7.5。

---

## 9. 安全

- Secret 只出现在：DSH credentials → 子进程 argv/env 的极短窗口。优先确认 CLI 是否支持从 stdin / env 读 secret；若必须走 argv，文档化风险，避免打进 logger。
- 日志打码 Bot ID（已有 `maskWecomBotId` 规则可复制，不要 import IM）。
- `configDir` 文件权限 0600（CLI 自己会写 credentials.enc）。
- 设置 RPC 仅 loopback。
- 不把 `credentials.enc` 提交 git；目录在 `$DSH_HOME` 下，本已 gitignore。
- 沙箱要测真开通：只拷 `~/.dsh/.credentials.yaml` 进 `.dsh-home/`，不要拷 sessions。

---

## 10. 测试

只测无 Cordis 文件：

- `im-bridge`：合法/非法 config.json、identity 对不上则丢弃。`imAvailable` 见附录 B.3（Client hint OR 已加载 im 插件），不在此文件里猜。
- `qr-auth`：fake fetch 的 start/poll；非法 auth_url 丢弃。
- `cli`：组装 argv、超时、非 JSON stdout、exit code。
- `auth`：非 TTY 参数；不要在单测里打真网。
- 工具层：service-disabled、unauthorized 短路。
- `office-controller`：有 IM 时开通 standalone（逃生门）、卸 IM 后保留身份、卸当前 IM bot 时清凭据。

e2e（有真 bot 时手动）：`auth init` 静默 + `doc search` 或 `calendar` 列表。CI 不依赖腾讯账号。

---

## 11. 实现顺序（批准本文之后）

1. `Config` + `cli.ts` + 探测 `--version`。
2. `im-bridge.ts`：读 IM config 列表。`imAvailable` 见附录 B.3。
3. `auth.ts` 静默 init / show；`configDir` 隔离。
4. 设置页：有 IM 的选 bot + 开通；无 IM 的 QR/手动。
5. 第一刀只读 tools（附录 A）+ guidance。
6. 有 IM 仅 click 侧栏入口 + 文案（不改 dsh-im）。
7. `pnpm --filter dsh-wecom-office test`、`build`；沙箱 link `dsh-dev` 再 `web`。
8. 真机：有 IM 开通一条；无 IM 扫码开通一条。

不要在第 1–4 步之前铺 14 个 Skill Markdown。官方 Skill 只作 guidance 措辞参考。

---

## 12. 飞书（本包范围外）

飞书官方办公入口是 [`@larksuiteoapi/lark-mcp`](https://github.com/larksuite/lark-openapi-mcp)，不是 CLI。以后 `dsh-feishu-office`：MCP stdio，学 memory，不扩本包运行时。

---

## 13. 参考链接

- <https://github.com/WecomTeam/wecom-cli>
- <https://github.com/WecomTeam/wecom-unified>（Skill 套件，Cursor 用，DSH 不装这个当运行时）
- <https://github.com/WecomTeam/wecom-openclaw-plugin>（OpenClaw：通道 + 内置 CLI；我们只偷「CLI 给 Agent」这一截）
- IM 企微：`plugins/im/src/host/channels/wecom/production.ts`、`plugins/im/src/channels/wecom/config-store.ts`
- 工具注册样例：`plugins/memory/src/tools.ts`、`plugins/memory/src/index.ts`
