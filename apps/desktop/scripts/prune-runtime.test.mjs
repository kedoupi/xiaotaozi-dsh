import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  isForeignNativeName,
  pruneRuntime,
  rewritePythonAliases,
} from "./prune-runtime.mjs";

function touch(path, body = "x") {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, body);
}

function fixture(target = "darwin-arm64") {
  const root = mkdtempSync(join(tmpdir(), "prune-runtime-"));
  touch(join(root, "node/bin/node"), "node-bin");
  touch(join(root, "node/bin/npm"), "npm-shim");
  touch(join(root, "node/bin/corepack"), "corepack-shim");
  touch(join(root, "node/include/node.h"), "hdr");
  touch(join(root, "node/CHANGELOG.md"), "log");
  touch(join(root, "node/lib/node_modules/npm/bin/npm-cli.js"), "npm");
  touch(join(root, "node/lib/node_modules/corepack/dist/corepack.js"), "corepack");
  touch(join(root, "python/bin/python3.12"), "interpreter");
  touch(join(root, "python/include/Python.h"), "pyhdr");
  touch(join(root, "python/lib/python3.12/idlelib/idle.py"), "idle");
  touch(join(root, "python/lib/python3.12/ensurepip/__init__.py"), "ensure");
  touch(join(root, "python/lib/python3.12/site-packages/pip/_vendor/distlib/w64.exe"), "winpip");
  const pkg = join(root, "dsh/lib/node_modules/demo");
  touch(join(pkg, "index.js"), "js");
  touch(join(pkg, "index.js.map"), "map");
  touch(join(pkg, "index.d.ts"), "types");
  touch(join(pkg, "README.md"), "docs");
  touch(join(pkg, "LICENSE"), "mit");
  touch(join(pkg, "prebuilds/darwin-arm64/addon.node"), "arm");
  touch(join(pkg, "prebuilds/win32-x64/addon.node"), "win");
  touch(join(pkg, "prebuilds/win32-x64/conpty.pdb"), "pdb");
  touch(join(pkg, "test/huge.json"), "test-data");
  touch(join(root, "dsh/lib/node_modules/@img/sharp-wasm32/lib/sharp.wasm"), "wasm");
  touch(join(root, "dsh/lib/node_modules/@img/sharp-libvips-darwin-arm64/lib/vips.dylib"), "vips");
  touch(join(root, "dsh/lib/node_modules/pnpm/dist/pnpm.mjs"), "pnpm");
  touch(join(root, "dsh/lib/node_modules/pnpm/artifacts/exe/dist/pnpm.mjs"), "pnpm-copy");
  touch(join(root, "profile/node_modules/@types/node/index.d.ts"), "types");
  touch(join(root, "profile/node_modules/@larksuiteoapi/node-sdk/types/index.d.ts"), "lark");
  touch(join(root, "profile/node_modules/@larksuiteoapi/node-sdk/lib/index.js"), "lark-js");
  touch(join(root, "profile/vendor/dsh-im-0.1.1.tgz"), "tgz");
  pruneRuntime(root, target);
  return root;
}

test("foreign native names keep the current target", () => {
  assert.equal(isForeignNativeName("darwin-arm64", "darwin-arm64"), false);
  assert.equal(isForeignNativeName("sharp-libvips-darwin-arm64", "darwin-arm64"), false);
  assert.equal(isForeignNativeName("win32-x64", "darwin-arm64"), true);
  assert.equal(isForeignNativeName("sharp-wasm32", "darwin-arm64"), true);
  assert.equal(isForeignNativeName("dsh-sandbox-windows-acl", "darwin-arm64"), false);
});

