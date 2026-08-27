import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const OFFICIAL_PORT = "3080";
export const SANDBOX_HOST = "127.0.0.1";
export const SANDBOX_PORT = "3081";
export const SANDBOX_PROCESS_MARKER = createHash("sha256")
  .update(`xiaotaozi-dsh-sandbox\0${repoRoot}`)
  .digest("hex");

export function sandboxHome() {
  return join(repoRoot, ".dsh-home");
}

export function sandboxAgentsHome() {
  return join(sandboxHome(), "agents");
}

export function sandboxEnv(base = process.env) {
  const env = {
    ...base,
    DSH_HOME: sandboxHome(),
    DSH_AGENTS_HOME: sandboxAgentsHome(),
    XIAOTAOZI_DSH_SANDBOX: SANDBOX_PROCESS_MARKER,
  };
  if (base.DSH_PLUGIN_TRACE === undefined || base.DSH_PLUGIN_TRACE === "") {
    env.DSH_PLUGIN_TRACE = "1";
  }
  return env;
}
