# 附录 A：第一刀 wecom-cli 命令合同

实测环境（2026-08-27）：

```text
wecom-cli 1.2.0 (wecom 2026-08-25T10:23:42Z 78c514b)
wecom-cli auth show --status  →  authorized
```

实现必须按下列 argv 组装。服务端 discovery 若增删 flag，以本机 `--help` 为准并改本附录；**不得**在代码里另猜一套子命令。

所有调用：

```text
env WECOM_CLI_CONFIG_DIR=<configDir>
<cliPath> <args...>
```

stdout = JSON（失败时亦然，见 CLI 错误格式）。超时 = `callTimeoutMs`。

时间字段格式与 CLI 帮助一致：`YYYY-MM-DD HH:mm:ss`（会议/文档）；日程 list/search 的 `--begin-time` / `--end-time` 帮助未写死格式，第一刀与会议相同传该字符串。

---

## A.1 探测与授权

| 用途 | argv |
| :-- | :-- |
| 版本 | `--version` |
| 是否已授权 | `auth show --status` → stdout 单行 `authorized` / `unauthorized` |
| 静默写入凭据（stderr 非 TTY） | `auth init --bot-id <remoteBotId> --secret <secret>` |

`--bot-id` / `--secret` 为 CLI hidden flags。仅 Host spawn（非 TTY）使用。Secret 不写日志。

---

## A.2 第一刀工具 → argv

工具 `execute` 把用户参数编成 `--json '<object>'`（优先）或等价 named flags。下列 JSON 键名与 CLI flag 的 kebab-case 对应关系：CLI 收 JSON body 时用其 schema 字段；第一刀 **一律 `--json`**，避免 flag 与 JSON 混用。

若 `--json` 字段名与 `--help` 不完全一致，以 `wecom-cli <cmd> --schema` 为准改本表一行。下面是 1.2.0 `--help` 能确定的调用面。

| PRD 工具 | argv | `--json` 最小体 | 备注 |
| :-- | :-- | :-- | :-- |
| `wecom_calendar_list` | `calendar schedules list --json '...'` | `{}` 或 `{ "begin_time", "end_time" }` | 都不传则 CLI 默认当前时间～+30 天 |
| `wecom_calendar_search` | `calendar schedules search --json '...'` | 至少 `keywords` / `organizer` / `has_attendees` 之一 | 建议 `{ "keywords": ["周会"] }` |
| `wecom_doc_search` | `doc search --json '...'` | `{ "keywords": ["周报"] }` | `keywords` 必填 |
| `wecom_doc_get` | `doc contents get --json '...'` | `{ "docid": "<id-or-url>" }` | 可选 `content_type`，默认 markdown |
| `wecom_meeting_list` | `meeting list --json '...'` | `{}` 或 `{ "begin_time", "end_time", "limit" }` | 时间都不传则默认当前～+30 天 |
| `wecom_contact_search` | `contact users search --json '...'` | `{ "keywords": ["张三"] }` | |

`--json` 的精确属性名（snake vs 别的）以各命令 `--schema` 为准。实现时在 `cli.ts` 旁用注释写上一次成功的 schema 字段；单测只锁 argv 前缀（`calendar schedules list` 等），不锁企业数据。

### 工具参数（给模型的 JSON Schema，第一刀从简）

`wecom_calendar_list`

- `begin_time` string 可选  
- `end_time` string 可选  

`wecom_calendar_search`

- `keywords` string[] 可选  
- `begin_time` / `end_time` 可选  
至少要能填 `keywords`（实现里若三者皆空则返回参数错误，不要打 CLI）。

`wecom_doc_search`

- `keywords` string[] **必填**  
- `limit` integer 可选，默认 10  

`wecom_doc_get`

- `docid` string **必填**（文档 id 或 url）  
- `content_type` string 可选  

`wecom_meeting_list`

- `begin_time` / `end_time` / `limit` 可选  

`wecom_contact_search`

- `keywords` string[] **必填**  

`wecom_doc_create` → `doc create`；JSON 至少 `{ "doc_name" }`，`doc_type` 为 `doc` / `sheet` / `smartsheet`。  
`wecom_doc_append` → `doc contents append`。  
`wecom_doc_overwrite` → `doc contents overwrite`。  
`wecom_doc_rename` → `doc names update`。  
`wecom_sheet_get` → `sheet get`。  
`wecom_sheet_read` → `sheet ranges get`。  
`wecom_sheet_write` → `sheet contents update`。  
`wecom_sheet_append_row` → `sheet rows append`。  
`wecom_smartsheet_get` → `smartsheet get`。  
`wecom_smartsheet_records_list` → `smartsheet records list`。  
`wecom_smartsheet_records_add` → `smartsheet records add`。  
`wecom_smartsheet_records_update` → `smartsheet records update`。  
`wecom_docs_run` → `<service> <method path…> --json`，method 白名单见 `src/cli-methods.ts`。

---

## A.3 明确仍不调用的命令

无。`wecom-cli` 叶子命令除 `auth` 外均在具名工具或 `wecom_run` 白名单中。写操作受当前办公机器人卡片「允许修改企业微信数据」开关约束。
