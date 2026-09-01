export type GitGraphKey =
  | "branch"
  | "repository"
  | "currentBranch"
  | "currentCommit"
  | "scanning"
  | "detached"
  | "dirty"
  | "search"
  | "graph"
  | "close"
  | "empty"
  | "branchEmpty"
  | "loadFailed"
  | "noRepo"
  | "switchFailed"
  | "switching"
  | "current"
  | "loading"
  | "loadMore"
  | "commits"
  | "lanes"
  | "justNow"
  | "minutesAgo"
  | "hoursAgo"
  | "daysAgo";

export const gitGraphZh: Record<GitGraphKey, string> = {
  branch: "分支",
  repository: "代码仓库",
  currentBranch: "当前分支",
  currentCommit: "当前提交",
  scanning: "正在扫描分支…",
  detached: "游离 HEAD",
  dirty: "有未提交改动",
  search: "搜索分支",
  graph: "Git 图谱",
  close: "关闭",
  empty: "没有提交",
  branchEmpty: "没有匹配的分支",
  loadFailed: "无法读取 Git 状态。",
  noRepo: "不是 Git 仓库。",
  switchFailed: "切换失败。",
  switching: "正在切换到",
  current: "当前",
  loading: "加载中…",
  loadMore: "加载更多",
  commits: "个提交",
  lanes: "条泳道",
  justNow: "刚刚",
  minutesAgo: "分钟前",
  hoursAgo: "小时前",
  daysAgo: "天前",
};

export const gitGraphEn: Record<GitGraphKey, string> = {
  branch: "Branch",
  repository: "Repository",
  currentBranch: "Current branch",
  currentCommit: "Current commit",
  scanning: "Scanning branches…",
  detached: "Detached HEAD",
  dirty: "Uncommitted changes",
  search: "Search branches",
  graph: "Git graph",
  close: "Close",
  empty: "No commits",
  branchEmpty: "No matching branches",
  loadFailed: "Could not read Git status.",
  noRepo: "Not a Git repository.",
  switchFailed: "Could not switch branch.",
  switching: "Switching to",
  current: "current",
  loading: "Loading…",
  loadMore: "Load more",
  commits: "commits",
  lanes: "lanes",
  justNow: "just now",
  minutesAgo: "minutes ago",
  hoursAgo: "hours ago",
  daysAgo: "days ago",
};
