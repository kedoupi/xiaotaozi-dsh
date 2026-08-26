import { spawn } from "node:child_process";
import { relative, resolve as resolvePath } from "node:path";
import { realpath } from "node:fs/promises";
import { RouteError } from "../http.ts";
import { isWithin } from "./paths.ts";
import { GIT_LOG_LIMIT, GIT_STATUS_LIMIT, GIT_TIMEOUT_MS, MAX_GIT_OUTPUT_BYTES } from "./limits.ts";

export interface GitStatusEntry {
  path: string;
  xy: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

export interface GitStatusResult {
  repo: boolean;
  branch?: string;
  root?: string;
  entries: GitStatusEntry[];
  truncated: boolean;
}

export interface GitLogEntry {
  hash: string;
  hashFull: string;
  subject: string;
  author: string;
  date: string;
  refs: string;
}

export function parsePorcelainZ(output: string): Array<{ path: string; xy: string }> {
  const tokens = output.split("\0");
  const entries: Array<{ path: string; xy: string }> = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index]!;
    index += 1;
    if (token === "") continue;
    const xy = token.slice(0, 2);
    const rest = token.slice(3);
    entries.push({ path: rest, xy });
    if ((xy.startsWith("R") || xy.startsWith("C")) && tokens[index] !== undefined && tokens[index] !== "") {
      index += 1;
    }
  }
  return entries;
}

export function parseLogLines(output: string): GitLogEntry[] {
  const rows: GitLogEntry[] = [];
  for (const line of output.split("\n")) {
    if (line === "") continue;
    const parts = line.split("\x1f");
    const hash = parts[0];
    const subject = parts[1];
    if (hash === undefined || subject === undefined) continue;
    rows.push({
      hash,
      subject,
      author: parts[2] ?? "",
      date: parts[3] ?? "",
      hashFull: parts[4] ?? hash,
      refs: parts[5] ?? "",
    });
  }
  return rows;
}

function classify(xy: string): { staged: boolean; unstaged: boolean; untracked: boolean } {
  if (xy === "??" || xy === "!!") return { staged: false, unstaged: false, untracked: true };
  const index = xy[0] ?? " ";
  const work = xy[1] ?? " ";
  return {
    staged: index !== " " && index !== "?",
    unstaged: work !== " ",
    untracked: false,
  };
}

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

async function repoRoot(cwd: string): Promise<string> {
  const out = await runGit(cwd, ["rev-parse", "--show-toplevel"], 5_000);
  return out.trim();
}

async function realWorkspace(cwd: string): Promise<string> {
  return await realpath(cwd);
}

async function inRepo(cwd: string): Promise<string> {
  const dir = await realWorkspace(cwd);
  if (!await isGitRepo(dir)) throw new RouteError(400, "not a git repository");
  return dir;
}

function gitPathAbsolute(root: string, rel: string): string {
  return resolvePath(root, rel);
}

export async function gitStatus(cwd: string): Promise<GitStatusResult> {
  const workspace = await realWorkspace(cwd);
  if (!await isGitRepo(workspace)) return { repo: false, entries: [], truncated: false };
  const root = await repoRoot(workspace);
  const [branchOut, porcelain] = await Promise.all([
    runGit(workspace, ["rev-parse", "--abbrev-ref", "HEAD"], 5_000).catch(() => ""),
    runGit(workspace, ["status", "--porcelain=v1", "-z", "-uall"]),
  ]);
  const parsed = parsePorcelainZ(porcelain);
  const entries: GitStatusEntry[] = [];
  let truncated = false;
  for (const row of parsed) {
    const abs = gitPathAbsolute(root, row.path);
    if (!isWithin(workspace, abs)) continue;
    if (entries.length >= GIT_STATUS_LIMIT) {
      truncated = true;
      break;
    }
    entries.push({ path: row.path, xy: row.xy, ...classify(row.xy) });
  }
  const branch = branchOut.trim();
  return {
    repo: true,
    branch: branch === "" || branch === "HEAD" ? undefined : branch,
    root,
    entries,
    truncated,
  };
}

