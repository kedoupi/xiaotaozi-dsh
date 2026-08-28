import { createHash } from "node:crypto";
import { access } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Walk up from cwd to find the xiaotaozi-dsh checkout. */
export async function findXiaotaoziRepo(start = process.cwd()): Promise<string | null> {
  let current = resolve(start);
  const { root } = parse(current);
  for (let i = 0; i < 8; i += 1) {
    const versions = join(current, "versions.json");
    const plugins = join(current, "plugins", "xtz-ui", "package.json");
    const cli = join(current, "apps", "cli", "package.json");
    if (await exists(versions) && await exists(plugins) && await exists(cli)) return current;
    if (current === root) break;
    current = dirname(current);
  }
  return null;
}

export function sandboxHomeFromRepo(repoRoot: string): string {
  return join(repoRoot, ".dsh-home");
}

/** Must match `scripts/sandbox-home.mjs` `SANDBOX_PROCESS_MARKER`. */
export function sandboxProcessMarker(repoRoot: string): string {
  return createHash("sha256")
    .update(`xiaotaozi-dsh-sandbox\0${resolve(repoRoot)}`)
    .digest("hex");
}

export function pluginPathSpec(slug: string): string {
  return `./plugins/${slug}`;
}

export function pluginSlugFromPackage(name: string): string {
  return name.startsWith("dsh-") ? name.slice("dsh-".length) : name;
}
