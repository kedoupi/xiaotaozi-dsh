import { access, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendMailbox,
  archiveTeamDir,
  createMessage,
  createTeamDir,
  readRetiredMemberIds,
  removeTeamDir,
  resolveStateRoot,
  stateDirError,
  writeTeam,
} from "../src/state.ts";
import type { TeamState } from "../src/types.ts";

function team(id = "landing"): TeamState {
  return {
    name: "落地页",
    id,
    captainSessionId: "captain-session",
    captainName: "张老板",
    createdAt: 1,
    members: [],
    tasks: [],
    taskSeq: 0,
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function linkDirectory(target: string, path: string): Promise<void> {
  await symlink(target, path, process.platform === "win32" ? "junction" : "dir");
}

async function fixture(): Promise<{
  base: string;
  workspace: string;
  outside: string;
}> {
  const base = await mkdtemp(join(tmpdir(), "agent-teams-links-"));
  const workspace = join(base, "workspace");
  const outside = join(base, "outside");
  await mkdir(workspace);
  await mkdir(outside);
  return { base, workspace, outside };
}

describe("state path symlink safety", () => {
  it("rejects a state root symlink before creating team files", async () => {
    const { base, workspace, outside } = await fixture();
    try {
      const stateRoot = resolveStateRoot(workspace, ".agent-teams");
      await linkDirectory(outside, stateRoot);

      await expect(createTeamDir(stateRoot, team())).rejects.toThrow(/symbolic links are forbidden/i);
      expect(await exists(join(outside, "landing", "team.json"))).toBe(false);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("rejects a symlink in a nested configured stateDir", async () => {
    const { base, workspace, outside } = await fixture();
    try {
      const stateRoot = resolveStateRoot(workspace, "state/teams");
      await linkDirectory(outside, join(workspace, "state"));

      await expect(createTeamDir(stateRoot, team())).rejects.toThrow(/symbolic links are forbidden/i);
      expect(await exists(join(outside, "teams", "landing", "team.json"))).toBe(false);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("recovers the workspace boundary for direct nested-root callers", async () => {
    const { base, workspace, outside } = await fixture();
    try {
      expect(stateDirError("state/teams")).toBeUndefined();
      const stateRoot = join(workspace, "state", "teams");
      await linkDirectory(outside, join(workspace, "state"));

      await expect(readRetiredMemberIds(stateRoot)).rejects.toThrow(/symbolic links are forbidden/i);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("refuses mailbox writes and recursive mutations through a descendant symlink", async () => {
    const { base, workspace, outside } = await fixture();
    try {
      const stateRoot = resolveStateRoot(workspace, ".agent-teams");
      const state = team();
      await createTeamDir(stateRoot, state);
      const inbox = join(stateRoot, state.id, "inbox");
      const outsideInbox = join(outside, "inbox");
      await mkdir(outsideInbox);
      await writeFile(join(outsideInbox, "sentinel.txt"), "outside", "utf8");
      await rm(inbox, { recursive: true });
      await linkDirectory(outsideInbox, inbox);

      await expect(appendMailbox(
        stateRoot,
        state.id,
        "captain",
        createMessage("worker", "captain", "hello"),
      )).rejects.toThrow(/symbolic links are forbidden/i);
      await expect(removeTeamDir(stateRoot, state.id)).rejects.toThrow(/symbolic links are forbidden/i);
      await expect(archiveTeamDir(stateRoot, state.id)).rejects.toThrow(/symbolic links are forbidden/i);

      expect(await readFile(join(outsideInbox, "sentinel.txt"), "utf8")).toBe("outside");
      expect(await exists(join(outsideInbox, "captain.jsonl"))).toBe(false);
      expect(await exists(join(stateRoot, state.id))).toBe(true);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("revalidates an archive directory that is replaced by a symlink", async () => {
    const { base, workspace, outside } = await fixture();
    try {
      const stateRoot = resolveStateRoot(workspace, ".agent-teams");
      const state = team();
      await createTeamDir(stateRoot, state);
      const outsideArchive = join(outside, "archive");
      await mkdir(outsideArchive);
      await linkDirectory(outsideArchive, join(stateRoot, "archive"));

      await expect(archiveTeamDir(stateRoot, state.id)).rejects.toThrow(/symbolic links are forbidden/i);
      expect(await exists(join(stateRoot, state.id, "team.json"))).toBe(true);
      expect(await exists(join(outsideArchive, state.id))).toBe(false);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("pins the state-root identity and rejects a plain-directory replacement", async () => {
    const { base, workspace } = await fixture();
    try {
      const stateRoot = resolveStateRoot(workspace, ".agent-teams");
      const state = team();
      await createTeamDir(stateRoot, state);
      const original = join(workspace, ".agent-teams-original");
      await rename(stateRoot, original);
      await mkdir(stateRoot);

      await expect(writeTeam(stateRoot, { ...state, description: "must not escape" }))
        .rejects.toThrow(/state root .* was replaced/i);
      expect(await exists(join(stateRoot, state.id, "team.json"))).toBe(false);
      expect(JSON.parse(await readFile(join(original, state.id, "team.json"), "utf8")))
        .not.toHaveProperty("description");
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
