import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { isSafeSessionId } from "./encode.ts";
import { projcachePath, workspacePath } from "./paths.ts";
import { dirSize, findSessionDir, readJsonFile, removeSessionDir, writeJsonFile } from "./store.ts";
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

interface ProjcacheFile {
  tables?: {
    sessions?: Record<string, {
      identity?: { createdAt?: number };
      rows?: {
        title?: { val?: string };
        sessionStats?: { val?: { turns?: number } };
        tokenUsage?: { val?: { totals?: { outputTokens?: number } } };
      };
    }>;
  };
}

function asWorkspace(value: unknown): WorkspaceFile | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  return value as WorkspaceFile;
}

function asProjcache(value: unknown): ProjcacheFile | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  return value as ProjcacheFile;
}

function untitledTitle(): string {
  return "未命名会话";
}

export function readArchivedIds(home: string, live?: ArchiveLiveHost): string[] {
  const fromLive = live?.archivedIds();
  if (Array.isArray(fromLive)) return fromLive.filter((id) => typeof id === "string");
  const workspace = asWorkspace(readJsonFile(workspacePath(home)));
  return workspace?.global?.archivedSessionIds ?? [];
}

export function listArchives(home: string, live?: ArchiveLiveHost): { items: ArchiveRecord[]; ghostIds: string[] } {
  const workspace = asWorkspace(readJsonFile(workspacePath(home)));
  const projcache = asProjcache(readJsonFile(projcachePath(home)));
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
    let title = typeof rows?.title?.val === "string" ? rows.title.val : undefined;
    let createdAt = sessionMeta?.identity?.createdAt;
    let turns = rows?.sessionStats?.val?.turns ?? 0;
    const outputTokens = rows?.tokenUsage?.val?.totals?.outputTokens ?? 0;
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
  const workspace = asWorkspace(readJsonFile(workspacePath(home)));
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
      const workspace = asWorkspace(readJsonFile(workspacePath(home))) ?? { global: { archivedSessionIds: [] } };
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
  const workspace = asWorkspace(readJsonFile(workspacePath(home)));
  const projcache = asProjcache(readJsonFile(projcachePath(home)));
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
