import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { relativizeContainedSymlinks } from "./pack-tree.mjs";

function fixture(t) {
  const base = mkdtempSync(join(tmpdir(), "xiaotaozi-pack-tree-"));
  const root = join(base, "profile");
  const outside = join(base, "outside");
  mkdirSync(join(root, "bin"), { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(root, "bin", "tool"), "inside");
  writeFileSync(join(outside, "secret"), "outside");
  t.after(() => rmSync(base, { recursive: true, force: true }));
  return { root, outside };
}

test("profile packer accepts contained relative links", (t) => {
  const { root } = fixture(t);
  symlinkSync("tool", join(root, "bin", "tool-link"));
  relativizeContainedSymlinks(root);
  assert.equal(readlinkSync(join(root, "bin", "tool-link")), "tool");
});

test("profile packer rewrites contained absolute links", (t) => {
  const { root } = fixture(t);
  const link = join(root, "bin", "tool-link");
  const target = join(root, "bin", "tool");
  symlinkSync(target, link);
  relativizeContainedSymlinks(root);
  assert.equal(readlinkSync(link), relative(dirname(link), target));
});

test("profile packer rejects relative and indirect escapes", (t) => {
  const { root, outside } = fixture(t);
  symlinkSync(relative(join(root, "bin"), join(outside, "secret")), join(root, "bin", "escape"));
  assert.throws(() => relativizeContainedSymlinks(root), /symlink escapes root/);

  rmSync(join(root, "bin", "escape"));
  symlinkSync(outside, join(root, "outside-alias"));
  symlinkSync("../outside-alias/secret", join(root, "bin", "indirect"));
  assert.throws(() => relativizeContainedSymlinks(root), /symlink escapes root/);
});
