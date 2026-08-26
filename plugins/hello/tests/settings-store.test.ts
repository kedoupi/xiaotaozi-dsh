import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveHelloConfig } from "../src/config.ts";
import { loadSettings, saveSettings } from "../src/settings-store.ts";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("settings store", () => {
  it("round-trips flags under DSH_HOME and ignores junk", () => {
    const home = mkdtempSync(join(tmpdir(), "dsh-hello-"));
    dirs.push(home);
    const env = { DSH_HOME: home };
    expect(loadSettings(env)).toEqual({});
    saveSettings(resolveHelloConfig({ archive: false, announceToAgent: true }), env);
    expect(loadSettings(env)).toMatchObject({ archive: false, announceToAgent: true });
    const raw = JSON.parse(readFileSync(join(home, "plugins", "hello", "settings.json"), "utf8")) as Record<string, unknown>;
    expect(raw.extra).toBeUndefined();
  });

  it("treats a corrupt file as empty", () => {
    const home = mkdtempSync(join(tmpdir(), "dsh-hello-"));
    dirs.push(home);
    const env = { DSH_HOME: home };
    saveSettings(resolveHelloConfig(), env);
    writeFileSync(join(home, "plugins", "hello", "settings.json"), "{not json");
    expect(loadSettings(env)).toEqual({});
  });
});
