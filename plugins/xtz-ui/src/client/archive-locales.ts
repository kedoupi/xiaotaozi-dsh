export type ArchiveKey =
  | "nav"
  | "title"
  | "description"
  | "searchPlaceholder"
  | "clearSearch"
  | "sortNewest"
  | "sortOldest"
  | "allProjects"
  | "noProject"
  | "countUnit"
  | "deleteAllInProject"
  | "deleteAll"
  | "deleteAllTip"
  | "preview"
  | "unarchive"
  | "deletePermanently"
  | "close"
  | "loading"
  | "empty"
  | "noMatch"
  | "loadFailed"
  | "previewFailed"
  | "previewEmpty"
  | "previewTitle"
  | "user"
  | "assistant"
  | "turns"
  | "confirmDelete"
  | "confirmDeleteWs"
  | "confirmDeleteAll"
  | "restored"
  | "deleted"
  | "deletedWs"
  | "deletedAll";

export const archiveZh: Record<ArchiveKey, string> = {
  nav: "归档",
  title: "归档管理",
  description: "查看、恢复或彻底删除已归档的会话。关掉「设置 → 小桃子」里的归档管理后，本页会消失。",
  searchPlaceholder: "搜索已归档聊天",
  clearSearch: "清空搜索",
  sortNewest: "全部聊天",
  sortOldest: "最早优先",
  allProjects: "所有项目",
  noProject: "无项目",
  countUnit: " 个聊天",
  deleteAllInProject: "删除此项目全部归档",
  deleteAll: "全部删除",
  deleteAllTip: "彻底删除所有归档会话（含磁盘文件）",
  preview: "查看内容",
  unarchive: "恢复会话",
  deletePermanently: "物理删除",
  close: "关闭",
  loading: "加载已归档对话中…",
  empty: "暂无已归档的对话。",
  noMatch: "未找到匹配的归档对话。",
  loadFailed: "加载失败",
  previewFailed: "读取失败",
  previewEmpty: "此会话没有保存的文本消息。",
  previewTitle: "查看会话",
  user: "用户",
  assistant: "助手",
  turns: " 轮对话",
  confirmDelete: "确认从磁盘彻底删除会话「{0}」？此操作不可恢复。",
  confirmDeleteWs: "确认彻底删除「{0}」下的全部 {1} 个归档会话？此操作不可恢复。",
  confirmDeleteAll: "确认彻底删除全部 {0} 个归档会话？此操作不可恢复。",
  restored: "已恢复会话「{0}」。",
  deleted: "已彻底删除会话。",
  deletedWs: "已删除「{0}」下的归档。",
  deletedAll: "已删除全部 {0} 个归档会话。",
};

export const archiveEn: Record<ArchiveKey, string> = {
  nav: "Archives",
  title: "Archive manager",
  description: "View, restore, or permanently delete archived sessions. Turning the feature off in Settings → Xiaotaozi hides this page.",
  searchPlaceholder: "Search archived chats",
  clearSearch: "Clear search",
  sortNewest: "All chats",
  sortOldest: "Oldest first",
  allProjects: "All projects",
  noProject: "No project",
  countUnit: " chats",
  deleteAllInProject: "Delete all in this project",
  deleteAll: "Delete all",
  deleteAllTip: "Permanently delete every archived session, including files",
  preview: "View",
  unarchive: "Restore",
  deletePermanently: "Delete",
  close: "Close",
  loading: "Loading archived chats…",
  empty: "No archived conversations.",
  noMatch: "No matching archived chats.",
  loadFailed: "Could not load archives.",
  previewFailed: "Could not read this session.",
  previewEmpty: "This session has no saved text messages.",
  previewTitle: "Session",
  user: "User",
  assistant: "Assistant",
  turns: " turns",
  confirmDelete: "Permanently delete session \"{0}\"? This cannot be undone.",
  confirmDeleteWs: "Permanently delete all {1} archived chats in \"{0}\"? This cannot be undone.",
  confirmDeleteAll: "Permanently delete all {0} archived sessions? This cannot be undone.",
  restored: "Restored \"{0}\".",
  deleted: "Session permanently deleted.",
  deletedWs: "Deleted archives in \"{0}\".",
  deletedAll: "Deleted all {0} archived sessions.",
};

export function formatArchive(template: string, ...args: Array<string | number>): string {
  return args.reduce<string>((text, value, index) => text.replaceAll(`{${String(index)}}`, String(value)), template);
}
