import type { FeatureKey } from "../config.ts";

export type XtzUiSettingsKey =
  | "nav"
  | "title"
  | "lede"
  | "comingSoon"
  | "loadFailed"
  | "saved"
  | "manageArchive"
  | FeatureKey
  | `${FeatureKey}Hint`;

export const zh: Record<XtzUiSettingsKey, string> = {
  nav: "小桃子",
  title: "小桃子工作台",
  lede: "打开或关闭小桃子功能。关掉后当作没装：没有入口、没有后台调度。品牌和欢迎说明不会关。右侧文件 / Git / 终端在独立插件 dsh-sidebar，细项在设置 → Side card。",
  comingSoon: "即将推出",
  loadFailed: "设置加载失败。",
  saved: "已保存",
  manageArchive: "管理归档会话",
  archive: "归档会话",
  archiveHint: "从最近列表隐藏会话，同时保留在本机。",
  board: "任务看板",
  boardHint: "多列看板和定时执行。",
  gitGraph: "Git 图谱",
  gitGraphHint: "空白会话上的分支胶囊和提交图。",
  announceToAgent: "向 Agent 宣告",
  announceToAgentHint: "把已打开的归档、看板、Git 图谱写进系统提示。默认关闭。右侧工作台由 dsh-sidebar 提供。",
};

export const en: Record<XtzUiSettingsKey, string> = {
  nav: "Xiaotaozi",
  title: "Xiaotaozi workbench",
  lede: "Turn Xiaotaozi features on or off. Off means uninstalled: no entry, no background jobs. Brand and the welcome notice stay. Files / Git / terminal live in the dsh-sidebar plugin (Settings → Side card).",
  comingSoon: "Coming soon",
  loadFailed: "Could not load settings.",
  saved: "Saved",
  manageArchive: "Manage archived chats",
  archive: "Archived chats",
  archiveHint: "Hide conversations from the recent list while keeping them on this device.",
  board: "Task board",
  boardHint: "Kanban columns and scheduled runs.",
  gitGraph: "Git graph",
  gitGraphHint: "Branch chip and commit graph on a blank session.",
  announceToAgent: "Announce to agent",
  announceToAgentHint: "Tell the agent that archive, the task board, and the git graph are on. Off by default. The right workbench is dsh-sidebar.",
};
