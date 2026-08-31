# 实现说明：腾讯文档智能排版（dsh-wecom-office 第一刀）

| 项 | 内容 |
| :-- | :-- |
| 读者 | 未参加过前面讨论的开发者 |
| 产品 | [ai-document-delivery-prd.zh.md](./ai-document-delivery-prd.zh.md) |
| 排版标准 | [tencent-doc-layout-standard.zh.md](./tencent-doc-layout-standard.zh.md) |
| 现有插件方案 | [technical.zh.md](./technical.zh.md) |
| 试验结论 | markdown 创建会解析成标题/列表/真表；text 不会；节点编辑不当主路 |
| 状态 | 按本文即可开发；未完成前不要扩 scope |

**目标：** 对话里「做成文档」交出去的腾讯文档，打开是标题/段落/列表/表，不是聊天稿。  
**手段：** 仍 spawn `wecom-cli`。模型负责去向和正文；插件强制 `content_type=markdown` 并做纪律检查。  
**不做：** 新插件、渲染库、`doc_requests`、默认智能文档、设置页改版。

仓库约定：不改 `deepseek-harness`；可测逻辑不依赖 Cordis；不 value-import `@deepseek-ai/dsh-tools`；超时和开关走现有 `Config`。

---

## 0. 开工前读什么

必读：

1. 本文全文
2. 排版标准第 2、4 节
3. `src/tools.ts` 里 `wecom_doc_create` / `overwrite` / `append` 与 `executeOfficeTool`
4. `src/guidance.ts`
5. `src/errors.ts`
6. `tests/tools.test.ts` 中 `creates a document through doc create argv`
7. `tests/guidance.test.ts`

不必改：`cli.ts` spawn、`auth.ts`、设置页、`cli-methods.ts` 白名单。

工作目录：`plugins/wecom-office/`。命令在仓库根：

```bash
pnpm --filter dsh-wecom-office test
pnpm --filter dsh-wecom-office build
```

沙箱验证（改完代码后）：`pnpm dev` 挂 `.dsh-home` 端口 3081，设置里办公已开通且允许修改。

---

## 1. 要改哪些文件

| 路径 | 动作 |
| :-- | :-- |
| `src/doc-layout.ts` | **新建** 纪律检查 |
| `src/errors.ts` | 增加错误码 `layout-rejected` |
| `src/tools.ts` | create / overwrite / append 的 description、`buildJson` |
| `src/guidance.ts` | 增加文档编排段落 |
| `tests/doc-layout.test.ts` | **新建** |
| `tests/tools.test.ts` | 改现有 create 用例 + 新增 |
| `tests/guidance.test.ts` | 断言新段落存在 |

不要改 `package.json` 依赖。不要 bump 版本。

---

## 2. 错误码

`src/errors.ts`：

```ts
export type OfficeErrorCode =
  | /* 现有不变 */
  | "layout-rejected";
```

`USER_MESSAGES`：

```ts
"layout-rejected": "正文不符合腾讯文档排版纪律，请按系统提示改写后再创建。",
```

`OfficeError` 构造：`new OfficeError("layout-rejected", 具体原因)`。  
`具体原因` 用下面 §3.3 的中文句子，让模型能改稿。`execute` 里现有逻辑会 `throw new Error(error.message)`，模型看到的是 `message`，所以 message 必须可执行，不要只写错误码。

---

## 3. `src/doc-layout.ts`（纯函数，无 Cordis、无 spawn）

### 3.1 导出

```ts
export type DocLayoutIssue = {
  code:
    | "chat-opening"
    | "title-duplicate"
    | "heading-too-deep"
    | "heading-exhibition"
    | "task-list"
    | "content-type-text";
  message: string;
};

/** 有 content 的 Word 文档写入前调用。通过则返回；失败 throw OfficeError("layout-rejected", message) */
export function assertDocMarkdownLayout(content: string, docName: string): void;

export function findDocLayoutIssues(content: string, docName: string): DocLayoutIssue[];

/** doc_type 空或 doc 视为 Word 在线文档 */
export function isWordDocType(docType: string | undefined): boolean;

export function rejectNonMarkdownContentType(contentType: string | undefined): void;
```

