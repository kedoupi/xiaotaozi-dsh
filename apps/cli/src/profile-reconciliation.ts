import { createHash } from "node:crypto";
import { cp, lstat, readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

export const PROFILE_RECONCILE_COMMITTED = ".xiaotaozi-reconcile-committed";

export interface ExpectedPluginSpec {
  readonly name: string;
  readonly spec: string;
}

export interface ProfileManifest {
  dependencies?: Record<string, unknown>;
  dsh?: { profile?: { bundles?: unknown } };
  [key: string]: unknown;
}

export function parseProfileManifest(text: string | null): ProfileManifest | null {
  if (text === null) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as ProfileManifest
      : null;
  } catch {
    return null;
  }
}

export function defaultPluginSpecMismatches(
  manifest: ProfileManifest,
  expected: readonly ExpectedPluginSpec[],
): string[] {
  const dependencies = manifest.dependencies ?? {};
  return expected
    .filter(({ name, spec }) => dependencies[name] !== spec)
    .map(({ name }) => name);
}

export function preservedManifestJson(
  manifest: ProfileManifest,
  managedNames: readonly string[],
  managedBundles: readonly string[],
): string {
  const copy = structuredClone(manifest);
  for (const key of ["dependencies", "devDependencies", "optionalDependencies"] as const) {
    const bag = copy[key];
    if (bag === null || typeof bag !== "object" || Array.isArray(bag)) continue;
    const entries = bag as Record<string, unknown>;
    for (const name of managedNames) delete entries[name];
    if (Object.keys(entries).length === 0) delete copy[key];
  }
  const bundles = copy.dsh?.profile?.bundles;
  if (Array.isArray(bundles)) {
    const managed = new Set(managedBundles);
    copy.dsh!.profile!.bundles = bundles.filter((name) => typeof name !== "string" || !managed.has(name));
  }
  return JSON.stringify(copy);
}

const MUTABLE_ROOT_FILES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "cordis.yml",
  PROFILE_RECONCILE_COMMITTED,
]);

export async function profileSnapshot(root: string): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = join(dir, entry.name);
      const name = relative(root, path).replaceAll("\\", "/");
      if (name === "node_modules" || name.startsWith("node_modules/")) continue;
      if (!name.includes("/") && MUTABLE_ROOT_FILES.has(name)) continue;
      if (entry.isSymbolicLink()) throw new Error(`profile contains symlink: ${path}`);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile()) {
        snapshot[name] = createHash("sha256").update(await readFile(path)).digest("hex");
      }
    }
  }
  await walk(root);
  return snapshot;
}

export async function copyProfileWithoutNodeModules(source: string, target: string): Promise<void> {
  const excluded = new Set([
    join(source, "node_modules"),
    join(source, PROFILE_RECONCILE_COMMITTED),
  ]);
  await cp(source, target, {
    recursive: true,
    filter: async (path) => {
      if (excluded.has(path)) return false;
      if ((await lstat(path)).isSymbolicLink()) throw new Error(`profile contains symlink: ${path}`);
      return true;
    },
  });
}
