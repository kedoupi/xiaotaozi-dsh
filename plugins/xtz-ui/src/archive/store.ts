import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