`isWordDocType`：`docType === undefined || docType.trim() === "" || docType === "doc"`。  
`sheet` / `smartsheet` **不做** markdown 纪律检查，也不强制 `content_type`。

`rejectNonMarkdownContentType`：若 `contentType` 有值且不等于 `markdown`（大小写不敏感，先 trim 再 toLowerCase），throw：

```text
Word 文档正文必须使用 content_type=markdown，不要传 text。纯文本不会变成标题和表格。
```

`code` 为 `content-type-text`。

### 3.2 `findDocLayoutIssues` 规则（按顺序，可返回多条；`assert` 用第一条 throw）

规范化：`content` 不要 trim 掉内部换行。检测用全文。

**chat-opening**  
全文去掉 BOM 后，跳过开头空行，第一行（trim 后）匹配（不区分大小写）：

- `/^(好的|好的[，,。]|嗯|嗯[，,]|我来整理|我来写|以下是|下面是文档|当然|没问题)/`

不含「以下是步骤」这种在章节里的句子——只查**第一行**。

message：`正文不要用对话开场（例如「好的，我来整理」）。直接写文档内容。`

**title-duplicate**  
用 `/^#{1,6}\s+(\S.*)$/m` 找**第一个** ATX 标题。将标题文本与 `docName` 都去掉首尾空白、再去掉所有空白字符后比较。相同则失败。

无 ATX 标题 → 不报（短文放行）。

message：`文档名已经在腾讯文档页眉。正文不要再用同名一级标题重复一遍。从章节或第一段开始写。`

**heading-too-deep**  
存在 `/^#{4,}\s/m`。

message：`章节最多用 ## 和 ###。不要使用四级及更深标题。`

**heading-exhibition**  
任一 ATX 标题文本 trim 后匹配 `/^标题\s*[一二三四五六1-6]$/`。

message：`标题里写章节在讲什么，不要写「标题一」「标题二」。`

**task-list**  
存在 `/^\s*[-*]\s+\[[ xX]\]/m`。

message：`不要用 - [ ] 任务列表。腾讯文档这条通道不会变成待办勾选。改成普通列表或表格。`

第一刀**不要**做：自动改稿、字数下限、表格比例、检测 `**` 残留（那是 text 通道的问题，本通道会解析）。

### 3.3 `assertDocMarkdownLayout`

```
const issues = findDocLayoutIssues(content, docName);
if (issues.length) throw new OfficeError("layout-rejected", issues[0]!.message);
```

---

## 4. `src/tools.ts`

### 4.1 `wecom_doc_create`

**description** 改为（整段替换，供模型阅读）：

```text
新建腾讯文档/在线表格/智能表格。用户说做成文档、介绍、给机构、给开发者时用这个。不要用终端 wecom-cli，不要用 wecom_doc_append 拼正式文档。
doc_type: doc（Word，默认）/ sheet / smartsheet。未指定类型时用 doc，不要改用智能文档。
Word（doc）若带 content：必须是 markdown，插件会写入 content_type=markdown；禁止 content_type=text。正文遵守排版纪律：页眉已是题目、章节最多 ##/###、不要对话开场、不要任务列表。
sheet 用 grid_data；smartsheet 用 fields。
```

**parameters.content_type description：** `Word 文档仅允许 markdown。不要传 text。省略则 Word 在有 content 时自动 markdown。`

**buildJson 在现有赋值之后、`return json` 之前增加：**

```ts
const word = isWordDocType(docType);
if (word && content) {
  rejectNonMarkdownContentType(contentType);
  assertDocMarkdownLayout(content, String(json.doc_name));
  json.content_type = "markdown";
}
```

无 `content`：行为与现在相同（只建标题，不设 content_type）。

