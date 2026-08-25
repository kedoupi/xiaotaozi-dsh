#!/usr/bin/env node
import { readdir, readFile, access, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginsDir = join(root, "plugins");
const templatesDir = join(root, "templates");
const versions = JSON.parse(await readFile(join(root, "versions.json"), "utf8"));
const HOST_RC = versions.dshRc;
const TEMPLATE_NAMES = ["host-plugin", "mixed-plugin"];
const OWN_DOC_ROOTS = [
  "README.md",
  "README.zh.md",
  "AGENTS.md",
  "docs",
  "apps/desktop",
  "plugins",
  "templates",
  ".grok/skills/dsh-plugin",
];

function parseArgs(argv) {
  return { requireLib: argv.includes("--require-lib") };
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Collected policy violations; reported together at the end of main(). */
const errors = [];

function fail(message) {
  errors.push(message);
}

function pinOf(spec) {
  if (typeof spec === "string") return spec;
  if (spec && typeof spec === "object" && typeof spec.version === "string") return spec.version;
  return "";
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) fail(`${label} must be ${expected} (got ${actual ?? "missing"})`);
}

async function markdownFiles(path) {
  if (!(await exists(path))) return [];
  const info = await stat(path);
  if (info.isFile()) return path.endsWith(".md") ? [path] : [];
  const files = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (["node_modules", "runtime", "plugin-packs", "target", "dist", ".runtime-build", ".pack-signing", "gen"].includes(entry.name)) continue;
    const child = join(path, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(child));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(child);
  }
  return files;
}

