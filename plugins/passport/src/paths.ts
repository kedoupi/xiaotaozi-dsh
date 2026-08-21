import { homedir } from "node:os";
import { join } from "node:path";

export function pluginData(...parts: string[]): string {
  const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
  return join(home, "plugins", "passport", ...parts);
}
