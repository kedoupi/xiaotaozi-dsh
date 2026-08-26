import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pickFeaturePatch, type HelloConfig } from "./config.ts";
import { helloSettingsPath } from "./dsh-home.ts";

export function loadSettings(env: NodeJS.ProcessEnv = process.env): Partial<HelloConfig> {
  const path = helloSettingsPath(env);
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return pickFeaturePatch(parsed);
  } catch {
    return {};
  }
}

export function saveSettings(config: HelloConfig, env: NodeJS.ProcessEnv = process.env): void {
  const path = helloSettingsPath(env);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(pickFeaturePatch(config), null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, path);
}
