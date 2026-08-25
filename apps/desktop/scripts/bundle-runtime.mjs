#!/usr/bin/env node
/**
 * Pack Node + pinned dsh + prebuilt plugins into
 * `apps/desktop/src-tauri/runtime/` for the 小白 installer.
 *
 * Staging is apps/desktop/.runtime-build — never ~/.dsh, never .dsh-home.
 * Packed plugins are file: tarballs, not github: or link: paths.
 *
 * Usage:
 *   node apps/desktop/scripts/bundle-runtime.mjs
 *   node apps/desktop/scripts/bundle-runtime.mjs --force
 *   node apps/desktop/scripts/bundle-runtime.mjs --target darwin-arm64
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_INDEX_URL, packPublicUrl } from "./cdn.mjs";
import {
  fetchSignedIndex,
  nextPackVersion,
  planPackRelease,
  signPayload,
  verifyEnvelope,
} from "./pack-signing.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(here, "..");
const repoRoot = resolve(desktopRoot, "../..");
const runtimeDir = join(desktopRoot, "src-tauri", "runtime");
const buildDir = join(desktopRoot, ".runtime-build");

const versions = JSON.parse(readFileSync(join(repoRoot, "versions.json"), "utf8"));
const NODE_VERSION = versions.node;
const PYTHON_VERSION = versions.python;
const DSH_VERSION = versions.dshRc;
const PNPM_VERSION = versions.pnpm;
const APP_VERSION = versions.desktopApp;
for (const [name, version] of Object.entries({
  node: NODE_VERSION,
  python: PYTHON_VERSION,
  dshRc: DSH_VERSION,
  pnpm: PNPM_VERSION,
  desktopApp: APP_VERSION,
})) {
  if (typeof version !== "string" || !version) {
    throw new Error(`versions.json ${name} must be a non-empty string`);
  }
}
const PYTHON_STANDALONE_TAG = "20260814";
const PLUGINS = ["hello", "providers", "memory", "im"];
const PROFILE_ALLOW_BUILDS = ["@whiskeysockets/baileys", "protobufjs"];

const TARGETS = {
  "darwin-arm64": {
    archive: "tar.gz",
    nodeFolder: "darwin-arm64",
    pythonFile: `cpython-${PYTHON_VERSION}+${PYTHON_STANDALONE_TAG}-aarch64-apple-darwin-install_only_stripped.tar.gz`,
    pythonSha256: "dd5b76ab11451a4a4367c17c61d944dded56b425396b07f102922a7ebef7d55f",
  },
  "darwin-x64": {
    archive: "tar.gz",
    nodeFolder: "darwin-x64",
    pythonFile: `cpython-${PYTHON_VERSION}+${PYTHON_STANDALONE_TAG}-x86_64-apple-darwin-install_only_stripped.tar.gz`,
    pythonSha256: "aec265e3cddaccdb2a3d783331596351b24d4a63c97af0a38f75f643c9451de9",
  },
  "win-x64": {
    archive: "zip",
    nodeFolder: "win-x64",
    pythonFile: `cpython-${PYTHON_VERSION}+${PYTHON_STANDALONE_TAG}-x86_64-pc-windows-msvc-install_only_stripped.tar.gz`,
    pythonSha256: "89f18f6932917163b74339ebcec2645c8e47ae7f1c5f2ac37f2b4f4cf3beb647",
  },
  "win-arm64": {
    archive: "zip",
    nodeFolder: "win-arm64",
    pythonFile: `cpython-${PYTHON_VERSION}+${PYTHON_STANDALONE_TAG}-aarch64-pc-windows-msvc-install_only_stripped.tar.gz`,
    pythonSha256: "1e1de8b5d0df73b965aa72f0c27d5c617a5d7256ce6d205228a0f9638bf6df21",
  },
};

function usage() {
  return `Pack Node ${NODE_VERSION} + Python ${PYTHON_VERSION} + @deepseek-ai/dsh@${DSH_VERSION} + plugins into src-tauri/runtime/.

Usage:
  node apps/desktop/scripts/bundle-runtime.mjs [--force] [--target <name>] [--emit-pack]

--emit-pack  also writes plugin-packs/*.tar.gz + latest.json for
             https://s.xiaotaozi.cc/dsh/packs/ (TCB COS), never GitHub.

Targets: ${Object.keys(TARGETS).join(", ")}
Does not write ~/.dsh. Does not link this workspace.
`;
}

function parseArgs(argv) {
  const out = { force: false, target: null, emitPack: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") return { help: true };
    if (arg === "--force") {
      out.force = true;
      continue;
    }
    if (arg === "--emit-pack") {
      out.emitPack = true;
      continue;
    }
    if (arg === "--target") {
      out.target = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--target=")) {
      out.target = arg.slice("--target=".length);
      continue;
    }
    throw new Error(`Unknown flag: ${arg}\n${usage()}`);
  }
  return out;
}

function hostTarget() {
  const os = process.platform === "win32" ? "win" : process.platform;
  const arch = process.arch === "x64" ? "x64" : process.arch;
  const name = `${os}-${arch}`;
  if (!TARGETS[name]) {
    throw new Error(`Unsupported host ${name}. Pack on macOS or Windows (x64/arm64).`);
  }
  return name;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "inherit", "inherit"],
    shell: process.platform === "win32",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}

function runOut(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    ...options,
  });
  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    throw new Error(output || `${command} ${args.join(" ")} failed`);
  }
  return (result.stdout ?? "").trim();
}

function isInside(child, parent) {
  const c = resolve(child);
  const p = resolve(parent);
  return c === p || c.startsWith(p.endsWith("/") || p.endsWith("\\") ? p : p + (p.includes("\\") ? "\\" : "/"));
}

function mkdir(path) {
  mkdirSync(path, { recursive: true });
}

function relativizeSymlinks(root) {
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      let st;
      try {
        st = lstatSync(path);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) {
        const target = readlinkSync(path);
        if (!isAbsolute(target)) continue;
        const absTarget = resolve(target);
        if (!isInside(absTarget, root)) {
          throw new Error(`absolute symlink escapes profile: ${path} -> ${absTarget}`);
        }
        unlinkSync(path);
        symlinkSync(relative(dirname(path), absTarget), path);
        continue;
      }
      if (st.isDirectory()) walk(path);
    }
  };
  walk(root);
}

function rm(path) {
  rmSync(path, { recursive: true, force: true });
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function isWin(target) {
  return target.startsWith("win-");
}

function nodeBinDir(nodeRoot, target) {
  return isWin(target) ? nodeRoot : join(nodeRoot, "bin");
}

function nodeBinary(nodeRoot, target) {
  return join(nodeBinDir(nodeRoot, target), isWin(target) ? "node.exe" : "node");
}

function pythonBinary(pythonRoot, target) {
  return isWin(target) ? join(pythonRoot, "python.exe") : join(pythonRoot, "bin", "python3");
}

function npmCli(nodeRoot, target) {
  return isWin(target)
    ? join(nodeRoot, "node_modules", "npm", "bin", "npm-cli.js")
    : join(nodeRoot, "lib", "node_modules", "npm", "bin", "npm-cli.js");
}

function dshBinJs(dshPrefix, target) {
  const unix = join(dshPrefix, "lib", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
  const win = join(dshPrefix, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
  if (existsSync(unix)) return unix;
  if (existsSync(win)) return win;
  if (isWin(target)) return win;
  return unix;
}

async function download(url, dest) {
  process.stdout.write(`Downloading ${url}\n`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
}

function extractArchive(archive, dest, kind) {
  rm(dest);
  mkdir(dest);
  if (kind === "tar.gz") {
    run("tar", ["-xzf", archive, "-C", dest, "--strip-components=1"]);
    return;
  }
  const staging = mkdtempSync(join(tmpdir(), "xiaotaozi-node-"));
  try {
    run("unzip", ["-q", archive, "-d", staging]);
    const top = readdirSync(staging);
    if (top.length !== 1) throw new Error(`Unexpected zip layout: ${top.join(", ")}`);
    cpSync(join(staging, top[0]), dest, { recursive: true });
  } finally {
    rm(staging);
  }
}

function pluginPackage(slug) {
  const pkgPath = join(repoRoot, "plugins", slug, "package.json");
  if (!existsSync(pkgPath)) throw new Error(`No plugin at plugins/${slug}`);
  return JSON.parse(readFileSync(pkgPath, "utf8"));
}

function readManifest() {
  const path = join(runtimeDir, "manifest.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function wantedPlugins() {
  const plugins = {};
  for (const slug of PLUGINS) {
    const pkg = pluginPackage(slug);
    plugins[pkg.name] = pkg.version;
  }
  return plugins;
}

function runtimeCurrent(target) {
  const manifest = readManifest();
  if (!manifest) return false;
  if (manifest.node !== NODE_VERSION || manifest.dsh !== DSH_VERSION || manifest.target !== target) {
    return false;
  }
  if (!existsSync(nodeBinary(join(runtimeDir, "node"), target))) return false;
  if (!existsSync(dshBinJs(join(runtimeDir, "dsh"), target))) return false;
  if (!existsSync(join(runtimeDir, "profile", "package.json"))) return false;
  if (!existsSync(join(runtimeDir, "profile", "node_modules"))) return false;
  const wanted = wantedPlugins();
  for (const [name, version] of Object.entries(wanted)) {
    if (manifest.plugins?.[name] !== version) return false;
  }
  return true;
}

async function installNode(target, nodeRoot) {
  const spec = TARGETS[target];
  const fileName = `node-v${NODE_VERSION}-${spec.nodeFolder}.${spec.archive}`;
  const cache = join(buildDir, "cache");
  mkdir(cache);
  const archive = join(cache, fileName);
  const sumsPath = join(cache, `SHASUMS256-${NODE_VERSION}.txt`);
  const base = `https://nodejs.org/dist/v${NODE_VERSION}`;
  if (!existsSync(sumsPath)) {
    await download(`${base}/SHASUMS256.txt`, sumsPath);
  }
  const sums = readFileSync(sumsPath, "utf8");
  const line = sums.split("\n").find((row) => row.endsWith(`  ${fileName}`));
  if (!line) throw new Error(`No SHA256 for ${fileName}`);
  const expected = line.slice(0, 64).toLowerCase();
  if (!existsSync(archive) || sha256File(archive) !== expected) {
    await download(`${base}/${fileName}`, archive);
    const actual = sha256File(archive);
    if (actual !== expected) {
      rm(archive);
      throw new Error(`SHA256 mismatch for ${fileName}: ${actual} != ${expected}`);
    }
  }
  extractArchive(archive, nodeRoot, spec.archive);
  const bin = nodeBinary(nodeRoot, target);
  if (!existsSync(bin)) throw new Error(`Node binary missing at ${bin}`);
  if (!isWin(target)) chmodSync(bin, 0o755);
  const version = runOut(bin, ["-v"]);
  if (version !== `v${NODE_VERSION}`) {
    throw new Error(`Bundled node is ${version}, expected v${NODE_VERSION}`);
  }
}

function nodeReady(target, nodeRoot) {
  const bin = nodeBinary(nodeRoot, target);
  if (!existsSync(bin)) return false;
  try {
    return runOut(bin, ["-v"]) === `v${NODE_VERSION}`;
  } catch {
    return false;
  }
}

function pythonReady(target, pythonRoot) {
  const bin = pythonBinary(pythonRoot, target);
  if (!existsSync(bin)) return false;
  try {
    const version = runOut(bin, ["-c", "import sys; print('%d.%d.%d' % sys.version_info[:3])"]);
    return version === PYTHON_VERSION;
  } catch {
    return false;
  }
}

async function installPython(target, pythonRoot) {
  const spec = TARGETS[target];
  const cache = join(buildDir, "cache");
  mkdir(cache);
  const archive = join(cache, spec.pythonFile);
  const url = `https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_STANDALONE_TAG}/${spec.pythonFile}`;
  if (!existsSync(archive) || sha256File(archive) !== spec.pythonSha256) {
    await download(url, archive);
    const actual = sha256File(archive);
    if (actual !== spec.pythonSha256) {
      rm(archive);
      throw new Error(`SHA256 mismatch for ${spec.pythonFile}: ${actual} != ${spec.pythonSha256}`);
    }
  }
  extractArchive(archive, pythonRoot, "tar.gz");
  const bin = pythonBinary(pythonRoot, target);
  if (!existsSync(bin)) throw new Error(`Python binary missing at ${bin}`);
  if (!isWin(target)) chmodSync(bin, 0o755);
  if (isWin(target)) {
    const py3 = join(pythonRoot, "python3.exe");
    if (!existsSync(py3)) cpSync(bin, py3);
  }
  const version = runOut(bin, ["-c", "import sys; print('%d.%d.%d' % sys.version_info[:3])"]);
  if (version !== PYTHON_VERSION) {
    throw new Error(`Bundled python is ${version}, expected ${PYTHON_VERSION}`);
  }
  runOut(bin, ["-c", "import pip"]);
}

function dshReady(target, nodeRoot, dshPrefix) {
  const binJs = dshBinJs(dshPrefix, target);
  if (!existsSync(binJs) || !existsSync(nodeBinary(nodeRoot, target))) return false;
  try {
    const version = runOut(nodeBinary(nodeRoot, target), [binJs, "--version"], {
      env: { ...process.env, PATH: pathWithNode(nodeRoot, target) },
    });
    return version === DSH_VERSION;
  } catch {
    return false;
  }
}

function pathWithNode(nodeRoot, target, extra = []) {
  const parts = [nodeBinDir(nodeRoot, target), ...extra.filter(Boolean), process.env.PATH ?? ""].filter(Boolean);
  return parts.join(isWin(target) ? ";" : ":");
}

function installDsh(target, nodeRoot, dshPrefix) {
  rm(dshPrefix);
  mkdir(dshPrefix);
  const node = nodeBinary(nodeRoot, target);
  const npm = npmCli(nodeRoot, target);
  if (!existsSync(npm)) throw new Error(`npm missing at ${npm}`);
  const env = {
    ...process.env,
    PATH: pathWithNode(nodeRoot, target),
    npm_config_update_notifier: "false",
    npm_config_fund: "false",
    npm_config_cache: join(buildDir, "npm-cache"),
  };
  run(node, [npm, "install", "-g", `@deepseek-ai/dsh@${DSH_VERSION}`, `pnpm@${PNPM_VERSION}`, "--prefix", dshPrefix], {
    env,
    cwd: buildDir,
  });
  const binJs = dshBinJs(dshPrefix, target);
  if (!existsSync(binJs)) throw new Error(`dsh missing at ${binJs}`);
  const version = runOut(node, [binJs, "--version"], { env: { ...env, PATH: pathWithNode(nodeRoot, target, [join(dshPrefix, isWin(target) ? "" : "bin")]) } });
  if (version !== DSH_VERSION) {
    throw new Error(`Bundled dsh is ${version}, expected ${DSH_VERSION}`);
  }
}

function packPlugins(vendorDir) {
  rm(vendorDir);
  mkdir(vendorDir);
  const tarballs = [];
  for (const slug of PLUGINS) {
    const dir = join(repoRoot, "plugins", slug);
    const lib = join(dir, "lib", "index.js");
    const pkg = pluginPackage(slug);
    run("pnpm", ["--filter", `dsh-${slug}`, "build"], { cwd: repoRoot });
    if (!existsSync(lib)) throw new Error(`plugins/${slug} has no lib/index.js after build`);
    run("pnpm", ["--filter", `dsh-${slug}`, "pack", "--pack-destination", vendorDir], { cwd: repoRoot });
    const file = `${pkg.name}-${pkg.version}.tgz`;
    if (!existsSync(join(vendorDir, file))) {
      const found = readdirSync(vendorDir).filter((name) => name.startsWith(`${pkg.name}-`) && name.endsWith(".tgz"));
      throw new Error(`Packed ${pkg.name} missing ${file}${found.length ? ` (found ${found.join(", ")})` : ""}`);
    }
    tarballs.push({ name: pkg.name, file });
  }
  return tarballs;
}

function installProfile(profileDir, vendorDir, tarballs) {
  rm(profileDir);
  mkdir(join(profileDir, "vendor"));
  const dependencies = {};
  const bundles = ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"];
  for (const { name, file } of tarballs) {
    cpSync(join(vendorDir, file), join(profileDir, "vendor", file));
    dependencies[name] = `file:./vendor/${file}`;
    bundles.push(name);
  }
  writeFileSync(
    join(profileDir, "package.json"),
    `${JSON.stringify(
      {
        name: "dsh-profile-web",
        private: true,
        dsh: { profile: { bundles } },
        dependencies,
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(profileDir, "pnpm-workspace.yaml"),
    `packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\nallowBuilds:\n${PROFILE_ALLOW_BUILDS.map((name) => `  ${JSON.stringify(name)}: true`).join("\n")}\n`,
  );
  writeFileSync(
    join(profileDir, ".npmrc"),
    "node-linker=hoisted\nauto-install-peers=false\npackage-import-method=copy\n",
  );
  writeFileSync(
    join(profileDir, "cordis.patch.yml"),
    `# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; \`!!js\` expressions allowed).
[]
`,
  );
  const env = {
    ...process.env,
    CI: "1",
    npm_config_update_notifier: "false",
    npm_config_fund: "false",
  };
  delete env.DSH_HOME;
  run("pnpm", ["install", "--store-dir", join(buildDir, "pnpm-store")], { cwd: profileDir, env });
  relativizeSymlinks(profileDir);
  const pkg = JSON.parse(readFileSync(join(profileDir, "package.json"), "utf8"));
  for (const spec of Object.values(pkg.dependencies ?? {})) {
    if (typeof spec === "string" && (spec.startsWith("github:") || spec.startsWith("link:") || spec.includes("xiaotaozi-dsh#path:"))) {
      throw new Error(`Profile must use packed tarballs, got ${spec}`);
    }
  }
  if (isInside(profileDir, join(homedir(), ".dsh"))) {
    throw new Error("refusing to write a profile under ~/.dsh");
  }
}

function packVersionNow() {
  return nextPackVersion();
}

function writeManifest(target, plugins, packVersion) {
  writeFileSync(
    join(runtimeDir, "manifest.json"),
    `${JSON.stringify(
      {
        packVersion,
        minApp: APP_VERSION,
        node: NODE_VERSION,
        python: PYTHON_VERSION,
        dsh: DSH_VERSION,
        pnpm: PNPM_VERSION,
        target,
        plugins,
      },
      null,
      2,
    )}\n`,
  );
}

function syncManifestPackVersion(packVersion) {
  const path = join(runtimeDir, "manifest.json");
  if (!existsSync(path)) return;
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return;
  }
  if (manifest.packVersion === packVersion) return;
  manifest.packVersion = packVersion;
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * Prefer the live CDN index as the remote baseline so a second machine
 * (whose gitignored plugin-packs/ is empty) does not evict other
 * platforms' targets. Fall back to the local plugin-packs/latest.json
 * on network failure or 404, preserving the previous behaviour.
 */
