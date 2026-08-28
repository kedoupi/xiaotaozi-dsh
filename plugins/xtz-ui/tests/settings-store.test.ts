import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveXtzUiConfig } from "../src/config.ts";
import { loadSettings, saveSettings } from "../src/settings-store.ts";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("settings store", () => {
  it("round-trips flags under DSH_HOME and ignores junk", () => {
    const home = mkdtempSync(join(tmpdir(), "dsh-xtz-ui-"));
    dirs.push(home);
    const env = { DSH_HOME: home };
    expect(loadSettings(env)).toEqual({});
    saveSettings(resolveXtzUiConfig({ archive: false, announceToAgent: true }), env);
    expect(loadSettings(env)).toMatchObject({ archive: false, announceToAgent: true });
    const raw = JSON.parse(readFileSync(join(home, "plugins", "xtz-ui", "settings.json"), "utf8")) as Record<string, unknown>;
    expect(raw.extra).toBeUndefined();
  });

  it("treats a corrupt file as empty", () => {
    const home = mkdtempSync(join(tmpdir(), "dsh-xtz-ui-"));
    dirs.push(home);
    const env = { DSH_HOME: home };
    saveSettings(resolveXtzUiConfig(), env);
    writeFileSync(join(home, "plugins", "xtz-ui", "settings.json"), "{not json");
    expect(loadSettings(env)).toEqual({});
  });

  it("adopts settings from plugins/hello when xtz-ui has none", () => {
    const home = mkdtempSync(join(tmpdir(), "dsh-xtz-ui-"));
    dirs.push(home);
    const env = { DSH_HOME: home };
    mkdirSync(join(home, "plugins", "hello"), { recursive: true, mode: 0o700 });
    writeFileSync(join(home, "plugins", "hello", "settings.json"), `${JSON.stringify({ archive: false, board: true })}\n`);
    expect(loadSettings(env)).toMatchObject({ archive: false, board: true });
    expect(JSON.parse(readFileSync(join(home, "plugins", "xtz-ui", "settings.json"), "utf8"))).toMatchObject({
      archive: false,
      board: true,
    });
  });
});
