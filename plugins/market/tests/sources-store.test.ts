import { dirname } from "node:path";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { marketStatePath } from "../src/dsh-home.ts";
import { loadSources, pickSources, saveSources } from "../src/sources-store.ts";
import { MarketStateError, type MarketStateErrorCode, type MarketStateIo } from "../src/state-store.ts";

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

describe("source store", () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("treats only ENOENT as an empty source list and round-trips valid data", () => {
    dir = mkdtempSync(join(tmpdir(), "dsh-market-sources-"));
    const env = { DSH_HOME: dir } as NodeJS.ProcessEnv;
    expect(loadSources(env)).toEqual([]);
    const sources = pickSources([{ label: "内网源", indexUrl: "https://mirror.corp/market.json" }]);
    saveSources(sources, env);
    expect(loadSources(env)).toEqual(sources);
  });

  it("distinguishes invalid JSON and preserves the original", () => {
    dir = mkdtempSync(join(tmpdir(), "dsh-market-sources-"));
    const env = { DSH_HOME: dir } as NodeJS.ProcessEnv;
    const path = marketStatePath("sources.json", env);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "not-json", "utf8");
    const error = caughtStateError(() => loadSources(env), "invalid-json");
    expect(error.message).toContain(path);
    expect(readFileSync(path, "utf8")).toBe("not-json");
  });

  it("distinguishes invalid schema and preserves the original", () => {
    dir = mkdtempSync(join(tmpdir(), "dsh-market-sources-"));
    const env = { DSH_HOME: dir } as NodeJS.ProcessEnv;
    const path = marketStatePath("sources.json", env);
    mkdirSync(dirname(path), { recursive: true });
    const invalid = JSON.stringify([{ label: "insecure", indexUrl: "http://mirror.corp/market.json" }]);
    writeFileSync(path, invalid, "utf8");
    caughtStateError(() => loadSources(env), "invalid-schema");
    expect(readFileSync(path, "utf8")).toBe(invalid);
  });

  it("keeps the previous file and removes the temp file when atomic replace fails", () => {
    dir = mkdtempSync(join(tmpdir(), "dsh-market-sources-"));
    const env = { DSH_HOME: dir } as NodeJS.ProcessEnv;
    const path = marketStatePath("sources.json", env);
    const oldSources = pickSources([{ label: "old", indexUrl: "https://old.example/market.json" }]);
    const newSources = pickSources([{ label: "new", indexUrl: "https://new.example/market.json" }]);
    saveSources(oldSources, env);
    const io: MarketStateIo = {
      readText: (file) => readFileSync(file, "utf8"),
      ensureParent: (file) => mkdirSync(dirname(file), { recursive: true }),
      writePrivate: (file, text) => writeFileSync(file, text, "utf8"),
      replace: () => { throw new Error("rename denied"); },
      remove: (file) => rmSync(file, { force: true }),
    };
    caughtStateError(() => saveSources(newSources, env, io), "write-failed");
    expect(loadSources(env)).toEqual(oldSources);
    expect(readdirSync(dirname(path)).filter((name) => name.includes(".tmp-"))).toEqual([]);
  });
});