async function checkVersionsAndDocs() {
  for (const key of ["dshRc", "node", "python", "pnpm", "desktopApp"]) {
    if (typeof versions[key] !== "string" || !versions[key]) fail(`versions.json ${key} must be a non-empty string`);
  }

  const rootPkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assertEqual(rootPkg.engines?.node, `>=${versions.node}`, "package.json engines.node");
  assertEqual(rootPkg.packageManager?.split("+")[0], `pnpm@${versions.pnpm}`, "package.json packageManager");

  const desktopRoot = join(root, "apps/desktop");
  const desktopPkg = JSON.parse(await readFile(join(desktopRoot, "package.json"), "utf8"));
  assertEqual(desktopPkg.version, versions.desktopApp, "apps/desktop/package.json version");
  const cargo = await readFile(join(desktopRoot, "src-tauri/Cargo.toml"), "utf8");
  assertEqual(/^\s*version\s*=\s*"([^"]+)"/mu.exec(cargo)?.[1], versions.desktopApp, "Cargo.toml package version");
  const tauri = JSON.parse(await readFile(join(desktopRoot, "src-tauri/tauri.conf.json"), "utf8"));
  assertEqual(tauri.version, versions.desktopApp, "tauri.conf.json version");
  const workflow = await readFile(join(root, ".github/workflows/check.yml"), "utf8");
  // pnpm/action-setup must take the version from packageManager; an explicit
  // version input conflicts with the +sha512 suffix and fails the job.
  if (/pnpm\/action-setup@\S*\s*\n\s*with:\s*\n\s*version:/u.test(workflow)) {
    fail(".github/workflows/check.yml must not pass version: to pnpm/action-setup (packageManager is the source)");
  }
  const ciNode = versions.node.split(".").slice(0, 2).join(".");
  for (const match of workflow.matchAll(/node-version:\s*"([^"]+)"/gu)) {
    assertEqual(match[1], ciNode, ".github/workflows/check.yml Node version");
  }
  for (const workspacePath of [join(root, "pnpm-workspace.yaml"), join(desktopRoot, "pnpm-workspace.yaml")]) {
    if (!(await exists(workspacePath))) continue;
    const workspaceLabel = relative(root, workspacePath).replaceAll("\\", "/");
    const workspace = await readFile(workspacePath, "utf8");
    for (const match of workspace.matchAll(/@deepseek-ai\/dsh-[^@\s'"]+@([0-9A-Za-z.-]+)/gu)) {
      assertEqual(match[1], versions.dshRc, workspaceLabel + " dsh catalog pin");
    }
  }

  const bundler = await readFile(join(desktopRoot, "scripts/bundle-runtime.mjs"), "utf8");
  if (!bundler.includes('readFileSync(join(repoRoot, "versions.json"), "utf8")')) {
    fail("bundle-runtime.mjs must read root versions.json directly");
  }
  for (const hardcoded of [versions.node, versions.python, versions.dshRc, versions.pnpm, versions.desktopApp]) {
    if (bundler.includes(`= "${hardcoded}"`)) fail(`bundle-runtime.mjs must not hardcode ${hardcoded}`);
  }
  const runtimeManifest = join(desktopRoot, "src-tauri/runtime/manifest.json");
  if (await exists(runtimeManifest)) {
    const manifest = JSON.parse(await readFile(runtimeManifest, "utf8"));
    const runtimeChecks = [["node", versions.node], ["dsh", versions.dshRc], ["pnpm", versions.pnpm]];
    // Older runtime builds predate the python field; only verify it when present.
    if (manifest.python !== undefined) runtimeChecks.push(["python", versions.python]);
    for (const [key, expected] of runtimeChecks) {
      if (manifest[key] !== expected) {
        fail(`bundled runtime ${key} must be ${expected} (got ${manifest[key] ?? "missing"});`
          + " re-run pnpm bundle-runtime or delete apps/desktop/src-tauri/runtime/manifest.json");
      }
    }
  }

  const docs = [];
  for (const path of OWN_DOC_ROOTS) docs.push(...await markdownFiles(join(root, path)));
  const encodedDsh = versions.dshRc.replaceAll("-", "--");
  const nodeBadge = versions.node.split(".").slice(0, 2).join(".");
  for (const path of docs) {
    const label = relative(root, path).replaceAll("\\", "/");
    const text = await readFile(path, "utf8");
    for (const match of text.matchAll(/img\.shields\.io\/badge\/dsh-(v?[0-9][^-"\s]*(?:--[^-"\s]+)*)-/gu)) {
      if (match[1].replace(/^v/u, "") !== encodedDsh) fail(`${label}: dsh badge must use ${versions.dshRc}`);
    }
    for (const match of text.matchAll(/alt="DeepSeek Harness ([0-9A-Za-z.-]+)"/gu)) {
      if (match[1] !== versions.dshRc) fail(`${label}: dsh badge alt text must use ${versions.dshRc}`);
    }
    for (const match of text.matchAll(/pnpm add -g @deepseek-ai\/dsh@([0-9A-Za-z.-]+)/gu)) {
      if (match[1] !== versions.dshRc) fail(`${label}: dsh install command must use ${versions.dshRc}`);
    }
    for (const forbidden of [
      "github:kedoupi/dsh-plugins",
      "github.com/kedoupi/dsh-plugins",
      "apps/macos",
      "13180",
      "three homes",
      "三套 home",
      "三套家目录",
      "Swift client",
      "Swift 客户端",
    ]) {
      if (text.includes(forbidden)) fail(`${label}: stale documentation reference ${forbidden}`);
    }
  }
  for (const readme of ["README.md", "README.zh.md"]) {
    const text = await readFile(join(root, readme), "utf8");
    if (!text.includes(`node-%3E%3D${nodeBadge}-`)) fail(`${readme}: Node badge must use >=${nodeBadge}`);
    if (!text.includes(`dsh-${encodedDsh}-`)) fail(`${readme}: dsh badge must use ${versions.dshRc}`);
    if (!text.includes(`@deepseek-ai/dsh@${versions.dshRc}`)) fail(`${readme}: host CLI text must use ${versions.dshRc}`);
  }
  const imClient = await readFile(join(root, "plugins/im/src/client/index.ts"), "utf8");
  if (!imClient.includes("https://github.com/kedoupi/xiaotaozi-dsh")
    || imClient.includes(["https://github.com/kedoupi", "dsh-plugins"].join("/"))) {
    fail("plugins/im client repository link must use kedoupi/xiaotaozi-dsh");
  }
}

