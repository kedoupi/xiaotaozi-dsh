import type { FeatureKey } from "../config.ts";

export type HelloSettingsKey =
  | "nav"
  | "title"
  | "lede"
  | "comingSoon"
  | "loadFailed"
  | "saved"
  | FeatureKey
  | `${FeatureKey}Hint`;

export const zh: Record<HelloSettingsKey, string> = {
  nav: "小桃子",
  title: "小桃子工作台",
  lede: "打开或关闭工作台功能。关掉后当作没装：没有入口、没有后台调度。品牌和欢迎说明不会关。右侧文件 / Git / 终端的细项在设置 → Side card。",
  comingSoon: "即将推出",
  loadFailed: "设置加载失败。",
  saved: "已保存",
  archive: "归档管理",
  archiveHint: "设置里查看、恢复或彻底删除已归档会话。",
  workbench: "右侧工作台",
  workbenchHint: "对话右侧的文件、编辑器、Git 和终端。各 Tab 在设置 → Side card 开关。",
  workbenchFiles: "文件",
  workbenchFilesHint: "资源管理器和编辑器。细项在 Side card。",
  workbenchGit: "Git 面板",
  workbenchGitHint: "暂存、提交和 diff。不含 push / pull。",
  workbenchTerminal: "终端",
  workbenchTerminalHint: "会话里的真实 PTY 终端。",
  workbenchBrowser: "浏览器",
  workbenchBrowserHint: "侧栏里打开网页。",
  board: "任务看板",
  boardHint: "多列看板和定时执行。",
  gitGraph: "Git 图谱",
  gitGraphHint: "空白会话上的分支胶囊和提交图。",
  announceToAgent: "向 Agent 宣告",
  announceToAgentHint: "把已打开的工作台能力写进系统提示，让 Agent 知道有文件、Git、终端、看板、归档、Git 图谱。默认关闭。",
};

export const en: Record<HelloSettingsKey, string> = {
  nav: "Xiaotaozi",
  title: "Xiaotaozi workbench",
  lede: "Turn workbench features on or off. Off means uninstalled: no entry, no background jobs. Brand and the welcome notice stay. File / Git / terminal tabs are under Settings → Side card.",
  comingSoon: "Coming soon",
  loadFailed: "Could not load settings.",
  saved: "Saved",
  archive: "Archive manager",
  archiveHint: "View, restore, or permanently delete archived sessions.",
  workbench: "Right workbench",
  workbenchHint: "Files, editor, Git, and terminal beside the conversation. Per-tab switches live in Settings → Side card.",
  workbenchFiles: "Files",
  workbenchFilesHint: "Explorer and editor. Fine control is on the Side card.",
  workbenchGit: "Git panel",
  workbenchGitHint: "Stage, commit, and diff. No push or pull.",
  workbenchTerminal: "Terminal",
  workbenchTerminalHint: "A real PTY shell in the session.",
  workbenchBrowser: "Browser",
  workbenchBrowserHint: "Open web pages in the side panel.",
  board: "Task board",
  boardHint: "Kanban columns and scheduled runs.",
  gitGraph: "Git graph",
  gitGraphHint: "Branch chip and commit graph on a blank session.",
  announceToAgent: "Announce to agent",
  announceToAgentHint: "Tell the agent which workbench skills are on (files, Git, terminal, board, archive, git graph). Off by default.",
};
