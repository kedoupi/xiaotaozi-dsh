#!/usr/bin/env node
/**
 * Rasterize src-tauri/dmg/background.html into the Finder DMG background.
 * Layout matches xiaotaozi-desktop: 660×420 (1x) / 1320×840 (2x).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(here, "..");
const dmgDir = join(desktopRoot, "src-tauri", "dmg");
const html = join(dmgDir, "background.html");
const retina = join(dmgDir, "background@2x.png");
const standard = join(dmgDir, "background.png");
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const WIDTH = 1320;
const HEIGHT = 840;

if (!existsSync(html)) throw new Error(`Missing ${html}`);
if (!existsSync(chrome)) {
  throw new Error("Google Chrome is required to render the DMG background");
}

const htmlUrl = pathToFileURL(html).href;
const shot = spawnSync(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--window-size=${WIDTH},${HEIGHT}`,
    "--default-background-color=ffffffff",
    "--allow-file-access-from-files",
    `--screenshot=${retina}`,
    htmlUrl,
  ],
  { cwd: desktopRoot, stdio: "inherit" },
);
if (shot.status !== 0) process.exit(shot.status ?? 1);

const sips = spawnSync("sips", ["-z", "420", "660", retina, "--out", standard], {
  stdio: "inherit",
});
if (sips.status !== 0) process.exit(sips.status ?? 1);
console.log(`wrote src-tauri/dmg/background@2x.png and background.png`);
