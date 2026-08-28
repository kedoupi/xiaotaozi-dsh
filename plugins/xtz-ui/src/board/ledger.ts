import { RouteError } from "../http.ts";
import { isValidCron, nextRunAtMs } from "./schedule.ts";
import { emptyExecution, newId } from "./store.ts";
import {
  MAX_PROMPT,
  MAX_TASKS,
  MAX_TITLE,
  canMoveManually,
  isTaskStatus,
  retainRecentExecutions,
  type ExecutionRecord,
  type TaskRecord,
  type TaskStatus,
} from "./types.ts";

export interface NewTaskInput {
  title: string;
  description?: string;
  prompt: string;
  workspaceId?: string;
  cron?: string;
  scheduleEnabled?: boolean;
}

export const ORPHANED_EXECUTION_ERROR = "host restarted before execution session was attached";

function trimText(value: string, max: number, label: string): string {
  const text = value.trim();
  if (text === "") throw new RouteError(400, `${label} required`);
  if (text.length > max) throw new RouteError(413, `${label} too long`);
  return text;
}

function optionalId(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export function createTask(tasks: readonly TaskRecord[], input: NewTaskInput, now = Date.now()): TaskRecord[] {
  if (tasks.length >= MAX_TASKS) throw new RouteError(413, "too many tasks");
  const title = trimText(input.title, MAX_TITLE, "title");
  const prompt = trimText(input.prompt === "" ? input.title : input.prompt, MAX_PROMPT, "prompt");
  const description = (input.description ?? "").trim().slice(0, MAX_PROMPT);
  const workspaceId = optionalId(input.workspaceId);
  const cron = input.cron?.trim() ?? "";
  let schedule: TaskRecord["schedule"];
  if (cron !== "") {
    if (!isValidCron(cron)) throw new RouteError(400, "invalid cron");
    const enabled = input.scheduleEnabled === true;
    schedule = {
      enabled,
      cron,
      nextRunAt: enabled ? nextRunAtMs(cron, now) : undefined,
      lastTriggeredAt: undefined,
    };
  }
  const task: TaskRecord = {
    id: newId(),
    title,
    description,
    prompt,
    status: "backlog",
    createdAt: now,
    updatedAt: now,
    executions: [],
    ...(workspaceId === undefined ? {} : { workspaceId }),
    ...(schedule === undefined ? {} : { schedule }),
  };
  return [task, ...tasks];
}

export function updateTask(tasks: readonly TaskRecord[], id: string, patch: Partial<NewTaskInput>, now = Date.now()): TaskRecord[] {
  const index = tasks.findIndex((task) => task.id === id);
  if (index < 0) throw new RouteError(404, "task not found");
  const current = tasks[index]!;
  if (current.status === "running") throw new RouteError(409, "task is running");
  const title = patch.title !== undefined ? trimText(patch.title, MAX_TITLE, "title") : current.title;
  const prompt = patch.prompt !== undefined ? trimText(patch.prompt, MAX_PROMPT, "prompt") : current.prompt;
  const description = patch.description !== undefined ? patch.description.trim().slice(0, MAX_PROMPT) : current.description;
  const workspaceId = patch.workspaceId !== undefined ? optionalId(patch.workspaceId) : current.workspaceId;
  let schedule = current.schedule;
  if (patch.cron !== undefined || patch.scheduleEnabled !== undefined) {
    const cron = (patch.cron ?? schedule?.cron ?? "").trim();
    if (cron === "") {
      schedule = undefined;
    } else {
      if (!isValidCron(cron)) throw new RouteError(400, "invalid cron");
      const enabled = patch.scheduleEnabled ?? schedule?.enabled ?? false;
      schedule = {
        enabled,
        cron,
        nextRunAt: enabled ? nextRunAtMs(cron, now) : undefined,
        lastTriggeredAt: schedule?.lastTriggeredAt,
      };
    }
  }
  const next: TaskRecord = {
    ...current,
    title,
    prompt,
    description,
    updatedAt: now,
    ...(workspaceId === undefined ? { workspaceId: undefined } : { workspaceId }),
    ...(schedule === undefined ? { schedule: undefined } : { schedule }),
  };
  const copy = [...tasks];
  copy[index] = next;
  return copy;
}

export function moveTask(tasks: readonly TaskRecord[], id: string, status: TaskStatus, now = Date.now()): TaskRecord[] {
  const index = tasks.findIndex((task) => task.id === id);
  if (index < 0) throw new RouteError(404, "task not found");
  const current = tasks[index]!;
  if (!canMoveManually(current.status, status)) throw new RouteError(409, "cannot move");
  const copy = [...tasks];
  copy[index] = { ...current, status, updatedAt: now };
  return copy;
}

export function deleteTask(tasks: readonly TaskRecord[], id: string): TaskRecord[] {
  const current = tasks.find((task) => task.id === id);
  if (current === undefined) throw new RouteError(404, "task not found");
  if (current.status === "running") throw new RouteError(409, "task is running");
  return tasks.filter((task) => task.id !== id);
}

export function openRun(tasks: readonly TaskRecord[], id: string, now = Date.now()): { tasks: TaskRecord[]; executionId: string } {
  const index = tasks.findIndex((task) => task.id === id);
  if (index < 0) throw new RouteError(404, "task not found");
  const current = tasks[index]!;
  if (current.status === "running") throw new RouteError(409, "task is running");
  const execution = emptyExecution(now);
  const copy = [...tasks];
  copy[index] = {
    ...current,
    status: "running",
    updatedAt: now,
    executions: retainRecentExecutions([...current.executions, execution]),
  };
  return { tasks: copy, executionId: execution.id };
}

export function attachSession(tasks: readonly TaskRecord[], taskId: string, executionId: string, sessionId: string): TaskRecord[] {
  return tasks.map((task) => {
    if (task.id !== taskId) return task;
    return {
      ...task,
      executions: task.executions.map((item) => item.id === executionId ? { ...item, sessionId } : item),
    };
  });
}

export function activeExecution(task: TaskRecord): ExecutionRecord {
  const execution = [...task.executions].reverse().find((item) => item.endedAt === undefined);
  if (execution === undefined) throw new RouteError(409, "task has no active execution");
  return execution;
}

export function settleRun(
  tasks: readonly TaskRecord[],
  taskId: string,
  executionId: string,
  result: "succeeded" | "failed" | "cancelled",
  error: string | undefined,
  now = Date.now(),
): TaskRecord[] {
  return tasks.map((task) => {
    if (task.id !== taskId) return task;
    const executions = task.executions.map((item) =>
      item.id === executionId ? { ...item, endedAt: now, result, error } : item,
    );
    const status: TaskStatus = result === "succeeded" ? "done" : result === "cancelled" ? "todo" : "failed";
    return { ...task, status, updatedAt: now, executions };
  });
}

export function failOrphanedRuns(
  tasks: readonly TaskRecord[],
  now = Date.now(),
): { tasks: TaskRecord[]; recovered: number } {
  let recovered = 0;
  const next = tasks.map((task) => {
    if (task.status !== "running") return task;
    let activeIndex = -1;
    for (let index = task.executions.length - 1; index >= 0; index -= 1) {
      if (task.executions[index]?.endedAt === undefined) {
        activeIndex = index;
        break;
      }
    }
    if (activeIndex < 0 || task.executions[activeIndex]?.sessionId !== undefined) return task;
    recovered += 1;
    const executions = task.executions.map((execution, index) => index === activeIndex
      ? {
          ...execution,
          endedAt: now,
          result: "failed" as const,
          error: ORPHANED_EXECUTION_ERROR,
        }
      : execution);
    return { ...task, status: "failed" as const, updatedAt: now, executions };
  });
  return { tasks: next, recovered };
}

export function skipMissed(tasks: readonly TaskRecord[], now: number): TaskRecord[] {
  return tasks.map((task) => {
    const schedule = task.schedule;
    if (schedule === undefined || !schedule.enabled) return task;
    let next = schedule.nextRunAt ?? nextRunAtMs(schedule.cron, now);
    while (next !== undefined && next <= now) {
      next = nextRunAtMs(schedule.cron, next);
    }
    return { ...task, schedule: { ...schedule, nextRunAt: next } };
  });
}

export function dueTaskIds(tasks: readonly TaskRecord[], now: number): string[] {
  return tasks.filter((task) =>
    task.status !== "running"
    && task.schedule?.enabled === true
    && typeof task.schedule.nextRunAt === "number"
    && task.schedule.nextRunAt <= now
  ).map((task) => task.id);
}

export function armAfterTrigger(task: TaskRecord, now: number): TaskRecord {
  const schedule = task.schedule;
  if (schedule === undefined) return task;
  return {
    ...task,
    schedule: {
      ...schedule,
      lastTriggeredAt: now,
      nextRunAt: nextRunAtMs(schedule.cron, now),
    },
  };
}

export function findTask(tasks: readonly TaskRecord[], id: string): TaskRecord {
  const task = tasks.find((item) => item.id === id);
  if (task === undefined) throw new RouteError(404, "task not found");
  return task;
}

export { isTaskStatus };
