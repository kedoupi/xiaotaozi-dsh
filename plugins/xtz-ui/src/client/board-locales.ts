export type BoardKey =
  | "entry"
  | "title"
  | "back"
  | "new"
  | "search"
  | "boardScroller"
  | "empty"
  | "colBacklog"
  | "colTodo"
  | "colRunning"
  | "colDone"
  | "colFailed"
  | "updated"
  | "scheduled"
  | "runs"
  | "newTitle"
  | "titlePh"
  | "description"
  | "descPh"
  | "prompt"
  | "promptPh"
  | "workspace"
  | "workspaceNone"
  | "create"
  | "cancel"
  | "required"
  | "detail"
  | "close"
  | "run"
  | "edit"
  | "stop"
  | "openSession"
  | "delete"
  | "confirmDelete"
  | "toBacklog"
  | "toTodo"
  | "noExecution"
  | "nextRun"
  | "cronEnable"
  | "cronPh"
  | "loadFailed"
  | "loading"
  | "operationBusy"
  | "operationSuccess"
  | "dragInstructions"
  | "dragging"
  | "dropTarget"
  | "dropSuccess"
  | "justNow"
  | "emptyBoardTitle"
  | "emptyBoardBody";

export const boardZh: Record<BoardKey, string> = {
  entry: "任务看板",
  title: "任务看板",
  back: "返回会话",
  new: "新建任务",
  search: "筛选任务…",
  boardScroller: "任务看板各状态列，可横向滚动",
  empty: "这个状态还没有任务",
  colBacklog: "待规划",
  colTodo: "待办",
  colRunning: "进行中",
  colDone: "已完成",
  colFailed: "已失败",
  updated: "更新于",
  scheduled: "定时",
  runs: "次执行",
  newTitle: "标题",
  titlePh: "一句话描述要做什么",
  description: "描述",
  descPh: "补充背景、范围与验收（可选）",
  prompt: "执行 Prompt",
  promptPh: "发给 agent 的完整指令（留空则使用标题）",
  workspace: "工作区",
  workspaceNone: "最近工作区",
  create: "创建",
  cancel: "取消",
  required: "标题不能为空",
  detail: "任务详情",
  close: "关闭",
  run: "执行",
  edit: "编辑",
  stop: "停止执行",
  openSession: "打开执行会话",
  delete: "删除",
  confirmDelete: "确定删除「{name}」吗？删除后不可恢复。",
  toBacklog: "移到待规划",
  toTodo: "移到待办",
  noExecution: "尚未执行",
  nextRun: "下次",
  cronEnable: "启用定时执行",
  cronPh: "Cron 表达式，例如 0 9 * * 1",
  loadFailed: "看板加载失败。",
  loading: "正在加载任务看板…",
  operationBusy: "正在处理任务操作…",
  operationSuccess: "任务操作已完成。",
  dragInstructions: "可拖动的任务可以放到待规划或待办；进行中的任务不能拖动。",
  dragging: "正在拖动「{name}」。",
  dropTarget: "将「{name}」移到{status}。",
  dropSuccess: "已将「{name}」移到{status}。",
  justNow: "刚刚",
  emptyBoardTitle: "还没有任务",
  emptyBoardBody: "把第一件想做的事交给小桃子，点「新建任务」就行。",
};

export const boardEn: Record<BoardKey, string> = {
  entry: "Task board",
  title: "Task board",
  back: "Back to chat",
  new: "New task",
  search: "Filter tasks…",
  boardScroller: "Task board status columns; scroll horizontally",
  empty: "No tasks in this column",
  colBacklog: "Backlog",
  colTodo: "Todo",
  colRunning: "Running",
  colDone: "Done",
  colFailed: "Failed",
  updated: "Updated",
  scheduled: "Scheduled",
  runs: "runs",
  newTitle: "Title",
  titlePh: "What should happen",
  description: "Description",
  descPh: "Background and acceptance (optional)",
  prompt: "Prompt",
  promptPh: "Full instruction for the agent (title if empty)",
  workspace: "Workspace",
  workspaceNone: "Recent workspace",
  create: "Create",
  cancel: "Cancel",
  required: "Title is required",
  detail: "Task detail",
  close: "Close",
  run: "Run",
  edit: "Edit",
  stop: "Stop run",
  openSession: "Open execution session",
  delete: "Delete",
  confirmDelete: "Delete “{name}”? This cannot be undone.",
  toBacklog: "Move to backlog",
  toTodo: "Move to todo",
  noExecution: "Not run yet",
  nextRun: "Next",
  cronEnable: "Enable schedule",
  cronPh: "Cron, e.g. 0 9 * * 1",
  loadFailed: "Could not load the board.",
  loading: "Loading task board…",
  operationBusy: "Updating the task board…",
  operationSuccess: "Task board updated.",
  dragInstructions:
    "Draggable tasks can be dropped on Backlog or Todo; running tasks cannot be dragged.",
  dragging: "Dragging “{name}”.",
  dropTarget: "Move “{name}” to {status}.",
  dropSuccess: "Moved “{name}” to {status}.",
  justNow: "Just now",
  emptyBoardTitle: "No tasks yet",
  emptyBoardBody:
    "Hand the first thing to Xiaotaozi — press “New task” to begin.",
};
