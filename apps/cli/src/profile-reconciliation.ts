import { cp } from "node:fs/promises";
import { join } from "node:path";

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

export async function copyProfileWithoutNodeModules(source: string, target: string): Promise<void> {
  const excluded = join(source, "node_modules");
  await cp(source, target, {
    recursive: true,
    filter: (path) => path !== excluded,
  });
}
