import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HERO_CHIP_GAP, heroOffset, heroViewport } from "../src/git-graph/hero.ts";
import { computeLanes, graphPath, invalidBranchReason, layoutGraph, parseDecoration, parseGraph } from "../src/git-graph/parse.ts";
import { graphLog, repoStatus } from "../src/git-graph/service.ts";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("git graph parse", () => {
  it("parses decorations and graph records", () => {
    expect(parseDecoration("HEAD -> main, origin/main, tag: v1")).toEqual(["main", "origin/main", "v1"]);
    const rows = parseGraph("aaa\u0000bbb\u0000Ada\u00001700000000\u0000HEAD -> main\u0000hello\u001e");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.oid).toBe("aaa");
    expect(rows[0]?.parents).toEqual(["bbb"]);
    expect(rows[0]?.refs).toEqual(["main"]);
    expect(invalidBranchReason("feat/ok")).toBeUndefined();
    expect(invalidBranchReason("bad name")).toBe("format");
  });

  it("assigns a single lane on a linear history", () => {
    const lanes = computeLanes([
      { oid: "c", parents: ["b"], subject: "c", author: "a", authorTime: 3, refs: [] },
      { oid: "b", parents: ["a"], subject: "b", author: "a", authorTime: 2, refs: [] },
      { oid: "a", parents: [], subject: "a", author: "a", authorTime: 1, refs: [] },
    ]);
    expect(lanes.map((row) => row.nodeColumn)).toEqual([0, 0, 0]);
    expect(lanes[0]?.columns[0]).toBe("node");
  });

  it("lays out a merge as two lanes with connecting edges", () => {
    const commits = [
      { oid: "m", parents: ["a", "b"], subject: "merge", author: "x", authorTime: 4, refs: ["main"] },
      { oid: "a", parents: ["c"], subject: "a", author: "x", authorTime: 3, refs: [] },
      { oid: "b", parents: ["c"], subject: "b", author: "x", authorTime: 2, refs: ["feat"] },
      { oid: "c", parents: [], subject: "c", author: "x", authorTime: 1, refs: [] },
    ];
    const layout = layoutGraph(commits);
    expect(layout.laneCount).toBeGreaterThanOrEqual(2);
    expect(layout.nodes[0]).toEqual({ row: 0, col: 0, merge: true });
    expect(layout.nodes[2]?.col).toBe(1);
    expect(layout.edges).toEqual(expect.arrayContaining([
      { fromRow: 0, fromCol: 0, toRow: 1, toCol: 0 },
      { fromRow: 0, fromCol: 0, toRow: 2, toCol: 1 },
      { fromRow: 1, fromCol: 0, toRow: 3, toCol: 0 },
      { fromRow: 2, fromCol: 1, toRow: 3, toCol: 0 },
    ]));
    expect(graphPath({ fromRow: 0, fromCol: 0, toRow: 1, toCol: 0 }, 14, 44)).toBe("M 7 22 L 7 66");
    expect(graphPath({ fromRow: 0, fromCol: 0, toRow: 2, toCol: 1 }, 14, 44)).toContain("Q");
    expect(graphPath({ fromRow: 0, fromCol: 0, toRow: 2, toCol: 1 }, 14, 44)).not.toContain("C");
  });
});

describe("git graph hero seat", () => {
  it("sits after the mode chip with the official row gap", () => {
    expect(HERO_CHIP_GAP).toBe(2);
    expect(heroViewport({ top: 100, height: 28 }, 28, 240)).toEqual({ left: 242, top: 100 });
    expect(heroOffset({ left: 40, top: 80 }, { top: 100, height: 28 }, { height: 28 }, 240)).toEqual({
      left: 202,
      top: 20,
    });
  });
});

describe("git graph service", () => {
  it("reads status and graph from a temp repo", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "dsh-hello-gg-"));
    dirs.push(cwd);
    const git = (args: string[]): void => {
      const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
      if (result.status !== 0) throw new Error(result.stderr || args.join(" "));
    };
    git(["init"]);
    git(["config", "user.email", "hello@test"]);
    git(["config", "user.name", "Hello Test"]);
    writeFileSync(join(cwd, "a.txt"), "one\n");
    git(["add", "a.txt"]);
    git(["commit", "-m", "first"]);
    const status = await repoStatus(cwd);
    expect(status.repo).toBe(true);
    expect(status.branch).toBeTruthy();
    const view = await graphLog(cwd, 10);
    expect(view.commits.length).toBeGreaterThanOrEqual(1);
    expect(view.commits[0]?.subject).toBe("first");
  });
});
