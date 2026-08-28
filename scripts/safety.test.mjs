import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  isSafePackagePath,
  localDependencyEscapes,
  packageFilePaths,
  parseArgs as parsePathArgs,
  runCommand,
} from "./check-path-install.mjs";
import { classifyLocalLink, isPathContained, parseArgs as parseDoctorArgs } from "./doctor.mjs";
import { parseArgs as parseLinkArgs } from "./link-plugin.mjs";

test("doctor validates arguments", () => {
  assert.throws(() => parseDoctorArgs(["--home"]), /requires/);
  assert.throws(() => parseDoctorArgs(["--home="]), /requires/);
  assert.throws(() => parseDoctorArgs(["daily"]), /Unknown flag/);
  assert.equal(parseDoctorArgs(["--home", "./daily"]).home.endsWith("/daily"), true);
});

test("containment compares path segments", () => {
  assert.equal(isPathContained("/repo/plugins/a", "/repo"), true);
  assert.equal(isPathContained("/repo-evil/plugins/a", "/repo"), false);
  assert.equal(isPathContained("/repo/plugins/../../secret", "/repo"), false);
});

test("doctor resolves relative links and follows symlinks", async () => {
  const base = await mkdtemp(join(tmpdir(), "dsh-doctor-"));
  const root = join(base, "repo");
  const profile = join(base, "home", "profiles", "web");
  const plugin = join(root, "plugins", "memory");
  const external = join(root, "externals", "upstream");
  await mkdir(profile, { recursive: true });
  await mkdir(plugin, { recursive: true });
  await mkdir(external, { recursive: true });
  await symlink(external, join(base, "external-link"));
  const pkgPath = join(profile, "package.json");
  try {
    const workspace = await classifyLocalLink(`link:${plugin}`, pkgPath, root);
    assert.deepEqual(workspace, { workspace: true, externals: false });
    const relativeExternal = await classifyLocalLink(`file:${join("..", "..", "..", "external-link")}`, pkgPath, root);
    assert.deepEqual(relativeExternal, { workspace: true, externals: true });
    assert.deepEqual(await classifyLocalLink("github:user/repo", pkgPath, root), {
      workspace: false,
      externals: false,
    });
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("link-plugin strictly validates profile and slug", () => {
  assert.deepEqual(parseLinkArgs(["--profile", "web", "im"]), { profile: "web", slug: "im" });
  assert.deepEqual(parseLinkArgs(["dsh-wecom-office"]), { profile: "dsh-dev", slug: "wecom-office" });
  assert.throws(() => parseLinkArgs([]), /Missing plugin slug/);
  assert.throws(() => parseLinkArgs(["im", "hello"]), /exactly one/);
  assert.throws(() => parseLinkArgs(["--profile"]), /requires/);
  assert.throws(() => parseLinkArgs(["--profile", "../web", "im"]), /Invalid profile/);
  assert.throws(() => parseLinkArgs(["../externals"]), /Invalid plugin slug/);
  assert.throws(() => parseLinkArgs(["AgentTeams"]), /Invalid plugin slug/);
});

test("path install validates plugin arguments", () => {
  assert.deepEqual(parsePathArgs([]), { plugin: undefined });
  assert.deepEqual(parsePathArgs(["--", "--plugin", "hello"]), { plugin: "hello" });
  assert.deepEqual(parsePathArgs(["--plugin", "dsh-wecom-office"]), { plugin: "wecom-office" });
  assert.deepEqual(parsePathArgs(["--plugin=im"]), { plugin: "im" });
  assert.throws(() => parsePathArgs(["--plugin"]), /requires/);
  assert.throws(() => parsePathArgs(["--plugin=../im"]), /Invalid plugin slug/);
  assert.throws(() => parsePathArgs(["im"]), /Unknown flag/);
});

test("path install rejects local dependency protocols", () => {
  assert.deepEqual(localDependencyEscapes({
    dependencies: {
      public: "^1.0.0",
      workspace: "workspace:*",
      linked: "link:../linked",
    },
    devDependencies: {
      local: { version: "file:../local" },
    },
  }), [
    "dependencies.workspace=workspace:*",
    "dependencies.linked=link:../linked",
    "devDependencies.local=file:../local",
  ]);
});

test("path install keeps package file paths contained", () => {
  assert.equal(isSafePackagePath("lib/index.js"), true);
  assert.equal(isSafePackagePath("./cordis.patch.yml"), true);
  assert.equal(isSafePackagePath("../outside"), false);
  assert.equal(isSafePackagePath("lib/../../outside"), false);
  assert.equal(isSafePackagePath("lib/.."), false);
  assert.equal(isSafePackagePath("/absolute"), false);
});

test("package file collection skips a missing main instead of undefined", () => {
  const paths = packageFilePaths({ files: ["lib"] });
  assert.equal(paths.includes(undefined), false);
  assert.deepEqual(paths.sort(), ["lib", "package.json"]);
});

test("package file collection expands conditional exports objects", () => {
  const paths = packageFilePaths({
    main: "lib/index.js",
    exports: {
      ".": { import: "./lib/index.js", require: "./lib/index.cjs", types: "./lib/index.d.ts" },
      "./client": ["./lib/client.js", { default: "./lib/client.fallback.js" }],
      "./blocked": null,
      "./package.json": "./package.json",
    },
  });
  for (const expected of [
    "lib/index.js",
    "./lib/index.js",
    "./lib/index.cjs",
    "./lib/index.d.ts",
    "./lib/client.js",
    "./lib/client.fallback.js",
    "./package.json",
  ]) {
    assert.equal(paths.includes(expected), true, `missing ${expected}`);
  }
  assert.equal(paths.includes(null), false);
});

test("path install subprocess reports failures", async () => {
  await runCommand(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore" });
  await assert.rejects(
    runCommand(process.execPath, ["-e", "process.exit(7)"], { stdio: "ignore" }),
    /exit 7/,
  );
});
