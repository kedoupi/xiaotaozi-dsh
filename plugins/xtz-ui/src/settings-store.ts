import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pickFeaturePatch, type XtzUiConfig } from "./config.ts";
import { adoptLegacyPluginFile, legacyHelloPluginFile, xtzUiSettingsPath } from "./dsh-home.ts";

export function loadSettings(env: NodeJS.ProcessEnv = process.env): Partial<XtzUiConfig> {
  const path = xtzUiSettingsPath(env);
  adoptLegacyPluginFile(path, legacyHelloPluginFile("settings.json", env));
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return pickFeaturePatch(parsed);
  } catch {
    return {};
  }
}

export function saveSettings(config: XtzUiConfig, env: NodeJS.ProcessEnv = process.env): void {
  const path = xtzUiSettingsPath(env);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(pickFeaturePatch(config), null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, path);
}
