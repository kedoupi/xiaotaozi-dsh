import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CatalogEntry } from "./catalog.ts";
import { dshHome } from "./dsh-home.ts";

export type PluginEntryInspection = { ok: true } | { ok: false; reason: string };

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return null;
}

/** Resolve the Host entry DSH would load: exports["."] then main / module, else index.js. */
export function resolvePackageEntry(pkg: Record<string, unknown>): string {
  const exportsField = pkg.exports;
  if (typeof exportsField === "string" && exportsField.trim() !== "") return exportsField;
  if (exportsField !== null && typeof exportsField === "object" && !Array.isArray(exportsField)) {
    const root = (exportsField as Record<string, unknown>)["."];
    if (typeof root === "string" && root.trim() !== "") return root;
    if (root !== null && typeof root === "object" && !Array.isArray(root)) {
      const cond = root as Record<string, unknown>;
      const hit = firstNonEmptyString(cond.import, cond.default, cond.require, cond.node);
      if (hit !== null) return hit;
    }
  }
  return firstNonEmptyString(pkg.main, pkg.module) ?? "index.js";
}

export function normalizePackageEntry(entry: string): string {
  return entry.replace(/^\.\//u, "");
}

export function resolveEntryFile(packageDir: string, entry: string): string | null {
  const relative = normalizePackageEntry(entry);
  if (
    relative === ""
    || relative.startsWith("/")
    || relative.includes("\\")
    || relative.split("/").includes("..")
    || /^[A-Za-z]:/u.test(relative)
  ) {
    return null;
  }
  return join(packageDir, relative);
}

export function webProfileDir(env: NodeJS.ProcessEnv = process.env): string {
  const profile = env.DSH_PROFILE?.trim() || "web";
  return join(dshHome(env), "profiles", profile);
}

export function inspectInstalledPluginEntry(
  entry: Pick<CatalogEntry, "packageName">,
  env: NodeJS.ProcessEnv = process.env,
): PluginEntryInspection {
  const name = entry.packageName;
  if (typeof name !== "string" || name === "") return { ok: false, reason: "missing package name" };
  const packageDir = join(webProfileDir(env), "node_modules", ...name.split("/"));
  let pkg: unknown;
  try {
    pkg = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  } catch {
    return { ok: false, reason: "plugin has no loadable entry (missing package.json)" };
  }
  if (pkg === null || typeof pkg !== "object" || Array.isArray(pkg)) {
    return { ok: false, reason: "plugin has no loadable entry (invalid package.json)" };
  }
  const resolved = resolvePackageEntry(pkg as Record<string, unknown>);
  const file = resolveEntryFile(packageDir, resolved);
  if (file === null) {
    return { ok: false, reason: `plugin has no loadable entry (invalid ${normalizePackageEntry(resolved)})` };
  }
  if (!existsSync(file)) {
    return { ok: false, reason: `plugin has no loadable entry (missing ${normalizePackageEntry(resolved)})` };
  }
  return { ok: true };
}

export function installedPluginLoadError(inspection: PluginEntryInspection): string {
  if (inspection.ok) return "";
  return `${inspection.reason}; install rolled back`;
}
