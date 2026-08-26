import { basename, dirname, isAbsolute, resolve } from "node:path";
import { RouteError } from "../http.ts";

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Last path segment, or the path itself at a filesystem root. */
export function rootLabel(path: string): string {
  const base = basename(path);
  return base !== "" ? base : path;
}

export function parentOf(path: string): string | undefined {
  const parent = dirname(path);
  return parent === path ? undefined : parent;
}

export function requireAbsolute(path: string): string {
  if (path === "" || !isAbsolute(path)) {
    throw new RouteError(400, `"${path}" is not an absolute path`);
  }
  return resolve(path);
}

/**
 * Whether `target` is `base` or a descendant. Separator-tolerant; Windows
 * compares case-insensitively. `platform` is injectable so both branches test
 * on any host.
 */
export function isWithin(base: string, target: string, platform: NodeJS.Platform = process.platform): boolean {
  const norm = (value: string): string => value.replace(/[\\/]+/g, "/").replace(/\/$/u, "");
  const b = norm(base);
  const t = norm(target);
  if (b === "") return false;
  if (platform === "win32") {
    const lb = b.toLowerCase();
    const lt = t.toLowerCase();
    return lt === lb || lt.startsWith(`${lb}/`);
  }
  return t === b || t.startsWith(`${b}/`);
}
