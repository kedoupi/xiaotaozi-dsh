#!/usr/bin/env node
import { readdir, readFile, access, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginsDir = join(root, "plugins");
const templatesDir = join(root, "templates");
const versions = JSON.parse(await readFile(join(root, "versions.json"), "utf8"));
const HOST_RC = versions.dshRc;
const TEMPLATE_NAMES = ["host-plugin", "mixed-plugin"];
const OWN_DOC_ROOTS = [
  "README.md",
  "README.zh.md",
  "CONTRIBUTING.md",
  "CONTRIBUTING.zh.md",
  "CHANGELOG.md",
  "AGENTS.md",
  "docs",
  "design-system",
  "apps/cli",
  "plugins",
  "templates",
  ".grok/skills",
];
const DEFAULT_USER_PLUGINS = ["xtz-ui", "sidebar", "providers", "im", "market", "wecom-office"];
/** Current ceiling after migrating session-binding-lock.ts. It may go down, never up. */
export const IM_TS_NOCHECK_MAX = 228;

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

/** Count actual TypeScript checking opt-out directives, not prose mentions. */
export function tsNoCheckDirectiveCount(source) {
  // Use TypeScript's own leading-comment scanner so banner blocks on the same
  // line (or the preceding lines) cannot hide an accepted // or /// pragma.
  const acceptedCount = (ts.getLeadingCommentRanges(source, 0) ?? [])
    .filter((range) => range.kind === ts.SyntaxKind.SingleLineCommentTrivia)
    .map((range) => source.slice(range.pos, range.end))
    .filter((comment) => /^\/\/\/?\s*@ts-nocheck(?:(?:[^\S\r\n]|:).*)?$/iu.test(comment))
    .length;
  // Preserve the standalone block spelling counted by the original ratchet,
  // even though current TypeScript only activates the // and /// pragmas.
  const legacyBlockCount = source.split(/\r?\n/u)
    .filter((line) => /^\s*\/\*\s*@ts-nocheck\b/iu.test(line))
    .length;
  return acceptedCount + legacyBlockCount;
}

export function isTypeScriptSourceName(name) {
  return /\.[cm]?tsx?$/u.test(name);
}

async function typeScriptFiles(path) {
  if (!(await exists(path))) return [];
  const files = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (["node_modules", "lib", "dist", ".git"].includes(entry.name)) continue;
    const child = join(path, entry.name);
    if (entry.isDirectory()) files.push(...await typeScriptFiles(child));
    else if (entry.isFile() && isTypeScriptSourceName(entry.name)) files.push(child);
  }
  return files;
}

