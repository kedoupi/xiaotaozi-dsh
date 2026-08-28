import { randomUUID } from "node:crypto";
import {
  adoptLegacyPluginFileOnce,
  legacyHelloBoardMigrationMarkerPath,
  legacyHelloPluginFile,
  xtzUiBoardPath,
} from "../dsh-home.ts";
import { readJsonFile, rejectJsonSchema, writeJsonFile } from "../archive/store.ts";
import { isValidCron, nextRunAtMs } from "./schedule.ts";
import {
  isTaskStatus,
  retainRecentExecutions,
  type ExecutionRecord,
  type ScheduleRule,
  type TaskRecord,
  type TaskStatus,
} from "./types.ts";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function parseExecution(value: unknown): ExecutionRecord | undefined {
  const rec = asRecord(value);
  if (rec === undefined || typeof rec.id !== "string" || rec.id === "") return undefined;
  if (typeof rec.startedAt !== "number" || !Number.isFinite(rec.startedAt)) return undefined;
  const sessionId = typeof rec.sessionId === "string" && rec.sessionId !== "" ? rec.sessionId : undefined;
  const endedAt = typeof rec.endedAt === "number" && Number.isFinite(rec.endedAt) ? rec.endedAt : undefined;
  const result = rec.result === "succeeded" || rec.result === "failed" || rec.result === "cancelled" ? rec.result : undefined;
  const error = typeof rec.error === "string" ? rec.error : undefined;
  return { id: rec.id, sessionId, startedAt: rec.startedAt, endedAt, result, error };
}

function parseSchedule(value: unknown, now: number): ScheduleRule | undefined {
  const rec = asRecord(value);
  if (rec === undefined || typeof rec.cron !== "string" || !isValidCron(rec.cron)) return undefined;
  const enabled = rec.enabled === true;
  const lastTriggeredAt = typeof rec.lastTriggeredAt === "number" ? rec.lastTriggeredAt : undefined;
  let nextRunAt = typeof rec.nextRunAt === "number" ? rec.nextRunAt : undefined;
  if (enabled && nextRunAt === undefined) nextRunAt = nextRunAtMs(rec.cron, now);
  return { enabled, cron: rec.cron, nextRunAt, lastTriggeredAt };
}

export function parseTask(value: unknown, now = Date.now()): TaskRecord | undefined {
  const rec = asRecord(value);
  if (rec === undefined || typeof rec.id !== "string" || rec.id === "") return undefined;
  if (typeof rec.title !== "string" || typeof rec.prompt !== "string") return undefined;
  if (!isTaskStatus(rec.status)) return undefined;
  const createdAt = typeof rec.createdAt === "number" ? rec.createdAt : now;
  const updatedAt = typeof rec.updatedAt === "number" ? rec.updatedAt : createdAt;
  const executions = Array.isArray(rec.executions)
    ? retainRecentExecutions(rec.executions.map(parseExecution).filter((item): item is ExecutionRecord => item !== undefined))
    : [];
  const description = typeof rec.description === "string" ? rec.description : "";
  const workspaceId = typeof rec.workspaceId === "string" && rec.workspaceId !== "" ? rec.workspaceId : undefined;
  const schedule = rec.schedule === undefined ? undefined : parseSchedule(rec.schedule, now);
  return {
    id: rec.id,
    title: rec.title,
    description,
    prompt: rec.prompt,
    status: rec.status,
    createdAt,
    updatedAt,
    executions,
    ...(schedule === undefined ? {} : { schedule }),
    ...(workspaceId === undefined ? {} : { workspaceId }),
  };
}

function parseStoredTask(value: unknown, now: number): TaskRecord | undefined {
  const rec = asRecord(value);
  if (rec === undefined) return undefined;
  if (rec.description !== undefined && typeof rec.description !== "string") return undefined;
  if (rec.workspaceId !== undefined && (typeof rec.workspaceId !== "string" || rec.workspaceId === "")) return undefined;
  if (rec.createdAt !== undefined && (typeof rec.createdAt !== "number" || !Number.isFinite(rec.createdAt))) return undefined;
  if (rec.updatedAt !== undefined && (typeof rec.updatedAt !== "number" || !Number.isFinite(rec.updatedAt))) return undefined;
  if (rec.executions !== undefined) {
    if (!Array.isArray(rec.executions) || rec.executions.some((execution) => {
      const stored = asRecord(execution);
      if (stored === undefined || parseExecution(execution) === undefined) return true;
      if (stored.sessionId !== undefined && (typeof stored.sessionId !== "string" || stored.sessionId === "")) return true;
      if (stored.endedAt !== undefined && (typeof stored.endedAt !== "number" || !Number.isFinite(stored.endedAt))) return true;
      if (stored.result !== undefined && stored.result !== "succeeded" && stored.result !== "failed" && stored.result !== "cancelled") return true;
      return stored.error !== undefined && typeof stored.error !== "string";
    })) return undefined;
  }
  if (rec.schedule !== undefined) {
    const schedule = asRecord(rec.schedule);
    if (schedule === undefined || parseSchedule(rec.schedule, now) === undefined) return undefined;
    if (typeof schedule.enabled !== "boolean") return undefined;
    if (schedule.nextRunAt !== undefined && (typeof schedule.nextRunAt !== "number" || !Number.isFinite(schedule.nextRunAt))) return undefined;
    if (schedule.lastTriggeredAt !== undefined && (
      typeof schedule.lastTriggeredAt !== "number" || !Number.isFinite(schedule.lastTriggeredAt)
    )) return undefined;
  }
  const task = parseTask(value, now);
  if (task?.status === "running" && !task.executions.some((execution) => execution.endedAt === undefined)) return undefined;
  return task;
}

export function loadBoard(env: NodeJS.ProcessEnv = process.env): TaskRecord[] {
  const path = xtzUiBoardPath(env);
  adoptLegacyPluginFileOnce(
    path,
    legacyHelloPluginFile("board.json", env),
    legacyHelloBoardMigrationMarkerPath(env),
  );
  const parsed = readJsonFile(path);
  if (parsed === undefined) return [];
  const rec = asRecord(parsed);
  const rows = rec !== undefined && Array.isArray(rec.tasks) ? rec.tasks : Array.isArray(parsed) ? parsed : undefined;
  if (rows === undefined) rejectJsonSchema(path, "expected an array or an object with a tasks array");
  const now = Date.now();
  const tasks = rows.map((row) => parseStoredTask(row, now));
  const invalidIndex = tasks.findIndex((task) => task === undefined);
  if (invalidIndex >= 0) rejectJsonSchema(path, `invalid task at index ${String(invalidIndex)}`);
  return tasks as TaskRecord[];
}

export function saveBoard(tasks: readonly TaskRecord[], env: NodeJS.ProcessEnv = process.env): void {
  writeJsonFile(xtzUiBoardPath(env), { tasks });
}

export function newId(): string {
  return randomUUID();
}

export function emptyExecution(now: number): ExecutionRecord {
  return {
    id: newId(),
    sessionId: undefined,
    startedAt: now,
    endedAt: undefined,
    result: undefined,
    error: undefined,
  };
}

export function withStatus(task: TaskRecord, status: TaskStatus, now: number): TaskRecord {
  return { ...task, status, updatedAt: now };
}