test("prune drops headers, maps, types, tests, docs, and other-OS natives", () => {
  const root = fixture("darwin-arm64");
  assert.equal(existsSync(join(root, "node/bin/node")), true);
  assert.equal(existsSync(join(root, "node/bin/npm")), false);
  assert.equal(existsSync(join(root, "node/bin/corepack")), false);
  assert.equal(existsSync(join(root, "node/include")), false);
  assert.equal(existsSync(join(root, "node/lib/node_modules/npm")), false);
  assert.equal(existsSync(join(root, "python/bin/python3.12")), true);
  assert.equal(existsSync(join(root, "python/include")), false);
  assert.equal(existsSync(join(root, "python/lib/python3.12/idlelib")), false);
  assert.equal(existsSync(join(root, "python/lib/python3.12/site-packages/pip/_vendor/distlib/w64.exe")), false);
  assert.equal(existsSync(join(root, "dsh/lib/node_modules/demo/index.js")), true);
  assert.equal(existsSync(join(root, "dsh/lib/node_modules/demo/LICENSE")), true);
  assert.equal(existsSync(join(root, "dsh/lib/node_modules/demo/index.js.map")), false);
  assert.equal(existsSync(join(root, "dsh/lib/node_modules/demo/index.d.ts")), false);
  assert.equal(existsSync(join(root, "dsh/lib/node_modules/demo/README.md")), false);
  assert.equal(existsSync(join(root, "dsh/lib/node_modules/demo/prebuilds/darwin-arm64/addon.node")), true);
  assert.equal(existsSync(join(root, "dsh/lib/node_modules/demo/prebuilds/win32-x64")), false);
  assert.equal(existsSync(join(root, "dsh/lib/node_modules/demo/test")), false);
  assert.equal(existsSync(join(root, "dsh/lib/node_modules/@img/sharp-wasm32")), false);
  assert.equal(existsSync(join(root, "dsh/lib/node_modules/@img/sharp-libvips-darwin-arm64/lib/vips.dylib")), true);
  assert.equal(existsSync(join(root, "dsh/lib/node_modules/pnpm/dist/pnpm.mjs")), true);
  assert.equal(existsSync(join(root, "dsh/lib/node_modules/pnpm/artifacts")), false);
  assert.equal(existsSync(join(root, "profile/node_modules/@types")), false);
  assert.equal(existsSync(join(root, "profile/node_modules/@larksuiteoapi/node-sdk/types/index.d.ts")), false);
  assert.equal(existsSync(join(root, "profile/node_modules/@larksuiteoapi/node-sdk/lib/index.js")), true);
  assert.equal(existsSync(join(root, "profile/vendor/dsh-im-0.1.1.tgz")), true);
});

test("rewritePythonAliases turns unix symlinks into exec wrappers", () => {
  const root = mkdtempSync(join(tmpdir(), "prune-python-link-"));
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "python3.12"), "#!/bin/sh\nprintf 'ok %s\\n' \"$*\"\n");
  chmodSync(join(bin, "python3.12"), 0o755);
  symlinkSync("python3.12", join(bin, "python"));
  symlinkSync("python3.12", join(bin, "python3"));
  assert.equal(rewritePythonAliases(root, "darwin-arm64"), 2);
  const wrapper = readFileSync(join(bin, "python3"), "utf8");
  assert.match(wrapper, /exec /);
  assert.match(wrapper, /python3\.12/);
  assert.notEqual(readFileSync(join(bin, "python3.12")).length, readFileSync(join(bin, "python3")).length);
  const ran = spawnSync(join(bin, "python3"), ["-c", "pass"], { encoding: "utf8" });
  assert.equal(ran.status, 0, ran.stderr);
  assert.equal(ran.stdout, "ok -c pass\n");
  assert.equal(rewritePythonAliases(root, "darwin-arm64"), 0);
});

test("rewritePythonAliases turns identical unix copies into exec wrappers", () => {
  const root = mkdtempSync(join(tmpdir(), "prune-python-copy-"));
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  const body = Buffer.alloc(4096, 7);
  writeFileSync(join(bin, "python3.12"), body);
  writeFileSync(join(bin, "python3"), body);
  writeFileSync(join(bin, "python"), body);
  writeFileSync(join(bin, "pythonw"), Buffer.alloc(4096, 8));
  assert.equal(rewritePythonAliases(root, "darwin-arm64"), 2);
  assert.equal(readFileSync(join(bin, "python3.12")).equals(body), true);
  assert.match(readFileSync(join(bin, "python"), "utf8"), /python3\.12/);
  assert.equal(readFileSync(join(bin, "pythonw")).equals(Buffer.alloc(4096, 8)), true);
});

test("rewritePythonAliases drops duplicate Windows python3.exe", () => {
  const root = mkdtempSync(join(tmpdir(), "prune-python-win-"));
  const body = Buffer.alloc(2048, 3);
  writeFileSync(join(root, "python.exe"), body);
  writeFileSync(join(root, "python3.exe"), body);
  writeFileSync(join(root, "pythonw.exe"), Buffer.alloc(2048, 4));
  assert.equal(rewritePythonAliases(root, "win-x64"), 1);
  assert.equal(existsSync(join(root, "python.exe")), true);
  assert.equal(existsSync(join(root, "python3.exe")), false);
  assert.equal(existsSync(join(root, "pythonw.exe")), true);
  assert.equal(rewritePythonAliases(root, "win-x64"), 0);
});
