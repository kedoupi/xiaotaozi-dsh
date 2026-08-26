import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendIntent, loadIntents, pickIntents, saveIntents, type InstallIntent } from "../src/intents.ts";

function intent(entryId: string, action: "install" | "remove" = "install"): InstallIntent {
  return { entryId, sourceId: "src-1", action, requestedAt: "2026-08-26T00:00:00.000Z", status: "pending" };
}

describe("appendIntent", () => {
  it("replaces earlier requests for the same entry", () => {
    const queue = appendIntent([intent("hello")], intent("hello", "remove"));
    expect(queue).toHaveLength(1);
    expect(queue[0]!.action).toBe("remove");
  });
  it("keeps requests for other entries", () => {
    expect(appendIntent([intent("a")], intent("b"))).toHaveLength(2);
  });
});

describe("pickIntents", () => {
  it("drops malformed rows", () => {
    const picked = pickIntents([intent("ok"), { entryId: "", sourceId: "s", action: "install" }, "junk", { entryId: "x", sourceId: "s", action: "explode" }]);
    expect(picked).toHaveLength(1);
    expect(picked[0]!.entryId).toBe("ok");
  });
});

describe("intent store", () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });
  it("round-trips through $DSH_HOME/plugins/market/intents.json", () => {
    dir = mkdtempSync(join(tmpdir(), "dsh-market-"));
    const env = { DSH_HOME: dir } as NodeJS.ProcessEnv;
    expect(loadIntents(env)).toEqual([]);
    saveIntents([intent("hello")], env);
    expect(loadIntents(env)).toEqual([intent("hello")]);
  });
});
