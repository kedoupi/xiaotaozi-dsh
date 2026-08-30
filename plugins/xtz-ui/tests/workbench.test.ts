import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeJsonFile } from "../src/archive/store.ts";
import { cwdFromWorkspaceFile, resolveSessionCwd } from "../src/workbench/cwd.ts";
import { isGitRepo, runGit } from "../src/workbench/git.ts";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

describe("workbench cwd", () => {
  it("reads session cwd from DSH_HOME workspace.json, not process.cwd()", () => {
    const home = tempDir("dsh-xtz-ui-cwd-");
    const workspace = "/tmp/hello-wb-proj";
    writeJsonFile(join(home, "storages", "workspace.json"), {
      tables: { workspaces: { ws1: { path: workspace, sessionIds: ["session-1"] } } },
    });
    expect(cwdFromWorkspaceFile(home, "session-1")).toBe(workspace);
    expect(cwdFromWorkspaceFile(home, "missing")).toBeUndefined();
    expect(resolveSessionCwd(home, "session-1", { cwdFor: () => "/live/cwd" })).toBe("/live/cwd");
  });
});

describe("workbench git", () => {
  it("treats a temp directory as outside a git repo", async () => {
    expect(await isGitRepo(tempDir("dsh-xtz-ui-git-"))).toBe(false);
  });

  it("ignores inherited Git repository selectors", async () => {
    const selected = tempDir("dsh-xtz-ui-selected-");
    const ambient = tempDir("dsh-xtz-ui-ambient-");
    execFileSync("git", ["init", "-q", selected]);
    execFileSync("git", ["init", "-q", ambient]);
    for (const repo of [selected, ambient]) {
      execFileSync("git", ["-C", repo, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "init"]);
    }
    const originalBranch = execFileSync("git", ["-C", ambient, "branch", "--show-current"], { encoding: "utf8" }).trim();
    execFileSync("git", ["-C", ambient, "branch", "other"]);
    const previous = process.env.GIT_DIR;
    process.env.GIT_DIR = join(ambient, ".git");
    try {
      await expect(runGit(selected, ["switch", "other"])).rejects.toBeDefined();
      expect(execFileSync("git", ["-C", ambient, "branch", "--show-current"], { encoding: "utf8" }).trim()).toBe(originalBranch);
    } finally {
      if (previous === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = previous;
    }
  });
});
