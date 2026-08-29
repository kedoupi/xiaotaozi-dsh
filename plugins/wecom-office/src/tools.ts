import { formatCliOutput, runWecomCli, TOOL_ARGV, type CliRunOptions, type CliRunResult } from "./cli.ts";
import { resolveCliMethod, resolveDocsMethod } from "./cli-methods.ts";
import { OfficeError, USER_MESSAGES } from "./errors.ts";
import { TOOL_SERVICE, WRITE_TOOLS, type OfficeToolName } from "./names.ts";
import { resolveConfigDir, type WecomOfficeSettings } from "./settings.ts";
import { authStatus } from "./auth.ts";
import { pluginTrace } from "./trace.ts";
import { MORE_SPECS } from "./tools-more.ts";
import {
  intArg,
  jsonArray,
  jsonObject,
  parsedJson,
  requireString,
  stringArg,
  stringArray,
  type ToolSpec,
} from "./tools-args.ts";
import {
  assertDocMarkdownLayout,
  isWordDocType,
  rejectNonMarkdownContentType,
} from "./doc-layout.ts";

type ToolHost = { tools: { register(tool: unknown): void } };

const CORE_SPECS: readonly ToolSpec[] = [
  {
    name: "wecom_calendar_list",
    description: "查询企业微信日程（今天下午/今天/本周有哪些会、安排）。tool name 是 wecom_calendar_list，不是 calendar.schedules.list，也不要用终端跑 wecom-cli。可选 begin_time/end_time（YYYY-MM-DD HH:mm:ss）；都不传则默认现在到 +30 天。",
    parameters: {
      type: "object",
      properties: {
        begin_time: { type: "string", description: "Range start, YYYY-MM-DD HH:mm:ss" },
        end_time: { type: "string", description: "Range end, YYYY-MM-DD HH:mm:ss" },
      },
    },
    buildJson: (args) => {
      const json: Record<string, unknown> = {};
      const begin = stringArg(args, "begin_time");
      const end = stringArg(args, "end_time");
      if (begin) json.begin_time = begin;
      if (end) json.end_time = end;
      return json;
    },
  },
  {
    name: "wecom_calendar_search",
    description: "按关键词搜索企业微信日程（找某场周会/面试）。tool name 是 wecom_calendar_search。keywords 为字符串数组，例如 [\"周会\"]。",
    parameters: {
      type: "object",
      properties: {
        keywords: { type: "array", items: { type: "string" }, description: "Search keywords (required unless you also implement organizer/attendees)." },
        begin_time: { type: "string", description: "Optional start, YYYY-MM-DD HH:mm:ss" },
        end_time: { type: "string", description: "Optional end, YYYY-MM-DD HH:mm:ss" },
      },
    },
    buildJson: (args) => {
      const keywords = stringArray(args, "keywords");
      if (!keywords) throw new OfficeError("invalid-args", "wecom_calendar_search 需要 keywords。");
      const json: Record<string, unknown> = { keywords };
      const begin = stringArg(args, "begin_time");
      const end = stringArg(args, "end_time");
      if (begin) json.begin_time = begin;
      if (end) json.end_time = end;
      return json;
    },
  },
  {
    name: "wecom_doc_search",
    description: "按关键词搜索企业微信文档（找周报/方案）。tool name 是 wecom_doc_search，不是 doc.search。keywords 为字符串数组。",
    parameters: {
      type: "object",
      properties: {
        keywords: { type: "array", items: { type: "string" }, description: "Keywords" },
        limit: { type: "integer", description: "Max docs, default 10" },
      },
      required: ["keywords"],
    },
    buildJson: (args) => {
      const keywords = stringArray(args, "keywords");
      if (!keywords) throw new OfficeError("invalid-args", "wecom_doc_search 需要 keywords。");
      const json: Record<string, unknown> = { keywords };
      const limit = intArg(args, "limit");
      if (limit !== undefined) json.limit = limit;
      return json;
    },
  },
  {
    name: "wecom_doc_get",
    description: "读取企业微信 Word 文档正文。tool name 是 wecom_doc_get。docid 可以是文档 id 或 url；content_type 可选 text/markdown/ooxml，默认 markdown。",
    parameters: {
      type: "object",
      properties: {
        docid: { type: "string", description: "Document id or url" },
        content_type: { type: "string", description: "text | markdown | ooxml" },
      },
      required: ["docid"],
    },
    buildJson: (args) => {
      const docid = stringArg(args, "docid");
      if (!docid) throw new OfficeError("invalid-args", "wecom_doc_get 需要 docid。");
      const json: Record<string, unknown> = { docid };
      const contentType = stringArg(args, "content_type");
      if (contentType) json.content_type = contentType;
      return json;
    },
  },
  {
    name: "wecom_doc_create",
    description: "新建腾讯文档/在线表格/智能表格。用户说做成文档、介绍、给机构、给开发者时用这个。不要用终端 wecom-cli，不要用 wecom_doc_append 拼正式文档。\ndoc_type: doc（Word，默认）/ sheet / smartsheet。未指定类型时用 doc，不要改用智能文档。\nWord（doc）若带 content：必须是 markdown，插件会写入 content_type=markdown；禁止 content_type=text。正文遵守排版纪律：页眉已是题目、章节最多 ##/###、不要对话开场、不要任务列表。\nsheet 用 grid_data；smartsheet 用 fields。",
    parameters: {
      type: "object",
      properties: {
        doc_name: { type: "string", description: "标题，必填" },
        doc_type: { type: "string", description: "doc | sheet | smartsheet，默认 doc" },
        content: { type: "string", description: "doc 的初始正文" },
        content_type: { type: "string", description: "Word 文档仅允许 markdown。不要传 text。省略则 Word 在有 content 时自动 markdown。" },
        sheet_title: { type: "string", description: "smartsheet 默认子表名" },
        fields: { type: "array", description: "smartsheet 初始字段" },
        grid_data: { type: "object", description: "sheet 初始表格数据" },
      },
      required: ["doc_name"],
    },
    buildJson: (args) => {
      const json: Record<string, unknown> = { doc_name: requireString(args, "doc_name", "wecom_doc_create") };
      const docType = stringArg(args, "doc_type");
      const content = stringArg(args, "content");
      const contentType = stringArg(args, "content_type");
      const sheetTitle = stringArg(args, "sheet_title");
      const fields = jsonArray(args, "fields");
      const grid = jsonObject(args, "grid_data");
      if (docType) json.doc_type = docType;
      if (content) json.content = content;
      if (contentType) json.content_type = contentType;
      if (sheetTitle) json.sheet_title = sheetTitle;
      if (fields) json.fields = fields;
      if (grid) json.grid_data = grid;
      const word = isWordDocType(docType);
      if (word && content) {
        rejectNonMarkdownContentType(contentType);
        assertDocMarkdownLayout(content, String(json.doc_name));
        json.content_type = "markdown";
      }
      return json;
    },
  },
  {
    name: "wecom_doc_append",
    description: "在 Word 文档末尾追加纯文本。不能用来生成正式排版文档。正式文档用 wecom_doc_create 或 overwrite + markdown。",
    parameters: {
      type: "object",
      properties: {
        docid: { type: "string" },
        content: { type: "string" },
      },
      required: ["docid", "content"],
    },
    buildJson: (args) => ({
      docid: requireString(args, "docid", "wecom_doc_append"),
      content: requireString(args, "content", "wecom_doc_append"),
    }),
  },
  {
    name: "wecom_doc_overwrite",
    description: "覆盖 Word 文档全部内容。需要 docid 和 content。正式文档必须 markdown；禁止 content_type=text。不要用来静默覆盖别人已评论的文档，除非用户明确说覆盖。",
    parameters: {
      type: "object",
      properties: {
        docid: { type: "string" },
        content: { type: "string" },
        content_type: { type: "string", description: "Word 文档仅允许 markdown。不要传 text。" },
      },
      required: ["docid"],
    },
    buildJson: (args) => {
      const json: Record<string, unknown> = { docid: requireString(args, "docid", "wecom_doc_overwrite") };
      const content = stringArg(args, "content");
      const contentType = stringArg(args, "content_type");
      if (content) json.content = content;
      if (contentType) json.content_type = contentType;
      if (content) {
        rejectNonMarkdownContentType(contentType);
        assertDocMarkdownLayout(content, "");
        json.content_type = "markdown";
      }
      return json;
    },
  },
  {
    name: "wecom_doc_rename",
    description: "重命名腾讯文档/表格标题。需要 docid 和 new_name。",
    parameters: {
      type: "object",
      properties: {
        docid: { type: "string" },
        new_name: { type: "string" },
      },
      required: ["docid", "new_name"],
    },
    buildJson: (args) => ({
      docid: requireString(args, "docid", "wecom_doc_rename"),
      new_name: requireString(args, "new_name", "wecom_doc_rename"),
    }),
  },
  {
    name: "wecom_sheet_get",
    description: "读取在线表格基本信息（工作表 id、行列数）。需要 docid。",
    parameters: {
      type: "object",
      properties: { docid: { type: "string" } },
      required: ["docid"],
    },
    buildJson: (args) => ({ docid: requireString(args, "docid", "wecom_sheet_get") }),
  },
  {
    name: "wecom_sheet_read",
    description: "读取在线表格单元格。需要 docid 和 sheet_id；range 为 A1 表示法，不传则整表。",
    parameters: {
      type: "object",
      properties: {
        docid: { type: "string" },
        sheet_id: { type: "string" },
        range: { type: "string" },
        mode: { type: "string", description: "csv | default" },
      },
      required: ["docid", "sheet_id"],
    },
    buildJson: (args) => {
      const json: Record<string, unknown> = {
        docid: requireString(args, "docid", "wecom_sheet_read"),
        sheet_id: requireString(args, "sheet_id", "wecom_sheet_read"),
      };
      const range = stringArg(args, "range");
      const mode = stringArg(args, "mode");
      if (range) json.range = range;
      if (mode) json.mode = mode;
      return json;
    },
  },
  {
    name: "wecom_sheet_write",
    description: "写入在线表格指定范围。需要 docid、sheet_id、grid_data。",
    parameters: {
      type: "object",
      properties: {
        docid: { type: "string" },
        sheet_id: { type: "string" },
        grid_data: { type: "object" },
      },
      required: ["docid", "sheet_id", "grid_data"],
    },
    buildJson: (args) => {
      const grid = jsonObject(args, "grid_data");
      if (!grid) throw new OfficeError("invalid-args", "wecom_sheet_write 需要 grid_data。");
      return {
        docid: requireString(args, "docid", "wecom_sheet_write"),
        sheet_id: requireString(args, "sheet_id", "wecom_sheet_write"),
        grid_data: grid,
      };
    },
  },
  {
    name: "wecom_sheet_append_row",
    description: "在线表格末尾追加一行。需要 docid、sheet_id、row。",
    parameters: {
      type: "object",
      properties: {
        docid: { type: "string" },
        sheet_id: { type: "string" },
        row: { type: "object" },
      },
      required: ["docid", "sheet_id", "row"],
    },
    buildJson: (args) => {
      const row = jsonObject(args, "row");
      if (!row) throw new OfficeError("invalid-args", "wecom_sheet_append_row 需要 row。");
      return {
        docid: requireString(args, "docid", "wecom_sheet_append_row"),
        sheet_id: requireString(args, "sheet_id", "wecom_sheet_append_row"),
        row,
      };
    },
  },
  {
    name: "wecom_smartsheet_get",
    description: "读取智能表格基本信息（子表 id、列）。需要 docid。",
    parameters: {
      type: "object",
      properties: { docid: { type: "string" } },
      required: ["docid"],
    },
    buildJson: (args) => ({ docid: requireString(args, "docid", "wecom_smartsheet_get") }),
  },
  {
    name: "wecom_smartsheet_records_list",
    description: "读取智能表格记录。需要 docid；可用 sheet_id / limit / cursor。",
    parameters: {
      type: "object",
      properties: {
        docid: { type: "string" },
        sheet_id: { type: "string" },
        sheet_title: { type: "string" },
        limit: { type: "integer" },
        cursor: { type: "string" },
      },
      required: ["docid"],
    },
    buildJson: (args) => {
      const json: Record<string, unknown> = { docid: requireString(args, "docid", "wecom_smartsheet_records_list") };
      const sheetId = stringArg(args, "sheet_id");
      const sheetTitle = stringArg(args, "sheet_title");
      const cursor = stringArg(args, "cursor");
      const limit = intArg(args, "limit");
      if (sheetId) json.sheet_id = sheetId;
      if (sheetTitle) json.sheet_title = sheetTitle;
      if (cursor) json.cursor = cursor;
      if (limit !== undefined) json.limit = limit;
      return json;
    },
  },
  {
    name: "wecom_smartsheet_records_add",
    description: "智能表格新增行。需要 docid 和 records 数组。",
    parameters: {
      type: "object",
      properties: {
        docid: { type: "string" },
        records: { type: "array" },
        sheet_id: { type: "string" },
        sheet_title: { type: "string" },
        key_type: { type: "string" },
      },
      required: ["docid", "records"],
    },
    buildJson: (args) => {
      const records = jsonArray(args, "records");
      if (!records) throw new OfficeError("invalid-args", "wecom_smartsheet_records_add 需要 records。");
      const json: Record<string, unknown> = {
        docid: requireString(args, "docid", "wecom_smartsheet_records_add"),
        records,
      };
      const sheetId = stringArg(args, "sheet_id");
      const sheetTitle = stringArg(args, "sheet_title");
      const keyType = stringArg(args, "key_type");
      if (sheetId) json.sheet_id = sheetId;
      if (sheetTitle) json.sheet_title = sheetTitle;
      if (keyType) json.key_type = keyType;
      return json;
    },
  },
  {
    name: "wecom_smartsheet_records_update",
    description: "智能表格更新/删除行。需要 docid 和 records。",
    parameters: {
      type: "object",
      properties: {
        docid: { type: "string" },
        records: { type: "array" },
        sheet_id: { type: "string" },
        type: { type: "string", description: "update | delete，默认 update" },
      },
      required: ["docid", "records"],
    },
    buildJson: (args) => {
      const records = jsonArray(args, "records");
      if (!records) throw new OfficeError("invalid-args", "wecom_smartsheet_records_update 需要 records。");
      const json: Record<string, unknown> = {
        docid: requireString(args, "docid", "wecom_smartsheet_records_update"),
        records,
      };
      const sheetId = stringArg(args, "sheet_id");
      const type = stringArg(args, "type");
      if (sheetId) json.sheet_id = sheetId;
      if (type) json.type = type;
      return json;
    },
  },
  {
    name: "wecom_docs_run",
    description: "企业微信文档全家桶兜底：权限、导入、子表、字段、视图、图表、智能文档页面等。service=doc|sheet|smartsheet|smartpage，method 用点号路径（如 contents.append、records.add、pages.get、fields.list），json 为请求体。高频操作请优先用 wecom_doc_create / wecom_sheet_* / wecom_smartsheet_*。",
    parameters: {
      type: "object",
      properties: {
        service: { type: "string", description: "doc | sheet | smartsheet | smartpage" },
        method: { type: "string", description: "例如 create、contents.append、ranges.get、records.add" },
        json: { type: "object", description: "CLI --json 请求体" },
      },
      required: ["service", "method"],
    },
    buildJson: (args) => {
      if (args.json !== undefined) {
        const parsed = parsedJson(args.json);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      }
      const json: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(args)) {
        if (key === "service" || key === "method" || key === "json") continue;
        json[key] = parsedJson(value);
      }
      return json;
    },
  },
  {
    name: "wecom_meeting_list",
    description: "查询企业微信在线会议列表（带会议号的会）。tool name 是 wecom_meeting_list，不是 meeting.list。可选 begin_time/end_time/limit。",
    parameters: {
      type: "object",
      properties: {
        begin_time: { type: "string", description: "YYYY-MM-DD HH:mm:ss" },
        end_time: { type: "string", description: "YYYY-MM-DD HH:mm:ss" },
        limit: { type: "integer", description: "Page size, default 20" },
      },
    },
    buildJson: (args) => {
      const json: Record<string, unknown> = {};
      const begin = stringArg(args, "begin_time");
      const end = stringArg(args, "end_time");
      const limit = intArg(args, "limit");
      if (begin) json.begin_time = begin;
      if (end) json.end_time = end;
      if (limit !== undefined) json.limit = limit;
      return json;
    },
  },
  {
    name: "wecom_contact_search",
    description: "按姓名/拼音搜企业微信通讯录。tool name 是 wecom_contact_search。keywords 为字符串数组，例如 [\"张三\"]。",
    parameters: {
      type: "object",
      properties: {
        keywords: { type: "array", items: { type: "string" }, description: "Name / pinyin keywords" },
      },
      required: ["keywords"],
    },
    buildJson: (args) => {
      const keywords = stringArray(args, "keywords");
      if (!keywords) throw new OfficeError("invalid-args", "wecom_contact_search 需要 keywords。");
      return { keywords };
    },
  },
];

