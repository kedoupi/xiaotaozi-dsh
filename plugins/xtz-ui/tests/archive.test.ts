import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zstdCompressSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { encodeSegment, isSafeSessionId } from "../src/archive/encode.ts";
import { deleteSessions, listArchives, previewArchive, unarchiveSessions } from "../src/archive/ledger.ts";
import { archiveWorkspaceKey, filterArchives, groupArchives, workspaceOptions } from "../src/archive/query.ts";
import { extractSessionDetail, readTranscriptText } from "../src/archive/transcript.ts";
import { writeJsonFile } from "../src/archive/store.ts";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function homeWithSession(options?: { archived?: boolean; jsonl?: string }): { home: string; sessionId: string } {
  const home = mkdtempSync(join(tmpdir(), "dsh-xtz-ui-arch-"));
  dirs.push(home);
  const sessionId = "session-abc";
  const wsId = "ws-1";
  const dataDir = join(home, "sessions", "proj", sessionId);
  mkdirSync(dataDir, { recursive: true });
  const jsonl = options?.jsonl ?? [
    JSON.stringify({ type: "session", createdAt: 1000 }),
    JSON.stringify({ type: "session/title/set", title: "Hello title" }),
    JSON.stringify({ type: "turn/start" }),
    JSON.stringify({ type: "user/message", time: 1001, data: { content: [{ type: "text", text: "hi<system-reminder>ignore" }] } }),
    JSON.stringify({ type: "assistant/message", time: 1002, data: { message: { content: [{ type: "text", text: "hello there" }] } } }),
  ].join("\n");
  writeFileSync(join(dataDir, "session.jsonl"), jsonl);
  writeJsonFile(join(home, "storages", "workspace.json"), {
    global: { archivedSessionIds: options?.archived === false ? [] : [sessionId] },
    tables: { workspaces: { [wsId]: { path: "/tmp/proj", title: "Proj", sessionIds: [sessionId] } } },
  });
  writeJsonFile(join(home, "storages", "session_projcache.json"), {
    tables: {
      sessions: {
        [sessionId]: {
          identity: { createdAt: 1000 },
          rows: {
            title: { ver: 1, seq: 1, val: "Hello title" },
            sessionStats: { ver: 1, seq: 2, val: { turns: 1 } },
          },
        },
      },
    },
  });
  return { home, sessionId };
}

describe("archive ids", () => {
  it("rejects path segments", () => {
    expect(isSafeSessionId("session-1")).toBe(true);
    expect(isSafeSessionId(".")).toBe(false);
    expect(isSafeSessionId("../etc")).toBe(false);
    expect(isSafeSessionId("a/b")).toBe(false);
    expect(encodeSegment("session-1")).toBe("session-1");
    expect(encodeSegment("😀")).toBe("~D83D~DE00");
    expect(encodeSegment("\uD83D")).toBe("~D83D");
  });
});

