import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(here, "..");
const conf = readFileSync(join(desktopRoot, "src-tauri/tauri.conf.json"), "utf8");
const makeDmg = readFileSync(join(desktopRoot, "scripts/make-macos-dmg.mjs"), "utf8");
const html = readFileSync(join(desktopRoot, "src-tauri/dmg/background.html"), "utf8");

test("macOS DMG uses the xiaotaozi-desktop drag-to-Applications layout", () => {
  assert.match(conf, /"background": "dmg\/background\.png"/);
  assert.match(conf, /"width": 660/);
  assert.match(conf, /"height": 438/);
  assert.match(conf, /"x": 168/);
  assert.match(conf, /"y": 186/);
  assert.match(conf, /"x": 492/);
  assert.match(makeDmg, /--icon-size[\s\S]*88/);
  assert.match(makeDmg, /--app-drop-link[\s\S]*492[\s\S]*186/);
  assert.match(html, /把小桃子拖到/);
  assert.match(html, /应用程序/);
  assert.equal(existsSync(join(desktopRoot, "src-tauri/dmg/background.html")), true);
  assert.equal(existsSync(join(desktopRoot, "src-tauri/dmg/background.png")), true);
  assert.equal(existsSync(join(desktopRoot, "src-tauri/dmg/background@2x.png")), true);
});
