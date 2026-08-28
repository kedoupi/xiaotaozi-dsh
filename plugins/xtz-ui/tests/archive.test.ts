import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zstdCompressSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { encodeSegment, isSafeSessionId } from "../src/archive/encode.ts";
import { deleteSessions, listArchives, previewArchive, unarchiveSessions } from "../src/archive/ledger.ts";
import { filterArchives, groupArchives } from "../src/archive/query.ts";
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
    expect(isSafeSessionId("../etc")).toBe(false);
    expect(isSafeSessionId("a/b")).toBe(false);
    expect(encodeSegment("session-1")).toBe("session-1");
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

  it("previews cleaned user/assistant text", () => {
    const { home, sessionId } = homeWithSession();
    const detail = previewArchive(home, sessionId);
    expect(detail?.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(detail?.messages[0]?.content).toBe("hi");
    expect(detail?.messages[1]?.content).toBe("hello there");
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

  it("ignores traversal ids", async () => {
    const { home } = homeWithSession();
    const result = await deleteSessions(home, ["../secret"]);
    expect(result.done).toEqual([]);
    expect(listArchives(home).items).toHaveLength(1);
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
});
