import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  extraBundleNames,
  extraPluginUnloadableMessage,
  inspectExtraPlugin,
  isProtectedProfileBundle,
  normalizePackageEntry,
  quarantineUnloadableExtraPlugins,
  resolveEntryFile,
  resolvePackageEntry,
  withoutExtraBundles,
} from "../lib/index.js";

test("isProtectedProfileBundle keeps core, first-party, and retired names", () => {
  assert.equal(isProtectedProfileBundle("@deepseek-ai/dsh-base"), true);
  assert.equal(isProtectedProfileBundle("dsh-xtz-ui"), true);
  assert.equal(isProtectedProfileBundle("dsh-hello"), true);
  assert.equal(isProtectedProfileBundle("dsh-context"), false);
  assert.equal(isProtectedProfileBundle("@nanmicoder/dsh-agent-teams"), false);
});

test("resolvePackageEntry prefers exports then main", () => {
  assert.equal(resolvePackageEntry({ exports: "./lib/index.js" }), "./lib/index.js");
  assert.equal(resolvePackageEntry({
    main: "legacy.js",
    exports: { ".": { import: "./lib/index.js", require: "./lib/index.cjs" } },
  }), "./lib/index.js");
  assert.equal(resolvePackageEntry({ main: "lib/index.js" }), "lib/index.js");
  assert.equal(resolvePackageEntry({}), "index.js");
});

test("resolveEntryFile rejects escapes", () => {
  assert.equal(normalizePackageEntry("./lib/index.js"), "lib/index.js");
  assert.equal(resolveEntryFile("/profile/node_modules/dsh-context", "./lib/index.js"), join("/profile/node_modules/dsh-context", "lib/index.js"));
  assert.equal(resolveEntryFile("/p", "../secret.js"), null);
  assert.equal(resolveEntryFile("/p", "/etc/passwd"), null);
});

test("extraBundleNames only lists non-protected bundles", () => {
  assert.deepEqual(extraBundleNames({
    dsh: {
      profile: {
        bundles: ["@deepseek-ai/dsh-base", "dsh-xtz-ui", "dsh-context", "@nanmicoder/dsh-agent-teams"],
      },
    },
  }), ["dsh-context", "@nanmicoder/dsh-agent-teams"]);
});

test("withoutExtraBundles keeps dependencies and protected bundles", () => {
  const next = withoutExtraBundles({
    dependencies: { "dsh-xtz-ui": "link:./x", "dsh-context": "github:example/dsh-context" },
    dsh: { profile: { bundles: ["dsh-xtz-ui", "dsh-context"] } },
  }, ["dsh-context"]);
  assert.equal(next.dependencies["dsh-context"], "github:example/dsh-context");
  assert.deepEqual(next.dsh.profile.bundles, ["dsh-xtz-ui"]);
});

test("inspectExtraPlugin reports a missing Host entry", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "xtz-extra-plugin-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  const pkgDir = join(root, "node_modules", "dsh-context");
  await mkdir(pkgDir, { recursive: true });
  await writeFile(join(pkgDir, "package.json"), JSON.stringify({ name: "dsh-context", main: "lib/index.js" }));
  const files = new Map([
    [join(pkgDir, "package.json"), JSON.stringify({ name: "dsh-context", main: "lib/index.js" })],
  ]);
  const io = {
    readText: async (path) => files.get(path) ?? null,
    pathExists: async (path) => files.has(path),
  };
  assert.deepEqual(await inspectExtraPlugin(root, "dsh-context", io), {
    name: "dsh-context",
    status: "unloadable",
    reason: "缺少入口 lib/index.js",
  });
});

test("quarantineUnloadableExtraPlugins drops missing extras and keeps a healthy one", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "xtz-extra-plugin-q-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  const brokenDir = join(root, "node_modules", "dsh-context");
  const scopedDir = join(root, "node_modules", "@nanmicoder", "dsh-agent-teams");
  const okDir = join(root, "node_modules", "dsh-ok");
  await mkdir(brokenDir, { recursive: true });
  await mkdir(scopedDir, { recursive: true });
  await mkdir(join(okDir, "lib"), { recursive: true });
  const files = new Map([
    [join(brokenDir, "package.json"), JSON.stringify({ name: "dsh-context", main: "lib/index.js" })],
    [join(scopedDir, "package.json"), JSON.stringify({ name: "@nanmicoder/dsh-agent-teams", main: "lib/index.js" })],
    [join(okDir, "package.json"), JSON.stringify({ name: "dsh-ok", main: "lib/index.js" })],
    [join(okDir, "lib", "index.js"), "export {}\n"],
  ]);
  const io = {
    readText: async (path) => files.get(path) ?? null,
    pathExists: async (path) => files.has(path),
  };
  const result = await quarantineUnloadableExtraPlugins(root, {
    dependencies: {
      "dsh-xtz-ui": "link:./xtz-ui",
      "dsh-context": "github:example/dsh-context",
      "@nanmicoder/dsh-agent-teams": "github:example/teams",
      "dsh-ok": "github:example/ok",
    },
    dsh: {
      profile: {
        bundles: ["@deepseek-ai/dsh-base", "dsh-xtz-ui", "dsh-context", "@nanmicoder/dsh-agent-teams", "dsh-ok"],
      },
    },
  }, io);
  assert.deepEqual(result.quarantined.map((item) => item.name), ["dsh-context", "@nanmicoder/dsh-agent-teams"]);
  assert.deepEqual(result.manifest.dsh.profile.bundles, ["@deepseek-ai/dsh-base", "dsh-xtz-ui", "dsh-ok"]);
  assert.equal(result.manifest.dependencies["dsh-context"], "github:example/dsh-context");
  assert.match(extraPluginUnloadableMessage(result.quarantined), /dsh-context.*lib\/index\.js/u);
});
