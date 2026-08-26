import { homedir } from "node:os";
import { join } from "node:path";

/** Harness home: sandbox `.dsh-home` when `DSH_HOME` is set, else `~/.dsh`. */
export function dshHome(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.DSH_HOME;
  if (typeof home === "string" && home !== "") return home;
  return join(homedir(), ".dsh");
}

export function helloSettingsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(dshHome(env), "plugins", "hello", "settings.json");
}
