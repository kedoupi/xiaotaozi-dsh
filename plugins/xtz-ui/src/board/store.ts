import { randomUUID } from "node:crypto";
import { adoptLegacyPluginFile, legacyHelloPluginFile, xtzUiBoardPath } from "../dsh-home.ts";
import { readJsonFile, writeJsonFile } from "../archive/store.ts";
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

export function loadBoard(env: NodeJS.ProcessEnv = process.env): TaskRecord[] {
  const path = xtzUiBoardPath(env);
  adoptLegacyPluginFile(path, legacyHelloPluginFile("board.json", env));
  const parsed = readJsonFile(path);
  const rec = asRecord(parsed);
  const rows = rec !== undefined && Array.isArray(rec.tasks) ? rec.tasks : Array.isArray(parsed) ? parsed : [];
  const now = Date.now();
  return rows.map((row) => parseTask(row, now)).filter((item): item is TaskRecord => item !== undefined);
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
