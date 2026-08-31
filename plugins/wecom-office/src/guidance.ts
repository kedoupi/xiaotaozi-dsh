import { GUIDANCE_SECTION_NAME, GUIDANCE_SECTION_ORDER } from "./names.ts";
import type { WecomOfficeSettings } from "./settings.ts";

export function officeGuidanceText(config: WecomOfficeSettings, authorized: boolean): string {
  if (!config.guidance || !authorized) return "";
  const write = config.allowWrite
    ? "Writes are enabled (docs, calendar, meetings, todos, mail, disk, messages). Do not run wecom-cli in the terminal."
    : "Writes are disabled. If the user asks to create or edit, say the IM WeCom robot card → 办公能力 has 允许修改企业微信数据 turned off.";
  const docsLayout = [
    "When the user wants 做成文档/介绍/给机构/给开发者/发群对齐: first decide 给谁 and 拿去做什么. If missing, ask one short question. Do not show a template picker.",
    "载体: 长说明 → wecom_doc_create doc_type=doc; 一张格子表 → doc_type=sheet + grid_data; 台账筛选 → smartsheet. Default is doc. Do not default to smartpage.",
    "Word 正文 must be markdown. Never content_type=text. Never wecom_doc_append for a full deliverable.",
    "排版: 页眉已是题目，正文不要再用同名 # 标题; 章节最多 ## 和 ###; 能成段就成段; 短并列才列表; 行列才表; 加粗只给关键词; 不要 - [x]; 不要「好的我来整理」。",
    "On success tell the user the url, 给谁, and 主张. Do not paste the full document back into chat. Do not silently overwrite a doc the user did not ask to replace.",
    "Missing facts: mark 待确认. Do not invent APIs, dates, or org names.",
  ].join("\n");
  return [
    "<wecom-office>",
    "Enterprise WeChat office tools are available. Call wecom_* tools. Do not guess. Do not use CLI method names (calendar.schedules.list, doc.create) as tool names.",
    "If the user says 约个会/开会 without specifying: ask whether they want a 日程 (no meeting link → wecom_calendar_create) or 带会议号的在线会议 (wecom_meeting_create). Do not ask this on queries.",
    "- calendar: wecom_calendar_list/search/get/create/update/cancel/freebusy",
    "- meetings: wecom_meeting_list/search/get/create/update/cancel/transcript/rooms_search",
    "- docs: wecom_doc_search/get/create/append/overwrite/rename; sheets wecom_sheet_*; smartsheet wecom_smartsheet_*",
    ...(config.allowWrite ? [docsLayout] : []),
    "- todo: wecom_todo_list/get/create/update/finish/delete",
    "- disk: wecom_disk_list/search/get/download/upload/rename/mkdir",
    "- mail: wecom_mail_search/get/send",
    "- chat/message: wecom_chat_list/messages, wecom_message_send (inbound chat still lives in IM)",
    "- media: wecom_media_upload/download",
    "- wecom_run: remaining whitelist (any service/method). wecom_docs_run: doc/sheet/smartsheet/smartpage only.",
    write,
    "Office data always comes from the WeCom bot selected in the IM WeCom robot card (办公能力).",
    "</wecom-office>",
  ].join("\n");
}

export const OFFICE_GUIDANCE_SECTION = {
  name: GUIDANCE_SECTION_NAME,
  order: GUIDANCE_SECTION_ORDER,
};
