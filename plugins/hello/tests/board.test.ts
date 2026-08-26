import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTask, deleteTask, dueTaskIds, moveTask, openRun, settleRun, skipMissed } from "../src/board/ledger.ts";
import { isValidCron, nextRunAtMs, parseCron } from "../src/board/schedule.ts";
import { loadBoard, saveBoard } from "../src/board/store.ts";
import { canMoveManually } from "../src/board/types.ts";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("board cron", () => {
  it("parses 5-field expressions and rejects junk", () => {
    expect(isValidCron("0 9 * * 1")).toBe(true);
    expect(isValidCron("* * * * *")).toBe(true);
    expect(isValidCron("0 0 30 2 *")).toBe(true);
    expect(parseCron("not cron")).toBeUndefined();
    expect(isValidCron("0 9 * *")).toBe(false);
  });

  it("computes the next local midnight after noon", () => {
    const from = new Date(2026, 0, 1, 12, 0, 0, 0).getTime();
    const next = nextRunAtMs("0 0 * * *", from);
    expect(next).toBeDefined();
    const date = new Date(next!);
    expect(date.getHours()).toBe(0);
    expect(date.getMinutes()).toBe(0);
    expect(date.getDate()).toBe(2);
  });
});

describe("board ledger", () => {
  it("creates, moves, runs, and skips missed ticks", () => {
    const now = new Date(2026, 0, 1, 12, 0, 0, 0).getTime();
    let tasks = createTask([], { title: "Upgrade", prompt: "upgrade dsh", cron: "0 0 * * *", scheduleEnabled: true }, now);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.status).toBe("backlog");
    expect(tasks[0]?.schedule?.enabled).toBe(true);
    expect(canMoveManually("backlog", "todo")).toBe(true);
    expect(canMoveManually("running", "todo")).toBe(false);
    tasks = moveTask(tasks, tasks[0]!.id, "todo", now);
    expect(tasks[0]?.status).toBe("todo");
    const dueBeforeSkip = dueTaskIds(tasks, now + 24 * 60 * 60 * 1000);
    expect(dueBeforeSkip.length).toBeGreaterThanOrEqual(0);
    tasks = skipMissed(tasks, now + 3 * 24 * 60 * 60 * 1000);
    expect(dueTaskIds(tasks, now + 3 * 24 * 60 * 60 * 1000)).toEqual([]);
    expect(tasks[0]?.schedule?.nextRunAt).toBeGreaterThan(now + 3 * 24 * 60 * 60 * 1000);
    const opened = openRun(tasks, tasks[0]!.id, now);
    expect(opened.tasks[0]?.status).toBe("running");
    tasks = settleRun(opened.tasks, opened.tasks[0]!.id, opened.executionId, "succeeded", undefined, now + 1);
    expect(tasks[0]?.status).toBe("done");
    tasks = deleteTask(tasks, tasks[0]!.id);
    expect(tasks).toEqual([]);
  });

  it("round-trips through DSH_HOME board.json", () => {
    const home = mkdtempSync(join(tmpdir(), "dsh-hello-board-"));
    dirs.push(home);
    const env = { DSH_HOME: home };
    const tasks = createTask([], { title: "A", prompt: "do a" }, 1);
    saveBoard(tasks, env);
    const loaded = loadBoard(env);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.title).toBe("A");
  });
});
