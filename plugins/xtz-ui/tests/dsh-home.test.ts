import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  adoptLegacyPluginFile,
  dshHome,
  legacyHelloPluginFile,
  xtzUiSettingsPath,
} from "../src/dsh-home.ts";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("dsh home", () => {
  it("uses DSH_HOME when set", () => {
    expect(dshHome({ DSH_HOME: "/tmp/sandbox-home" })).toBe("/tmp/sandbox-home");
    expect(xtzUiSettingsPath({ DSH_HOME: "/tmp/sandbox-home" })).toBe(
      join("/tmp/sandbox-home", "plugins", "xtz-ui", "settings.json"),
    );
    expect(legacyHelloPluginFile("settings.json", { DSH_HOME: "/tmp/sandbox-home" })).toBe(
      join("/tmp/sandbox-home", "plugins", "hello", "settings.json"),
    );
  });

  it("does not treat an empty DSH_HOME as a path", () => {
    expect(dshHome({ DSH_HOME: "" })).toBe(join(homedir(), ".dsh"));
  });

  it("copies a missing xtz-ui file from plugins/hello", () => {
    const home = mkdtempSync(join(tmpdir(), "dsh-xtz-ui-adopt-"));
    dirs.push(home);
    const env = { DSH_HOME: home };
    const legacy = legacyHelloPluginFile("settings.json", env);
    const current = xtzUiSettingsPath(env);
    mkdirSync(join(home, "plugins", "hello"), { recursive: true, mode: 0o700 });
    writeFileSync(legacy, `${JSON.stringify({ archive: false })}\n`);
    adoptLegacyPluginFile(current, legacy);
    expect(JSON.parse(readFileSync(current, "utf8"))).toEqual({ archive: false });
  });
});
