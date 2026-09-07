import { mkdtemp, readFile, readdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authFilePath, deleteSession, getSession, loadStore, saveSession, updateSessionIfCurrent, type QwenSession, type ClaudeSession, type CodexSession } from "../src/auth/store.ts";

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: vi.fn(actual.readFile), rename: vi.fn(actual.rename) };
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => { resolve = yes; });
  return { promise, resolve };
}
const previousHome = process.env.DSH_HOME;
const old: QwenSession = { accessToken: "synthetic-old", refreshToken: "synthetic-r", expiresAt: 1 };
const next: QwenSession = { accessToken: "synthetic-new", refreshToken: "synthetic-r2", expiresAt: 9e15 };
const dirs: string[] = [];
async function home() {
  const dir = await mkdtemp(join(tmpdir(), "providers-cas-"));
  dirs.push(dir);
  process.env.DSH_HOME = dir;
  await saveSession("qwen", old);
  return dir;
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

function codex(): CodexSession {
  return {
    accessToken: "a",
    refreshToken: "ra",
    expiresAt: Date.now() + 60_000,
    accountId: "acc-a",
  };
}

function claude(): ClaudeSession {
  return {
    accessToken: "b",
    refreshToken: "rb",
    expiresAt: Date.now() + 60_000,
    scopes: "user:profile",
  };
}

describe("auth store", () => {
  it.each(["accessToken", "refreshToken", "expiresAt"] as const)("CAS compares %s for save and delete", async field => {
    await home();
    const mismatch = { ...old, [field]: field === "expiresAt" ? 2 : "synthetic-other" };
    for (const value of [next, undefined]) {
      expect(await updateSessionIfCurrent("qwen", mismatch, value, () => true)).toBe(false);
      expect((await getSession("qwen"))?.accessToken === old.accessToken).toBe(true);
    }
    expect(await updateSessionIfCurrent("qwen", old, next, () => true)).toBe(true);
    expect((await getSession("qwen"))?.accessToken === next.accessToken).toBe(true);
    expect(await updateSessionIfCurrent("qwen", next, undefined, () => true)).toBe(true);
    expect(await getSession("qwen")).toBeUndefined();
    expect(await updateSessionIfCurrent("qwen", next, next, () => true)).toBe(false);
  });

  it.each(["generation", "replacement"])("checks %s after entering the real store queue", async scenario => {
    await home();
    const entered = deferred();
    const release = deferred();
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(readFile).mockImplementationOnce(async (...args) => {
      const snapshot = await actual.readFile(...args);
      entered.resolve(); await release.promise; return snapshot;
    });
    let current = true;
    const first = scenario === "replacement" ? saveSession("qwen", next) : saveSession("claude", claude());
    await entered.promise;
    const pending = updateSessionIfCurrent("qwen", old, undefined, () => current);
    if (scenario === "generation") current = false;
    release.resolve();
    await first;
    expect(await pending).toBe(false);
    expect((await getSession("qwen"))?.accessToken === (scenario === "replacement" ? next : old).accessToken).toBe(true);
  });

  it("recovers after a conditional write failure and preserves other providers", async () => {
    await home();
    vi.mocked(rename).mockRejectedValueOnce(new Error("fixture rename failure"));
    const failed = updateSessionIfCurrent("qwen", old, next, () => true).catch(error => error);
    const later = saveSession("claude", claude());
    expect(await failed).toBeInstanceOf(Error);
    await later;
    expect((await getSession("qwen"))?.accessToken === old.accessToken).toBe(true);
    expect((await getSession("claude")) !== undefined).toBe(true);
    expect(await readdir(join(authFilePath(), ".."))).toEqual(["auth.json"]);
  });

  afterEach(async () => {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
  });

  it("keeps both providers when saves overlap", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dsh-providers-store-"));
    process.env.DSH_HOME = dir;
    try {
      await Promise.all([saveSession("codex", codex()), saveSession("claude", claude())]);
      const store = await loadStore();
      expect(store.codex?.accessToken).toBe("a");
      expect(store.claude?.accessToken).toBe("b");
      await deleteSession("codex");
      expect((await loadStore()).codex).toBeUndefined();
      expect((await loadStore()).claude?.accessToken).toBe("b");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
