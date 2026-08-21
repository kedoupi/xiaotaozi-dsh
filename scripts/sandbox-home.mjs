import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SANDBOX_PORT = "3081";

export function sandboxHome() {
  return join(repoRoot, ".dsh-home");
}

export function sandboxEnv() {
  return { ...process.env, DSH_HOME: sandboxHome() };
}
