/** Cordis plugin id. Must match cordis.patch.yml `id`. */
export const PLUGIN_ID = "wecom-office";

/** npm / patch package name. Must match package.json `name`. */
export const PLUGIN_PACKAGE = "dsh-wecom-office";

/** Cordis `export const name` values that mean dsh-im is loaded. */
export const IM_PLUGIN_NAMES = new Set(["im", "dsh-im"]);

/** Settings page title shown to users. */
export const SETTINGS_TITLE = "企业微信办公";

/** JSON overlay under $DSH_HOME/plugins/wecom-office/settings.json. */
export const SETTINGS_FILE = "settings.json";

/** Loopback HTTP route the settings panel uses. Appendix B. */
export const OFFICE_STATUS_ROUTE = "/_dsh/dsh-wecom-office/status";

export const IM_HUB_ENTRY_ATTR = "data-im-hub-entry";

export const IM_CONFIG_RELATIVE = ["integrations", "dsh-wecom", "config.json"] as const;

export const GUIDANCE_SECTION_NAME = "wecom-office-guidance";
export const GUIDANCE_SECTION_ORDER = 125;

export const OFFICE_TOOL_NAMES = [
  "wecom_calendar_list",
  "wecom_calendar_search",
  "wecom_calendar_get",
  "wecom_calendar_create",
  "wecom_calendar_update",
  "wecom_calendar_cancel",
  "wecom_calendar_freebusy",
  "wecom_doc_search",
  "wecom_doc_get",
  "wecom_doc_create",
  "wecom_doc_append",
  "wecom_doc_overwrite",
  "wecom_doc_rename",
  "wecom_sheet_get",
  "wecom_sheet_read",
  "wecom_sheet_write",
  "wecom_sheet_append_row",
  "wecom_smartsheet_get",
  "wecom_smartsheet_records_list",
  "wecom_smartsheet_records_add",
  "wecom_smartsheet_records_update",
  "wecom_docs_run",
  "wecom_run",
  "wecom_meeting_list",
  "wecom_meeting_search",
  "wecom_meeting_get",
  "wecom_meeting_create",
  "wecom_meeting_update",
  "wecom_meeting_cancel",
  "wecom_meeting_transcript",
  "wecom_meeting_rooms_search",
  "wecom_contact_search",
  "wecom_todo_list",
  "wecom_todo_get",
  "wecom_todo_create",
  "wecom_todo_update",
  "wecom_todo_finish",
  "wecom_todo_delete",
  "wecom_disk_list",
  "wecom_disk_search",
  "wecom_disk_get",
  "wecom_disk_download",
  "wecom_disk_upload",
  "wecom_disk_rename",
  "wecom_disk_mkdir",
  "wecom_mail_search",
  "wecom_mail_get",
  "wecom_mail_send",
  "wecom_media_upload",
  "wecom_media_download",
  "wecom_chat_list",
  "wecom_chat_messages",
  "wecom_message_send",
] as const;

export type OfficeToolName = (typeof OFFICE_TOOL_NAMES)[number];

export type OfficeServiceName =
  | "calendar"
  | "chat"
  | "contact"
  | "disk"
  | "doc"
  | "mail"
  | "media"
  | "message"
  | "meeting"
  | "sheet"
  | "smartsheet"
  | "smartpage"
  | "todo";

export const TOOL_SERVICE: Record<OfficeToolName, OfficeServiceName> = {
  wecom_calendar_list: "calendar",
  wecom_calendar_search: "calendar",
  wecom_calendar_get: "calendar",
  wecom_calendar_create: "calendar",
  wecom_calendar_update: "calendar",
  wecom_calendar_cancel: "calendar",
  wecom_calendar_freebusy: "calendar",
  wecom_doc_search: "doc",
  wecom_doc_get: "doc",
  wecom_doc_create: "doc",
  wecom_doc_append: "doc",
  wecom_doc_overwrite: "doc",
  wecom_doc_rename: "doc",
  wecom_sheet_get: "sheet",
  wecom_sheet_read: "sheet",
  wecom_sheet_write: "sheet",
  wecom_sheet_append_row: "sheet",
  wecom_smartsheet_get: "smartsheet",
  wecom_smartsheet_records_list: "smartsheet",
  wecom_smartsheet_records_add: "smartsheet",
  wecom_smartsheet_records_update: "smartsheet",
  wecom_docs_run: "doc",
  wecom_run: "doc",
  wecom_meeting_list: "meeting",
  wecom_meeting_search: "meeting",
  wecom_meeting_get: "meeting",
  wecom_meeting_create: "meeting",
  wecom_meeting_update: "meeting",
  wecom_meeting_cancel: "meeting",
  wecom_meeting_transcript: "meeting",
  wecom_meeting_rooms_search: "meeting",
  wecom_contact_search: "contact",
  wecom_todo_list: "todo",
  wecom_todo_get: "todo",
  wecom_todo_create: "todo",
  wecom_todo_update: "todo",
  wecom_todo_finish: "todo",
  wecom_todo_delete: "todo",
  wecom_disk_list: "disk",
  wecom_disk_search: "disk",
  wecom_disk_get: "disk",
  wecom_disk_download: "disk",
  wecom_disk_upload: "disk",
  wecom_disk_rename: "disk",
  wecom_disk_mkdir: "disk",
  wecom_mail_search: "mail",
  wecom_mail_get: "mail",
  wecom_mail_send: "mail",
  wecom_media_upload: "media",
  wecom_media_download: "media",
  wecom_chat_list: "chat",
  wecom_chat_messages: "chat",
  wecom_message_send: "message",
};

export const WRITE_TOOLS = new Set<OfficeToolName>([
  "wecom_calendar_create",
  "wecom_calendar_update",
  "wecom_calendar_cancel",
  "wecom_doc_create",
  "wecom_doc_append",
  "wecom_doc_overwrite",
  "wecom_doc_rename",
  "wecom_sheet_write",
  "wecom_sheet_append_row",
  "wecom_smartsheet_records_add",
  "wecom_smartsheet_records_update",
  "wecom_docs_run",
  "wecom_run",
  "wecom_meeting_create",
  "wecom_meeting_update",
  "wecom_meeting_cancel",
  "wecom_todo_create",
  "wecom_todo_update",
  "wecom_todo_finish",
  "wecom_todo_delete",
  "wecom_disk_upload",
  "wecom_disk_rename",
  "wecom_disk_mkdir",
  "wecom_mail_send",
  "wecom_media_upload",
  "wecom_message_send",
]);