async function assertExportName(dir, dirName) {
  const indexPath = join(dir, "src/index.ts");
  if (!(await exists(indexPath))) {
    fail(dirName + ": missing src/index.ts");
    return;
  }
  const index = await readFile(indexPath, "utf8");
  const direct = /export const name = ["']([^"']+)["']/.exec(index);
  if (direct) {
    if (direct[1] !== dirName) {
      fail(dirName + ': export const name must be "' + dirName + '"');
    }
    return;
  }
  if (index.includes("export const name = PLUGIN_NAME")) {
    const namesPath = join(dir, "src/names.ts");
    if (!(await exists(namesPath))) {
      fail(dirName + ": export const name = PLUGIN_NAME but src/names.ts is missing");
      return;
    }
    const names = await readFile(namesPath, "utf8");
    if (!names.includes('PLUGIN_NAME = "' + dirName + '"')) {
      fail(dirName + ': PLUGIN_NAME must be "' + dirName + '"');
    }
    return;
  }
  fail(dirName + ': src/index.ts must export const name = "' + dirName + '"');
}

function checkDshPins(dirName, pkg) {
  const bags = [pkg.dependencies, pkg.devDependencies, pkg.optionalDependencies, pkg.peerDependencies];
  for (const bag of bags) {
    if (bag === undefined) continue;
    for (const [name, spec] of Object.entries(bag)) {
      if (!name.startsWith("@deepseek-ai/dsh-")) continue;
      const pin = pinOf(spec);
      if (pin === "latest" || pin.includes("0.0.1-rc.1")) {
        fail(dirName + ": " + name + " must not be latest or 0.0.1-rc.1; pin " + HOST_RC);
      } else if (pin.replace(/^[\^~]/u, "") !== HOST_RC) {
        // Strict equality after stripping ^/~: substring matching would accept
        // e.g. 0.1.1-rc.20 when the host RC is 0.1.1-rc.2.
        fail(dirName + ": " + name + " must be pinned to " + HOST_RC + " (got " + (pin || JSON.stringify(spec)) + ")");
      }
    }
  }
}

function checkDshTools(dirName, pkg) {
  for (const bagName of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    if (pkg[bagName]?.["@deepseek-ai/dsh-tools"] !== undefined) {
      fail(dirName + ": " + bagName + " must not declare @deepseek-ai/dsh-tools; register a plain tool object instead");
    }
  }
}

async function listTsconfigFiles(dir) {
  if (!(await exists(dir))) return [];
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (["node_modules", "lib", "dist", ".git"].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listTsconfigFiles(path));
    else if (entry.isFile() && /^tsconfig.*\.json$/u.test(entry.name)) files.push(path);
  }
  return files;
}

/** Extract extends targets (string or array form) that climb out of the package. */
function tsconfigExtendsEscapes(text) {
  const clause = /"extends"\s*:\s*("(?:[^"\\]|\\.)*"|\[[\s\S]*?\])/u.exec(text);
  if (clause === null) return [];
  const values = clause[1].startsWith("[")
    ? [...clause[1].matchAll(/"((?:[^"\\]|\\.)*)"/gu)].map((hit) => hit[1])
    : [clause[1].slice(1, -1)];
  return values.filter((value) => value.replaceAll("\\", "/").split("/").includes(".."));
}

async function checkSelfContainedTsconfigs(dir, label) {
  for (const path of await listTsconfigFiles(dir)) {
    const name = relative(dir, path).replaceAll("\\", "/");
    const escapes = tsconfigExtendsEscapes(await readFile(path, "utf8"));
    if (escapes.length > 0) {
      fail(label + ": " + name + " extends outside the package (" + escapes.join(", ")
        + "); tsconfig files must be self-contained for Git path installs");
    }
  }
}

async function listJavaScriptFiles(dir) {
  if (!(await exists(dir))) return [];
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listJavaScriptFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(path);
  }
  return files;
}

function runtimeDeepseekImports(js) {
  const imports = new Set();
  const importRe = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)["'](@deepseek-ai\/[^"']+)["']/gu;
  let match;
  while ((match = importRe.exec(js)) !== null) {
    imports.add(match[1].split("/").slice(0, 2).join("/"));
  }
  return imports;
}

