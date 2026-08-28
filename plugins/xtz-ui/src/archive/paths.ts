import { join } from "node:path";

export function workspacePath(home: string): string {
  return join(home, "storages", "workspace.json");
}

export function projcachePath(home: string): string {
  return join(home, "storages", "session_projcache.json");
}

export function sessionsDir(home: string): string {
  return join(home, "sessions");
}