`doc_type=sheet|smartsheet` 且带了 `content`：第一刀不检查、不改 content_type（避免误伤）。guidance 应引导 sheet 走 grid_data 而不是 content。

### 4.2 `wecom_doc_overwrite`

**description：**

```text
覆盖 Word 文档全部内容。需要 docid 和 content。正式文档必须 markdown；禁止 content_type=text。不要用来静默覆盖别人已评论的文档，除非用户明确说覆盖。
```

**buildJson：** 有 `content` 时同样 `rejectNonMarkdownContentType` + `assertDocMarkdownLayout(content, docid)`（overwrite 没有新标题时，`docName` 用空字符串，则 **跳过 title-duplicate**——在 `findDocLayoutIssues` 里若 `docName.trim()===''` 不跑 title-duplicate）。

有 content 则 `json.content_type = "markdown"`。

### 4.3 `wecom_doc_append`

**description** 改为：

```text
在 Word 文档末尾追加纯文本。不能用来生成正式排版文档。正式文档用 wecom_doc_create 或 overwrite + markdown。
```

逻辑不改。

### 4.4 成功返回

第一刀**保持** `formatCliOutput(result)` 现状（CLI JSON 里已有 url/docid）。不要在 tools.ts 滤掉 content。靠 guidance 要求模型不要把全文贴回聊天。

---

## 5. `src/guidance.ts`

在 `write` 变量之后、`return [` 的数组里，于 `"- docs: ..."` 行**之后**插入下面整段（英文外壳保持现有风格，文档纪律用中文，与工具 description 一致）。

在 `officeGuidanceText` 中构造：

```ts
const docsLayout = [
  "When the user wants 做成文档/介绍/给机构/给开发者/发群对齐: first decide 给谁 and 拿去做什么. If missing, ask one short question. Do not show a template picker.",
  "载体: 长说明 → wecom_doc_create doc_type=doc; 一张格子表 → doc_type=sheet + grid_data; 台账筛选 → smartsheet. Default is doc. Do not default to smartpage.",
  "Word 正文 must be markdown. Never content_type=text. Never wecom_doc_append for a full deliverable.",
  "排版: 页眉已是题目，正文不要再用同名 # 标题; 章节最多 ## 和 ###; 能成段就成段; 短并列才列表; 行列才表; 加粗只给关键词; 不要 - [x]; 不要「好的我来整理」。",
  "On success tell the user the url, 给谁, and 主张. Do not paste the full document back into chat. Do not silently overwrite a doc the user did not ask to replace.",
  "Missing facts: mark 待确认. Do not invent APIs, dates, or org names.",
].join("\n");
```

仅当 `config.allowWrite` 为 true 时加入 `docsLayout`（只读时不必教创建纪律）。未授权或 `guidance===false` 仍返回 `""`。

把 `docsLayout` 插在 docs 工具那一行后面。

---

## 6. 单测

### 6.1 `tests/doc-layout.test.ts`（新建）

用 vitest，`import { expect, it } from "vitest"`。

| 用例 | 输入 | 期望 |
| :-- | :-- | :-- |
| 合格介绍 | `docName=项目介绍`，正文从段落开始，有 `## 这是什么`、列表、无对话腔 | `findDocLayoutIssues` 为空；`assert` 不 throw |
| 对话腔 | 第一行 `好的，我来整理一份文档` | 含 `chat-opening` |
| 题目重复 | `docName=排版试验`，正文 `# 排版试验\n\n一段` | 含 `title-duplicate` |
| 题目重复忽略空白 | `docName=排版 试验`，`# 排版试验` | 含 `title-duplicate` |
| 无标题短文 | `hello`，`docName=周报` | 通过 |
| 四级标题 | `## a\n#### b` | 含 `heading-too-deep` |
| 展览标题 | `## 标题一` | 含 `heading-exhibition` |
| 任务列表 | `- [x] 完成` | 含 `task-list` |
| text 类型 | `rejectNonMarkdownContentType("text")` | throw `layout-rejected` |
| markdown 类型 | `rejectNonMarkdownContentType("markdown")` | 不 throw |
| 省略类型 | `rejectNonMarkdownContentType(undefined)` | 不 throw |
| isWordDocType | `undefined`/`""`/`doc` true；`sheet` false |

