import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeJsonFile } from "../src/archive/store.ts";
import { cwdFromWorkspaceFile, resolveSessionCwd } from "../src/workbench/cwd.ts";
import { gitCommit, gitStage, gitStatus, parseLogLines, parsePorcelainZ } from "../src/workbench/git.ts";
import { isWithin, parentOf, requireAbsolute, rootLabel } from "../src/workbench/paths.ts";
import { RouteError } from "../src/http.ts";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

describe("workbench paths", () => {
  it("rejects relative paths and treats siblings as outside", () => {
    expect(() => requireAbsolute("rel")).toThrow(RouteError);
    expect(isWithin("/tmp/proj", "/tmp/proj")).toBe(true);
    expect(isWithin("/tmp/proj", "/tmp/proj/src/a.ts")).toBe(true);
    expect(isWithin("/tmp/proj", "/tmp/proj-evil/x")).toBe(false);
    expect(isWithin("C:\\Users\\Me", "C:\\Users\\Me\\src", "win32")).toBe(true);
    expect(isWithin("C:\\Users\\Me", "c:/users/me/src/a.ts", "win32")).toBe(true);
    expect(parentOf("/tmp/proj/src")).toBe("/tmp/proj");
    expect(rootLabel("/tmp/demo")).toBe("demo");
  });
});

describe("workbench cwd", () => {
  it("reads session cwd from DSH_HOME workspace.json, not process.cwd()", () => {
    const home = tempDir("dsh-hello-cwd-");
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
  it("parses porcelain and log rows", () => {
    expect(parsePorcelainZ(" M src/a.ts\0?? new.md\0")).toEqual([
      { path: "src/a.ts", xy: " M" },
      { path: "new.md", xy: "??" },
    ]);
    expect(parseLogLines("abc123\x1fFix bug\x1fAda\x1f2026-01-01\x1ffullhash\x1fHEAD -> main, tag: v1")).toEqual([
      { hash: "abc123", subject: "Fix bug", author: "Ada", date: "2026-01-01", hashFull: "fullhash", refs: "HEAD -> main, tag: v1" },
    ]);
  });

  it("stages and commits inside a temp repo", async () => {
    const cwd = tempDir("dsh-hello-git-");
    const git = (args: string[]): void => {
      const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
      if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")}`);
    };
    git(["init"]);
    git(["config", "user.email", "hello@test"]);
    git(["config", "user.name", "Hello Test"]);
    writeFileSync(join(cwd, "readme.md"), "one\n");
    const dirty = await gitStatus(cwd);
    expect(dirty.repo).toBe(true);
    expect(dirty.entries.some((row) => row.path === "readme.md" && row.untracked)).toBe(true);
    await gitStage(cwd, "readme.md");
    await gitCommit(cwd, "add readme");
    const clean = await gitStatus(cwd);
    expect(clean.entries).toEqual([]);
  });
});
