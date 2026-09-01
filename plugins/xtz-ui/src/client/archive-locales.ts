export type ArchiveKey =
  | "title"
  | "description"
  | "backToSettings"
  | "backToArchives"
  | "countUnit"
  | "searchPlaceholder"
  | "clearSearch"
  | "projectLabel"
  | "allProjects"
  | "noProject"
  | "select"
  | "cancelSelection"
  | "selectAllResults"
  | "selectedCount"
  | "selectChat"
  | "bulkActions"
  | "more"
  | "restore"
  | "restoreSelected"
  | "deletePermanently"
  | "deleteAll"
  | "dataCleanup"
  | "dataCleanupHint"
  | "close"
  | "cancel"
  | "deleting"
  | "loading"
  | "loadingPreview"
  | "emptyTitle"
  | "emptyBody"
  | "noMatch"
  | "resetFilters"
  | "loadFailed"
  | "retry"
  | "previewFailed"
  | "previewEmpty"
  | "previewTruncated"
  | "user"
  | "assistant"
  | "turns"
  | "confirmDeleteTitle"
  | "confirmDeleteBody"
  | "confirmSelectedTitle"
  | "confirmSelectedBody"
  | "confirmAllTitle"
  | "confirmAllBody"
  | "deleteAllPhraseLabel"
  | "deleteAllPhrase"
  | "restored"
  | "restoredSelected"
  | "deleted"
  | "deletedSelected"
  | "deletedAll"
  | "noLongerArchived";

export const archiveZh: Record<ArchiveKey, string> = {
  title: "已归档会话",
  description: "归档只会将会话从最近列表隐藏，内容仍保存在本机。",
  backToSettings: "小桃子",
  backToArchives: "已归档会话",
  countUnit: " 条",
  searchPlaceholder: "搜索已归档会话",
  clearSearch: "清空搜索",
  projectLabel: "按项目筛选",
  allProjects: "所有项目",
  noProject: "无项目",
  select: "选择",
  cancelSelection: "取消选择",
  selectAllResults: "选择全部结果",
  selectedCount: "已选择 {0} 条",
  selectChat: "选择会话「{0}」",
  bulkActions: "批量操作",
  more: "更多操作",
  restore: "恢复会话",
  restoreSelected: "恢复所选",
  deletePermanently: "永久删除",
  deleteAll: "清空归档",
  dataCleanup: "数据清理",
  dataCleanupHint: "永久删除全部归档会话及其本机文件，删除后无法恢复。",
  close: "关闭",
  cancel: "取消",
  deleting: "正在删除…",
  loading: "正在加载已归档会话…",
  loadingPreview: "正在读取会话内容…",
  emptyTitle: "还没有归档会话",
  emptyBody: "归档后，会话会从最近列表隐藏，但仍保存在本机。",
  noMatch: "没有找到匹配的归档会话。请清除搜索或项目筛选后重试。",
  resetFilters: "重置搜索和筛选",
  loadFailed: "加载失败",
  retry: "重新加载",
  previewFailed: "读取失败",
  previewEmpty: "此会话没有保存的文本消息。",
  previewTruncated: "仅显示最近 {0} 条，共 {1} 条消息。",
  user: "用户",
  assistant: "助手",
  turns: " 轮",
  confirmDeleteTitle: "永久删除「{0}」？",
  confirmDeleteBody: "这会从本机磁盘删除该会话及其消息，删除后无法恢复。",
  confirmSelectedTitle: "永久删除所选 {0} 条会话？",
  confirmSelectedBody: "所选会话及其本机文件都会被删除，删除后无法恢复。",
  confirmAllTitle: "永久删除全部 {0} 条归档会话？",
  confirmAllBody: "全部归档会话及其本机文件都会被删除，删除后无法恢复。",
  deleteAllPhraseLabel: "输入“{0}”以确认",
  deleteAllPhrase: "删除全部",
  restored: "已恢复「{0}」。",
  restoredSelected: "已恢复 {0} 条会话。",
  deleted: "会话已永久删除。",
  deletedSelected: "已永久删除 {0} 条会话。",
  deletedAll: "已永久删除全部 {0} 条归档会话。",
  noLongerArchived: "会话已不在归档中，未执行操作。",
};

export const archiveEn: Record<ArchiveKey, string> = {
  title: "Archived chats",
  description:
    "Archiving hides a chat from the recent list while keeping its contents on this device.",
  backToSettings: "Xiaotaozi",
  backToArchives: "Archived chats",
  countUnit: " chats",
  searchPlaceholder: "Search archived chats",
  clearSearch: "Clear search",
  projectLabel: "Filter by project",
  allProjects: "All projects",
  noProject: "No project",
  select: "Select",
  cancelSelection: "Cancel selection",
  selectAllResults: "Select all results",
  selectedCount: "{0} selected",
  selectChat: "Select chat “{0}”",
  bulkActions: "Bulk actions",
  more: "More actions",
  restore: "Restore",
  restoreSelected: "Restore selected",
  deletePermanently: "Delete permanently",
  deleteAll: "Clear archives",
  dataCleanup: "Data cleanup",
  dataCleanupHint:
    "Permanently delete every archived chat and its local files. This cannot be undone.",
  close: "Close",
  cancel: "Cancel",
  deleting: "Deleting…",
  loading: "Loading archived chats…",
  loadingPreview: "Loading chat contents…",
  emptyTitle: "No archived chats",
  emptyBody: "Archived chats leave the recent list but remain on this device.",
  noMatch:
    "No matching archived chats. Clear the search or project filter to try again.",
  resetFilters: "Reset search and filters",
  loadFailed: "Could not load archives.",
  retry: "Retry",
  previewFailed: "Could not read this chat.",
  previewEmpty: "This chat has no saved text messages.",
  previewTruncated: "Showing the latest {0} of {1} messages.",
  user: "User",
  assistant: "Assistant",
  turns: " turns",
  confirmDeleteTitle: "Permanently delete “{0}”?",
  confirmDeleteBody:
    "This deletes the chat and its messages from this device. It cannot be undone.",
  confirmSelectedTitle: "Permanently delete {0} selected chats?",
  confirmSelectedBody:
    "The selected chats and their local files will be deleted. This cannot be undone.",
  confirmAllTitle: "Permanently delete all {0} archived chats?",
  confirmAllBody:
    "Every archived chat and its local files will be deleted. This cannot be undone.",
  deleteAllPhraseLabel: "Type “{0}” to confirm",
  deleteAllPhrase: "delete all",
  restored: "Restored “{0}”.",
  restoredSelected: "Restored {0} chats.",
  deleted: "Chat permanently deleted.",
  deletedSelected: "Permanently deleted {0} chats.",
  deletedAll: "Permanently deleted all {0} archived chats.",
  noLongerArchived: "The chat is no longer archived, so no action was taken.",
};

export function formatArchive(
  template: string,
  ...args: Array<string | number>
): string {
  return args.reduce<string>(
    (text, value, index) =>
      text.replaceAll(`{${String(index)}}`, String(value)),
    template,
  );
}