合格样例不要用「好的」开头。可从 `docs/layout-trials/standard-intro.md` 抄一段进测试字符串（文件 IO 也行，但单测更稳是内联短字符串）。

### 6.2 `tests/tools.test.ts`

**改** `creates a document through doc create argv`：

- 入参 `content` 改为不含对话腔的短正文，例如 `"第一段说明。\n\n## 范围\n\n- 仅文档\n"`，`doc_name: "周报"`（与第一标题「范围」不同）。
- 期望 `json` 含 `content_type: "markdown"` 且含该 `content`。

**新增：**

1. `refuses text content_type for word docs`：`content_type: "text", content: "一段正文"` → reject `layout-rejected`，spawn 除 auth 外不应跑到 `doc create`（可记 calls，长度在 auth 后停止）。
2. `refuses chat opening before spawn`：content 以 `好的，我来整理` 开头 → `layout-rejected`。
3. `sheet create still allows content without markdown lock`：`doc_type: "sheet", doc_name: "表", grid_data: { start_row: 0, start_column: 0, rows: [] }` 不 throw；json 无强制 markdown（没有 content 即可）。

mock spawn 模式与现有用例相同（auth 返回 `authorized\n`）。

### 6.3 `tests/guidance.test.ts`

授权且默认 settings 下：

```
expect(text).toContain("content_type=markdown");
expect(text).toContain("不要默认 to smartpage"); // 按你实际写入的英文/中文改断言，必须与 guidance 原文一致
```

请按 §5 实际字符串断言，例如 `toContain("Never content_type=text")` 与 `toContain("Default is doc")`。

`allowWrite: false` 时**不要**包含 `Never content_type=text`（只读不教创建）。

---

## 7. 实现顺序（按 commit 也可合成一个）

1. `errors.ts` 加码  
2. `doc-layout.ts` + `doc-layout.test.ts`，测到绿  
3. `tools.ts` create/overwrite/append + 改 tools.test.ts，测到绿  
4. `guidance.ts` + guidance.test.ts，测到绿  
5. `pnpm --filter dsh-wecom-office test` 全绿  
6. `pnpm --filter dsh-wecom-office build`  

不要改 `versions.json`。不要 `npm publish`。

---

## 8. 沙箱验收（开发者自己点）

前提：`pnpm dev`，企业微信机器人卡片上办公已开通，允许修改开。

对话（同一会话，同一项目事实）：

1. 「做成一份给第三方机构看的介绍」→ 应创建 Word 文档，返回链接。打开：无 `#` 字符墙、无「好的我来整理」、题目未在正文重复。  
2. 「再给开发者做一份」→ 另一份链接，章节应更像如何跑/约束，而不是对外宣传。  
3. 「做成文档」且未说给谁 → 应先问一句给谁，或声明读者后再建。  
4. 若模型仍传 text：工具应失败并出现 markdown 纪律说明，不应生成纯文本墙。

打开对照产品验收（排版标准 §4）。API 成功不算通过。

---

## 9. 明确不要做

- 不要在 `buildJson` 里静默把 `text` 改成 `markdown`  
- 不要自动删除重复 `# 标题`  
- 不要实现 `doc_requests`、docx 库、smartpage 具名工具  
- 不要把 `doc-layout` 接到 sheet/smartsheet  
- 不要新增设置项（第一刀用现有 allowWrite / guidance 开关）

---

## 10. 第二刀（本文不实施）

sheet 表头检查；`wecom_smartpage_import` 具名工具；读回 ooxml 抽检。未改 PRD 前不要做。

---

**完成定义：** §6 单测全绿 + §8 至少第 1、4 条在沙箱打开验证。届时再把本文状态改为「第一刀已实现」。
