import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { encodeSegment, isSafeSessionId } from "./encode.ts";
import { sessionsDir } from "./paths.ts";

export function readJsonFile(filePath: string): unknown {
  if (!existsSync(filePath)) return undefined;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

export function writeJsonFile(filePath: string, data: unknown): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, filePath);
}

export function findSessionDir(home: string, sessionId: string): string | undefined {
  if (!isSafeSessionId(sessionId)) return undefined;
  const root = sessionsDir(home);
  if (!existsSync(root)) return undefined;
  const encoded = encodeSegment(sessionId);
  try {
    for (const entry of readdirSync(root)) {
      const dir = join(root, entry);
      try {
        if (!statSync(dir).isDirectory()) continue;
        const direct = join(dir, sessionId);
        if (existsSync(direct) && statSync(direct).isDirectory()) return direct;
        if (encoded !== sessionId) {
          const encodedDir = join(dir, encoded);
          if (existsSync(encodedDir) && statSync(encodedDir).isDirectory()) return encodedDir;
        }
      } catch {
        // skip unreadable entries
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function dirSize(dir: string): number {
  if (!existsSync(dir)) return 0;
  let total = 0;
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const info = statSync(full);
      total += info.isDirectory() ? dirSize(full) : info.size;
    }
  } catch {
    return total;
  }
  return total;
}

export function removeSessionDir(home: string, sessionDirPath: string): void {
  rmSync(sessionDirPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  const parent = dirname(sessionDirPath);
  const root = sessionsDir(home);
  if (parent === root || dirname(parent) !== root) return;
  try {
    if (readdirSync(parent).length === 0) rmSync(parent, { recursive: true, force: true });
  } catch {
    // best effort
  }
}
