import { OfficeError } from "./errors.ts";
import type { ToolSpec } from "./tools-args.ts";
import {
  jsonObject,
  mergeOptional,
  optionalJson,
  requireArray,
  requireString,
  stringArg,
} from "./tools-args.ts";

function str(tool: string, args: Record<string, unknown>, key: string): string {
  return requireString(args, key, tool);
}

export const MORE_SPECS: readonly ToolSpec[] = [
  {
    name: "wecom_calendar_get",
    description: "按日程 ID 查详情。需要 schedule_ids 数组。",
    parameters: {
      type: "object",
      properties: { schedule_ids: { type: "array", items: { type: "string" } } },
      required: ["schedule_ids"],
    },
    buildJson: (args) => ({ schedule_ids: requireArray(args, "schedule_ids", "wecom_calendar_get") }),
  },
  {
    name: "wecom_calendar_create",
    description: "创建日程（不含在线会议链接）。用户说约个会且未明确要腾讯会议时，先确认是日程还是带会议号的会。需要 subject/begin_time/end_time。",
    parameters: {
      type: "object",
      properties: {
        subject: { type: "string" },
        begin_time: { type: "string" },
        end_time: { type: "string" },
        description: { type: "string" },
        location: { type: "string" },
        attendees: { type: "array" },
        is_all_day: { type: "boolean" },
        meeting_room_id: { type: "string" },
      },
      required: ["subject", "begin_time", "end_time"],
    },
    buildJson: (args) => mergeOptional({
      subject: str("wecom_calendar_create", args, "subject"),
      begin_time: str("wecom_calendar_create", args, "begin_time"),
      end_time: str("wecom_calendar_create", args, "end_time"),
    }, args, ["description", "location", "meeting_room_id"], ["attendees", "mark_optional_attendees"], ["reminders", "timezone"], [], ["is_all_day", "allow_self_join"]),
  },
  {
    name: "wecom_calendar_update",
    description: "更新日程。需要 schedule_id。",
    parameters: {
      type: "object",
      properties: {
        schedule_id: { type: "string" },
        subject: { type: "string" },
        begin_time: { type: "string" },
        end_time: { type: "string" },
        description: { type: "string" },
        location: { type: "string" },
      },
      required: ["schedule_id"],
    },
    buildJson: (args) => mergeOptional(
      { schedule_id: str("wecom_calendar_update", args, "schedule_id") },
      args,
      ["subject", "begin_time", "end_time", "description", "location", "meeting_room_id"],
      ["add_attendees", "remove_attendees"],
      [],
      [],
      ["is_all_day", "allow_self_join"],
    ),
  },
  {
    name: "wecom_calendar_cancel",
    description: "取消日程。需要 schedule_id。",
    parameters: {
      type: "object",
      properties: { schedule_id: { type: "string" } },
      required: ["schedule_id"],
    },
    buildJson: (args) => ({ schedule_id: str("wecom_calendar_cancel", args, "schedule_id") }),
  },
  {
    name: "wecom_calendar_freebusy",
    description: "查多人忙闲/可约时段。需要 userids、begin_time、end_time。",
    parameters: {
      type: "object",
      properties: {
        userids: { type: "array", items: { type: "string" } },
        begin_time: { type: "string" },
        end_time: { type: "string" },
        limit: { type: "integer" },
        min_duration_minutes: { type: "integer" },
      },
      required: ["userids", "begin_time", "end_time"],
    },
    buildJson: (args) => mergeOptional({
      userids: requireArray(args, "userids", "wecom_calendar_freebusy"),
      begin_time: str("wecom_calendar_freebusy", args, "begin_time"),
      end_time: str("wecom_calendar_freebusy", args, "end_time"),
    }, args, ["strategy"], [], [], ["limit", "min_duration_minutes"]),
  },
  {
    name: "wecom_meeting_search",
    description: "按关键词搜在线会议。需要 keywords。",
    parameters: {
      type: "object",
      properties: {
        keywords: { type: "array", items: { type: "string" } },
        begin_time: { type: "string" },
        end_time: { type: "string" },
        limit: { type: "integer" },
      },
      required: ["keywords"],
    },
    buildJson: (args) => mergeOptional(
      { keywords: requireArray(args, "keywords", "wecom_meeting_search") },
      args,
      ["begin_time", "end_time", "cursor"],
      [],
      [],
      ["limit"],
    ),
  },
  {
    name: "wecom_meeting_get",
    description: "会议详情（参会人、纪要/录制地址等）。传 meeting_ids 或 urls。",
    parameters: {
      type: "object",
      properties: {
        meeting_ids: { type: "array", items: { type: "string" } },
        urls: { type: "array", items: { type: "string" } },
      },
    },
    buildJson: (args) => {
      const json = mergeOptional({}, args, [], ["meeting_ids", "urls"]);
      if (!json.meeting_ids && !json.urls) throw new OfficeError("invalid-args", "wecom_meeting_get 需要 meeting_ids 或 urls。");
      return json;
    },
  },
  {
    name: "wecom_meeting_create",
    description: "创建带会议号的在线会议。用户说约个会且要远程/视频时用这个，不要用 wecom_calendar_create。需要 subject/begin_time/end_time。",
    parameters: {
      type: "object",
      properties: {
        subject: { type: "string" },
        begin_time: { type: "string" },
        end_time: { type: "string" },
        attendees: { type: "array" },
        location: { type: "string" },
        description: { type: "string" },
        meeting_room_id: { type: "string" },
      },
      required: ["subject", "begin_time", "end_time"],
    },
    buildJson: (args) => mergeOptional({
      subject: str("wecom_meeting_create", args, "subject"),
      begin_time: str("wecom_meeting_create", args, "begin_time"),
      end_time: str("wecom_meeting_create", args, "end_time"),
    }, args, ["cal_id", "description", "location", "meeting_room_id"], ["attendees", "mark_optional_attendees"], ["timezone"]),
  },
  {
    name: "wecom_meeting_update",
    description: "更新在线会议。需要 meeting_id。",
    parameters: {
      type: "object",
      properties: {
        meeting_id: { type: "string" },
        subject: { type: "string" },
        begin_time: { type: "string" },
        end_time: { type: "string" },
      },
      required: ["meeting_id"],
    },
    buildJson: (args) => mergeOptional(
      { meeting_id: str("wecom_meeting_update", args, "meeting_id") },
      args,
      ["subject", "begin_time", "end_time", "description", "location", "meeting_room_id"],
      ["add_attendees", "remove_attendees"],
    ),
  },
  {
    name: "wecom_meeting_cancel",
    description: "取消在线会议。需要 meeting_id。",
    parameters: {
      type: "object",
      properties: { meeting_id: { type: "string" } },
      required: ["meeting_id"],
    },
    buildJson: (args) => ({ meeting_id: str("wecom_meeting_cancel", args, "meeting_id") }),
  },
  {
    name: "wecom_meeting_transcript",
    description: "拉取会议转写原文。传 meeting_id 或 url。",
    parameters: {
      type: "object",
      properties: {
        meeting_id: { type: "string" },
        url: { type: "string" },
        sub_meeting_id: { type: "string" },
        limit: { type: "integer" },
      },
    },
    buildJson: (args) => mergeOptional({}, args, ["meeting_id", "url", "sub_meeting_id", "cursor"], [], [], ["limit", "media_index", "bot_source"]),
  },
  {
    name: "wecom_meeting_rooms_search",
    description: "按时间查空闲会议室。需要 begin_time/end_time。",
    parameters: {
      type: "object",
      properties: {
        begin_time: { type: "string" },
        end_time: { type: "string" },
        city_name: { type: "string" },
        building_name: { type: "string" },
        room_name: { type: "string" },
        capacity_min: { type: "integer" },
      },
      required: ["begin_time", "end_time"],
    },
    buildJson: (args) => mergeOptional({
      begin_time: str("wecom_meeting_rooms_search", args, "begin_time"),
      end_time: str("wecom_meeting_rooms_search", args, "end_time"),
    }, args, ["building_name", "city_name", "floor_name", "room_name", "cursor"], [], [], ["capacity_min", "limit"], ["expand_to_other_buildings"]),
  },
  {
    name: "wecom_todo_list",
    description: "列待办。可选 keywords/status_filter/时间范围。",
    parameters: {
      type: "object",
      properties: {
        keywords: { type: "array", items: { type: "string" } },
        limit: { type: "integer" },
        cursor: { type: "string" },
      },
    },
    buildJson: (args) => mergeOptional({}, args, ["cursor", "create_begin_time", "create_end_time", "deadline_begin_time", "deadline_end_time"], ["keywords", "status_filter"], [], ["limit"]),
  },
  {
    name: "wecom_todo_get",
    description: "待办详情。items 为待办 id 列表。",
    parameters: {
      type: "object",
      properties: { items: { type: "array" } },
      required: ["items"],
    },
    buildJson: (args) => ({ items: requireArray(args, "items", "wecom_todo_get") }),
  },
  {
    name: "wecom_todo_create",
    description: "创建待办。items 为待办对象数组。",
    parameters: {
      type: "object",
      properties: { items: { type: "array" } },
      required: ["items"],
    },
    buildJson: (args) => ({ items: requireArray(args, "items", "wecom_todo_create") }),
  },
  {
    name: "wecom_todo_update",
    description: "更新待办。items 为待办对象数组。",
    parameters: {
      type: "object",
      properties: { items: { type: "array" } },
      required: ["items"],
    },
    buildJson: (args) => ({ items: requireArray(args, "items", "wecom_todo_update") }),
  },
  {
    name: "wecom_todo_finish",
    description: "完成待办。items 为待办对象数组。",
    parameters: {
      type: "object",
      properties: { items: { type: "array" } },
      required: ["items"],
    },
    buildJson: (args) => ({ items: requireArray(args, "items", "wecom_todo_finish") }),
  },
  {
    name: "wecom_todo_delete",
    description: "删除待办。items 为待办对象数组。",
    parameters: {
      type: "object",
      properties: { items: { type: "array" } },
      required: ["items"],
    },
    buildJson: (args) => ({ items: requireArray(args, "items", "wecom_todo_delete") }),
  },
  {
    name: "wecom_disk_list",
    description: "微盘最近文件列表。",
    parameters: {
      type: "object",
      properties: { cursor: { type: "string" }, limit: { type: "integer" } },
    },
    buildJson: (args) => mergeOptional({}, args, ["cursor"], [], [], ["limit"]),
  },
  {
    name: "wecom_disk_search",
    description: "搜微盘文件。keywords 或其他过滤至少一项。",
    parameters: {
      type: "object",
      properties: {
        keywords: { type: "array", items: { type: "string" } },
        limit: { type: "integer" },
      },
    },
    buildJson: (args) => mergeOptional({}, args, ["cursor", "search_type", "sort_by", "sort_order"], ["keywords", "creator_userids", "file_types", "space_keywords"], [], ["limit"]),
  },
  {
    name: "wecom_disk_get",
    description: "微盘文件信息。file_id 或 url。",
    parameters: {
      type: "object",
      properties: { file_id: { type: "string" }, url: { type: "string" } },
    },
    buildJson: (args) => {
      const json = mergeOptional({}, args, ["file_id", "url"]);
      if (!json.file_id && !json.url) throw new OfficeError("invalid-args", "wecom_disk_get 需要 file_id 或 url。");
      return json;
    },
  },
  {
    name: "wecom_disk_download",
    description: "下载微盘文件。file_id 或 url。",
    parameters: {
      type: "object",
      properties: { file_id: { type: "string" }, url: { type: "string" } },
    },
    buildJson: (args) => {
      const json = mergeOptional({}, args, ["file_id", "url"]);
      if (!json.file_id && !json.url) throw new OfficeError("invalid-args", "wecom_disk_download 需要 file_id 或 url。");
      return json;
    },
  },
  {
    name: "wecom_disk_upload",
    description: "上传到微盘。file_path 或 file_content_media。",
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        file_name: { type: "string" },
        folder_id: { type: "string" },
      },
    },
    buildJson: (args) => mergeOptional({}, args, ["file_path", "content_path", "file_content_media", "file_name", "folder_id"]),
  },
  {
    name: "wecom_disk_rename",
    description: "微盘文件改名。需要 file_id 和 new_name。",
    parameters: {
      type: "object",
      properties: { file_id: { type: "string" }, new_name: { type: "string" } },
      required: ["file_id", "new_name"],
    },
    buildJson: (args) => ({
      file_id: str("wecom_disk_rename", args, "file_id"),
      new_name: str("wecom_disk_rename", args, "new_name"),
    }),
  },
  {
    name: "wecom_disk_mkdir",
    description: "微盘新建文件夹。需要 folder_name。",
    parameters: {
      type: "object",
      properties: { folder_name: { type: "string" }, folder_id: { type: "string" } },
      required: ["folder_name"],
    },
    buildJson: (args) => mergeOptional(
      { folder_name: str("wecom_disk_mkdir", args, "folder_name") },
      args,
      ["folder_id"],
    ),
  },
  {
    name: "wecom_mail_search",
    description: "搜邮件/拉邮件列表。",
    parameters: {
      type: "object",
      properties: {
        keywords: { type: "array", items: { type: "string" } },
        sender: { type: "string" },
        receiver: { type: "string" },
        begin_time: { type: "string" },
        end_time: { type: "string" },
        limit: { type: "integer" },
      },
    },
    buildJson: (args) => mergeOptional({}, args, ["begin_time", "end_time", "cursor", "sender", "receiver"], ["keywords", "folder_names", "tag_names"], [], ["limit"], ["has_attachments", "has_star", "only_reminder", "only_subject", "only_unread"]),
  },
  {
    name: "wecom_mail_get",
    description: "读邮件详情。需要 mail_ids。",
    parameters: {
      type: "object",
      properties: { mail_ids: { type: "array", items: { type: "string" } } },
      required: ["mail_ids"],
    },
    buildJson: (args) => ({ mail_ids: requireArray(args, "mail_ids", "wecom_mail_get") }),
  },
  {
    name: "wecom_mail_send",
    description: "发/回/转邮件。to 为 {emails,userids}；正文 content。回复传 reply.last_mail_id。",
    parameters: {
      type: "object",
      properties: {
        subject: { type: "string" },
        content: { type: "string" },
        to: { type: "object" },
        cc: { type: "object" },
        bcc: { type: "object" },
      },
    },
    buildJson: (args) => mergeOptional({}, args, ["subject", "content", "content_path", "content_type", "file_path"], ["attachments", "inline_images"], ["to", "cc", "bcc", "reply", "forward", "schedule", "meeting"]),
  },
  {
    name: "wecom_media_upload",
    description: "上传媒体，返回 media_id。需要 file_path。",
    parameters: {
      type: "object",
      properties: { file_path: { type: "string" }, type: { type: "string" } },
      required: ["file_path"],
    },
    buildJson: (args) => mergeOptional({ file_path: str("wecom_media_upload", args, "file_path") }, args, ["type"]),
  },
  {
    name: "wecom_media_download",
    description: "按 media_id 下载媒体。",
    parameters: {
      type: "object",
      properties: { media_id: { type: "string" } },
      required: ["media_id"],
    },
    buildJson: (args) => ({ media_id: str("wecom_media_download", args, "media_id") }),
  },
  {
    name: "wecom_chat_list",
    description: "最近 7 天会话列表。需要 begin_time/end_time。",
    parameters: {
      type: "object",
      properties: {
        begin_time: { type: "string" },
        end_time: { type: "string" },
        cursor: { type: "string" },
      },
      required: ["begin_time", "end_time"],
    },
    buildJson: (args) => mergeOptional({
      begin_time: str("wecom_chat_list", args, "begin_time"),
      end_time: str("wecom_chat_list", args, "end_time"),
    }, args, ["cursor"]),
  },
  {
    name: "wecom_chat_messages",
    description: "拉会话消息（最近 7 天）。需要 chat_id/begin_time/end_time。单聊 chat_id 为对方 userid。",
    parameters: {
      type: "object",
      properties: {
        chat_id: { type: "string" },
        begin_time: { type: "string" },
        end_time: { type: "string" },
      },
      required: ["chat_id", "begin_time", "end_time"],
    },
    buildJson: (args) => mergeOptional({
      chat_id: str("wecom_chat_messages", args, "chat_id"),
      begin_time: str("wecom_chat_messages", args, "begin_time"),
      end_time: str("wecom_chat_messages", args, "end_time"),
    }, args, ["cursor"]),
  },
  {
    name: "wecom_message_send",
    description: "往单聊/群聊发文本。需要 chat_id；text 可以是字符串或 {content}。长连接收消息仍在 IM。",
    parameters: {
      type: "object",
      properties: {
        chat_id: { type: "string" },
        text: { description: "文本内容" },
        msg_type: { type: "string" },
      },
      required: ["chat_id"],
    },
    buildJson: (args) => {
      const json: Record<string, unknown> = {
        chat_id: str("wecom_message_send", args, "chat_id"),
        msg_type: stringArg(args, "msg_type") ?? "text",
      };
      const textObj = jsonObject(args, "text");
      const textStr = stringArg(args, "text");
      if (textObj) json.text = textObj;
      else if (textStr) json.text = { content: textStr };
      else throw new OfficeError("invalid-args", "wecom_message_send 需要 text。");
      return json;
    },
  },
  {
    name: "wecom_run",
    description: "wecom-cli 全量白名单兜底。service 为 calendar/chat/contact/disk/doc/mail/media/message/meeting/sheet/smartpage/smartsheet/todo，method 为点号路径（如 schedules.create、todo.list、mail.send）。高频操作请用对应 wecom_* 具名工具。",
    parameters: {
      type: "object",
      properties: {
        service: { type: "string" },
        method: { type: "string" },
        json: { type: "object" },
      },
      required: ["service", "method"],
    },
    buildJson: (args) => {
      const parsed = jsonObject(args, "json");
      if (parsed) return parsed;
      return optionalJson(args);
    },
  },
];
