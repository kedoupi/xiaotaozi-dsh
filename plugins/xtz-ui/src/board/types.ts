export const TASK_STATUSES = ["backlog", "todo", "running", "done", "failed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const MANUAL_STATUSES = ["backlog", "todo"] as const satisfies readonly TaskStatus[];

export interface ExecutionRecord {
  id: string;
  sessionId: string | undefined;
  startedAt: number;
  endedAt: number | undefined;
  result: "succeeded" | "failed" | "cancelled" | undefined;
  error: string | undefined;
}

export interface ScheduleRule {
  enabled: boolean;
  cron: string;
  nextRunAt: number | undefined;
  lastTriggeredAt: number | undefined;
}

export interface BoardWorkspace {
  id: string;
  title: string;
  path: string;
}

export interface TaskRecord {
  id: string;
  title: string;
  description: string;
  prompt: string;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  executions: ExecutionRecord[];
  schedule?: ScheduleRule;
  workspaceId?: string;
}

export const COLUMNS: readonly { status: TaskStatus; labelKey: "colBacklog" | "colTodo" | "colRunning" | "colDone" | "colFailed" }[] = [
  { status: "backlog", labelKey: "colBacklog" },
  { status: "todo", labelKey: "colTodo" },
  { status: "running", labelKey: "colRunning" },
  { status: "done", labelKey: "colDone" },
  { status: "failed", labelKey: "colFailed" },
];

export const EXECUTION_HISTORY_LIMIT = 20;
export const MAX_TASKS = 200;
export const MAX_TITLE = 200;
export const MAX_PROMPT = 32 * 1024;

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (TASK_STATUSES as readonly string[]).includes(value);
}

export function canMoveManually(from: TaskStatus, to: TaskStatus): boolean {
  return from !== "running" && (MANUAL_STATUSES as readonly TaskStatus[]).includes(to);
}

export function retainRecentExecutions(executions: readonly ExecutionRecord[]): ExecutionRecord[] {
  if (executions.length <= EXECUTION_HISTORY_LIMIT) return [...executions];
  const open = executions.filter((item) => item.endedAt === undefined);
  const settled = executions.filter((item) => item.endedAt !== undefined);
  const keepSettled = Math.max(EXECUTION_HISTORY_LIMIT - open.length, 0);
  return [...settled.slice(Math.max(settled.length - keepSettled, 0)), ...open];
}