const SPECS: readonly ToolSpec[] = [...CORE_SPECS, ...MORE_SPECS];

export async function executeOfficeTool(
  name: OfficeToolName,
  args: Record<string, unknown>,
  settings: WecomOfficeSettings,
  run: (options: CliRunOptions) => Promise<CliRunResult> = runWecomCli,
): Promise<string> {
  const spec = SPECS.find((item) => item.name === name);
  if (!spec) throw new OfficeError("invalid-args", `unknown tool ${name}`);
  const started = Date.now();
  pluginTrace(`tool ${name} start`);
  try {
    const json = spec.buildJson(args);
    const cliOptions = {
      cliPath: settings.cliPath,
      configDir: resolveConfigDir(settings),
      timeoutMs: settings.callTimeoutMs,
    };
    const status = await authStatus({ ...cliOptions, run });
    if (status !== "authorized") throw new OfficeError("unauthorized", USER_MESSAGES.unauthorized);
    let argv: readonly string[];
    let service = TOOL_SERVICE[name];
    let write = WRITE_TOOLS.has(name);
    if (name === "wecom_docs_run" || name === "wecom_run") {
      const runService = stringArg(args, "service");
      const method = stringArg(args, "method");
      if (!runService || !method) throw new OfficeError("invalid-args", `${name} 需要 service 和 method。`);
      const resolved = name === "wecom_run" ? resolveCliMethod(runService, method) : resolveDocsMethod(runService, method);
      argv = resolved.args;
      service = resolved.service;
      write = resolved.write;
    } else {
      argv = TOOL_ARGV[name as keyof typeof TOOL_ARGV];
    }
    if (!settings.enabledServices.includes(service)) {
      throw new OfficeError("service-disabled", USER_MESSAGES["service-disabled"]);
    }
    if (write && !settings.allowWrite) {
      throw new OfficeError("write-disabled", USER_MESSAGES["write-disabled"]);
    }
    const result = await run({
      ...cliOptions,
      args: argv,
      json,
    });
    const text = formatCliOutput(result);
    pluginTrace(`tool ${name} ok ms=${String(Date.now() - started)} chars=${String(text.length)}`);
    return text;
  } catch (error) {
    const code = error instanceof OfficeError ? error.code : "error";
    pluginTrace(`tool ${name} error=${code} ms=${String(Date.now() - started)}`);
    throw error;
  }
}

export function registerOfficeTools(
  ctx: ToolHost,
  resolveSettings: () => WecomOfficeSettings,
): void {
  for (const spec of SPECS) {
    ctx.tools.register({
      name: spec.name,
      description: spec.description,
      parameters: spec.parameters,
      output: {
        schema: { type: "string" },
        render: (_args: unknown, value: string) => [{ type: "text", text: value }],
      },
      async execute(args: Record<string, unknown>) {
        try {
          return await executeOfficeTool(spec.name, args ?? {}, resolveSettings());
        } catch (error) {
          if (error instanceof OfficeError) throw new Error(error.message);
          throw error;
        }
      },
    });
  }
}
