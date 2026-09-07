import { join } from "node:path";
import { isProtectedProfileBundle } from "./plugin-spec";
import type { ProfileManifest } from "./profile-reconciliation";

export interface ExtraPluginIo {
  readText(path: string): Promise<string | null>;
  pathExists(path: string): Promise<boolean>;
}

export interface ExtraPluginOk {
  name: string;
  status: "ok";
  entry: string;
}

export interface ExtraPluginUnloadable {
  name: string;
  status: "unloadable";
  reason: string;
}

export type ExtraPluginInspection = ExtraPluginOk | ExtraPluginUnloadable;

export function profileBundleNames(manifest: ProfileManifest): string[] {
  const bundles = manifest.dsh?.profile?.bundles;
  return Array.isArray(bundles) ? bundles.filter((item): item is string => typeof item === "string") : [];
}

export function extraBundleNames(manifest: ProfileManifest): string[] {
  return profileBundleNames(manifest).filter((name) => !isProtectedProfileBundle(name));
}

export function packageInstallDir(profileDir: string, name: string): string {
  return join(profileDir, "node_modules", ...name.split("/"));
}

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

/** Client services that hang DSH 0.1.2 web boot when an extra plugin waits on them. */
export const BOOT_BLOCKING_CLIENT_SERVICES = ["uiConversation"] as const;

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

export function bootBlockingClientService(inject: readonly string[]): string | undefined {
  return inject.find((name) => (BOOT_BLOCKING_CLIENT_SERVICES as readonly string[]).includes(name));
}

/** Resolve `exports["./client"]` when the extra plugin ships a Web Client. */
export function resolveClientEntry(pkg: Record<string, unknown>): string | undefined {
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

export function extraPluginUnloadableMessage(items: readonly ExtraPluginUnloadable[]): string {
  return `已隔离无法加载的额外插件，工作台继续启动：${
    items.map((item) => `${item.name}（${item.reason}）`).join("；")
  }`;
}

export function withoutExtraBundles(manifest: ProfileManifest, names: readonly string[]): ProfileManifest {
  const drop = new Set(names);
  const copy = structuredClone(manifest);
  const bundles = copy.dsh?.profile?.bundles;
  if (!Array.isArray(bundles)) return copy;
  copy.dsh!.profile!.bundles = bundles.filter((name) => typeof name !== "string" || !drop.has(name));
  return copy;
}

export async function inspectExtraPlugin(
  profileDir: string,
  name: string,
  io: ExtraPluginIo,
): Promise<ExtraPluginInspection> {
  const packageDir = packageInstallDir(profileDir, name);
  const manifestText = await io.readText(join(packageDir, "package.json"));
  if (manifestText === null) {
    return { name, status: "unloadable", reason: "缺少 package.json" };
  }
  let pkg: unknown;
  try {
    pkg = JSON.parse(manifestText);
  } catch {
    return { name, status: "unloadable", reason: "package.json 不是有效 JSON" };
  }
  if (pkg === null || typeof pkg !== "object" || Array.isArray(pkg)) {
    return { name, status: "unloadable", reason: "package.json 不是有效 JSON object" };
  }
  const entry = resolvePackageEntry(pkg as Record<string, unknown>);
  const file = resolveEntryFile(packageDir, entry);
  if (file === null) {
    return { name, status: "unloadable", reason: `入口无效：${entry}` };
  }
  if (!await io.pathExists(file)) {
    return { name, status: "unloadable", reason: `缺少入口 ${normalizePackageEntry(entry)}` };
  }
  const clientEntry = resolveClientEntry(pkg as Record<string, unknown>);
  if (clientEntry !== undefined) {
    const clientFile = resolveEntryFile(packageDir, clientEntry);
    if (clientFile !== null && await io.pathExists(clientFile)) {
      const source = await io.readText(clientFile);
      if (source !== null) {
        const blocked = bootBlockingClientService(parseExportedInject(source));
        if (blocked !== undefined) {
          return { name, status: "unloadable", reason: `Client 等待 ${blocked}，会卡住 Web 启动` };
        }
      }
    }
  }
  return { name, status: "ok", entry: normalizePackageEntry(entry) };
}

export async function inspectExtraBundles(
  profileDir: string,
  manifest: ProfileManifest,
  io: ExtraPluginIo,
): Promise<ExtraPluginInspection[]> {
  const inspections: ExtraPluginInspection[] = [];
  for (const name of extraBundleNames(manifest)) {
    inspections.push(await inspectExtraPlugin(profileDir, name, io));
  }
  return inspections;
}

export async function quarantineUnloadableExtraPlugins(
  profileDir: string,
  manifest: ProfileManifest,
  io: ExtraPluginIo,
): Promise<{ manifest: ProfileManifest; quarantined: ExtraPluginUnloadable[] }> {
  const inspections = await inspectExtraBundles(profileDir, manifest, io);
  const quarantined = inspections.filter((item): item is ExtraPluginUnloadable => item.status === "unloadable");
  if (quarantined.length === 0) return { manifest, quarantined: [] };
  return { manifest: withoutExtraBundles(manifest, quarantined.map((item) => item.name)), quarantined };
}
