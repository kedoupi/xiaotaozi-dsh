import { RouteError } from "../http.ts";
import { GIT_GRAPH_LIMIT } from "../workbench/limits.ts";
import { isGitRepo, runGit } from "../workbench/git.ts";
import { invalidBranchReason, parseBranches, parseGraph, parsePorcelain } from "./parse.ts";

export interface RepoStatus {
  repo: boolean;
  root?: string;
  branch?: string;
  head?: string;
  dirtyFiles: number;
  untrackedFiles: number;
  conflicts: number;
}

export interface BranchesView {
  repo: boolean;
  branch?: string;
  branches: Array<{ name: string; current: boolean }>;
  dirtyFiles: number;
  untrackedFiles: number;
  conflicts: number;
}

export interface GraphView {
  repo: boolean;
  branch?: string;
  commits: ReturnType<typeof parseGraph>;
  hasMore: boolean;
}

async function realRepo(cwd: string): Promise<string> {
  if (!await isGitRepo(cwd)) throw new RouteError(400, "not a git repository");
  return (await runGit(cwd, ["rev-parse", "--show-toplevel"], 5_000)).trim();
}

export async function repoStatus(cwd: string): Promise<RepoStatus> {
  if (!await isGitRepo(cwd)) return { repo: false, dirtyFiles: 0, untrackedFiles: 0, conflicts: 0 };
  const root = (await runGit(cwd, ["rev-parse", "--show-toplevel"], 5_000)).trim();
  const [branchOut, headOut, porcelain] = await Promise.all([
    runGit(root, ["rev-parse", "--abbrev-ref", "HEAD"], 5_000).catch(() => "HEAD"),
    runGit(root, ["rev-parse", "--short", "HEAD"], 5_000).catch(() => ""),
    runGit(root, ["status", "--porcelain"]),
  ]);
  const counts = parsePorcelain(porcelain);
  const branch = branchOut.trim();
  return {
    repo: true,
    root,
    branch: branch === "" || branch === "HEAD" ? undefined : branch,
    head: headOut.trim(),
    ...counts,
  };
}

export async function listBranches(cwd: string): Promise<BranchesView> {
  const status = await repoStatus(cwd);
  if (!status.repo || status.root === undefined) {
    return { repo: false, branches: [], dirtyFiles: 0, untrackedFiles: 0, conflicts: 0 };
  }
  const stdout = await runGit(status.root, [
    "for-each-ref",
    "refs/heads",
    "--format=%(refname:short)%00%(HEAD)%00%(objectname)",
  ]);
  return {
    repo: true,
    branch: status.branch,
    branches: parseBranches(stdout),
    dirtyFiles: status.dirtyFiles,
    untrackedFiles: status.untrackedFiles,
    conflicts: status.conflicts,
  };
}

export async function graphLog(cwd: string, limit = GIT_GRAPH_LIMIT): Promise<GraphView> {
  const status = await repoStatus(cwd);
  if (!status.repo || status.root === undefined) return { repo: false, commits: [], hasMore: false };
  const n = Number.isFinite(limit) ? Math.min(Math.max(1, Math.floor(limit)), 400) : GIT_GRAPH_LIMIT;
  const stdout = await runGit(status.root, [
    "log",
    "--branches",
    "--tags",
    "--remotes",
    "HEAD",
    "--topo-order",
    "--parents",
    "--format=%H%x00%P%x00%an%x00%at%x00%D%x00%s%x1e",
    "--max-count",
    String(n + 1),
  ]);
  const commits = parseGraph(stdout);
  const hasMore = n < 400 && commits.length > n;
  return { repo: true, branch: status.branch, commits: hasMore ? commits.slice(0, n) : commits, hasMore };
}

export async function switchBranch(cwd: string, branch: string): Promise<{ branch: string }> {
  const reason = invalidBranchReason(branch);
  if (reason !== undefined) throw new RouteError(400, "invalid-branch-name");
  const root = await realRepo(cwd);
  const status = await repoStatus(root);
  if (status.conflicts > 0) throw new RouteError(409, "conflicts-present");
  try {
    await runGit(root, ["switch", "--no-guess", "--", branch]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/already used by worktree|is already checked out at/u.test(message)) {
      throw new RouteError(409, "branch-in-other-worktree");
    }
    if (/would be overwritten/u.test(message)) throw new RouteError(409, "tracked-changes-would-be-overwritten");
    if (/did not match any file|not a valid branch|invalid reference/u.test(message)) {
      throw new RouteError(404, "target-branch-not-found");
    }
    throw error;
  }
  return { branch };
}
