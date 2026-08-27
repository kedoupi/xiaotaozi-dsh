import { GUIDANCE_SECTION_NAME, GUIDANCE_SECTION_ORDER } from "./names.ts";
import type { WecomOfficeSettings } from "./settings.ts";

export function officeGuidanceText(config: WecomOfficeSettings, authorized: boolean): string {
  if (!config.guidance || !authorized) return "";
  const write = config.allowWrite
    ? "Writes are enabled (docs, calendar, meetings, todos, mail, disk, messages). Do not run wecom-cli in the terminal."
    : "Writes are disabled. If the user asks to create or edit, say 设置 → 企业微信办公 → 高级 has 允许修改 turned off.";
  return [
    "<wecom-office>",
    "Enterprise WeChat office tools are available. Call wecom_* tools. Do not guess. Do not use CLI method names (calendar.schedules.list, doc.create) as tool names.",
    "If the user says 约个会/开会 without specifying: ask whether they want a 日程 (no meeting link → wecom_calendar_create) or 带会议号的在线会议 (wecom_meeting_create). Do not ask this on queries.",
    "- calendar: wecom_calendar_list/search/get/create/update/cancel/freebusy",
    "- meetings: wecom_meeting_list/search/get/create/update/cancel/transcript/rooms_search",
    "- docs: wecom_doc_search/get/create/append/overwrite/rename; sheets wecom_sheet_*; smartsheet wecom_smartsheet_*",
    "- todo: wecom_todo_list/get/create/update/finish/delete",
    "- disk: wecom_disk_list/search/get/download/upload/rename/mkdir",
    "- mail: wecom_mail_search/get/send",
    "- chat/message: wecom_chat_list/messages, wecom_message_send (inbound chat still lives in IM)",
    "- media: wecom_media_upload/download",
    "- wecom_run: remaining whitelist (any service/method). wecom_docs_run: doc/sheet/smartsheet/smartpage only.",
    write,
    "Office data always comes from the WeCom bot selected under Settings → 企业微信办公.",
    "</wecom-office>",
  ].join("\n");
}

export const OFFICE_GUIDANCE_SECTION = {
  name: GUIDANCE_SECTION_NAME,
  order: GUIDANCE_SECTION_ORDER,
};