async function remoteIndexBaseline(privatePem, indexPath) {
  const indexUrl = process.env.XIAOTAOZI_PACK_INDEX || DEFAULT_INDEX_URL;
  try {
    return await fetchSignedIndex(indexUrl, privatePem, { timeoutMs: 10_000 });
  } catch (error) {
    process.stderr.write(
      `warning: could not use live pack index ${indexUrl} (${error.message}); falling back to local latest.json\n`,
    );
  }
  if (existsSync(indexPath)) {
    return verifyEnvelope(JSON.parse(readFileSync(indexPath, "utf8")), privatePem);
  }
  return null;
}

async function emitPluginPack(target, plugins) {
  const profileDir = join(runtimeDir, "profile");
  if (!existsSync(join(profileDir, "package.json"))) {
    throw new Error("runtime/profile missing; pack the runtime first");
  }
  const outDir = join(desktopRoot, "plugin-packs");
  mkdir(outDir);
  const privatePem = signingPrivateKey();
  const indexPath = join(outDir, "latest.json");
  const remote = await remoteIndexBaseline(privatePem, indexPath);
  const metadata = {
    minApp: APP_VERSION,
    dsh: DSH_VERSION,
    node: NODE_VERSION,
    plugins,
  };
  const release = planPackRelease(remote, metadata, target);
  const packVersion = release.packVersion;
  const fileName = `xiaotaozi-plugins-${packVersion}-${target}.tar.gz`;
  const archive = join(outDir, fileName);
  rm(archive);
  // -h dereferences symlinks (pnpm creates node_modules/.bin links); the client's
  // unpack_tar_gz only accepts plain file/dir entries and rejects everything else.
  run("tar", ["-czhf", archive, "-C", profileDir, "."]);
  assertNoSpecialTarEntries(archive);
  const sha256 = sha256File(archive);
  const local = {
    packVersion,
    ...metadata,
    targets: {
      ...release.targets,
      [target]: {
        url: packPublicUrl(fileName),
        sha256,
        sizeBytes: statSync(archive).size,
      },
    },
  };
  writeFileSync(indexPath, `${JSON.stringify(signPayload(local, privatePem), null, 2)}\n`);
  // Keep runtime/manifest.json in lockstep with the index so a fresh
  // install seeded from this runtime does not immediately re-download
  // the identical pack on its first update check.
  syncManifestPackVersion(packVersion);
  process.stdout.write(
    `Plugin pack ${archive}\nUpload with: pnpm publish-pack  →  ${packPublicUrl(fileName)}\n`,
  );
}

