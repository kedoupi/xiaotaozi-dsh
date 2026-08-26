import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dshHome, helloSettingsPath } from "../src/dsh-home.ts";

describe("dsh home", () => {
  it("uses DSH_HOME when set", () => {
    expect(dshHome({ DSH_HOME: "/tmp/sandbox-home" })).toBe("/tmp/sandbox-home");
    expect(helloSettingsPath({ DSH_HOME: "/tmp/sandbox-home" })).toBe(
      join("/tmp/sandbox-home", "plugins", "hello", "settings.json"),
    );
  });

  it("does not treat an empty DSH_HOME as a path", () => {
    expect(dshHome({ DSH_HOME: "" })).toBe(join(homedir(), ".dsh"));
  });
});
