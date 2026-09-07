import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  inspectInstalledPluginEntry,
  installedPluginLoadError,
  parseExportedInject,
  resolvePackageEntry,
} from "../src/plugin-entry.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("resolvePackageEntry", () => {
  it("reads main when exports is absent", () => {
    expect(resolvePackageEntry({ main: "lib/index.js" })).toBe("lib/index.js");
  });
});

describe("inspectInstalledPluginEntry", () => {
  it("fails when the Host entry file is missing and succeeds when it exists", () => {
    const home = mkdtempSync(join(tmpdir(), "dsh-market-entry-"));
    dirs.push(home);
    const pkgDir = join(home, "profiles", "web", "node_modules", "dsh-context");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, "package.json"), JSON.stringify({ name: "dsh-context", main: "lib/index.js" }));
    const env = { DSH_HOME: home };
    const missing = inspectInstalledPluginEntry({ packageName: "dsh-context" }, env);
    expect(missing).toEqual({ ok: false, reason: "plugin has no loadable entry (missing lib/index.js)" });
    expect(installedPluginLoadError(missing)).toContain("缺少 lib/index.js");
    expect(installedPluginLoadError(missing)).toContain("当前不可装");
    mkdirSync(join(pkgDir, "lib"));
    writeFileSync(join(pkgDir, "lib", "index.js"), "export {}\n");
    expect(inspectInstalledPluginEntry({ packageName: "dsh-context" }, env)).toEqual({ ok: true });
  });

  it("fails when the Client inject list waits on uiConversation", () => {
    const home = mkdtempSync(join(tmpdir(), "dsh-market-entry-ui-"));
    dirs.push(home);
    const pkgDir = join(home, "profiles", "web", "node_modules", "@nanmicoder", "dsh-agent-teams");
    mkdirSync(join(pkgDir, "lib"), { recursive: true });
    writeFileSync(join(pkgDir, "package.json"), JSON.stringify({
      name: "@nanmicoder/dsh-agent-teams",
      main: "lib/index.js",
      exports: { ".": "./lib/index.js", "./client": "./lib/client.js" },
    }));
    writeFileSync(join(pkgDir, "lib", "index.js"), "export {}\n");
    writeFileSync(
      join(pkgDir, "lib", "client.js"),
      "export const inject = ['uiConversation', 'slots', 'sessions'];\n",
    );
    const env = { DSH_HOME: home };
    const blocked = inspectInstalledPluginEntry({ packageName: "@nanmicoder/dsh-agent-teams" }, env);
    expect(blocked.ok).toBe(false);
    if (blocked.ok) throw new Error("expected Client boot block");
    expect(blocked.reason).toContain("uiConversation");
    expect(installedPluginLoadError(blocked)).toContain("uiConversation");
    expect(installedPluginLoadError(blocked)).toContain("已回滚安装");
    expect(parseExportedInject("export const inject = ['uiConversation', 'slots']")).toEqual([
      "uiConversation",
      "slots",
    ]);
  });
});
