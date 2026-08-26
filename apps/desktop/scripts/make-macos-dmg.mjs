#!/usr/bin/env node
/**
 * Fancy drag-to-Applications DMG for the already-signed .app.
 * Layout copied from xiaotaozi-desktop (window 660×438, icons 88px).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(here, "..");
const app = join(
  desktopRoot,
  "src-tauri/target/release/bundle/macos/小桃子DSH.app",
);
const dmg = join(
  desktopRoot,
  "src-tauri/target/release/bundle/dmg/小桃子DSH_0.1.0_aarch64.dmg",
);
const background = join(desktopRoot, "src-tauri/dmg/background.png");
const volicon = join(desktopRoot, "src-tauri/icons/icon.icns");
const createDmg = join(
  desktopRoot,
  "src-tauri/target/release/bundle/dmg/bundle_dmg.sh",
);
const staging = join(desktopRoot, "src-tauri/target/release/bundle/dmg-src");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}

function closeFinderVolumeWindows() {
  spawnSync(
    "osascript",
    [
      "-e",
      'tell application "Finder" to close (every window whose name is "小桃子DSH")',
    ],
    { stdio: "ignore" },
  );
}

function convertLeftoverRwImage() {
  const dmgDir = dirname(dmg);
  const leftover = spawnSync("bash", ["-lc", `ls -1 "${dmgDir}"/rw.*小桃子DSH*.dmg 2>/dev/null | head -1`], {
    encoding: "utf8",
  });
  const rw = (leftover.stdout ?? "").trim();
  if (!rw) return false;
  closeFinderVolumeWindows();
  spawnSync("hdiutil", ["detach", "/Volumes/小桃子DSH", "-force", "-quiet"], {
    stdio: "ignore",
  });
  for (const mount of spawnSync("bash", ["-lc", "ls -d /Volumes/dmg.* 2>/dev/null"], {
    encoding: "utf8",
  }).stdout.split("\n").map((s) => s.trim()).filter(Boolean)) {
    spawnSync("hdiutil", ["detach", mount, "-force", "-quiet"], { stdio: "ignore" });
  }
  rmSync(dmg, { force: true });
  run("hdiutil", ["convert", rw, "-format", "UDZO", "-imagekey", "zlib-level=9", "-o", dmg]);
  rmSync(rw, { force: true });
  return true;
}

for (const [label, path] of [
  [".app", app],
  ["background", background],
  ["volicon", volicon],
  ["create-dmg", createDmg],
]) {
  if (!existsSync(path)) throw new Error(`Missing ${label}: ${path}`);
}

closeFinderVolumeWindows();
rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
run("cp", ["-cR", app, join(staging, "小桃子DSH.app")]);
mkdirSync(dirname(dmg), { recursive: true });
rmSync(dmg, { force: true });

try {
  run(createDmg, [
    "--volname",
    "小桃子DSH",
    "--volicon",
    volicon,
    "--background",
    background,
    "--window-pos",
    "200",
    "120",
    "--window-size",
    "660",
    "438",
    "--icon-size",
    "88",
    "--text-size",
    "12",
    "--icon",
    "小桃子DSH.app",
    "168",
    "186",
    "--hide-extension",
    "小桃子DSH.app",
    "--app-drop-link",
    "492",
    "186",
    "--format",
    "UDZO",
    dmg,
    staging,
  ]);
} catch (err) {
  if (!convertLeftoverRwImage()) throw err;
  console.log("create-dmg unmount was busy; converted leftover RW image");
} finally {
  rmSync(staging, { recursive: true, force: true });
}
console.log(dmg);
