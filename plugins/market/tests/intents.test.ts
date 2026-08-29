import { dirname } from "node:path";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { marketStatePath } from "../src/dsh-home.ts";
import { appendIntent, loadIntents, saveIntents, settleIntent, type InstallIntent } from "../src/intents.ts";
import { MarketStateError, type MarketStateErrorCode, type MarketStateIo } from "../src/state-store.ts";

function intent(
  entryId: string,
  action: "install" | "remove" = "install",
  requestId = `request-${entryId}-${action}`,
): InstallIntent {
  return { requestId, entryId, sourceId: "src-1", action, requestedAt: "2026-08-26T00:00:00.000Z", status: "pending" };
}

function caughtStateError(run: () => void, code: MarketStateErrorCode): MarketStateError {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(MarketStateError);
  expect((caught as MarketStateError).code).toBe(code);
  return caught as MarketStateError;
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

describe("settleIntent", () => {
  it("does not settle an identical replacement requested in the same millisecond", () => {
    const completed = intent("a", "install", "request-a-1");
    const replacement = { ...completed, requestId: "request-a-2" };
    const latest = appendIntent([completed], replacement);
    expect(settleIntent(latest, completed)).toEqual([replacement]);
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
  it("loads legacy rows without requestId deterministically and migrates them on save", () => {
    dir = mkdtempSync(join(tmpdir(), "dsh-market-"));
    const env = { DSH_HOME: dir } as NodeJS.ProcessEnv;
    const path = marketStatePath("intents.json", env);
    mkdirSync(dirname(path), { recursive: true });
    const { requestId: _requestId, ...legacy } = intent("legacy");
    writeFileSync(path, JSON.stringify([legacy]), "utf8");

    const first = loadIntents(env);
    const second = loadIntents(env);
    expect(first[0]!.requestId).toMatch(/^legacy:[a-f0-9]{64}$/);
    expect(second).toEqual(first);

    saveIntents(first, env);
    expect(JSON.parse(readFileSync(path, "utf8"))[0].requestId).toBe(first[0]!.requestId);
  });
  it("distinguishes invalid JSON and preserves the original", () => {
    dir = mkdtempSync(join(tmpdir(), "dsh-market-"));
    const env = { DSH_HOME: dir } as NodeJS.ProcessEnv;
    const path = marketStatePath("intents.json", env);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "{broken", "utf8");
    const error = caughtStateError(() => loadIntents(env), "invalid-json");
    expect(error.message).toContain("original file was kept");
    expect(readFileSync(path, "utf8")).toBe("{broken");
  });
  it("distinguishes invalid schema and preserves the original", () => {
    dir = mkdtempSync(join(tmpdir(), "dsh-market-"));
    const env = { DSH_HOME: dir } as NodeJS.ProcessEnv;
    const path = marketStatePath("intents.json", env);
    mkdirSync(dirname(path), { recursive: true });
    const invalid = JSON.stringify([{ ...intent("hello"), status: "done" }]);
    writeFileSync(path, invalid, "utf8");
    caughtStateError(() => loadIntents(env), "invalid-schema");
    expect(readFileSync(path, "utf8")).toBe(invalid);
  });
  it("keeps the previous file and removes the temp file when atomic replace fails", () => {
    dir = mkdtempSync(join(tmpdir(), "dsh-market-"));
    const env = { DSH_HOME: dir } as NodeJS.ProcessEnv;
    const path = marketStatePath("intents.json", env);
    saveIntents([intent("old")], env);
    const io: MarketStateIo = {
      readText: (file) => readFileSync(file, "utf8"),
      ensureParent: (file) => mkdirSync(dirname(file), { recursive: true }),
      writePrivate: (file, text) => writeFileSync(file, text, "utf8"),
      replace: () => { throw Object.assign(new Error("rename denied"), { code: "EACCES" }); },
      remove: (file) => rmSync(file, { force: true }),
    };
    caughtStateError(() => saveIntents([intent("new")], env, io), "write-failed");
    expect(loadIntents(env)).toEqual([intent("old")]);
    expect(readdirSync(dirname(path)).filter((name) => name.includes(".tmp-"))).toEqual([]);
  });
});
