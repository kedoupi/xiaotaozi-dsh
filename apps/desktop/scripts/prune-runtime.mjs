/**
 * Strip installer-only junk from a packed runtime tree.
 * Does not change which Node / Python / dsh / plugins ship — only drops
 * headers, docs, maps, types, tests, and other-OS native addons.
 */
import {
  chmodSync,
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";

const FOREIGN_NATIVE_TOKENS = [
  "darwin-arm64",
  "darwin_arm64",
  "darwin-x64",
  "darwin_x64",
  "win32-arm64",
  "win32-x64",
  "win32-ia32",
  "linux-arm64",
  "linux-x64",
  "linux-arm",
  "linuxmusl-arm64",
  "linuxmusl-x64",
  "aarch64-apple-darwin",
  "x86_64-apple-darwin",
  "wasm32",
];

const KEEP_TOKENS = {
  "darwin-arm64": ["darwin-arm64", "darwin_arm64", "aarch64-apple-darwin"],
  "darwin-x64": ["darwin-x64", "darwin_x64", "x86_64-apple-darwin"],
  "win-x64": ["win32-x64", "windows-x64"],
  "win-arm64": ["win32-arm64", "windows-arm64"],
};

const KEEP_DOC = /^(license|licence|notice|copying)(\.|$)/iu;
const DROP_DOC = /^(readme|changelog|changes|history|contributing|code_of_conduct|security|authors)(\.|$)/iu;
const DROP_TEST_DIR = new Set(["test", "tests", "__tests__", "__mocks__", ".yarn"]);

export function keepNativeTokens(target) {
  const keep = KEEP_TOKENS[target];
  if (!keep) throw new Error(`unknown runtime target ${target}`);
  return keep;
}

export function isForeignNativeName(name, target) {
  const keep = keepNativeTokens(target);
  const lower = name.toLowerCase();
  if (keep.some((token) => lower.includes(token))) return false;
  return FOREIGN_NATIVE_TOKENS.some((token) => lower.includes(token));
}

function isWin(target) {
  return target.startsWith("win-");
}

function isInstalledPackageDir(path) {
  if (!existsSync(join(path, "package.json"))) return false;
  const parent = basename(dirname(path));
  return parent === "node_modules" || parent.startsWith("@");
}

function shouldDropDir(name, path, target) {
  if (isForeignNativeName(name, target)) return true;
  if (name === "conpty" && !isWin(target)) return true;
  if (name === "artifacts" && basename(dirname(path)) === "pnpm") return true;
  if (name === "@types" && basename(dirname(path)) === "node_modules") return true;
  if (!DROP_TEST_DIR.has(name)) return false;
  return !isInstalledPackageDir(path);
}

function shouldDropFile(name, target) {
  if (name.endsWith(".map")) return true;
  if (name.endsWith(".d.ts") || name.endsWith(".d.cts") || name.endsWith(".d.mts")) return true;
  if (name.endsWith(".pdb")) return true;
  if (!isWin(target) && (name.endsWith(".exe") || name.endsWith(".dll"))) return true;
  if (KEEP_DOC.test(name)) return false;
  return DROP_DOC.test(name);
}

function pruneTree(root, target) {
  if (!existsSync(root)) return;
  const walk = (dir) => {
    let names;
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const path = join(dir, name);
      let st;
      try {
        st = lstatSync(path);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        if (shouldDropDir(name, path, target)) {
          rmSync(path, { recursive: true, force: true });
          continue;
        }
        walk(path);
        continue;
      }
      if (st.isFile() && shouldDropFile(name, target)) {
        rmSync(path, { force: true });
      }
    }
  };
  walk(root);
}

function rmIfPresent(path) {
  rmSync(path, { recursive: true, force: true });
}

export function pruneNodeDist(nodeRoot) {
  if (!existsSync(nodeRoot)) return;
  rmIfPresent(join(nodeRoot, "include"));
  rmIfPresent(join(nodeRoot, "share"));
  rmIfPresent(join(nodeRoot, "CHANGELOG.md"));
  rmIfPresent(join(nodeRoot, "README.md"));
  rmIfPresent(join(nodeRoot, "lib", "node_modules", "npm"));
  rmIfPresent(join(nodeRoot, "lib", "node_modules", "corepack"));
  rmIfPresent(join(nodeRoot, "node_modules", "npm"));
  rmIfPresent(join(nodeRoot, "node_modules", "corepack"));
  for (const name of ["npm", "npx", "corepack", "npm.cmd", "npx.cmd", "corepack.cmd", "npm.ps1", "npx.ps1", "corepack.ps1"]) {
    rmIfPresent(join(nodeRoot, "bin", name));
    rmIfPresent(join(nodeRoot, name));
  }
}

