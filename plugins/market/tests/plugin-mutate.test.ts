import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CatalogEntry } from "../src/catalog.ts";
import { PINNED_DSH_VERSION, resolvePinnedDshLaunch, spawnDshPluginMutate } from "../src/plugin-mutate.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function catalogEntry(): CatalogEntry {
  return {
    id: "context",
    name: "context",
    version: "1",
    summary: "",
    tags: [],
    kind: "plugin",
    sourceId: "s",
    installed: false,
    packageName: "dsh-context",
    installSpec: "github:example/dsh-context",
  };
}

function fakeDshPackage(version = PINNED_DSH_VERSION): { root: string; entry: string } {
  const root = mkdtempSync(join(tmpdir(), "dsh-market-runtime-"));
  dirs.push(root);
  const lib = join(root, "lib");
  mkdirSync(lib, { recursive: true });
  const entry = join(lib, "bin.js");
  writeFileSync(join(root, "package.json"), JSON.stringify({
    name: "@deepseek-ai/dsh",
    version,
    type: "module",
    bin: { dsh: "lib/bin.js" },
  }), "utf8");
  writeFileSync(entry, [
    'import { writeFileSync } from "node:fs";',
    "if (process.env.PROBE_MODULE_URL) {",
    "  const { resolvePinnedDshLaunch } = await import(process.env.PROBE_MODULE_URL);",
    "  writeFileSync(process.env.CAPTURE_FILE, JSON.stringify({ argvEntry: process.argv[1], launch: resolvePinnedDshLaunch() }));",
    "} else {",
    "  writeFileSync(process.env.CAPTURE_FILE, JSON.stringify({ args: process.argv.slice(2), home: process.env.DSH_HOME }));",
    "}",
  ].join("\n"), "utf8");
  return { root, entry };
}

