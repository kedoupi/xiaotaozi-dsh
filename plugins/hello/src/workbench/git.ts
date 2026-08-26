import { spawn } from "node:child_process";
import { RouteError } from "../http.ts";
import { GIT_TIMEOUT_MS, MAX_GIT_OUTPUT_BYTES } from "./limits.ts";

export function runGit(cwd: string, args: string[], timeoutMs = GIT_TIMEOUT_MS): Promise<string> {
  const full = ["-C", cwd, "--no-pager", "-c", "color.ui=false", ...args];
  return new Promise((resolvePromise, reject) => {
    let settled = false;
    const finish = (error: RouteError | undefined, value?: string): void => {
      if (settled) return;
      settled = true;
      if (error !== undefined) reject(error);
      else resolvePromise(value ?? "");
    };
    const child = spawn("git", full, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    const chunks: Buffer[] = [];
    let stderr = "";
    let total = 0;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new RouteError(504, `git ${args[0] ?? ""} timed out`));
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_GIT_OUTPUT_BYTES) {
        child.kill("SIGKILL");
        finish(new RouteError(413, "git output too large"));
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      finish(new RouteError(400, `cannot run git: ${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        finish(undefined, Buffer.concat(chunks).toString("utf8"));
        return;
      }
      finish(new RouteError(400, stderr.trim() || `git exited ${String(code)}`));
    });
  });
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    const out = await runGit(cwd, ["rev-parse", "--is-inside-work-tree"], 5_000);
    return out.trim() === "true";
  } catch {
    return false;
  }
}