export function prunePythonDist(pythonRoot) {
  if (!existsSync(pythonRoot)) return;
  rmIfPresent(join(pythonRoot, "include"));
  rmIfPresent(join(pythonRoot, "share"));
  const libPy = join(pythonRoot, "lib", "python3.12");
  rmIfPresent(join(libPy, "idlelib"));
  rmIfPresent(join(libPy, "ensurepip"));
  rmIfPresent(join(libPy, "turtledemo"));
  const bin = existsSync(join(pythonRoot, "bin")) ? join(pythonRoot, "bin") : pythonRoot;
  for (const name of [
    "2to3",
    "2to3-3.12",
    "idle3",
    "idle3.12",
    "pydoc3",
    "pydoc3.12",
    "python3-config",
    "python3.12-config",
  ]) {
    rmIfPresent(join(bin, name));
  }
}

const UNIX_PYTHON_WRAPPER = `#!/bin/sh
exec "$(dirname -- "$0")/python3.12" "$@"
`;

function pythonBinDir(pythonRoot) {
  return existsSync(join(pythonRoot, "bin")) ? join(pythonRoot, "bin") : pythonRoot;
}

function sameFileBytes(a, b) {
  const left = lstatSync(a);
  const right = lstatSync(b);
  if (!left.isFile() || !right.isFile() || left.size !== right.size) return false;
  return readFileSync(a).equals(readFileSync(b));
}

function isUnixPythonWrapper(path) {
  let st;
  try {
    st = lstatSync(path);
  } catch {
    return false;
  }
  if (!st.isFile() || st.isSymbolicLink() || st.size > 512) return false;
  const body = readFileSync(path, "utf8");
  return body.includes("python3.12") && body.includes("exec");
}

function shouldRewriteUnixAlias(path, canonical) {
  if (isUnixPythonWrapper(path)) return false;
  if (!existsSync(path)) return false;
  const st = lstatSync(path);
  if (st.isSymbolicLink()) {
    const target = readlinkSync(path);
    return basename(target) === "python3.12";
  }
  if (!st.isFile()) return false;
  return sameFileBytes(path, canonical);
}

function rewriteUnixPythonAliases(pythonRoot) {
  const bin = pythonBinDir(pythonRoot);
  const canonical = join(bin, "python3.12");
  if (!existsSync(canonical) || lstatSync(canonical).isSymbolicLink()) return 0;
  let written = 0;
  for (const name of ["python", "python3"]) {
    const path = join(bin, name);
    if (!shouldRewriteUnixAlias(path, canonical)) continue;
    rmIfPresent(path);
    writeFileSync(path, UNIX_PYTHON_WRAPPER);
    chmodSync(path, 0o755);
    written += 1;
  }
  return written;
}

function rewriteWinPythonAliases(pythonRoot) {
  const exe = join(pythonRoot, "python.exe");
  const py3 = join(pythonRoot, "python3.exe");
  if (!existsSync(exe) || !existsSync(py3)) return 0;
  if (!sameFileBytes(exe, py3)) return 0;
  rmIfPresent(py3);
  return 1;
}

/**
 * python / python3 become tiny exec wrappers so Tauri resource copy
 * does not triplicate the interpreter. Version stays python3.12.
 */
export function rewritePythonAliases(pythonRoot, target) {
  if (!existsSync(pythonRoot)) return 0;
  return isWin(target) ? rewriteWinPythonAliases(pythonRoot) : rewriteUnixPythonAliases(pythonRoot);
}

export function pruneRuntime(runtimeDir, target) {
  if (!KEEP_TOKENS[target]) throw new Error(`unknown runtime target ${target}`);
  pruneNodeDist(join(runtimeDir, "node"));
  prunePythonDist(join(runtimeDir, "python"));
  pruneTree(join(runtimeDir, "node"), target);
  pruneTree(join(runtimeDir, "python"), target);
  pruneTree(join(runtimeDir, "dsh"), target);
  pruneTree(join(runtimeDir, "profile"), target);
  rewritePythonAliases(join(runtimeDir, "python"), target);
}
