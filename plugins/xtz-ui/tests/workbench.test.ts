import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeJsonFile } from "../src/archive/store.ts";
import { cwdFromWorkspaceFile, resolveSessionCwd } from "../src/workbench/cwd.ts";
import { isGitRepo } from "../src/workbench/git.ts";

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
});