async function checkImTsNoCheckBudget() {
  const sourceRoot = join(pluginsDir, "im", "src");
  let count = 0;
  for (const path of await typeScriptFiles(sourceRoot)) {
    count += tsNoCheckDirectiveCount(await readFile(path, "utf8"));
  }
  if (count !== IM_TS_NOCHECK_MAX) {
    const action = count < IM_TS_NOCHECK_MAX
      ? `lower IM_TS_NOCHECK_MAX to ${count} so the ratchet cannot regress`
      : "remove new directives; the budget may not increase";
    fail(`plugins/im/src @ts-nocheck count must equal ratchet ${IM_TS_NOCHECK_MAX} (got ${count}); ${action}`);
  }
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
  for (const key of ["dshRc", "node", "python", "pnpm", "cliApp"]) {
    if (typeof versions[key] !== "string" || !versions[key]) fail(`versions.json ${key} must be a non-empty string`);
  }
  if (versions.desktopApp !== undefined) fail("versions.json must not list desktopApp");

  const rootPkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assertEqual(rootPkg.engines?.node, `>=${versions.node}`, "package.json engines.node");
  assertEqual(rootPkg.packageManager?.split("+")[0], `pnpm@${versions.pnpm}`, "package.json packageManager");

  const cliRoot = join(root, "apps/cli");
  const cliPkg = JSON.parse(await readFile(join(cliRoot, "package.json"), "utf8"));
  assertEqual(cliPkg.version, versions.cliApp, "apps/cli/package.json version");
  assertEqual(cliPkg.engines?.node, versions.node, "apps/cli/package.json engines.node");
  const cliNodeVersion = (await readFile(join(cliRoot, ".node-version"), "utf8")).trim();
  assertEqual(cliNodeVersion, versions.node, "apps/cli/.node-version");
  assertEqual(cliPkg.packageManager?.split("+")[0], `pnpm@${versions.pnpm}`, "apps/cli/package.json packageManager");
  assertEqual(cliPkg.dependencies?.["@deepseek-ai/dsh"], versions.dshRc, "apps/cli/package.json dsh dependency");
  assertEqual(cliPkg.dependencies?.pnpm, versions.pnpm, "apps/cli/package.json pnpm dependency");
  assertEqual(cliPkg.bin?.xtz, "lib/cli.js", "apps/cli/package.json bin.xtz");
  assertEqual(cliPkg.repository?.type, "git", "apps/cli/package.json repository.type");
  assertEqual(
    cliPkg.repository?.url,
    "git+https://github.com/kedoupi/xiaotaozi-dsh.git",
    "apps/cli/package.json repository.url",
  );
  if (cliPkg.private === true) fail("apps/cli/package.json must be publishable, not private");
  const pluginSpecSrc = await readFile(join(cliRoot, "src/plugin-spec.ts"), "utf8");
  const seedPin = `#v${versions.cliApp}&path:plugins/`;
  const seedSpecs = [...pluginSpecSrc.matchAll(/spec:\s*"(github:kedoupi\/xiaotaozi-dsh#[^"]+)"/gu)].map((match) => match[1]);
  if (seedSpecs.length === 0) fail("apps/cli/src/plugin-spec.ts DEFAULT_PLUGINS specs are missing");
  for (const spec of seedSpecs) {
    if (!spec.includes(seedPin)) {
      fail(`DEFAULT_PLUGINS spec must pin ${seedPin} (got ${spec})`);
    }
  }
  const publishWorkflow = await readFile(join(root, ".github/workflows/publish.yml"), "utf8");
  if (!publishWorkflow.includes("id-token: write")) {
    fail(".github/workflows/publish.yml must grant id-token: write for npm OIDC");
  }
  if (publishWorkflow.includes("registry-url: https://registry.npmjs.org")) {
    fail(".github/workflows/publish.yml must not set setup-node registry-url (it blocks OIDC)");
  }
  if (!publishWorkflow.includes("npm@^11.5.1")) {
    fail(".github/workflows/publish.yml must install npm@^11.5.1 (Node 22.19.0 ships npm 10)");
  }
  const cliInstall = await readFile(join(cliRoot, "scripts/install.sh"), "utf8");
  if (!cliInstall.includes(`NEED_NODE="${versions.node}"`)) {
    fail(`apps/cli/scripts/install.sh must pin Node ${versions.node}`);
  }
  if (!cliInstall.includes(cliPkg.name) || !cliInstall.includes("--bun") || !cliInstall.includes("--npm")) {
    fail("apps/cli/scripts/install.sh must install the publishable CLI package via npm or bun");
  }
  const workflow = await readFile(join(root, ".github/workflows/check.yml"), "utf8");
  // pnpm/action-setup must take the version from packageManager; an explicit
  // version input conflicts with the +sha512 suffix and fails the job.
  if (/pnpm\/action-setup@\S*\s*\n\s*with:\s*\n\s*version:/u.test(workflow)) {
    fail(".github/workflows/check.yml must not pass version: to pnpm/action-setup (packageManager is the source)");
  }
  const ciNode = versions.node;
  for (const match of workflow.matchAll(/node-version:\s*"([^"]+)"/gu)) {
    assertEqual(match[1], ciNode, ".github/workflows/check.yml Node version");
  }
  if (await exists(join(root, "apps/desktop"))) {
    fail("apps/desktop must not exist; desktop is archived at tag archive/desktop");
  }
  for (const requiredDoc of [
    "CONTRIBUTING.md",
    "CONTRIBUTING.zh.md",
    "CHANGELOG.md",
    "docs/README.md",
    "docs/README.zh.md",
  ]) {
    if (!await exists(join(root, requiredDoc))) fail(`${requiredDoc} is missing`);
  }
  if (rootPkg.scripts?.["check:desktop"]) {
    fail("package.json must not define check:desktop");
  }
  if (workflow.includes("desktop-web-node") || workflow.includes("desktop-rust") || workflow.includes("apps/desktop")) {
    fail(".github/workflows/check.yml must not run desktop jobs");
  }
  for (const workspacePath of [
    join(root, "pnpm-workspace.yaml"),
    join(cliRoot, "pnpm-workspace.yaml"),
  ]) {
    if (!(await exists(workspacePath))) continue;
    const workspaceLabel = relative(root, workspacePath).replaceAll("\\", "/");
    const workspace = await readFile(workspacePath, "utf8");
    for (const match of workspace.matchAll(/@deepseek-ai\/dsh-[^@\s'"]+@([0-9A-Za-z.-]+)/gu)) {
      assertEqual(match[1], versions.dshRc, workspaceLabel + " dsh catalog pin");
    }
    for (const match of workspace.matchAll(/"@deepseek-ai\/dsh-[^"]+"\s*:\s*"([^"]+)"/gu)) {
      assertEqual(match[1], versions.dshRc, workspaceLabel + " packageExtensions pin");
    }
  }

  const marketCatalog = await readFile(join(root, "plugins/market/src/catalog.ts"), "utf8");
  for (const spec of [
    "github:NanmiCoder/dsh-agent-teams",
    "github:bowenliang123/dsh-context",
    "github:melandlabs/opencontext#path:plugins/dsh-opencontext",
  ]) {
    if (!marketCatalog.includes(spec)) fail(`plugins/market catalog must list ${spec}`);
  }
  const marketMutate = await readFile(join(root, "plugins/market/src/plugin-mutate.ts"), "utf8");
  const marketDshPin = /export const PINNED_DSH_VERSION = "([^"]+)";/u.exec(marketMutate)?.[1];
  assertEqual(marketDshPin, versions.dshRc, "plugins/market/src/plugin-mutate.ts PINNED_DSH_VERSION");
  for (const slug of DEFAULT_USER_PLUGINS) {
    if (!await exists(join(root, "plugins", slug, "package.json"))) {
      fail(`default plugin plugins/${slug} is missing`);
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
      "小白",
      "`plugin`, `open`",
      "`plugin`、`open`",
      "Nothing has been published yet",
      "目前还没有对外发过",
    ]) {
      if (text.includes(forbidden)) fail(`${label}: stale documentation reference ${forbidden}`);
    }
  }
  const pluginEntries = (await exists(pluginsDir))
    ? (await readdir(pluginsDir, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    : [];
  for (const readme of ["README.md", "README.zh.md"]) {
    const text = await readFile(join(root, readme), "utf8");
    if (!text.includes(`node-%3E%3D${nodeBadge}-`)) fail(`${readme}: Node badge must use >=${nodeBadge}`);
    if (!text.includes(`dsh-${encodedDsh}-`)) fail(`${readme}: dsh badge must use ${versions.dshRc}`);
    if (!text.includes(`@deepseek-ai/dsh@${versions.dshRc}`)) fail(`${readme}: host CLI text must use ${versions.dshRc}`);
    for (const slug of pluginEntries) {
      if (!text.includes(`#path:plugins/${slug}`)) {
        fail(`${readme}: install table must include github path for plugins/${slug}`);
      }
    }
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

// Declaring @deepseek-ai/dsh-tools in dependencies is allowed (dsh-subagent
// needs it resolvable at load time in isolated Git path installs), but source
// code must never value-import it: register a plain tool object instead.
export const SESSION_LOAD_PEERS = ["@deepseek-ai/dsh-scope"];
export const SUBAGENT_LOAD_PEERS = ["@deepseek-ai/dsh-scope", "@deepseek-ai/dsh-tools"];

export function packageValueImports(source, specifier) {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const offenses = [];
  const staticRe = new RegExp(
    String.raw`(?:^|\n)[ \t]*(import|export)\s+([^;]*?)\bfrom\s*["']` + escaped + String.raw`(?:\/[^"']*)?["']`,
    "gu",
  );
  let match;
  while ((match = staticRe.exec(source)) !== null) {
    if (!/^type\b/u.test(match[2].trim())) offenses.push(match[0].trim());
  }
  const dynamicRe = new RegExp(
    String.raw`(?:\brequire\s*\(\s*|\bimport\s*\(\s*)["']` + escaped + String.raw`(?:\/[^"']*)?["']`,
    "gu",
  );
  while ((match = dynamicRe.exec(source)) !== null) offenses.push(match[0].trim());
  const bareRe = new RegExp(
    String.raw`(?:^|\n)[ \t]*import\s*["']` + escaped + String.raw`(?:\/[^"']*)?["']`,
    "gu",
  );
  while ((match = bareRe.exec(source)) !== null) offenses.push(match[0].trim());
  return offenses;
}

export function dshToolsValueImports(source) {
  return packageValueImports(source, "@deepseek-ai/dsh-tools");
}

export function missingHarnessPeerCompanions(loaded, dependencies) {
  const declared = new Set(Object.keys(dependencies ?? {}));
  const names = loaded.has("@deepseek-ai/dsh-subagent")
    ? SUBAGENT_LOAD_PEERS
    : loaded.has("@deepseek-ai/dsh-session")
      ? SESSION_LOAD_PEERS
      : [];
  return names.filter((name) => !declared.has(name));
}

async function listTypeScriptFiles(dir) {
  if (!(await exists(dir))) return [];
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (["node_modules", "lib", "dist", ".git"].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listTypeScriptFiles(path));
    else if (entry.isFile() && /\.(?:ts|tsx|mts|cts)$/u.test(entry.name)) files.push(path);
  }
  return files;
}

async function checkDshTools(dirName, dir) {
  for (const tsPath of await listTypeScriptFiles(join(dir, "src"))) {
    const label = relative(dir, tsPath).replaceAll("\\", "/");
    for (const offense of dshToolsValueImports(await readFile(tsPath, "utf8"))) {
      fail(dirName + ": " + label + " value-imports @deepseek-ai/dsh-tools; register a plain tool object instead ("
        + offense.split("\n")[0] + ")");
    }
  }
}

async function checkHarnessPeerCompanions(dirName, dir, pkg) {
  const loaded = new Set();
  for (const tsPath of await listTypeScriptFiles(join(dir, "src"))) {
    const label = relative(dir, tsPath).replaceAll("\\", "/");
    if (label === "src/client.ts" || label === "src/client.tsx" || label.startsWith("src/client/")) continue;
    const source = await readFile(tsPath, "utf8");
    if (packageValueImports(source, "@deepseek-ai/dsh-session").length > 0) {
      loaded.add("@deepseek-ai/dsh-session");
    }
    if (packageValueImports(source, "@deepseek-ai/dsh-subagent").length > 0) {
      loaded.add("@deepseek-ai/dsh-subagent");
    }
  }
  for (const name of missingHarnessPeerCompanions(loaded, pkg.dependencies)) {
    fail(
      dirName
        + ": value-imports a harness package that needs "
        + name
        + " in dependencies so link:/path installs can resolve its peers",
    );
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
  await checkDshTools(dirName, dir);
  await checkHarnessPeerCompanions(dirName, dir, pkg);

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
  await checkDshTools(label, dir);
}

async function checkRoot() {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  if (pkg.dsh?.bundle) fail("workspace root must not declare dsh.bundle");
  if (pkg.dsh?.profile) fail("workspace root must not declare dsh.profile");
  await checkVersionsAndDocs();
  await checkImTsNoCheckBudget();
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

const isDirectRun = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(error.message + "\n");
    process.exitCode = 1;
  });
}