describe("archive ledger", () => {
  it("lists archived sessions from DSH_HOME fixtures, not ~/.dsh", () => {
    const { home, sessionId } = homeWithSession();
    const { items, ghostIds } = listArchives(home);
    expect(ghostIds).toEqual([]);
    expect(items).toHaveLength(1);
    expect(items[0]?.sessionId).toBe(sessionId);
    expect(items[0]?.title).toBe("Hello title");
    expect(items[0]?.workspaceTitle).toBe("Proj");
    expect(items[0]?.hasDataFile).toBe(true);
  });

  it("does not prune an archived live session before lazy materialization", () => {
    const { home, sessionId } = homeWithSession();
    rmSync(join(home, "sessions"), { recursive: true, force: true });
    writeJsonFile(join(home, "storages", "session_projcache.json"), { tables: { sessions: {} } });
    const result = listArchives(home, {
      archivedIds: () => [sessionId],
      setArchivedIds: async () => undefined,
      mutateArchivedIds: async (mutation) => (await mutation([sessionId])).result,
      isLive: () => true,
      detachLive: () => undefined,
      emitDisposed: () => undefined,
    });

    expect(result.ghostIds).toEqual([]);
    expect(result.items).toEqual([expect.objectContaining({ sessionId, hasDataFile: false })]);
  });

  it("previews cleaned user/assistant text only while archived", () => {
    const { home, sessionId } = homeWithSession();
    const detail = previewArchive(home, sessionId);
    expect(detail?.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(detail?.messages[0]?.content).toBe("hi");
    expect(detail?.messages[1]?.content).toBe("hello there");
    const restored = homeWithSession({ archived: false });
    expect(previewArchive(restored.home, restored.sessionId)).toBeUndefined();
  });

  it("reads zstd transcripts", () => {
    const { home, sessionId } = homeWithSession();
    const dataDir = join(home, "sessions", "proj", sessionId);
    const raw = readFileSync(join(dataDir, "session.jsonl"));
    writeFileSync(join(dataDir, "session.jsonl.zstd"), zstdCompressSync(raw));
    rmSync(join(dataDir, "session.jsonl"));
    expect(readTranscriptText(dataDir)).toContain("Hello title");
    expect(extractSessionDetail(dataDir).totalMessages).toBe(2);
  });

  it("unarchives by removing the id from workspace.json", async () => {
    const { home, sessionId } = homeWithSession();
    const result = await unarchiveSessions(home, [sessionId]);
    expect(result.done).toEqual([sessionId]);
    expect(listArchives(home).items).toEqual([]);
  });

  it("deletes files, projcache, and archived ids", async () => {
    const { home, sessionId } = homeWithSession();
    const result = await deleteSessions(home, [sessionId]);
    expect(result.done).toEqual([sessionId]);
    expect(listArchives(home).items).toEqual([]);
    expect(() => readFileSync(join(home, "sessions", "proj", sessionId, "session.jsonl"))).toThrow();
  });

  it("refuses stale deletion after a session is no longer archived", async () => {
    const { home, sessionId } = homeWithSession({ archived: false });
    const dataFile = join(home, "sessions", "proj", sessionId, "session.jsonl");

    const result = await deleteSessions(home, [sessionId]);

    expect(result).toEqual({ done: [], notFound: [sessionId], errors: [] });
    expect(existsSync(dataFile)).toBe(true);
    const projcache = JSON.parse(readFileSync(join(home, "storages", "session_projcache.json"), "utf8")) as {
      tables: { sessions: Record<string, unknown> };
    };
    expect(projcache.tables.sessions[sessionId]).toBeDefined();
  });

  it("refuses to delete a currently live archived session", async () => {
    const { home, sessionId } = homeWithSession();
    let archived = [sessionId];
    const result = await deleteSessions(home, [sessionId], {
      archivedIds: () => [...archived],
      setArchivedIds: async (ids) => { archived = ids; },
      mutateArchivedIds: async (mutation) => {
        const outcome = await mutation([...archived]);
        archived = outcome.ids;
        return outcome.result;
      },
      isLive: () => true,
      detachLive: () => { throw new Error("must not detach"); },
      emitDisposed: () => { throw new Error("must not dispose"); },
    });

    expect(result).toEqual({ done: [], notFound: [], errors: ["permanent deletion unavailable while DSH is running"] });
    expect(archived).toEqual([sessionId]);
    expect(existsSync(join(home, "sessions", "proj", sessionId, "session.jsonl"))).toBe(true);
  });

  it("uses live archive membership as authoritative for deletion", async () => {
    const { home, sessionId } = homeWithSession();
    const calls: string[] = [];
    const result = await deleteSessions(home, [sessionId], {
      archivedIds: () => [],
      setArchivedIds: async () => undefined,
      detachLive: (id) => calls.push(`detach:${id}`),
      emitDisposed: (id) => calls.push(`dispose:${id}`),
    });

    expect(result.notFound).toEqual([sessionId]);
    expect(calls).toEqual([]);
    expect(existsSync(join(home, "sessions", "proj", sessionId, "session.jsonl"))).toBe(true);
  });

  it.skipIf(process.platform === "win32")("keeps archive membership when transcript removal fails", async () => {
    const { home, sessionId } = homeWithSession();
    const parent = join(home, "sessions", "proj");
    chmodSync(parent, 0o555);
    let result;
    try {
      result = await deleteSessions(home, [sessionId]);
    } finally {
      chmodSync(parent, 0o755);
    }

    expect(result.done).toEqual([]);
    expect(result.errors).toEqual(["session data removal failed"]);
    expect(listArchives(home).items.map((item) => item.sessionId)).toEqual([sessionId]);
  });

  it.skipIf(process.platform === "win32")("rolls a quarantined transcript back when metadata commit fails", async () => {
    const { home, sessionId } = homeWithSession();
    const storages = join(home, "storages");
    chmodSync(storages, 0o555);
    let result;
    try {
      result = await deleteSessions(home, [sessionId]);
    } finally {
      chmodSync(storages, 0o755);
    }

    expect(result.done).toEqual([]);
    expect(result.errors).toEqual(["workspace metadata write failed"]);
    expect(existsSync(join(home, "sessions", "proj", sessionId, "session.jsonl"))).toBe(true);
    expect(listArchives(home).items.map((item) => item.sessionId)).toEqual([sessionId]);
  });

  it("fails live permanent deletion closed without rewriting domain files", async () => {
    const { home, sessionId } = homeWithSession();
    let archived = [sessionId];
    let mutations = 0;
    const result = await deleteSessions(home, [sessionId], {
      archivedIds: () => [...archived],
      setArchivedIds: async (ids) => { archived = ids; },
      mutateArchivedIds: async (mutation) => {
        mutations += 1;
        const outcome = await mutation([...archived]);
        archived = outcome.ids;
        return outcome.result;
      },
      detachLive: () => undefined,
      emitDisposed: () => undefined,
    });

    expect(result).toEqual({
      done: [],
      notFound: [],
      errors: ["permanent deletion unavailable while DSH is running"],
    });
    expect(archived).toEqual([sessionId]);
    expect(mutations).toBe(0);
    const workspace = JSON.parse(readFileSync(join(home, "storages", "workspace.json"), "utf8")) as {
      tables: { workspaces: Record<string, { sessionIds: string[] }> };
    };
    expect(workspace.tables.workspaces["ws-1"]?.sessionIds).toContain(sessionId);
    const projcache = JSON.parse(readFileSync(join(home, "storages", "session_projcache.json"), "utf8")) as {
      tables: { sessions: Record<string, unknown> };
    };
    expect(projcache.tables.sessions[sessionId]).toBeDefined();
    expect(existsSync(join(home, "sessions", "proj", sessionId, "session.jsonl"))).toBe(true);
  });

  it("ignores traversal ids", async () => {
    const { home } = homeWithSession();
    const result = await deleteSessions(home, ["../secret"]);
    expect(result.done).toEqual([]);
    expect(listArchives(home).items).toHaveLength(1);
  });

  it("never treats dot as a session directory", async () => {
    const { home, sessionId } = homeWithSession();
    const sibling = join(home, "sessions", "proj", "session-sibling");
    mkdirSync(sibling, { recursive: true });
    writeFileSync(join(sibling, "session.jsonl"), "sibling");

    const result = await deleteSessions(home, ["."]);

    expect(result.done).toEqual([]);
    expect(existsSync(join(home, "sessions", "proj", sessionId, "session.jsonl"))).toBe(true);
    expect(existsSync(join(sibling, "session.jsonl"))).toBe(true);
  });
});

describe("archive query", () => {
  it("filters, sorts, and groups", () => {
    const items: Array<ReturnType<typeof listArchives>["items"][number]> = [
      { sessionId: "a", title: "Alpha", workspaceTitle: "One", workspacePath: "/one", workspaceId: "1", createdAt: 2, turns: 1, outputTokens: 0, dataSize: 1, hasDataFile: true },
      { sessionId: "b", title: "Beta", workspaceTitle: "Two", workspacePath: "/two", workspaceId: "2", createdAt: 1, turns: 1, outputTokens: 0, dataSize: 1, hasDataFile: true },
    ];
    const filtered = filterArchives(items, { query: "be", workspace: "ALL", sort: "oldest" }, "none");
    expect(filtered.map((item) => item.sessionId)).toEqual(["b"]);
    expect(groupArchives(items, "none").map((group) => group.title)).toEqual(["One", "Two"]);
  });

  it("keeps same-title workspaces isolated by workspace identity", () => {
    const items: Array<ReturnType<typeof listArchives>["items"][number]> = [
      { sessionId: "a", title: "Alpha", workspaceTitle: "Same", workspacePath: "/one", workspaceId: "ws-1", createdAt: 2, turns: 1, outputTokens: 0, dataSize: 1, hasDataFile: true },
      { sessionId: "b", title: "Beta", workspaceTitle: "Same", workspacePath: "/two", workspaceId: "ws-2", createdAt: 1, turns: 1, outputTokens: 0, dataSize: 1, hasDataFile: true },
    ];

    expect(groupArchives(items, "none").map((group) => ({ key: group.key, ids: group.items.map((item) => item.sessionId) }))).toEqual([
      { key: archiveWorkspaceKey(items[0]!), ids: ["a"] },
      { key: archiveWorkspaceKey(items[1]!), ids: ["b"] },
    ]);
    expect(workspaceOptions(items, "none")).toEqual([
      { key: archiveWorkspaceKey(items[0]!), title: "Same", label: "Same (1/2)" },
      { key: archiveWorkspaceKey(items[1]!), title: "Same", label: "Same (2/2)" },
    ]);
    expect(filterArchives(items, {
      query: "",
      workspace: archiveWorkspaceKey(items[0]!),
      sort: "newest",
    }, "none").map((item) => item.sessionId)).toEqual(["a"]);
  });

  it("offers one no-project filter without merging destructive groups", () => {
    const base = { workspaceTitle: undefined, workspacePath: undefined, workspaceId: undefined, createdAt: 1, turns: 0, outputTokens: 0, dataSize: 0, hasDataFile: true };
    const items: Array<ReturnType<typeof listArchives>["items"][number]> = [
      { ...base, sessionId: "a", title: "Alpha" },
      { ...base, sessionId: "b", title: "Beta" },
    ];

    expect(groupArchives(items, "none").map((group) => group.items.map((item) => item.sessionId))).toEqual([["a"], ["b"]]);
    expect(workspaceOptions(items, "none")).toEqual([{ key: "NONE", title: "none", label: "none" }]);
    expect(filterArchives(items, { query: "", workspace: "NONE", sort: "newest" }, "none").map((item) => item.sessionId)).toEqual(["a", "b"]);
  });
});
