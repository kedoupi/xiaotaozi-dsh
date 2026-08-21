import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { deleteSession, loadStore, saveSession, type ClaudeSession, type CodexSession } from "../src/auth/store.ts";

const previousHome = process.env.DSH_HOME;

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
