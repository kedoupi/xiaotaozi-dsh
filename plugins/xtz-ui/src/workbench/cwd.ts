import { isAbsolute } from "node:path";
import { isSafeSessionId } from "../archive/encode.ts";
import { workspacePath } from "../archive/paths.ts";
import { readJsonFile } from "../archive/store.ts";

export interface CwdHost {
  cwdFor(sessionId: string): string | undefined;
}

interface WorkspaceFile {
  tables?: { workspaces?: Record<string, { path?: string; sessionIds?: string[] }> };
}

function asWorkspaceFile(value: unknown): WorkspaceFile | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  return value as WorkspaceFile;
}

export function cwdFromWorkspaceFile(home: string, sessionId: string): string | undefined {
  if (!isSafeSessionId(sessionId)) return undefined;
  const file = asWorkspaceFile(readJsonFile(workspacePath(home)));
  const workspaces = file?.tables?.workspaces ?? {};
  for (const record of Object.values(workspaces)) {
    if (!Array.isArray(record.sessionIds) || !record.sessionIds.includes(sessionId)) continue;
    if (typeof record.path === "string" && record.path !== "" && isAbsolute(record.path)) return record.path;
  }
  return undefined;
}

export function resolveSessionCwd(home: string, sessionId: string, live?: CwdHost): string | undefined {
  if (!isSafeSessionId(sessionId)) return undefined;
  const liveCwd = live?.cwdFor(sessionId);
  if (typeof liveCwd === "string" && liveCwd !== "" && isAbsolute(liveCwd)) return liveCwd;
  return cwdFromWorkspaceFile(home, sessionId);
}
