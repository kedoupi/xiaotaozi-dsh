import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { isSafeSessionId } from "./encode.ts";
import { projcachePath, workspacePath } from "./paths.ts";
import { dirSize, findSessionDir, findSessionDirStrict, readJsonFile, rejectJsonSchema, removeSessionDir, retrySessionDeleteTrash, writeJsonFile } from "./store.ts";
import { pluginTrace } from "../trace.ts";
import { extractSessionDetail, readSessionMetaFromDataFile, type SessionDetail } from "./transcript.ts";

export interface ArchiveRecord {
  sessionId: string;
  title: string;
  workspacePath: string | undefined;
  workspaceTitle: string | undefined;
  workspaceId: string | undefined;
  createdAt: number | undefined;
  turns: number;
  outputTokens: number;
  dataSize: number;
  hasDataFile: boolean;
}

export interface MutateResult {
  done: string[];
  notFound: string[];
  errors: string[];
}

export interface ArchiveLiveHost {
  archivedIds(): string[] | undefined;
  setArchivedIds(ids: string[]): Promise<void>;
  mutateArchivedIds?<T>(
    mutation: (ids: string[]) => Promise<{ ids: string[]; result: T }> | { ids: string[]; result: T },
  ): Promise<T>;
  detachLive(sessionId: string): void;
  emitDisposed(sessionId: string): void;
  isLive?(sessionId: string): boolean;
}

interface WorkspaceFile {
  global?: { archivedSessionIds?: string[] };
  tables?: { workspaces?: Record<string, { path?: string; title?: string; sessionIds?: string[] }> };
}

interface ProjectionCheckpointRow {
  ver: number;
  seq: number;
  val: unknown;
}

interface ProjcacheFile {
  tables?: {
    sessions?: Record<string, {
      identity?: { createdAt?: number };
      rows?: Record<string, ProjectionCheckpointRow | undefined>;
    }>;
  };
}

const PINNED_PROJECTION_STATE_VERSION = {
  title: 1,
  sessionStats: 1,
  tokenUsage: 1,
} as const;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function readWorkspace(home: string): WorkspaceFile | undefined {
  const path = workspacePath(home);
  const value = readJsonFile(path);
  if (value === undefined) return undefined;
  const root = asRecord(value);
  if (root === undefined) rejectJsonSchema(path, "expected an object");
  if (root.global !== undefined) {
    const global = asRecord(root.global);
    if (global === undefined) rejectJsonSchema(path, "global must be an object");
    if (global.archivedSessionIds !== undefined && !isStringArray(global.archivedSessionIds)) {
      rejectJsonSchema(path, "global.archivedSessionIds must be an array of strings");
    }
  }
  if (root.tables !== undefined) {
    const tables = asRecord(root.tables);
    if (tables === undefined) rejectJsonSchema(path, "tables must be an object");
    if (tables.workspaces !== undefined) {
      const workspaces = asRecord(tables.workspaces);
      if (workspaces === undefined) rejectJsonSchema(path, "tables.workspaces must be an object");
      for (const [id, value] of Object.entries(workspaces)) {
        const workspace = asRecord(value);
        if (workspace === undefined) rejectJsonSchema(path, `workspace ${id} must be an object`);
        if (workspace.path !== undefined && typeof workspace.path !== "string") {
          rejectJsonSchema(path, `workspace ${id}.path must be a string`);
        }
        if (workspace.title !== undefined && typeof workspace.title !== "string") {
          rejectJsonSchema(path, `workspace ${id}.title must be a string`);
        }
        if (workspace.sessionIds !== undefined && !isStringArray(workspace.sessionIds)) {
          rejectJsonSchema(path, `workspace ${id}.sessionIds must be an array of strings`);
        }
      }
    }
  }
  return value as WorkspaceFile;
}

