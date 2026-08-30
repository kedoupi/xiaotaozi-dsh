import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listArchives } from "../src/archive/ledger.ts";
import { projcachePath, workspacePath } from "../src/archive/paths.ts";
import { findSessionDir, findSessionDirStrict, JsonStoreError, readJsonFile, removeSessionDir, writeJsonFile } from "../src/archive/store.ts";
import {
  legacyHelloBoardMigrationMarkerPath,
  legacyHelloPluginFile,
  xtzUiBoardPath,
} from "../src/dsh-home.ts";
import { loadBoard, saveBoard } from "../src/board/store.ts";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempHome(): string {
  const home = mkdtempSync(join(tmpdir(), "dsh-xtz-ui-store-"));
  dirs.push(home);
  return home;
}

function captureJsonError(run: () => unknown): JsonStoreError {
  try {
    run();
  } catch (error) {
    if (error instanceof JsonStoreError) return error;
    throw error;
  }
  throw new Error("expected JsonStoreError");
}

describe("session directory removal", () => {
  it("refuses to recursively remove a workspace bucket", () => {
    const home = tempHome();
    const sessionFile = join(home, "sessions", "bucket", "session-a", "session.jsonl");
    mkdirSync(dirname(sessionFile), { recursive: true });
    writeFileSync(sessionFile, "session");

    expect(() => removeSessionDir(home, join(home, "sessions", "bucket"))).toThrow("non-Session");
    expect(readFileSync(sessionFile, "utf8")).toBe("session");
  });

  it("resolves only DSH-encoded UTF-16 names for destructive lookup", () => {
    const home = tempHome();
    const bucket = join(home, "sessions", "bucket");
    const emoji = join(bucket, "~D83D~DE00");
    const literal = join(bucket, "~007ED83D~007EDE00");
    mkdirSync(emoji, { recursive: true });
    mkdirSync(literal, { recursive: true });

    expect(findSessionDirStrict(home, "😀")).toBe(emoji);
    expect(findSessionDirStrict(home, "~D83D~DE00")).toBe(literal);
  });

  it("quarantines long Session names outside the scanner before removal", () => {
    const home = tempHome();
    const sessionId = "a".repeat(240);
    const sessionDir = join(home, "sessions", "bucket", sessionId);
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "session.jsonl"), "session");

    const cleanup = removeSessionDir(home, sessionDir);
    expect(existsSync(sessionDir)).toBe(false);
    expect(cleanup.commit()).toBe(true);
  });

  it.skipIf(process.platform !== "darwin")("refuses case-aliased destructive lookup", () => {
    const home = tempHome();
    const sessionDir = join(home, "sessions", "bucket", "session-a");
    mkdirSync(sessionDir, { recursive: true });

    expect(findSessionDirStrict(home, "SESSION-A")).toBeUndefined();
    expect(existsSync(sessionDir)).toBe(true);
  });

  it("refuses delete trash that canonically contains the sessions root", () => {
    const home = tempHome();
    const trash = join(home, "plugins", "xtz-ui", "delete-trash");
    const scanner = join(trash, "scanner");
    const sessionDir = join(scanner, "bucket", "session-a");
    mkdirSync(sessionDir, { recursive: true });
    symlinkSync(scanner, join(home, "sessions"));

    expect(() => removeSessionDir(home, sessionDir)).toThrow("unsafe delete trash");
    expect(existsSync(sessionDir)).toBe(true);
  });

  it("refuses a symlinked private delete trash", () => {
    const home = tempHome();
    const outside = tempHome();
    const sessionDir = join(home, "sessions", "bucket", "session-a");
    mkdirSync(sessionDir, { recursive: true });
    mkdirSync(join(home, "plugins", "xtz-ui"), { recursive: true });
    symlinkSync(outside, join(home, "plugins", "xtz-ui", "delete-trash"));

    expect(() => removeSessionDir(home, sessionDir)).toThrow("unsafe delete trash");
    expect(existsSync(sessionDir)).toBe(true);
  });

  it("refuses a Session path reached through a symlinked workspace bucket", () => {
    const home = tempHome();
    const outside = tempHome();
    const outsideSession = join(outside, "session-a");
    const sessionFile = join(outsideSession, "session.jsonl");
    mkdirSync(outsideSession, { recursive: true });
    writeFileSync(sessionFile, "outside session");
    mkdirSync(join(home, "sessions"), { recursive: true });
    symlinkSync(outside, join(home, "sessions", "bucket"));

    expect(findSessionDir(home, "session-a")).toBeUndefined();
    expect(() => removeSessionDir(home, join(home, "sessions", "bucket", "session-a"))).toThrow("non-Session");
    expect(readFileSync(sessionFile, "utf8")).toBe("outside session");
  });
});