function assertNoSpecialTarEntries(archive) {
  const result = spawnSync("tar", ["-tvf", archive], {
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`tar -tvf ${archive} failed`);
  }
  const special = result.stdout
    .split("\n")
    .filter((line) => /^[lbcps]/.test(line));
  if (special.length > 0) {
    throw new Error(
      `pack contains non-file entries the client will reject:\n${special.join("\n")}`,
    );
  }
}

function signingPrivateKey() {
  const configured = process.env.XIAOTAOZI_PACK_SIGNING_KEY;
  if (configured) {
    return existsSync(configured) ? readFileSync(configured, "utf8") : configured;
  }
  const path = join(desktopRoot, ".pack-signing", "pack-signing-key.pem");
  if (!existsSync(path)) {
    throw new Error(`missing ${path}; run pnpm generate-pack-key`);
  }
  return readFileSync(path, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  const target = args.target ?? hostTarget();
  if (!TARGETS[target]) throw new Error(`Unknown target ${target}\n${usage()}`);
  const host = hostTarget();
  if (target !== host) {
    throw new Error(`This machine is ${host}; pack ${target} on that OS (native plugin addons follow the host).`);
  }
  if (isInside(buildDir, join(homedir(), ".dsh"))) {
    throw new Error("refusing to use ~/.dsh as staging");
  }

  const pythonRoot = join(runtimeDir, "python");
  const ensurePython = async () => {
    if (!args.force && pythonReady(target, pythonRoot)) {
      process.stdout.write(`Reusing Python ${PYTHON_VERSION}\n`);
      return;
    }
    process.stdout.write(`Packing Python ${PYTHON_VERSION}\n`);
    await installPython(target, pythonRoot);
    const debugRuntime = join(desktopRoot, "src-tauri", "target", "debug", "runtime");
    if (existsSync(debugRuntime)) {
      const debugPython = join(debugRuntime, "python");
      rm(debugPython);
      cpSync(pythonRoot, debugPython, { recursive: true, verbatimSymlinks: true });
      process.stdout.write(`Copied Python into ${debugPython}\n`);
    }
  };

  if (!args.force && runtimeCurrent(target)) {
    process.stdout.write(`Runtime already packed at ${runtimeDir}\n`);
    await ensurePython();
    if (args.emitPack) {
      await emitPluginPack(target, wantedPlugins());
    }
    return;
  }

  mkdir(buildDir);
  const nodeRoot = join(runtimeDir, "node");
  const dshPrefix = join(runtimeDir, "dsh");
  const profileDir = join(runtimeDir, "profile");

  process.stdout.write(`Packing runtime for ${target}\n`);
  if (!args.force && nodeReady(target, nodeRoot)) {
    process.stdout.write(`Reusing Node ${NODE_VERSION}\n`);
  } else {
    await installNode(target, nodeRoot);
  }
  if (!args.force && dshReady(target, nodeRoot, dshPrefix)) {
    process.stdout.write(`Reusing dsh ${DSH_VERSION}\n`);
  } else {
    installDsh(target, nodeRoot, dshPrefix);
  }
  await ensurePython();

  const vendorDir = join(buildDir, "vendor");
  const tarballs = packPlugins(vendorDir);
  const stagingProfile = join(buildDir, "profile-src");
  installProfile(stagingProfile, vendorDir, tarballs);
  rm(profileDir);
  mkdir(dirname(profileDir));
  cpSync(stagingProfile, profileDir, { recursive: true, verbatimSymlinks: true });

  const packVersion = packVersionNow();
  writeManifest(target, wantedPlugins(), packVersion);
  if (args.emitPack) {
    await emitPluginPack(target, wantedPlugins());
  }
  process.stdout.write(`Wrote ${runtimeDir}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message || error}\n`);
  process.exit(1);
});
