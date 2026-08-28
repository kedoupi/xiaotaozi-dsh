import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { isSafeSessionId } from "./encode.ts";
import { projcachePath, workspacePath } from "./paths.ts";
import { dirSize, findSessionDir, readJsonFile, rejectJsonSchema, removeSessionDir, writeJsonFile } from "./store.ts";
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
  detachLive(sessionId: string): void;
  emitDisposed(sessionId: string): void;
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
  const workspace = readWorkspace(home);
  return workspace?.global?.archivedSessionIds ?? [];
}

export function listArchives(home: string, live?: ArchiveLiveHost): { items: ArchiveRecord[]; ghostIds: string[] } {
  const workspace = readWorkspace(home);
  const projcache = readProjcache(home);
  const archivedIds = readArchivedIds(home, live);
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
    if (!hasDataFile && sessionMeta === undefined) {
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

export async function pruneGhostIds(home: string, ghostIds: string[], live?: ArchiveLiveHost): Promise<void> {
  if (ghostIds.length === 0) return;
  const workspace = readWorkspace(home);
  if (workspace?.global?.archivedSessionIds === undefined) return;
  const drop = new Set(ghostIds);
  workspace.global.archivedSessionIds = workspace.global.archivedSessionIds.filter((id) => !drop.has(id));
  writeJsonFile(workspacePath(home), workspace);
  try {
    await live?.setArchivedIds(workspace.global.archivedSessionIds);
  } catch {
    // file is already the source of truth
  }
}

export function previewArchive(home: string, sessionId: string): SessionDetail | undefined {
  if (!isSafeSessionId(sessionId)) return undefined;
  const dataDir = findSessionDir(home, sessionId);
  if (dataDir === undefined) return undefined;
  return extractSessionDetail(dataDir, 50);
}

export async function unarchiveSessions(home: string, sessionIds: string[], live?: ArchiveLiveHost): Promise<MutateResult> {
  const wanted = sessionIds.filter(isSafeSessionId);
  const done: string[] = [];
  const notFound: string[] = [];
  const errors: string[] = [];
  const current = readArchivedIds(home, live);
  const drop = new Set(wanted);
  const next = current.filter((id) => {
    if (drop.has(id)) {
      done.push(id);
      return false;
    }
    return true;
  });
  for (const id of wanted) {
    if (!done.includes(id)) notFound.push(id);
  }
  if (done.length === 0) return { done, notFound, errors };
  let persisted = false;
  if (live !== undefined) {
    try {
      await live.setArchivedIds(next);
      persisted = true;
    } catch {
      // fall through to workspace.json
    }
  }
  if (!persisted) {
    try {
      const workspace = readWorkspace(home) ?? { global: { archivedSessionIds: [] } };
      if (workspace.global === undefined) workspace.global = {};
      workspace.global.archivedSessionIds = next;
      writeJsonFile(workspacePath(home), workspace);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { done, notFound, errors };
}

export async function deleteSessions(home: string, sessionIds: string[], live?: ArchiveLiveHost): Promise<MutateResult> {
  const wanted = sessionIds.filter(isSafeSessionId);
  const done: string[] = [];
  const notFound: string[] = [];
  const errors: string[] = [];
  const workspace = readWorkspace(home);
  const projcache = readProjcache(home);
  let wsChanged = false;
  let pcChanged = false;

  for (const sid of wanted) {
    let found = false;
    try {
      live?.detachLive(sid);
      live?.emitDisposed(sid);
    } catch {
      // live teardown is best-effort
    }
    if (workspace?.global?.archivedSessionIds !== undefined) {
      const before = workspace.global.archivedSessionIds.length;
      workspace.global.archivedSessionIds = workspace.global.archivedSessionIds.filter((id) => id !== sid);
      if (workspace.global.archivedSessionIds.length !== before) {
        wsChanged = true;
        found = true;
      }
    }
    if (workspace?.tables?.workspaces !== undefined) {
      for (const ws of Object.values(workspace.tables.workspaces)) {
        if (!Array.isArray(ws.sessionIds)) continue;
        const before = ws.sessionIds.length;
        ws.sessionIds = ws.sessionIds.filter((id) => id !== sid);
        if (ws.sessionIds.length !== before) {
          wsChanged = true;
          found = true;
        }
      }
    }
    if (projcache?.tables?.sessions !== undefined && projcache.tables.sessions[sid] !== undefined) {
      delete projcache.tables.sessions[sid];
      pcChanged = true;
      found = true;
    }
    const dataDir = findSessionDir(home, sid);
    if (dataDir !== undefined) {
      try {
        removeSessionDir(home, dataDir);
        found = true;
      } catch (error) {
        errors.push(`${sid}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (found) done.push(sid);
    else notFound.push(sid);
  }

  if (wsChanged && workspace !== undefined) {
    try {
      writeJsonFile(workspacePath(home), workspace);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (pcChanged && projcache !== undefined) {
    try {
      writeJsonFile(projcachePath(home), projcache);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (live !== undefined && workspace?.global?.archivedSessionIds !== undefined) {
    try {
      await live.setArchivedIds(workspace.global.archivedSessionIds);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { done, notFound, errors };
}