describe("JSON store diagnostics", () => {
  it("treats only ENOENT as an empty store", () => {
    const path = join(tempHome(), "missing.json");
    expect(readJsonFile(path)).toBeUndefined();
    expect(existsSync(path)).toBe(false);
  });

  it("reports non-ENOENT read failures without treating them as empty", () => {
    const path = join(tempHome(), "directory.json");
    mkdirSync(path);

    const error = captureJsonError(() => readJsonFile(path));

    expect(error.kind).toBe("read");
    expect(error.recoveryPath).toBeUndefined();
    expect(existsSync(path)).toBe(true);
  });

  it("quarantines invalid JSON and reports its recovery path", () => {
    const path = join(tempHome(), "broken.json");
    writeFileSync(path, "{not json");

    const error = captureJsonError(() => readJsonFile(path));

    expect(error.kind).toBe("invalid-json");
    expect(error.filePath).toBe(path);
    expect(error.recoveryPath).toBeDefined();
    expect(existsSync(path)).toBe(false);
    expect(readFileSync(error.recoveryPath!, "utf8")).toBe("{not json");
    expect(error.message).toContain("original moved to");
  });

  it("quarantines a board file with an invalid task schema", () => {
    const home = tempHome();
    const env = { DSH_HOME: home };
    const path = xtzUiBoardPath(env);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify({ tasks: [{ id: "broken" }] })}\n`);

    const error = captureJsonError(() => loadBoard(env));

    expect(error.kind).toBe("schema");
    expect(error.message).toContain("invalid task at index 0");
    expect(error.recoveryPath).toBeDefined();
    expect(existsSync(path)).toBe(false);
    expect(JSON.parse(readFileSync(error.recoveryPath!, "utf8"))).toEqual({ tasks: [{ id: "broken" }] });
  });

  it("does not re-adopt a stale legacy board after the current board is quarantined", () => {
    const home = tempHome();
    const env = { DSH_HOME: home };
    const current = xtzUiBoardPath(env);
    const legacy = legacyHelloPluginFile("board.json", env);
    const marker = legacyHelloBoardMigrationMarkerPath(env);
    const legacyBytes = `${JSON.stringify({
      tasks: [{
        id: "deleted-task",
        title: "Stale scheduled task",
        prompt: "perform durable work",
        status: "todo",
        createdAt: 1,
        updatedAt: 1,
        executions: [],
        schedule: { enabled: true, cron: "* * * * *", nextRunAt: 1 },
      }],
    })}\n`;
    mkdirSync(dirname(legacy), { recursive: true });
    writeFileSync(legacy, legacyBytes);

    expect(loadBoard(env).map((task) => task.id)).toEqual(["deleted-task"]);
    expect(existsSync(marker)).toBe(true);
    saveBoard([], env);
    writeFileSync(current, `${JSON.stringify({ tasks: [{ id: "broken" }] })}\n`);

    const error = captureJsonError(() => loadBoard(env));
    expect(error.kind).toBe("schema");
    expect(existsSync(current)).toBe(false);
    expect(loadBoard(env)).toEqual([]);
    expect(readFileSync(legacy, "utf8")).toBe(legacyBytes);
  });

  it("quarantines an archive workspace with an invalid schema", () => {
    const home = tempHome();
    const path = workspacePath(home);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify({ global: { archivedSessionIds: "broken" } })}\n`);

    const error = captureJsonError(() => listArchives(home));

    expect(error.kind).toBe("schema");
    expect(error.message).toContain("global.archivedSessionIds must be an array of strings");
    expect(error.recoveryPath).toBeDefined();
    expect(existsSync(path)).toBe(false);
    expect(JSON.parse(readFileSync(error.recoveryPath!, "utf8"))).toEqual({ global: { archivedSessionIds: "broken" } });
  });

  it("accepts the pinned title projection's null initial state without quarantine", () => {
    const home = tempHome();
    const workspace = workspacePath(home);
    const projcache = projcachePath(home);
    mkdirSync(dirname(workspace), { recursive: true });
    writeFileSync(workspace, `${JSON.stringify({
      unit: { name: "workspace", version: 2 },
      global: { archivedSessionIds: ["session-null-title"] },
      tables: { workspaces: {} },
    })}\n`);
    writeFileSync(projcache, `${JSON.stringify({
      unit: { name: "session_projcache", version: 3 },
      global: {},
      tables: {
        sessions: {
          "session-null-title": {
            identity: { createdAt: 1 },
            rows: { title: { ver: 1, seq: -1, val: null } },
          },
        },
      },
    })}\n`);

    expect(listArchives(home).items).toEqual([
      expect.objectContaining({ sessionId: "session-null-title", title: "未命名会话" }),
    ]);
    expect(existsSync(projcache)).toBe(true);
    expect(readdirSync(dirname(projcache)).some((name) => name.startsWith("session_projcache.json.corrupt-"))).toBe(false);
  });

  it("keeps stale projection rows but ignores their values in the archive view", () => {
    const home = tempHome();
    const workspace = workspacePath(home);
    const projcache = projcachePath(home);
    mkdirSync(dirname(workspace), { recursive: true });
    writeFileSync(workspace, `${JSON.stringify({
      global: { archivedSessionIds: ["session-stale-projections"] },
      tables: { workspaces: {} },
    })}\n`);
    writeFileSync(projcache, `${JSON.stringify({
      tables: {
        sessions: {
          "session-stale-projections": {
            identity: { createdAt: 1 },
            rows: {
              title: { ver: 0, seq: -1, val: "stale title" },
              sessionStats: { ver: 0, seq: -1, val: null },
              tokenUsage: { ver: 2, seq: 4, val: "stale usage shape" },
            },
          },
        },
      },
    })}\n`);

    expect(listArchives(home).items).toEqual([
      expect.objectContaining({
        sessionId: "session-stale-projections",
        title: "未命名会话",
        turns: 0,
        outputTokens: 0,
      }),
    ]);
    expect(existsSync(projcache)).toBe(true);
    expect(readdirSync(dirname(projcache)).some((name) => name.startsWith("session_projcache.json.corrupt-"))).toBe(false);
  });

  it("quarantines a malformed checkpoint envelope even when its version is stale", () => {
    const home = tempHome();
    const workspace = workspacePath(home);
    const projcache = projcachePath(home);
    mkdirSync(dirname(workspace), { recursive: true });
    writeFileSync(workspace, `${JSON.stringify({
      global: { archivedSessionIds: ["session-malformed-projection"] },
      tables: { workspaces: {} },
    })}\n`);
    writeFileSync(projcache, `${JSON.stringify({
      tables: {
        sessions: {
          "session-malformed-projection": {
            identity: { createdAt: 1 },
            rows: { sessionStats: { ver: 0, seq: -1 } },
          },
        },
      },
    })}\n`);

    const error = captureJsonError(() => listArchives(home));

    expect(error.kind).toBe("schema");
    expect(error.message).toContain("must be a checkpoint row");
    expect(error.recoveryPath).toBeDefined();
    expect(existsSync(projcache)).toBe(false);
    expect(JSON.parse(readFileSync(error.recoveryPath!, "utf8"))).toEqual({
      tables: {
        sessions: {
          "session-malformed-projection": {
            identity: { createdAt: 1 },
            rows: { sessionStats: { ver: 0, seq: -1 } },
          },
        },
      },
    });
  });

  it("distinguishes an atomic commit failure and retains the new data", () => {
    const target = join(tempHome(), "state.json");
    mkdirSync(target);

    const error = captureJsonError(() => writeJsonFile(target, { next: true }));

    expect(error.kind).toBe("commit");
    expect(error.recoveryPath).toBeDefined();
    expect(existsSync(target)).toBe(true);
    expect(JSON.parse(readFileSync(error.recoveryPath!, "utf8"))).toEqual({ next: true });
    expect(error.message).toContain("original left unchanged");
  });
});