export async function gitDiff(cwd: string, path: string | undefined, staged: boolean): Promise<string> {
  const dir = await inRepo(cwd);
  const args = ["diff"];
  if (staged) args.push("--cached");
  if (path !== undefined && path !== "") {
    args.push("--", await lockGitPath(dir, path));
  }
  return await runGit(dir, args);
}

export async function gitLog(cwd: string, count = GIT_LOG_LIMIT): Promise<GitLogEntry[]> {
  const dir = await realWorkspace(cwd);
  if (!await isGitRepo(dir)) return [];
  const n = Number.isFinite(count) ? Math.min(Math.max(1, Math.floor(count)), GIT_LOG_LIMIT) : GIT_LOG_LIMIT;
  const out = await runGit(dir, ["log", `-n${String(n)}`, "--pretty=format:%h%x1f%s%x1f%an%x1f%ai%x1f%H%x1f%D"]);
  return parseLogLines(out);
}

export async function gitBranches(cwd: string): Promise<{ current?: string; names: string[] }> {
  const dir = await realWorkspace(cwd);
  if (!await isGitRepo(dir)) return { names: [] };
  const [branchOut, refs] = await Promise.all([
    runGit(dir, ["rev-parse", "--abbrev-ref", "HEAD"], 5_000).catch(() => ""),
    runGit(dir, ["for-each-ref", "refs/heads", "--format=%(refname:short)"]),
  ]);
  const current = branchOut.trim();
  const names = refs.split("\n").map((name) => name.trim()).filter((name) => name !== "");
  names.sort((a, b) => a.localeCompare(b));
  return { current: current === "" || current === "HEAD" ? undefined : current, names };
}

export async function gitCheckout(cwd: string, branch: string): Promise<void> {
  const dir = await inRepo(cwd);
  if (branch === "" || /[\s~^:?*[\\]/.test(branch) || branch.includes("..")) {
    throw new RouteError(400, "invalid-branch-name");
  }
  await runGit(dir, ["switch", "--no-guess", "--", branch]);
}

export async function gitShow(cwd: string, hash: string): Promise<string> {
  const dir = await inRepo(cwd);
  if (!/^[0-9a-f]{7,40}$/iu.test(hash)) throw new RouteError(400, "invalid hash");
  return await runGit(dir, ["show", "--pretty=format:", "--patch", hash]);
}

/** Return a path git will accept (`--` separated), inside the workspace. */
export async function lockGitPath(cwd: string, rel: string): Promise<string> {
  if (rel === "" || rel.includes("\0")) throw new RouteError(400, "path required");
  const workspace = await realWorkspace(cwd);
  const root = await repoRoot(cwd);
  const abs = gitPathAbsolute(root, rel);
  let target = abs;
  try {
    target = await realpath(abs);
  } catch {
    target = resolvePath(abs);
  }
  if (!isWithin(workspace, target) && !isWithin(workspace, abs)) {
    throw new RouteError(403, `path "${rel}" is outside workspace`);
  }
  const fromCwd = relative(workspace, abs);
  if (fromCwd.startsWith("..") || fromCwd === "") throw new RouteError(403, `path "${rel}" is outside workspace`);
  return fromCwd;
}

export async function gitStage(cwd: string, path?: string): Promise<void> {
  const dir = await inRepo(cwd);
  if (path === undefined || path === "") {
    await runGit(dir, ["add", "-A", "--", "."]);
    return;
  }
  await runGit(dir, ["add", "--", await lockGitPath(dir, path)]);
}

export async function gitUnstage(cwd: string, path?: string): Promise<void> {
  const dir = await inRepo(cwd);
  if (path === undefined || path === "") {
    await runGit(dir, ["restore", "--staged", "--", "."]);
    return;
  }
  await runGit(dir, ["restore", "--staged", "--", await lockGitPath(dir, path)]);
}

export async function gitDiscard(cwd: string, path: string): Promise<void> {
  const dir = await inRepo(cwd);
  await runGit(dir, ["restore", "--worktree", "--", await lockGitPath(dir, path)]);
}

export async function gitCommit(cwd: string, message: string): Promise<void> {
  const dir = await inRepo(cwd);
  const text = message.trim();
  if (text === "" || text.includes("\0")) throw new RouteError(400, "message required");
  if (text.length > 4000) throw new RouteError(413, "message too long");
  await runGit(dir, ["commit", "-m", text]);
}
