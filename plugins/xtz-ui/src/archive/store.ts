import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { encodeSegment, isSafeSessionId } from "./encode.ts";
import { sessionsDir } from "./paths.ts";

export type JsonStoreErrorKind = "read" | "invalid-json" | "schema" | "serialize" | "write" | "commit";

export class JsonStoreError extends Error {
  readonly name = "JsonStoreError";

  constructor(
    readonly kind: JsonStoreErrorKind,
    readonly filePath: string,
    message: string,
    readonly recoveryPath?: string,
    cause?: unknown,
  ) {
    super(message, { cause });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

function corruptPath(filePath: string): string {
  const stamp = new Date().toISOString().replaceAll(":", "-");
  return `${filePath}.corrupt-${stamp}-${randomUUID().slice(0, 8)}`;
}

function quarantinedError(
  kind: "invalid-json" | "schema",
  filePath: string,
  detail: string,
  cause?: unknown,
): JsonStoreError {
  const recoveryPath = corruptPath(filePath);
  try {
    renameSync(filePath, recoveryPath);
    return new JsonStoreError(
      kind,
      filePath,
      `${detail}; original moved to ${recoveryPath}`,
      recoveryPath,
      cause,
    );
  } catch (quarantineError) {
    return new JsonStoreError(
      kind,
      filePath,
      `${detail}; original retained at ${filePath} because quarantine failed: ${errorMessage(quarantineError)}`,
      undefined,
      cause,
    );
  }
}

export function readJsonFile(filePath: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") return undefined;
    throw new JsonStoreError("read", filePath, `failed to read JSON file ${filePath}: ${errorMessage(error)}`, undefined, error);
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw quarantinedError("invalid-json", filePath, `invalid JSON in ${filePath}: ${errorMessage(error)}`, error);
  }
}

export function rejectJsonSchema(filePath: string, detail: string): never {
  throw quarantinedError("schema", filePath, `invalid JSON schema in ${filePath}: ${detail}`);
}

export function writeJsonFile(filePath: string, data: unknown): void {
  let serialized: string;
  try {
    const json = JSON.stringify(data, null, 2);
    if (json === undefined) throw new TypeError("value is not JSON serializable");
    serialized = `${json}\n`;
  } catch (error) {
    throw new JsonStoreError("serialize", filePath, `failed to serialize JSON for ${filePath}: ${errorMessage(error)}`, undefined, error);
  }
  const dir = dirname(filePath);
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch (error) {
    throw new JsonStoreError("write", filePath, `failed to prepare JSON directory ${dir}: ${errorMessage(error)}`, undefined, error);
  }
  const tmp = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(tmp, serialized, { encoding: "utf8", mode: 0o600 });
  } catch (error) {
    try {
      rmSync(tmp, { force: true });
    } catch {
      // best effort; the original target was never replaced
    }
    throw new JsonStoreError("write", filePath, `failed to write temporary JSON file for ${filePath}: ${errorMessage(error)}`, undefined, error);
  }
  try {
    renameSync(tmp, filePath);
  } catch (error) {
    throw new JsonStoreError(
      "commit",
      filePath,
      `failed to atomically replace ${filePath}: ${errorMessage(error)}; original left unchanged and new data retained at ${tmp}`,
      tmp,
      error,
    );
  }
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
        if (!lstatSync(dir).isDirectory()) continue;
        const direct = join(dir, sessionId);
        if (existsSync(direct) && lstatSync(direct).isDirectory()) return direct;
        if (encoded !== sessionId) {
          const encodedDir = join(dir, encoded);
          if (existsSync(encodedDir) && lstatSync(encodedDir).isDirectory()) return encodedDir;
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

export function findSessionDirStrict(home: string, sessionId: string): string | undefined {
  if (!isSafeSessionId(sessionId)) return undefined;
  const root = sessionsDir(home);
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const name = encodeSegment(sessionId);
  const matches: string[] = [];
  for (const entry of entries) {
    const workspace = join(root, entry);
    let workspaceInfo;
    try {
      workspaceInfo = lstatSync(workspace);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (!workspaceInfo.isDirectory()) continue;
    if (!readdirSync(workspace).includes(name)) continue;
    const candidate = join(workspace, name);
    try {
      if (lstatSync(candidate).isDirectory() && basename(realpathSync(candidate)) === name) matches.push(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (matches.length > 1) throw new Error("duplicate Session directories");
  return matches[0];
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

export function retrySessionDeleteTrash(home: string): boolean {
  const canonicalHome = realpathSync(home);
  const trash = resolve(canonicalHome, "plugins", "xtz-ui", "delete-trash");
  try {
    try {
      if (!lstatSync(trash).isDirectory()) return false;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "ENOENT";
    }
    if (realpathSync(trash) !== trash) return false;
    const sessions = sessionsDir(home);
    if (existsSync(sessions)) {
      const root = realpathSync(sessions);
      const fromSessions = relative(root, trash);
      const toSessions = relative(trash, root);
      const nested = (value: string) => value === "" || (!value.startsWith(`..${sep}`) && value !== ".." && !isAbsolute(value));
      if (nested(fromSessions) || nested(toSessions)) return false;
    }
    chmodSync(trash, 0o700);
    let cleaned = true;
    for (const entry of readdirSync(trash)) {
      if (!entry.startsWith("cleanup-")) continue;
      try {
        rmSync(join(trash, entry), { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch {
        cleaned = false;
      }
    }
    return cleaned;
  } catch {
    return false;
  }
}

export function removeSessionDir(
  home: string,
  sessionDirPath: string,
): { commit(): boolean; rollback(): boolean } {
  const root = realpathSync(resolve(sessionsDir(home)));
  const target = realpathSync(resolve(sessionDirPath));
  const fromRoot = relative(root, target);
  if (fromRoot === "" || fromRoot === ".." || fromRoot.startsWith(`..${sep}`)
    || isAbsolute(fromRoot) || fromRoot.split(sep).length !== 2) {
    throw new Error("refusing to remove a non-Session directory");
  }
  const parent = dirname(target);
  const trash = resolve(realpathSync(home), "plugins", "xtz-ui", "delete-trash");
  mkdirSync(trash, { recursive: true, mode: 0o700 });
  if (!lstatSync(trash).isDirectory()) throw new Error("refusing unsafe delete trash");
  const canonicalTrash = realpathSync(trash);
  const fromSessions = relative(root, canonicalTrash);
  const toSessions = relative(canonicalTrash, root);
  if (
    canonicalTrash !== trash
    || fromSessions === ""
    || (!fromSessions.startsWith(`..${sep}`) && fromSessions !== ".." && !isAbsolute(fromSessions))
    || toSessions === ""
    || (!toSessions.startsWith(`..${sep}`) && toSessions !== ".." && !isAbsolute(toSessions))
  ) {
    throw new Error("refusing unsafe delete trash");
  }
  chmodSync(trash, 0o700);
  if (
    (statSync(trash).mode & 0o077) !== 0
  ) throw new Error("refusing unsafe delete trash");
  const token = randomUUID();
  const rollbackPath = join(trash, `rollback-${token}`);
  const cleanupPath = join(trash, `cleanup-${token}`);
  let quarantine = rollbackPath;
  renameSync(target, quarantine);
  try {
    rmdirSync(parent);
  } catch {
    // best effort
  }
  return {
    commit: () => {
      try {
        renameSync(quarantine, cleanupPath);
        quarantine = cleanupPath;
      } catch {
        return false;
      }
      try {
        rmSync(quarantine, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        return true;
      } catch {
        return false;
      }
    },
    rollback: () => {
      try {
        mkdirSync(parent, { recursive: true, mode: 0o700 });
        renameSync(quarantine, target);
        return true;
      } catch {
        return false;
      }
    },
  };
}
