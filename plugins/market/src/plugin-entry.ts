import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CatalogEntry } from "./catalog.ts";
import { dshHome } from "./dsh-home.ts";
import { explainMutateError } from "./mutate-error.ts";

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

const BOOT_BLOCKING_CLIENT_SERVICES = ["uiConversation"] as const;
const INJECT_ASSIGN =
  /(?:export\s+const\s+inject|exports\.inject|const\s+inject)\s*=\s*\[([^\]]*)\]/gu;

export function parseExportedInject(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(INJECT_ASSIGN)) {
    const block = match[1];
    if (block === undefined) continue;
    for (const item of block.matchAll(/["']([A-Za-z][A-Za-z0-9_]*)["']/g)) {
      if (item[1] !== undefined) names.push(item[1]);
    }
  }
  return [...new Set(names)];
}

function resolveClientEntry(pkg: Record<string, unknown>): string | undefined {
  const exportsField = pkg.exports;
  if (exportsField === null || typeof exportsField !== "object" || Array.isArray(exportsField)) {
    return undefined;
  }
  const client = (exportsField as Record<string, unknown>)["./client"];
  if (typeof client === "string" && client.trim() !== "") return client;
  if (client === null || typeof client !== "object" || Array.isArray(client)) return undefined;
  const hit = firstNonEmptyString(
    (client as Record<string, unknown>).import,
    (client as Record<string, unknown>).default,
    (client as Record<string, unknown>).require,
  );
  return hit ?? undefined;
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
  const clientEntry = resolveClientEntry(pkg as Record<string, unknown>);
  if (clientEntry !== undefined) {
    const clientFile = resolveEntryFile(packageDir, clientEntry);
    if (clientFile !== null && existsSync(clientFile)) {
      let source = "";
      try {
        source = readFileSync(clientFile, "utf8");
      } catch {
        source = "";
      }
      const blocked = parseExportedInject(source).find((name) =>
        (BOOT_BLOCKING_CLIENT_SERVICES as readonly string[]).includes(name)
      );
      if (blocked !== undefined) {
        return { ok: false, reason: `Client waits for ${blocked} (would hang Web boot)` };
      }
    }
  }
  return { ok: true };
}

export function installedPluginLoadError(inspection: PluginEntryInspection): string {
  if (inspection.ok) return "";
  return explainMutateError(`${inspection.reason}; install rolled back`);
}
