import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type MarketStateKind = "intents" | "sources";
export type MarketStateErrorCode = "invalid-json" | "invalid-schema" | "read-failed" | "write-failed";

export interface MarketStateIo {
  readText: (path: string) => string;
  ensureParent: (path: string) => void;
  writePrivate: (path: string, text: string) => void;
  replace: (from: string, to: string) => void;
  remove: (path: string) => void;
}

const nodeStateIo: MarketStateIo = {
  readText: (path) => readFileSync(path, "utf8"),
  ensureParent: (path) => mkdirSync(dirname(path), { recursive: true, mode: 0o700 }),
  writePrivate: (path, text) => writeFileSync(path, text, { encoding: "utf8", mode: 0o600 }),
  replace: (from, to) => renameSync(from, to),
  remove: (path) => rmSync(path, { force: true }),
};

function errorDetail(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return detail.length > 240 ? `${detail.slice(0, 237)}...` : detail;
}

function stateErrorMessage(
  code: MarketStateErrorCode,
  kind: MarketStateKind,
  path: string,
  detail?: string,
): string {
  if (code === "invalid-json") {
    return `Market ${kind} state is not valid JSON at ${path}; the original file was kept. Fix it or move it aside, then retry.`;
  }
  if (code === "invalid-schema") {
    const suffix = detail === undefined || detail === "" ? "" : ` (${detail})`;
    return `Market ${kind} state has an invalid schema at ${path}${suffix}; the original file was kept. Fix it or move it aside, then retry.`;
  }
  if (code === "read-failed") {
    return `Market ${kind} state could not be read at ${path}: ${detail ?? "unknown error"}. Fix the file permissions, then retry.`;
  }
  return `Market ${kind} state could not be written at ${path}: ${detail ?? "unknown error"}. The existing file was kept when possible; fix permissions or disk space, then retry.`;
}

export class MarketStateError extends Error {
  override readonly name = "MarketStateError";

  constructor(
    readonly code: MarketStateErrorCode,
    readonly kind: MarketStateKind,
    readonly path: string,
    detail?: string,
  ) {
    super(stateErrorMessage(code, kind, path, detail));
  }
}

function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

/** Read a state file. Only an absent file is an empty state; malformed data is preserved and reported. */
export function loadMarketState<T>(
  path: string,
  kind: MarketStateKind,
  parse: (value: unknown) => T,
  io: MarketStateIo = nodeStateIo,
): T | undefined {
  let text: string;
  try {
    text = io.readText(path);
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw new MarketStateError("read-failed", kind, path, errorDetail(error));
  }

  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new MarketStateError("invalid-json", kind, path);
  }

  try {
    return parse(value);
  } catch (error) {
    if (error instanceof MarketStateError) throw error;
    throw new MarketStateError("invalid-schema", kind, path, errorDetail(error));
  }
}

/** Atomically replace a state file and remove a failed temporary write. */
export function saveMarketState(
  path: string,
  kind: MarketStateKind,
  value: unknown,
  io: MarketStateIo = nodeStateIo,
): void {
  const tmp = `${path}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
  try {
    io.ensureParent(path);
    io.writePrivate(tmp, `${JSON.stringify(value, null, 2)}\n`);
    io.replace(tmp, path);
  } catch (error) {
    try {
      io.remove(tmp);
    } catch {
      // The write error below remains the actionable failure.
    }
    throw new MarketStateError("write-failed", kind, path, errorDetail(error));
  }
}
