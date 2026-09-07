import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  allowGitPluginBuilds,
  parseAllowBuildKeys,
  withAllowBuilds,
} from "../src/allow-builds.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const dshContextBlocked = `
[ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED] Failed to prepare git-hosted package fetched from
"https://codeload.github.com/bowenliang123/dsh-context/tar.gz/4ac3bba1cf55ae70a9f9a393fae5663f263f976a"
The git-hosted package "dsh-context@0.44.0" needs to execute build scripts but is not in the "allowBuilds" allowlist.
`;

describe("parseAllowBuildKeys", () => {
  it("reads pnpm example blocks and DSH git-hosted package lines", () => {
    expect(parseAllowBuildKeys(`Add the package to "allowBuilds" in your project's pnpm-workspace.yaml to allow it to run scripts. For example:
allowBuilds:
  sharp: true
`)).toEqual(["sharp"]);
    expect(parseAllowBuildKeys(dshContextBlocked)).toEqual([
      "dsh-context@0.44.0",
      "dsh-context",
      "dsh-context@https://codeload.github.com/bowenliang123/dsh-context/tar.gz/4ac3bba1cf55ae70a9f9a393fae5663f263f976a",
    ]);
  });
});

describe("allowGitPluginBuilds", () => {
  it("writes missing keys into the web profile workspace", () => {
    const home = mkdtempSync(join(tmpdir(), "dsh-market-allow-"));
    dirs.push(home);
    const profile = join(home, "profiles", "web");
    mkdirSync(profile, { recursive: true });
    writeFileSync(join(profile, "pnpm-workspace.yaml"), "packages:\n  - .\n", "utf8");
    expect(allowGitPluginBuilds(parseAllowBuildKeys(dshContextBlocked), { DSH_HOME: home })).toBe(true);
    const yaml = readFileSync(join(profile, "pnpm-workspace.yaml"), "utf8");
    expect(yaml).toMatch(/allowBuilds:/u);
    expect(yaml).toContain("dsh-context: true");
    expect(allowGitPluginBuilds(["dsh-context"], { DSH_HOME: home })).toBe(false);
    expect(withAllowBuilds("allowBuilds:", ["sharp"])).toMatch(/^allowBuilds:\n  sharp: true\n$/u);
  });
});