async function checkPlugin(dirName, requireLib) {
  const dir = join(pluginsDir, dirName);
  const pkgPath = join(dir, "package.json");
  const patchPath = join(dir, "cordis.patch.yml");
  if (!(await exists(pkgPath))) {
    fail(dirName + ": missing package.json");
    return;
  }
  if (!(await exists(patchPath))) fail(dirName + ": missing cordis.patch.yml");
  if (!(await exists(join(dir, "README.md")))) fail(dirName + ": missing README.md");
  if (!(await exists(join(dir, "README.zh.md")))) fail(dirName + ": missing README.zh.md");

  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  if (typeof pkg.name !== "string" || !pkg.name.startsWith("dsh-")) {
    fail(dirName + ": package.json name must start with dsh-");
  }
  if (pkg.name !== "dsh-" + dirName) {
    fail(dirName + ": package.json name must be dsh-" + dirName);
  }
  if (pkg.type !== "module") fail(dirName + ": package.json type must be module");
  if (pkg.dsh?.profile) fail(dirName + ": plugin packages must not declare dsh.profile");
  const patchRel = pkg.dsh?.bundle?.patch;
  if (typeof patchRel !== "string") {
    fail(dirName + ": missing dsh.bundle.patch");
  } else if (!(await exists(join(dir, patchRel)))) {
    fail(dirName + ": dsh.bundle.patch does not exist: " + patchRel);
  }
  const files = pkg.files ?? [];
  if (!files.includes("cordis.patch.yml") && !files.includes("./cordis.patch.yml")) {
    fail(dirName + ": files[] must include cordis.patch.yml");
  }

  if (await exists(patchPath)) {
    const patch = await readFile(patchPath, "utf8");
    if (!patch.includes("name: " + pkg.name)) {
      fail(dirName + ": cordis.patch.yml name must match package.json name (" + pkg.name + ")");
    }
    if (!new RegExp("id:\\s+" + dirName + "(?:\\s|$)").test(patch)) {
      fail(dirName + ": cordis.patch.yml id must be " + dirName);
    }
  }

  await assertExportName(dir, dirName);

  const tsdownPath = join(dir, "tsdown.config.ts");
  if (!(await exists(tsdownPath))) {
    fail(dirName + ": missing tsdown.config.ts");
  } else if (!(await readFile(tsdownPath, "utf8")).includes("neverBundle: true")) {
    fail(dirName + ": tsdown.config.ts must set deps.neverBundle: true");
  }
  await checkSelfContainedTsconfigs(dir, dirName);

  if (pkg.dsh?.client) {
    const hasClient = (await exists(join(dir, "src/client/index.ts")))
      || (await exists(join(dir, "src/client/index.tsx")))
      || (await exists(join(dir, "src/client")));
    if (!hasClient) fail(dirName + ": dsh.client is set but src/client is missing");
    if (pkg.exports?.["./client"] === undefined) {
      fail(dirName + ': dsh.client requires exports["./client"]');
    }
  }

  checkDshPins(dirName, pkg);
  checkDshTools(dirName, pkg);

  const built = join(dir, "lib", "index.js");
  if (requireLib && !(await exists(built))) {
    fail(dirName + ": missing lib/index.js; run build");
  }
  for (const jsPath of await listJavaScriptFiles(join(dir, "lib"))) {
    const label = relative(dir, jsPath).replaceAll("\\", "/");
    const js = await readFile(jsPath, "utf8");
    if (/#region[^\n]*node_modules/u.test(js)) {
      fail(dirName + ": " + label + " bundled node_modules; set deps.neverBundle: true");
    }
    const runtimeImports = runtimeDeepseekImports(js);
    if (runtimeImports.has("@deepseek-ai/dsh-tools")) {
      fail(dirName + ": " + label + " value-imports @deepseek-ai/dsh-tools; register a plain tool object instead");
    }
    if (label === "lib/client.js") continue;
    const declared = new Set(Object.keys(pkg.dependencies ?? {}));
    for (const name of runtimeImports) {
      if (!declared.has(name)) {
        fail(dirName + ": " + label + " imports " + name + "; move it from devDependencies to dependencies");
      }
    }
  }
}

