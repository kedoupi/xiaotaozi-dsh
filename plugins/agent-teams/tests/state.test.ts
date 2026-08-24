import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAPTAIN_KEY,
  appendMailbox,
  createMessage,
  createTeamDir,
  readTeam,
  readUnreadMailbox,
  sanitizeKey,
  taskDepthsById,
  taskVisualState,
  transitionError,
  unsatisfiedDependencies,
} from "../src/state.ts";
import type { TeamState, TeamTask } from "../src/types.ts";

function task(partial: Partial<TeamTask> & Pick<TeamTask, "id" | "status">): TeamTask {
  return {
    subject: partial.subject ?? partial.id,
    dependencies: partial.dependencies ?? [],
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  };
}

describe("sanitizeKey", () => {
  it("keeps CJK names readable and distinct", () => {
    expect(sanitizeKey("设计师")).toBe("设计师");
    expect(sanitizeKey("  Engineer  ")).toBe("engineer");
    expect(sanitizeKey("QA / 测试")).toBe("qa-测试");
  });

  it("does not collapse every non-Latin name onto one fallback", () => {
    expect(sanitizeKey("设计师")).not.toBe(sanitizeKey("工程师"));
    expect(sanitizeKey("🎨")).toMatch(/^k-[0-9a-f]{8}$/);
  });
});

describe("task graph", () => {
  it("lists unsatisfied dependencies until they complete", () => {
    const tasks = [
      task({ id: "t1", status: "completed" }),
      task({ id: "t2", status: "pending", dependencies: ["t1", "t3"] }),
    ];
    expect(unsatisfiedDependencies(tasks, ["t1"])).toEqual([]);
    expect(unsatisfiedDependencies(tasks, ["t1", "t3"])).toEqual(["t3"]);
  });

  it("rejects illegal status jumps and allows the documented path", () => {
    expect(transitionError("pending", "claimed")).toBeUndefined();
    expect(transitionError("claimed", "in_progress")).toBeUndefined();
    expect(transitionError("in_progress", "completed")).toBeUndefined();
    expect(transitionError("pending", "completed")).toBe('task status cannot move from "pending" to "completed"');
    expect(transitionError("completed", "pending")).toBe('task status cannot move from "completed" to "pending"');
  });

  it("maps visual state from status and unfinished deps", () => {
    const tasks = [
      task({ id: "t1", status: "pending" }),
      task({ id: "t2", status: "in_progress", dependencies: ["t1"] }),
      task({ id: "t3", status: "completed" }),
    ];
    expect(taskVisualState("completed", [], tasks)).toBe("completed");
    expect(taskVisualState("in_progress", ["t1"], tasks)).toBe("running");
    expect(taskVisualState("pending", ["t1"], tasks)).toBe("blocked");
    expect(taskVisualState("pending", ["t3"], tasks)).toBe("open");
  });

  it("computes dependency depth and stays cycle-safe", () => {
    const tasks = [
      task({ id: "t1", status: "pending" }),
      task({ id: "t2", status: "pending", dependencies: ["t1"] }),
      task({ id: "t3", status: "pending", dependencies: ["t2"] }),
      task({ id: "loop-a", status: "pending", dependencies: ["loop-b"] }),
      task({ id: "loop-b", status: "pending", dependencies: ["loop-a"] }),
    ];
    const depths = taskDepthsById(tasks);
    expect(depths.get("t1")).toBe(0);
    expect(depths.get("t2")).toBe(1);
    expect(depths.get("t3")).toBe(2);
    expect(depths.get("loop-a")).toBeTypeOf("number");
    expect(depths.get("loop-b")).toBeTypeOf("number");
  });
});

describe("durable team files", () => {
  it("round-trips a team record and a captain mailbox", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "dsh-agent-teams-"));
    try {
      const state: TeamState = {
        name: "落地页",
        id: "landing",
        captainSessionId: "sess-1",
        captainName: "张老板",
        createdAt: 1,
        members: [{ id: "mem-1", name: "设计师", joinedAt: 1, status: "idle" }],
        tasks: [],
        taskSeq: 0,
      };
      await createTeamDir(stateRoot, state);
      const read = await readTeam(stateRoot, "landing");
      expect(read?.captainName).toBe("张老板");
      expect(read?.members[0]?.name).toBe("设计师");

      const message = createMessage("设计师", CAPTAIN_KEY, "首页线框好了");
      await appendMailbox(stateRoot, "landing", CAPTAIN_KEY, message);
      const unread = await readUnreadMailbox(stateRoot, "landing", CAPTAIN_KEY);
      expect(unread).toHaveLength(1);
      expect(unread[0]?.from).toBe("设计师");
      expect(unread[0]?.to).toBe("captain");
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
    }
  });
});
