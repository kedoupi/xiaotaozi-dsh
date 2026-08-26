import { homedir } from "node:os";
import { join } from "node:path";

export function officialDshHome(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  fallbackHome = homedir(),
): string {
  const userHome = platform === "win32"
    ? env.USERPROFILE || fallbackHome
    : fallbackHome;
  return join(userHome, ".dsh");
}

export function officialProfileDir(home: string): string {
  return join(home, "profiles", "web");
}

export function officialDshEnv(
  home: string,
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...base,
    DSH_HOME: home,
    DSH_AGENTS_HOME: join(home, "agents"),
  };
}