async function checkTemplate(templateName) {
  const label = "templates/" + templateName;
  const dir = join(templatesDir, templateName);
  const required = [
    "package.json",
    "cordis.patch.yml",
    "README.md",
    "README.zh.md",
    "src/index.ts",
    "tsconfig.json",
    "tsdown.config.ts",
  ];
  let missing = false;
  for (const path of required) {
    if (!(await exists(join(dir, path)))) {
      fail(label + ": missing " + path);
      missing = true;
    }
  }
  // Content checks below read the required files; skip them when any is absent.
  if (missing) return;

  const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
  if (pkg.name !== "__PACKAGE__") fail(label + ': package.json name must remain "__PACKAGE__"');
  if (pkg.type !== "module") fail(label + ": package.json type must be module");
  if (pkg.dsh?.profile) fail(label + ": template must not declare dsh.profile");
  if (pkg.dsh?.bundle?.patch !== "./cordis.patch.yml") {
    fail(label + ': dsh.bundle.patch must be "./cordis.patch.yml"');
  }
  const files = pkg.files ?? [];
  if (!files.includes("lib") || !files.includes("cordis.patch.yml")) {
    fail(label + ": files[] must include lib and cordis.patch.yml");
  }

  const patch = await readFile(join(dir, "cordis.patch.yml"), "utf8");
  if (!/id:\s+__ID__(?:\s|$)/u.test(patch)) fail(label + ': patch id must remain "__ID__"');
  if (!/name:\s+__PACKAGE__(?:\s|$)/u.test(patch)) fail(label + ': patch name must remain "__PACKAGE__"');

  const index = await readFile(join(dir, "src/index.ts"), "utf8");
  if (!/export const name = ["']__ID__["']/u.test(index)) {
    fail(label + ': src/index.ts name must remain "__ID__"');
  }

  const tsdown = await readFile(join(dir, "tsdown.config.ts"), "utf8");
  if (!tsdown.includes("neverBundle: true")) {
    fail(label + ": tsdown.config.ts must set deps.neverBundle: true");
  }
  await checkSelfContainedTsconfigs(dir, label);

  for (const readmeName of ["README.md", "README.zh.md"]) {
    const readme = await readFile(join(dir, readmeName), "utf8");
    for (const placeholder of ["__PACKAGE__", "__DESCRIPTION__", "__SLUG__"]) {
      if (!readme.includes(placeholder)) {
        fail(label + ": " + readmeName + " must retain " + placeholder);
      }
    }
  }

  checkDshPins(label, pkg);
  checkDshTools(label, pkg);
}

async function checkRoot() {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  if (pkg.dsh?.bundle) fail("workspace root must not declare dsh.bundle");
  if (pkg.dsh?.profile) fail("workspace root must not declare dsh.profile");
  await checkVersionsAndDocs();
}

/** Print the success summary, or every collected error plus a count. */
function finish(summary) {
  if (errors.length > 0) {
    for (const message of errors) process.stderr.write(message + "\n");
    process.stderr.write("check-manifest: " + errors.length + " error(s)\n");
    process.exitCode = 1;
    return;
  }
  process.stdout.write(summary + "\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await checkRoot();
  for (const name of TEMPLATE_NAMES) {
    await checkTemplate(name);
  }
  if (!(await exists(pluginsDir))) {
    finish("Checked " + TEMPLATE_NAMES.length + " plugin template(s). No plugins/ directory.");
    return;
  }
  const entries = await readdir(pluginsDir, { withFileTypes: true });
  const plugins = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  if (plugins.length === 0) {
    finish("Checked " + TEMPLATE_NAMES.length + " plugin template(s). No plugins to check.");
    return;
  }
  for (const name of plugins) {
    await checkPlugin(name, args.requireLib);
  }
  finish(
    "Checked " + plugins.length + " plugin manifest(s) and " + TEMPLATE_NAMES.length + " template(s)."
      + (args.requireLib ? " lib/ required." : ""),
  );
}

main().catch((error) => {
  process.stderr.write(error.message + "\n");
  process.exitCode = 1;
});
