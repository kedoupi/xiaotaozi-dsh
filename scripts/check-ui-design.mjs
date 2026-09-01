#!/usr/bin/env node
import { access, readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED_UI_PLUGINS = ["xtz-ui", "market", "im", "providers", "sidebar"];
const SOURCE_EXTENSIONS = new Set([".css", ".ts", ".tsx"]);
const BANNED_LEGACY_UI_COLORS = [
  "#a84c2c",
  "#8f3f27",
  "#b5522a",
  "#5a3228",
  "#f8e6d9",
  "#d06840",
  "#13713b",
];
const SHARED_TOOLS_SELECTORS = [
  "[data-dsh-sidebar-tools]",
  "[data-dsh-sidebar-tools] > button",
  "[data-dsh-sidebar-tools] > button span",
];

export function hexToRgb(hex) {
  const value = hex.replace(/^#/u, "");
  if (!/^[0-9a-f]{6}$/iu.test(value)) throw new Error(`invalid color ${hex}`);
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function linear(channel) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function contrastRatio(first, second) {
  const luminance = (hex) => {
    const [red, green, blue] = hexToRgb(hex).map(linear);
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function normalizeDeclarations(value) {
  return value
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/\s*([:;,])\s*/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
}

export function firstRule(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "u").exec(source)?.[1];
}

export function allRules(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return [...source.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "gu"))]
    .map((match) => match[1]);
}

export function laneColors(source, selector) {
  const rule = firstRule(source, selector);
  if (rule === undefined) return new Map();
  const colors = new Map();
  for (const match of rule.matchAll(/--dshH-gg-lane-(\d+):\s*(#[0-9a-f]{6})/giu)) {
    colors.set(Number(match[1]), match[2]);
  }
  return colors;
}

export function mixWithBlack(hex, amount) {
  const mixed = hexToRgb(hex).map((channel) => Math.round(channel * amount));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

export function mediaBlocks(source) {
  const blocks = [];
  for (const match of source.matchAll(/@media\b/gu)) {
    const open = source.indexOf("{", match.index + match[0].length);
    if (open < 0) continue;
    let depth = 1;
    let close = open + 1;
    while (close < source.length && depth > 0) {
      if (source[close] === "{") depth += 1;
      else if (source[close] === "}") depth -= 1;
      close += 1;
    }
    if (depth === 0) {
      blocks.push({
        condition: source.slice(match.index + match[0].length, open).trim(),
        body: source.slice(open + 1, close - 1),
      });
    }
  }
  return blocks;
}

/** Apply UI source policies to caller-selected, shipped client-source chunks. */
export function uiSourcePolicyErrors(chunks) {
  const errors = [];
  const bannedColors = new Set(BANNED_LEGACY_UI_COLORS);
  for (const { path, text } of chunks) {
    for (const match of text.matchAll(/#[0-9a-f]{6}\b/giu)) {
      if (bannedColors.has(match[0].toLowerCase())) {
        errors.push(`${path}: banned legacy UI color ${match[0]}`);
      }
    }
    for (const declaration of text.matchAll(/\btransition(-duration)?\s*:\s*([^;}\n]+)/giu)) {
      const values = declaration[2].split(",");
      for (const value of values) {
        const durations = [...value.matchAll(/(?:^|\s)(\d*\.?\d+)(ms|s)\b/giu)];
        const candidates = declaration[1] === undefined ? durations.slice(0, 1) : durations;
        for (const duration of candidates) {
          const milliseconds = Number(duration[1]) * (duration[2].toLowerCase() === "s" ? 1000 : 1);
          if (milliseconds > 200) {
            const literal = `${duration[1]}${duration[2]}`;
            errors.push(`${path}: routine transition duration ${literal} exceeds 200ms`);
          }
        }
      }
    }
  }
  return errors;
}

/** Detect text glyphs used as structural-control icons, including indirection. */
export function containsStructuralGlyph(source) {
  return />(?:\s|\{"\s*"\})*(?:×|✕|‹|✓|\+|−|⟳)(?:\s|\{"\s*"\})*</u.test(source)
    || /<button\b[^>]*>\s*x\s*<\/button>/iu.test(source)
    || /\b(?:glyph|iconText|textIcon|symbol)\s*:\s*["'`](?:×|✕|‹|✓|\+|−|⟳)["'`]/u.test(source);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function sourceFiles(path) {
  const files = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(child));
    else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) files.push(child);
  }
  return files;
}

export async function collectUiErrors(repoRoot = root) {
  const errors = [];
  const designRoot = join(repoRoot, "design-system", "xiaotaozi-dsh");
  const masterPath = join(designRoot, "MASTER.md");
  const referencePath = join(designRoot, "reference.png");
  if (!await exists(masterPath)) errors.push("design-system/xiaotaozi-dsh/MASTER.md is missing");
  const reference = await exists(referencePath) ? await readFile(referencePath) : undefined;
  const pngSignature = "89504e470d0a1a0a";
  if (reference === undefined || reference.length < 24
    || reference.subarray(0, 8).toString("hex") !== pngSignature
    || reference.readUInt32BE(16) < 800 || reference.readUInt32BE(20) < 600) {
    errors.push("design-system/xiaotaozi-dsh/reference.png is missing or invalid");
  }

  const peachSource = await readFile(join(repoRoot, "plugins", "xtz-ui", "src", "client", "peach.ts"), "utf8");
  const palette = new Map();
  for (const match of peachSource.matchAll(/\b(\d+):\s*"(#[0-9a-f]{6})"/giu)) {
    palette.set(Number(match[1]), match[2]);
  }
  for (const step of [600, 700]) {
    const value = palette.get(step);
    if (value === undefined || contrastRatio(value, "#ffffff") < 4.5) {
      errors.push(`Peach ${String(step)} must keep at least 4.5:1 contrast with white`);
    }
  }
  const darkForeground = palette.get(200);
  for (const surface of ["#151517", "#232324", "#353638", "#61666b"]) {
    if (darkForeground === undefined || contrastRatio(darkForeground, surface) < 3) {
      errors.push(`Peach 200 must keep at least 3:1 contrast with dark DSH surface ${surface}`);
    }
  }
  const brandDisplayDark = /display:\s*\{\s*light:\s*"#[0-9a-f]{6}",\s*dark:\s*"(#[0-9a-f]{6})"\s*\}/iu.exec(peachSource);
  for (const surface of ["#151517", "#232324", "#353638", "#61666b"]) {
    if (brandDisplayDark === null || contrastRatio(brandDisplayDark[1], surface) < 3) {
      errors.push(`Brand display dark must keep at least 3:1 contrast with dark DSH surface ${surface}`);
    }
  }
  if (!/"--dsw-alias-state-business-primary":\s*\{\s*light:\s*PEACH\[600\],\s*dark:\s*PEACH\[200\]\s*\}/u.test(peachSource)) {
    errors.push("state-business-primary must map light to Peach 600 and dark to Peach 200");
  }
  const statusInk = new Map();
  for (const match of peachSource.matchAll(/(success|warning|error):\s*\{\s*light:\s*"(#[0-9a-f]{6})",\s*dark:\s*"(#[0-9a-f]{6})"\s*\}/giu)) {
    statusInk.set(match[1].toLowerCase(), { light: match[2], dark: match[3] });
  }
  for (const name of ["success", "warning", "error"]) {
    const ink = statusInk.get(name);
    if (ink === undefined || contrastRatio(ink.light, "#ffffff") < 4.5) {
      errors.push(`${name} status ink must pass 4.5:1 on the light surface`);
    }
    for (const surface of ["#151517", "#232324", "#353638", "#61666b"]) {
      if (ink === undefined || contrastRatio(ink.dark, surface) < 4.5) {
        errors.push(`${name} status ink must pass 4.5:1 on dark surface ${surface}`);
      }
    }
  }
  for (const errorToken of ["#ec1313", "#f25a5a"]) {
    if (contrastRatio(mixWithBlack(errorToken, 0.72), "#ffffff") < 4.5) {
      errors.push(`72% danger-fill mix from ${errorToken} must pass 4.5:1 with white`);
    }
  }

  const pluginSources = new Map();
  const pluginEntries = await readdir(join(repoRoot, "plugins"), { withFileTypes: true });
  const uiPlugins = [];
  for (const entry of pluginEntries) {
    if (entry.isDirectory() && await exists(join(repoRoot, "plugins", entry.name, "src", "client"))) {
      uiPlugins.push(entry.name);
    }
  }
  for (const slug of REQUIRED_UI_PLUGINS) {
    if (!uiPlugins.includes(slug)) errors.push(`required UI plugin plugins/${slug}/src/client is missing`);
  }
  for (const slug of uiPlugins.sort()) {
    const clientRoot = join(repoRoot, "plugins", slug, "src", "client");
    const files = await sourceFiles(clientRoot);
    const chunks = await Promise.all(files.map(async (path) => ({ path, text: await readFile(path, "utf8") })));
    pluginSources.set(slug, chunks);
    const combined = chunks.map((chunk) => chunk.text).join("\n");
    if (!combined.includes("focus-visible")) errors.push(`plugins/${slug}: missing focus-visible treatment`);
    if (!combined.includes("prefers-reduced-motion")) errors.push(`plugins/${slug}: missing reduced-motion treatment`);
    const narrowBreakpoints = [...combined.matchAll(/max-width:\s*(\d+)px/gu)].map((match) => Number(match[1]));
    if (!narrowBreakpoints.some((width) => width <= 768) && !/pointer:\s*coarse/u.test(combined)) {
      errors.push(`plugins/${slug}: missing narrow/coarse-pointer treatment`);
    }
    const compactMedia = mediaBlocks(combined).filter(({ condition }) => {
      if (/pointer:\s*coarse/u.test(condition)) return true;
      return [...condition.matchAll(/max-width:\s*(\d+)px/gu)].some((match) => Number(match[1]) <= 768);
    });
    if (!compactMedia.some(({ body }) => body.includes("44px"))) {
      errors.push(`plugins/${slug}: compact/coarse-pointer rules must include 44px targets`);
    }
    for (const chunk of chunks) {
      const label = relative(repoRoot, chunk.path).replaceAll("\\", "/");
      if (/\.dsh-sidebar-tools\b/u.test(chunk.text)) {
        errors.push(`${label}: shared sidebar tools styling must use the data attribute recipe`);
      }
      if (/var\(\s*--dsw-alias-state-business-primary\s*,\s*#3370ff\s*\)/iu.test(chunk.text)) {
        errors.push(`${label}: functional focus fallback must use Xiaotaozi Peach 600, not legacy blue`);
      }
      if (containsStructuralGlyph(chunk.text)) {
        errors.push(`${label}: structural controls must use SVG icons, not text glyphs`);
      }
      if (/font-size:\s*(?:[1-9](?:\.\d+)?|10(?:\.0+)?)px/u.test(chunk.text)) {
        errors.push(`${label}: readable UI text must never be smaller than 11px`);
      }
      for (const match of chunk.text.matchAll(/([^{}]+)\{([^{}]*)\}/gu)) {
        const selector = match[1];
        const body = match[2];
        if (/::placeholder/u.test(selector) && /color:\s*var\(\s*--dsw-alias-label-(?:tertiary|caption)/u.test(body)) {
          errors.push(`${label}: placeholder text must use readable secondary text, not tertiary/caption`);
        }
        if (/font-size:\s*(?:11|12|13)(?:\.5)?px/u.test(body)
          && /color:\s*var\(\s*--dsw-alias-label-(?:tertiary|caption)/u.test(body)
          && !/(?:disabled|aria-disabled)/u.test(selector)) {
          errors.push(`${label}: small readable text must not use low-contrast tertiary/caption color (${selector.trim()})`);
        }
        if (/font-size:\s*(?:11|12|13)(?:\.5)?px/u.test(body)
          && /color:\s*var\(\s*--dsw-alias-state-(?:success|warn|warning|error)-primary/u.test(body)) {
          errors.push(`${label}: small status text must use an accessible status ink (${selector.trim()})`);
        }
        if (/font-size:\s*(?:11|12|13)(?:\.5)?px/u.test(body)
          && /color:\s*var\(\s*--dsw-(?:xtz-)?status-(?:success|warning|error)-ink/u.test(body)
          && /background(?:-color)?:\s*var\(\s*--dsw-alias-state-(?:success|warn|warning|error)-secondary/u.test(body)) {
          errors.push(`${label}: composed status text/background pair needs explicit contrast proof (${selector.trim()})`);
        }
        if (/background(?:-color)?:\s*var\(\s*--dsw-alias-state-error-primary/u.test(body)
          && /color:\s*(?:#fff(?:fff)?|white)\b/iu.test(body)) {
          errors.push(`${label}: solid danger controls must use a darkened danger fill with white text (${selector.trim()})`);
        }
      }
    }
  }

  const xtzClientSources = (pluginSources.get("xtz-ui") ?? []).map((chunk) => ({
    path: relative(repoRoot, chunk.path).replaceAll("\\", "/"),
    text: chunk.text,
  }));
  errors.push(...uiSourcePolicyErrors(xtzClientSources));

  const marketCss = (pluginSources.get("market") ?? []).map((chunk) => chunk.text).join("\n");
  const imCss = (pluginSources.get("im") ?? []).map((chunk) => chunk.text).join("\n");
  for (const selector of SHARED_TOOLS_SELECTORS) {
    const marketRules = allRules(marketCss, selector).map(normalizeDeclarations);
    const imRules = allRules(imCss, selector).map(normalizeDeclarations);
    if (marketRules.length !== 1 || imRules.length !== 1 || marketRules[0] !== imRules[0]) {
      errors.push(`market/im shared recipe drifted for ${selector}`);
    }
  }

  const gitGraphCss = (pluginSources.get("xtz-ui") ?? [])
    .find((chunk) => chunk.path.endsWith("gitgraph-css.ts"))?.text ?? "";
  for (const [selector, surface] of [
    [".dshH-gg-dialog", "#ffffff"],
    ["body[data-ds-dark-theme] .dshH-gg-dialog", "#353638"],
  ]) {
    const colors = laneColors(gitGraphCss, selector);
    if (colors.size !== 8 || [...Array(8).keys()].some((lane) => !colors.has(lane))) {
      errors.push(`Git graph ${selector} must define exactly lanes 0-7`);
      continue;
    }
    for (const [lane, color] of colors) {
      if (contrastRatio(color, surface) < 3) {
        errors.push(`Git graph ${selector} lane ${String(lane)} must pass 3:1 on ${surface}`);
      }
    }
  }
  return errors;
}

async function main() {
  const errors = await collectUiErrors();
  if (errors.length > 0) {
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log("UI design-system checks passed.");
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