describe("spawnDshPluginMutate", () => {
  it("refuses local and externals specs without spawning", async () => {
    await expect(spawnDshPluginMutate("install", {
      id: "x",
      name: "x",
      version: "1",
      summary: "",
      tags: [],
      kind: "plugin",
      sourceId: "s",
      installed: false,
      installSpec: "link:./plugins/x",
    })).resolves.toMatchObject({ ok: false, error: "refused local spec" });
    await expect(spawnDshPluginMutate("install", {
      id: "x",
      name: "x",
      version: "1",
      summary: "",
      tags: [],
      kind: "plugin",
      sourceId: "s",
      installed: false,
      installSpec: "github:kedoupi/xiaotaozi-dsh#path:externals/opencontext",
    })).resolves.toMatchObject({ ok: false, error: "refused externals path" });
  });

  it("resolves the exact pinned DSH package that launched the Host", () => {
    const runtime = fakeDshPackage();
    expect(resolvePinnedDshLaunch(runtime.entry, "/absolute/node")).toEqual({
      command: "/absolute/node",
      prefixArgs: [realpathSync(runtime.entry)],
    });
    const wrong = fakeDshPackage("9.9.9");
    expect(() => resolvePinnedDshLaunch(wrong.entry, "/absolute/node")).toThrow(`expected ${PINNED_DSH_VERSION}`);
  });

  it("reads process.argv[1] from an actual Node-launched Host bin", () => {
    const runtime = fakeDshPackage();
    const capture = join(runtime.root, "argv-contract.json");
    const child = spawnSync(process.execPath, [runtime.entry], {
      encoding: "utf8",
      env: {
        ...process.env,
        CAPTURE_FILE: capture,
        PROBE_MODULE_URL: new URL("../src/plugin-mutate.ts", import.meta.url).href,
      },
    });
    expect(child.status, child.stderr).toBe(0);
    expect(JSON.parse(readFileSync(capture, "utf8"))).toEqual({
      argvEntry: runtime.entry,
      launch: {
        command: process.execPath,
        prefixArgs: [realpathSync(runtime.entry)],
      },
    });
  });

  it("uses process.argv[1], ignores a wrong PATH dsh, and keeps sandbox DSH_HOME", async () => {
    const runtime = fakeDshPackage();
    const wrongBin = join(runtime.root, "wrong-bin");
    mkdirSync(wrongBin);
    const wrongMarker = join(runtime.root, "wrong-path-used");
    const wrongDsh = join(wrongBin, "dsh");
    writeFileSync(wrongDsh, `#!/bin/sh\nprintf wrong > ${JSON.stringify(wrongMarker)}\nexit 31\n`, "utf8");
    chmodSync(wrongDsh, 0o755);
    const capture = join(runtime.root, "capture.json");
    const sandboxHome = join(runtime.root, ".dsh-home");
    const previousEntry = process.argv[1];
    process.argv[1] = runtime.entry;
    let result: Awaited<ReturnType<typeof spawnDshPluginMutate>> | undefined;
    try {
      result = await spawnDshPluginMutate("install", catalogEntry(), {
        DSH_HOME: sandboxHome,
        PATH: wrongBin,
        CAPTURE_FILE: capture,
      }, {
        timeoutMs: 5_000,
      });
    } finally {
      if (previousEntry === undefined) process.argv.splice(1, 1);
      else process.argv[1] = previousEntry;
    }
    expect(result).toEqual({ ok: true });
    expect(existsSync(wrongMarker)).toBe(false);
    expect(JSON.parse(readFileSync(capture, "utf8"))).toEqual({
      args: ["plugin", "--profile", "web", "add", "github:example/dsh-context"],
      home: sandboxHome,
    });
  });

  it("removes a scoped package name rather than its stored link spec", async () => {
    const runtime = fakeDshPackage();
    const capture = join(runtime.root, "capture-scoped-remove.json");
    const home = join(runtime.root, "fake-home");
    const result = await spawnDshPluginMutate("remove", {
      ...catalogEntry(),
      id: "installed:%40example%2Fextra",
      sourceId: "profile",
      installed: true,
      packageName: "@example/extra",
      installSpec: "link:/temporary/extra",
    }, {
      DSH_HOME: home,
      PATH: "",
      CAPTURE_FILE: capture,
    }, {
      dshEntry: runtime.entry,
      nodePath: process.execPath,
      timeoutMs: 5_000,
    });
    expect(result).toEqual({ ok: true });
    expect(JSON.parse(readFileSync(capture, "utf8"))).toEqual({
      args: ["plugin", "--profile", "web", "remove", "@example/extra"],
      home,
    });
  });

  it("does not need PATH and keeps the official home separate", async () => {
    const runtime = fakeDshPackage();
    const capture = join(runtime.root, "capture-official.json");
    const result = await spawnDshPluginMutate("remove", catalogEntry(), {
      PATH: "",
      CAPTURE_FILE: capture,
    }, {
      dshEntry: runtime.entry,
      nodePath: process.execPath,
      timeoutMs: 5_000,
    });
    expect(result).toEqual({ ok: true });
    expect(JSON.parse(readFileSync(capture, "utf8"))).toEqual({
      args: ["plugin", "--profile", "web", "remove", "dsh-context"],
      home: join(homedir(), ".dsh"),
    });
  });

  it("exposes unique dsh plugin stderr instead of a bare mutation-failed", async () => {
    const root = mkdtempSync(join(tmpdir(), "dsh-market-runtime-"));
    dirs.push(root);
    const lib = join(root, "lib");
    mkdirSync(lib, { recursive: true });
    const entry = join(lib, "bin.js");
    writeFileSync(join(root, "package.json"), JSON.stringify({
      name: "@deepseek-ai/dsh",
      version: PINNED_DSH_VERSION,
      type: "module",
      bin: { dsh: "lib/bin.js" },
    }), "utf8");
    writeFileSync(entry, [
      "process.stderr.write('pnpm failed in profile directory /tmp/web\\nunique-stderr-token-42\\n');",
      "process.exit(1);",
    ].join("\n"), "utf8");
    const result = await spawnDshPluginMutate("install", catalogEntry(), {
      DSH_HOME: join(root, "home"),
    }, {
      dshEntry: entry,
      nodePath: process.execPath,
      timeoutMs: 5_000,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("unique-stderr-token-42");
    expect(result.error).not.toBe("mutation-failed");
    expect(result.error).not.toBe("dsh plugin install failed");
  });

  it("allows a blocked git prepare once and succeeds on retry", async () => {
    const root = mkdtempSync(join(tmpdir(), "dsh-market-runtime-"));
    dirs.push(root);
    const lib = join(root, "lib");
    mkdirSync(lib, { recursive: true });
    const entry = join(lib, "bin.js");
    writeFileSync(join(root, "package.json"), JSON.stringify({
      name: "@deepseek-ai/dsh",
      version: PINNED_DSH_VERSION,
      type: "module",
      bin: { dsh: "lib/bin.js" },
    }), "utf8");
    writeFileSync(entry, [
      'import { existsSync, readFileSync, writeFileSync } from "node:fs";',
      'import { join } from "node:path";',
      "const yamlPath = join(process.env.DSH_HOME ?? \"\", \"profiles\", \"web\", \"pnpm-workspace.yaml\");",
      "let yaml = \"\";",
      "try { yaml = readFileSync(yamlPath, \"utf8\"); } catch {}",
      "if (yaml.includes(\"dsh-context\")) {",
      "  writeFileSync(process.env.CAPTURE_FILE, JSON.stringify({ retried: true, home: process.env.DSH_HOME }));",
      "  process.exit(0);",
      "}",
      "process.stderr.write(`[ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED] Failed to prepare git-hosted package fetched from\\n\"https://codeload.github.com/example/dsh-context/tar.gz/abc\"\\nThe git-hosted package \"dsh-context@0.44.0\" needs to execute build scripts but is not in the \"allowBuilds\" allowlist.\\n`);",
      "process.exit(1);",
    ].join("\n"), "utf8");
    const home = join(root, "home");
    const capture = join(root, "retry.json");
    const result = await spawnDshPluginMutate("install", catalogEntry(), {
      DSH_HOME: home,
      CAPTURE_FILE: capture,
    }, {
      dshEntry: entry,
      nodePath: process.execPath,
      timeoutMs: 5_000,
    });
    expect(result).toEqual({ ok: true });
    expect(JSON.parse(readFileSync(capture, "utf8"))).toEqual({ retried: true, home });
    expect(readFileSync(join(home, "profiles", "web", "pnpm-workspace.yaml"), "utf8")).toContain("dsh-context");
  });
});
