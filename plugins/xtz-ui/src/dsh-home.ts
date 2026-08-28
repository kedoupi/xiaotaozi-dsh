import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const PLUGIN_SLUG = "xtz-ui";
export const LEGACY_PLUGIN_SLUG = "hello";

/** Harness home: sandbox `.dsh-home` when `DSH_HOME` is set, else `~/.dsh`. */
export function dshHome(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.DSH_HOME;
  if (typeof home === "string" && home !== "") return home;
  return join(homedir(), ".dsh");
}

export function xtzUiPluginFile(name: string, env: NodeJS.ProcessEnv = process.env): string {
  return join(dshHome(env), "plugins", PLUGIN_SLUG, name);
}

export function legacyHelloPluginFile(name: string, env: NodeJS.ProcessEnv = process.env): string {
  return join(dshHome(env), "plugins", LEGACY_PLUGIN_SLUG, name);
}

export function xtzUiSettingsPath(env: NodeJS.ProcessEnv = process.env): string {
  return xtzUiPluginFile("settings.json", env);
}

export function xtzUiBoardPath(env: NodeJS.ProcessEnv = process.env): string {
  return xtzUiPluginFile("board.json", env);
}

export function legacyHelloBoardMigrationMarkerPath(env: NodeJS.ProcessEnv = process.env): string {
  return xtzUiPluginFile(".legacy-hello-board-v1.done", env);
}

/** Copy `plugins/hello/<file>` into `plugins/xtz-ui/` when the new path is missing. */
export function adoptLegacyPluginFile(currentPath: string, legacyPath: string): void {
  if (existsSync(currentPath) || !existsSync(legacyPath)) return;
  mkdirSync(dirname(currentPath), { recursive: true, mode: 0o700 });
  copyFileSync(legacyPath, currentPath);
}

/** Adopt a legacy file at most once while retaining the legacy source as recovery data. */
export function adoptLegacyPluginFileOnce(currentPath: string, legacyPath: string, markerPath: string): void {
  if (existsSync(markerPath)) return;
  if (!existsSync(currentPath)) {
    if (!existsSync(legacyPath)) return;
    mkdirSync(dirname(currentPath), { recursive: true, mode: 0o700 });
    copyFileSync(legacyPath, currentPath);
  }
  mkdirSync(dirname(markerPath), { recursive: true, mode: 0o700 });
  writeFileSync(markerPath, "legacy migration completed\n", { encoding: "utf8", mode: 0o600 });
}
