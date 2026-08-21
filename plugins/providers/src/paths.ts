import { chmod, copyFile, mkdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

function home(): string {
  return process.env.DSH_HOME ?? join(homedir(), ".dsh");
}

export function pluginData(...parts: string[]): string {
  return join(home(), "plugins", "providers", ...parts);
}

function legacyPluginData(...parts: string[]): string {
  return join(home(), "plugins", "passport", ...parts);
}

export async function ensurePluginDir(): Promise<string> {
  const dir = join(home(), "plugins", "providers");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  try {
    await chmod(dir, 0o700);
  } catch {
    // chmod can fail on some volume types; the mkdir mode still applied for new dirs
  }
  return dir;
}

let migrated = false;

/** Copy auth/selection/models from the pre-rename `plugins/passport` dir once. */
export async function migrateLegacyPluginData(): Promise<void> {
  if (migrated) return;
  migrated = true;
  await ensurePluginDir();
  for (const file of ["auth.json", "selection.json", "models.json", "device-id"] as const) {
    const dest = pluginData(file);
    try {
      await stat(dest);
    } catch {
      try {
        await copyFile(legacyPluginData(file), dest);
      } catch {
        // no legacy file
      }
    }
  }
}
