import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { archiveHostFromContext } from "../src/archive/live.ts";
import { listArchives, readArchivedIds } from "../src/archive/ledger.ts";

it("resolves a late workspace registry lazily and mutates on its official queue", async () => {
  let service: Record<string, unknown> | undefined;
  let state: Record<string, unknown> = { workspaceIds: [], archivedSessionIds: ["session-a"] };
  const events: string[] = [];
  const ctx = {
    get(name: string) {
      return name === "workspaceRegistry" ? service : undefined;
    },
    emit() {},
  };
  const host = archiveHostFromContext(ctx as never);
  expect(host.archivedIds()).toBeUndefined();
  expect(() => readArchivedIds("/missing", host)).toThrow("workspace registry unavailable");
  const home = mkdtempSync(join(tmpdir(), "dsh-xtz-ui-live-fence-"));
  const workspace = join(home, "storages", "workspace.json");
  mkdirSync(dirname(workspace), { recursive: true });
  writeFileSync(workspace, "{invalid");
  try {
    expect(() => listArchives(home, host)).toThrow("workspace registry unavailable");
    expect(existsSync(workspace)).toBe(true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }

  service = {
    get archivedSessionIds() {
      return state.archivedSessionIds;
    },
    requireState: () => state,
    setState: async (next: Record<string, unknown>) => {
      events.push("set");
      state = next;
    },
    enqueueOperation: async (operation: () => Promise<unknown>) => {
      events.push("queue:start");
      const result = await operation();
      events.push("queue:end");
      return result;
    },
  };

  expect(host.archivedIds()).toEqual(["session-a"]);
  const result = await host.mutateArchivedIds?.(async (ids) => ({
    ids: ids.filter((id) => id !== "session-a"),
    result: "done",
  }));

  expect(result).toBe("done");
  expect(state.archivedSessionIds).toEqual([]);
  expect(events).toEqual(["queue:start", "set", "queue:end"]);
});