function optionalFiniteNumber(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function checkpointRow(path: string, label: string, value: unknown): ProjectionCheckpointRow {
  const row = asRecord(value);
  if (
    row === undefined
    || typeof row.ver !== "number"
    || !Number.isInteger(row.ver)
    || row.ver < 0
    || typeof row.seq !== "number"
    || !Number.isInteger(row.seq)
    || row.seq < -1
    || !Object.prototype.hasOwnProperty.call(row, "val")
  ) {
    rejectJsonSchema(path, `${label} must be a checkpoint row with nonnegative integer ver, integer seq >= -1, and val`);
  }
  return { ver: row.ver, seq: row.seq, val: row.val };
}

function readProjcache(home: string): ProjcacheFile | undefined {
  const path = projcachePath(home);
  const value = readJsonFile(path);
  if (value === undefined) return undefined;
  const root = asRecord(value);
  if (root === undefined) rejectJsonSchema(path, "expected an object");
  if (root.tables === undefined) return value as ProjcacheFile;
  const tables = asRecord(root.tables);
  if (tables === undefined) rejectJsonSchema(path, "tables must be an object");
  if (tables.sessions === undefined) return value as ProjcacheFile;
  const sessions = asRecord(tables.sessions);
  if (sessions === undefined) rejectJsonSchema(path, "tables.sessions must be an object");
  for (const [id, value] of Object.entries(sessions)) {
    const session = asRecord(value);
    if (session === undefined) rejectJsonSchema(path, `session ${id} must be an object`);
    if (session.identity !== undefined) {
      const identity = asRecord(session.identity);
      if (identity === undefined || !optionalFiniteNumber(identity.createdAt)) {
        rejectJsonSchema(path, `session ${id}.identity is invalid`);
      }
    }
    if (session.rows !== undefined) {
      const rows = asRecord(session.rows);
      if (rows === undefined) rejectJsonSchema(path, `session ${id}.rows must be an object`);
      for (const [key, value] of Object.entries(rows)) {
        const row = checkpointRow(path, `session ${id}.rows.${key}`, value);
        if (key === "title" && row.ver === PINNED_PROJECTION_STATE_VERSION.title) {
          if (row.val !== null && typeof row.val !== "string") {
            rejectJsonSchema(path, `session ${id}.rows.title.val is invalid for state version ${row.ver}`);
          }
        }
        if (key === "sessionStats" && row.ver === PINNED_PROJECTION_STATE_VERSION.sessionStats) {
          const statsValue = asRecord(row.val);
          if (statsValue === undefined || !optionalFiniteNumber(statsValue.turns)) {
            rejectJsonSchema(path, `session ${id}.rows.sessionStats.val is invalid for state version ${row.ver}`);
          }
        }
        if (key === "tokenUsage" && row.ver === PINNED_PROJECTION_STATE_VERSION.tokenUsage) {
          const usageValue = asRecord(row.val);
          const totals = usageValue?.totals === undefined ? undefined : asRecord(usageValue.totals);
          if (
            usageValue === undefined
            || (usageValue.totals !== undefined && totals === undefined)
            || (totals !== undefined && !optionalFiniteNumber(totals.outputTokens))
          ) {
            rejectJsonSchema(path, `session ${id}.rows.tokenUsage.val is invalid for state version ${row.ver}`);
          }
        }
      }
    }
  }
  return value as ProjcacheFile;
}

function currentProjectionValue(
  row: ProjectionCheckpointRow | undefined,
  stateVersion: number,
): unknown {
  return row?.ver === stateVersion ? row.val : undefined;
}

function untitledTitle(): string {
  return "未命名会话";
}

export function readArchivedIds(home: string, live?: ArchiveLiveHost): string[] {
  const fromLive = live?.archivedIds();
  if (Array.isArray(fromLive)) return fromLive.filter((id) => typeof id === "string");
  if (live?.mutateArchivedIds !== undefined) throw new Error("workspace registry unavailable");
  const workspace = readWorkspace(home);
  return workspace?.global?.archivedSessionIds ?? [];
}

export function listArchives(home: string, live?: ArchiveLiveHost): { items: ArchiveRecord[]; ghostIds: string[] } {
  const archivedIds = readArchivedIds(home, live);
  const workspace = readWorkspace(home);
  const projcache = readProjcache(home);
  const workspaces = workspace?.tables?.workspaces ?? {};
  const sessions = projcache?.tables?.sessions ?? {};

  const sessionToWorkspace = new Map<string, { id: string; path: string; title: string }>();
  for (const [wsId, ws] of Object.entries(workspaces)) {
    const wsPath = ws.path ?? "";
    const wsTitle = ws.title || (wsPath !== "" ? basename(wsPath) : "");
    for (const sid of ws.sessionIds ?? []) {
      sessionToWorkspace.set(sid, { id: wsId, path: wsPath, title: wsTitle });
    }
  }

  const items: ArchiveRecord[] = [];
  const ghostIds: string[] = [];
  for (const sid of archivedIds) {
    if (!isSafeSessionId(sid)) continue;
    const wsInfo = sessionToWorkspace.get(sid);
    const sessionMeta = sessions[sid];
    const rows = sessionMeta?.rows;
    const titleValue = currentProjectionValue(rows?.title, PINNED_PROJECTION_STATE_VERSION.title);
    const statsValue = asRecord(currentProjectionValue(rows?.sessionStats, PINNED_PROJECTION_STATE_VERSION.sessionStats));
    const usageValue = asRecord(currentProjectionValue(rows?.tokenUsage, PINNED_PROJECTION_STATE_VERSION.tokenUsage));
    const usageTotals = usageValue === undefined ? undefined : asRecord(usageValue.totals);
    let title = typeof titleValue === "string" ? titleValue : undefined;
    let createdAt = sessionMeta?.identity?.createdAt;
    let turns = typeof statsValue?.turns === "number" ? statsValue.turns : 0;
    const outputTokens = typeof usageTotals?.outputTokens === "number" ? usageTotals.outputTokens : 0;
    const dataDir = findSessionDir(home, sid);
    let dataSize = 0;
    let hasDataFile = false;
    if (dataDir !== undefined) {
      dataSize = dirSize(dataDir);
      hasDataFile = existsSync(join(dataDir, "session.jsonl.zstd")) || existsSync(join(dataDir, "session.jsonl"));
      if (hasDataFile && (title === undefined || createdAt === undefined || turns === 0)) {
        const fileMeta = readSessionMetaFromDataFile(dataDir);
        title ??= fileMeta.title;
        createdAt ??= fileMeta.createdAt;
        if (turns === 0) turns = fileMeta.turns;
      }
    }
    if (!hasDataFile && sessionMeta === undefined && !live?.isLive?.(sid)) {
      ghostIds.push(sid);
      continue;
    }
    items.push({
      sessionId: sid,
      title: title && title !== "" ? title : untitledTitle(),
      workspacePath: wsInfo?.path,
      workspaceTitle: wsInfo?.title,
      workspaceId: wsInfo?.id,
      createdAt,
      turns,
      outputTokens,
      dataSize,
      hasDataFile,
    });
  }
  items.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return { items, ghostIds };
}

export function previewArchive(home: string, sessionId: string, live?: ArchiveLiveHost): SessionDetail | undefined {
  if (!isSafeSessionId(sessionId) || !readArchivedIds(home, live).includes(sessionId)) return undefined;
  const dataDir = findSessionDirStrict(home, sessionId);
  if (dataDir === undefined) return undefined;
  return extractSessionDetail(dataDir, 50);
}

export async function unarchiveSessions(home: string, sessionIds: string[], live?: ArchiveLiveHost): Promise<MutateResult> {
  const wanted = [...new Set(sessionIds.filter(isSafeSessionId))];
  const update = (current: string[]): { ids: string[]; result: MutateResult } => {
    const drop = new Set(wanted);
    const done = current.filter((id) => drop.has(id));
    const found = new Set(done);
    return {
      ids: current.filter((id) => !drop.has(id)),
      result: { done, notFound: wanted.filter((id) => !found.has(id)), errors: [] },
    };
  };
  if (live?.mutateArchivedIds !== undefined) {
    try {
      return await live.mutateArchivedIds(update);
    } catch (error) {
      return { done: [], notFound: [], errors: [error instanceof Error ? error.message : String(error)] };
    }
  }
  const outcome = update(readArchivedIds(home));
  if (outcome.result.done.length === 0) return outcome.result;
  try {
    const workspace = readWorkspace(home) ?? { global: { archivedSessionIds: [] } };
    if (workspace.global === undefined) workspace.global = {};
    workspace.global.archivedSessionIds = outcome.ids;
    writeJsonFile(workspacePath(home), workspace);
  } catch (error) {
    return { done: [], notFound: outcome.result.notFound, errors: [error instanceof Error ? error.message : String(error)] };
  }
  return outcome.result;
}

async function deleteFromArchivedSet(
  home: string,
  wanted: string[],
  archivedIds: string[],
  live: ArchiveLiveHost | undefined,
): Promise<{ ids: string[]; result: MutateResult }> {
  const done: string[] = [];
  const notFound: string[] = [];
  const errors: string[] = [];
  const archived = new Set(archivedIds);
  const workspace = readWorkspace(home);
  let wsChanged = false;
  const quarantines: Array<{ commit(): boolean; rollback(): boolean }> = [];

  for (const sid of wanted) {
    if (!archived.has(sid)) {
      notFound.push(sid);
      continue;
    }
    if (live?.isLive?.(sid)) {
      errors.push("live session deletion refused");
      continue;
    }
    try {
      live?.detachLive(sid);
      live?.emitDisposed(sid);
    } catch {
      // live teardown is best-effort
    }
    try {
      const dataDir = findSessionDirStrict(home, sid);
      if (dataDir !== undefined) quarantines.push(removeSessionDir(home, dataDir));
    } catch {
      errors.push("session data removal failed");
      continue;
    }
    if (workspace?.global?.archivedSessionIds !== undefined) {
      workspace.global.archivedSessionIds = workspace.global.archivedSessionIds.filter((id) => id !== sid);
      wsChanged = true;
    }
    if (workspace?.tables?.workspaces !== undefined) {
      for (const ws of Object.values(workspace.tables.workspaces)) {
        if (!Array.isArray(ws.sessionIds) || !ws.sessionIds.includes(sid)) continue;
        ws.sessionIds = ws.sessionIds.filter((id) => id !== sid);
        wsChanged = true;
      }
    }
    done.push(sid);
  }

  let commitFailed = false;
  if (wsChanged && workspace !== undefined) {
    try {
      writeJsonFile(workspacePath(home), workspace);
    } catch {
      errors.push("workspace metadata write failed");
      commitFailed = true;
    }
  }
  if (commitFailed) {
    for (const quarantine of quarantines) {
      if (!quarantine.rollback()) pluginTrace("archive delete rollback=pending");
    }
    return { ids: archivedIds, result: { done: [], notFound, errors } };
  }
  for (const quarantine of quarantines) {
    if (!quarantine.commit()) {
      pluginTrace("archive delete cleanup=pending");
      if (!errors.includes("delete cleanup pending")) errors.push("delete cleanup pending");
    }
  }
  const removed = new Set(done);
  return { ids: archivedIds.filter((id) => !removed.has(id)), result: { done, notFound, errors } };
}

export async function deleteSessions(home: string, sessionIds: string[], live?: ArchiveLiveHost): Promise<MutateResult> {
  const wanted = [...new Set(sessionIds.filter(isSafeSessionId))];
  if (!retrySessionDeleteTrash(home)) pluginTrace("archive delete cleanup=pending");
  if (live?.mutateArchivedIds !== undefined) {
    const ids = live.archivedIds();
    if (ids === undefined) {
      return { done: [], notFound: [], errors: ["permanent deletion unavailable while DSH is running"] };
    }
    const archived = new Set(ids);
    const notFound = wanted.filter((id) => !archived.has(id));
    return {
      done: [],
      notFound,
      errors: wanted.length === notFound.length ? [] : ["permanent deletion unavailable while DSH is running"],
    };
  }
  const outcome = await deleteFromArchivedSet(home, wanted, readArchivedIds(home, live), live);
  if (live !== undefined && outcome.result.done.length > 0) {
    try {
      await live.setArchivedIds(outcome.ids);
    } catch {
      outcome.result.errors.push("archive membership write failed");
    }
  }
  return outcome.result;
}
