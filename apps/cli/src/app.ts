import { randomUUID } from "node:crypto";
import { access, link, lstat, mkdir, readFile, readdir, realpath, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parseStartArgs, resolveStartPort } from "./flags";
import {
  expandAllowBuildKeysForDefaultPlugins,
  parseAllowBuildKeys,
  seedAllowBuildKeys,
  withAllowBuilds,
} from "./allow-builds";
import { officialDshHome, officialProfileDir } from "./home";
import {
  HOST_TOOLS_PACKAGE,
  HOST_TOOLS_RELATIVE_LINK,
  hostToolsFallbackPath,
  hostToolsProfilePath,
  packageVersionFromJson,
  planHostToolsHeal,
  type PathKind,
} from "./host-packages";
import type { CliMetadata } from "./metadata";
import { readCliMetadata } from "./metadata";
import { nodeSatisfiesEngine } from "./node-engine";
import { DEFAULT_PLUGINS, OFFICIAL_BUNDLED_PLUGINS, RETIRED_OFFICIAL_PLUGINS, isAllowedPluginSpec } from "./plugin-spec";
import {
  PROFILE_RECONCILE_COMMITTED,
  copyProfileWithoutNodeModules,
  defaultPluginSpecMismatches,
  parseProfileManifest,
  preservedManifestJson,
  profileSnapshot,
  type ProfileManifest,
} from "./profile-reconciliation";
import { pluginPathSpec, pluginSlugFromPackage, sandboxProcessMarker } from "./repo";
import type { CommandResult, SpawnedDsh, StopProcessResult } from "./runtime";
import {
  executeDsh,
  processAlive,
  readProcessIdentity,
  spawnDshDetached,
  spawnDshForeground,
  stopProcess,
} from "./runtime";
import { openUrl } from "./open-url";
import { SANDBOX_PORT, alternatePorts, serviceUrl, webLaunchArgs } from "./ports";
import {
  WEB_PID_FILE,
  WEB_READY_ATTEMPTS,
  WEB_READY_DELAY_MS,
  XTZ_STAMP_FILE,
  parseWebPidRecord,
  parseXtzStamp,
} from "./service";
import type { WebPidRecord } from "./service";
import type { ServiceStatus } from "./status";
import { OFFICIAL_HOST, OFFICIAL_PORT, probeService } from "./status";

type Writer = (text: string) => void;

export interface CliDependencies {
  metadata: CliMetadata;
  home: string;
  sandbox: boolean;
  repoRoot: string | null;
  nodeVersion: string;
  stdout: Writer;
  stderr: Writer;
  cwd: string;
  runDsh(args: string[], options?: { capture?: boolean; cwd?: string }): Promise<CommandResult>;
  spawnWeb(args: string[], options?: { foreground?: boolean }): Promise<SpawnedDsh>;
  probe(port?: number): Promise<ServiceStatus>;
  openUrl(url: string): Promise<void>;
  isInteractive(): boolean;
  ask(question: string): Promise<string | null>;
  readText(path: string): Promise<string | null>;
  ensureDirectory(path: string): Promise<void>;
  writeText(path: string, text: string): Promise<void>;
  createExclusive(path: string, text: string): Promise<boolean>;
  readExclusive(path: string): Promise<string | null>;
  replaceExclusive(path: string, text: string): Promise<void>;
  ownsExclusive(path: string, text: string): Promise<boolean>;
  removeExclusive(path: string, text: string): Promise<boolean>;
  listDirectory(path: string): Promise<string[]>;
  removePath(path: string): Promise<void>;
  copyProfile(source: string, target: string): Promise<void>;
  profileSnapshot(path: string): Promise<Record<string, string>>;
  movePath(source: string, target: string): Promise<void>;
  removeTree(path: string): Promise<void>;
  pathExists(path: string): Promise<boolean>;
  realPath(path: string): Promise<string>;
  lstatKind?(path: string): Promise<PathKind>;
  replaceWithSymlink?(path: string, target: string): Promise<void>;
  processAlive(pid: number): boolean;
  processIdentity?(pid: number): Promise<string | null>;
  stopPid(pid: number, identity?: string): Promise<void | StopProcessResult>;
  wait(ms: number): Promise<void>;
  now(): string;
}

interface DoctorCheck {
  id: string;
  level: "ok" | "warning" | "error";
  message: string;
}

const DESKTOP_STAMP = "xiaotaozi-desktop.json";
const PROFILE_RECONCILE_BACKUP = ".web-reconcile-backup";
const PROFILE_RECONCILE_LOCK_PREFIX = "xiaotaozi-xtz-reconcile.lock.";
const RECONCILE_LOCK_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PROFILE_TRANSACTION_DIRS = [
  ".web-staging",
  ".web-backup",
  ".web-retired",
  ".web-seeding",
  ".xiaotaozi-pack",
];
const CORE_PROFILE_BUNDLES = ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"] as const;
const REQUIRED_PROFILE_BUNDLES = [...CORE_PROFILE_BUNDLES, ...OFFICIAL_BUNDLED_PLUGINS] as const;

const HELP = `小桃子 CLI（xtz）

用法：
  xtz
  xtz <命令> [参数]

直接运行 xtz 会在后台启动小桃子（第一次会种上自研插件），打印地址并打开浏览器。

命令：
  start [--port <端口>] [--foreground] [--no-open]
                         启动（与直接运行 xtz 相同）
  stop                   停止 xtz 自己拉起的服务
  restart                重启 xtz 自己拉起的服务
  open                   打开当前地址
  status [--json]        查看是否在运行
  doctor [--json]        诊断 Node、DSH、profile 与端口
  version [--json]       显示 xtz、DSH 与 Node 版本
  help                   显示本说明

说明：
  默认地址是 127.0.0.1:3080，数据在 ~/.dsh。
  只管理 xtz 自己记下的进程，不结束别人的程序，不用 3081。
  3080 被其他程序占用时，交互下可改用 3082 起；脚本请加 --port。
  额外插件在小桃子市场里安装，不必在终端里装。
  仓库调试：xtz --sandbox start --foreground（由 pnpm dev 调用；固定 .dsh-home:3081）。
`;

function line(write: Writer, text = ""): void {
  write(`${text}\n`);
}

function usageError(deps: CliDependencies, message: string): number {
  line(deps.stderr, `错误：${message}`);
  line(deps.stderr, "运行 xtz --help 查看用法。");
  return 2;
}

function optionalJson(args: string[]): boolean | null {
  if (args.length === 0) return false;
  if (args.length === 1 && args[0] === "--json") return true;
  return null;
}

function isContained(candidate: string, root: string): boolean {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function sandboxPluginDir(repoRoot: string, name: string): string {
  return resolve(repoRoot, "plugins", pluginSlugFromPackage(name));
}

function pluginNameFromSpec(spec: string): string {
  const fromDefault = DEFAULT_PLUGINS.find((plugin) => plugin.spec === spec);
  if (fromDefault) return fromDefault.name;
  const pathMatch = /(?:^|[&#])path:plugins\/([a-z][a-z0-9-]*)/u.exec(spec);
  if (pathMatch) return `dsh-${pathMatch[1]}`;
  return spec;
}

function sandboxLinkTarget(
  name: string,
  spec: string,
  packageJson: string,
  repoRoot: string,
): string | null {
  if (!spec.startsWith("link:")) return null;
  const raw = spec.slice("link:".length);
  if (raw.length === 0) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (/[\u0000-\u001f\u007f]/u.test(decoded)) return null;
  const target = isAbsolute(decoded) ? resolve(decoded) : resolve(dirname(packageJson), decoded);
  return isContained(target, sandboxPluginDir(repoRoot, name)) ? target : null;
}

function dependencyEntries(pkg: Record<string, unknown>): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const key of ["dependencies", "devDependencies", "optionalDependencies"]) {
    const bag = pkg[key];
    if (bag === null || typeof bag !== "object" || Array.isArray(bag)) continue;
    for (const [name, spec] of Object.entries(bag)) {
      if (typeof spec === "string") entries.push([name, spec]);
    }
  }
  return entries;
}

function hasDependency(pkg: Record<string, unknown>, name: string): boolean {
  return dependencyEntries(pkg).some(([candidate]) => candidate === name);
}

function hasDependencyOutsidePrimary(pkg: Record<string, unknown>, name: string): boolean {
  return [pkg.devDependencies, pkg.optionalDependencies].some((bag) => (
    bag !== null && typeof bag === "object" && !Array.isArray(bag) && Object.hasOwn(bag, name)
  ));
}

function localFileTarget(spec: string, packageJson: string): string | null {
  if (!spec.startsWith("file:")) return null;
  const raw = spec.slice("file:".length);
  if (raw.length === 0) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  // Treat both separators as structural so a Windows path cannot look harmless
  // when a profile is inspected on another platform.
  const normalized = decoded.replaceAll("\\", "/");
  if (
    /[\u0000-\u001f\u007f]/u.test(normalized)
    || normalized.includes("?")
    || normalized.includes("#")
    || normalized.startsWith("//")
    || /^[A-Za-z]:\//u.test(normalized)
    || isAbsolute(normalized)
  ) {
    return null;
  }
  return resolve(dirname(packageJson), normalized);
}

function isLocalDependencySpec(spec: string): boolean {
  return spec.startsWith(".")
    || spec.startsWith("/")
    || spec.startsWith("~")
    || spec.startsWith("\\")
    || spec.startsWith("workspace:")
    || spec.startsWith("path:")
    || spec.startsWith("portal:")
    || spec.startsWith("directory:")
    || spec.startsWith("git+file:")
    || /^[A-Za-z]:[\\/]/u.test(spec);
}

function packedVendorSpec(name: string, spec: string): boolean {
  if (!spec.startsWith("file:")) return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(spec.slice("file:".length)).replaceAll("\\", "/");
  } catch {
    return false;
  }
  const match = /^\.\/vendor\/([A-Za-z0-9@._+-]+\.tgz)$/u.exec(decoded);
  if (match === null) return false;
  const file = match[1];
  return !OFFICIAL_BUNDLED_PLUGINS.includes(name as typeof OFFICIAL_BUNDLED_PLUGINS[number])
    || file === `${name}.tgz`
    || file.startsWith(`${name}-`);
}

function inspectXtzStamp(text: string | null, expectedVersion: string): DoctorCheck {
  if (text === null) {
    return { id: "xtz-seed", level: "error", message: "缺少 xtz 安装戳；请先运行 xtz start" };
  }
  try {
    const stamp = JSON.parse(text) as { writer?: unknown; createdAt?: unknown; productVersion?: unknown };
    if (stamp.writer !== "xtz") {
      return { id: "xtz-seed", level: "error", message: "xtz 安装戳 writer 无效" };
    }
    if (typeof stamp.createdAt !== "string" || stamp.createdAt.length === 0) {
      return { id: "xtz-seed", level: "error", message: "xtz 安装戳缺少 createdAt" };
    }
    return stamp.productVersion === expectedVersion
      ? { id: "xtz-seed", level: "ok", message: `xtz ${expectedVersion} 已初始化（${stamp.createdAt}）` }
      : { id: "xtz-seed", level: "warning", message: `安装戳不是当前产品 ${expectedVersion}；请运行 xtz restart` };
  } catch {
    return { id: "xtz-seed", level: "error", message: "xtz 安装戳不是有效 JSON" };
  }
}

function inspectLeftoverDesktopStamp(text: string | null): DoctorCheck | null {
  if (text === null) return null;
  return {
    id: "desktop-leftover",
    level: "warning",
    message: "发现遗留 Desktop 安装戳；产品路径是 xtz，不要再发 pack",
  };
}

function profileBundles(pkg: Record<string, unknown>): string[] {
  const dsh = pkg.dsh;
  if (dsh === null || typeof dsh !== "object" || Array.isArray(dsh)) return [];
  const profile = (dsh as Record<string, unknown>).profile;
  if (profile === null || typeof profile !== "object" || Array.isArray(profile)) return [];
  const bundles = (profile as Record<string, unknown>).bundles;
  return Array.isArray(bundles) ? bundles.filter((item): item is string => typeof item === "string") : [];
}

async function inspectProfile(deps: CliDependencies): Promise<DoctorCheck[]> {
  const profileDir = officialProfileDir(deps.home);
  const packageJson = join(profileDir, "package.json");
  const text = await deps.readText(packageJson);
  if (text === null) {
    return [{ id: "profile", level: "error", message: "官方 Web profile 尚未初始化；请先运行 xtz start" }];
  }

  const pkg = parseProfileManifest(text);
  if (pkg === null) {
    return [{ id: "profile", level: "error", message: "官方 Web profile/package.json 不是有效 JSON object" }];
  }

  const checks: DoctorCheck[] = [];
  checks.push(await safeOfficialDirectory(deps, profileDir, "web")
    ? { id: "profile-path", level: "ok", message: "Web profile 是官方 DSH home 内的真实目录" }
    : { id: "profile-path", level: "error", message: "Web profile 必须是官方 DSH home/profiles 下的真实目录" });
  const dependencies = pkg.dependencies !== null
    && typeof pkg.dependencies === "object"
    && !Array.isArray(pkg.dependencies)
    ? pkg.dependencies as Record<string, unknown>
    : {};
  const bundles = new Set(profileBundles(pkg));
  const missingCoreBundles = CORE_PROFILE_BUNDLES.filter((name) => !bundles.has(name));
  checks.push(missingCoreBundles.length === 0
    ? { id: "profile-core-bundles", level: "ok", message: "Web profile 包含 DSH 核心 bundles" }
    : {
      id: "profile-core-bundles",
      level: "error",
      message: `Web profile 缺少 DSH 核心 bundle：${missingCoreBundles.join(", ")}`,
    });
  const missingBundles = OFFICIAL_BUNDLED_PLUGINS.filter((name) => !bundles.has(name));
  const missingDependencies = OFFICIAL_BUNDLED_PLUGINS.filter((name) => typeof dependencies[name] !== "string");
  const misplacedDependencies = OFFICIAL_BUNDLED_PLUGINS.filter((name) => hasDependencyOutsidePrimary(pkg, name));
  const retiredEntries = RETIRED_OFFICIAL_PLUGINS.filter((name) => bundles.has(name) || hasDependency(pkg, name));
  if (missingBundles.length > 0 || missingDependencies.length > 0 || misplacedDependencies.length > 0 || retiredEntries.length > 0) {
    const details = [
      missingBundles.length > 0 ? `缺少 bundles：${missingBundles.join(", ")}` : null,
      missingDependencies.length > 0 ? `缺少依赖：${missingDependencies.join(", ")}` : null,
      misplacedDependencies.length > 0 ? `默认插件出现在非 dependencies 字段：${misplacedDependencies.join(", ")}` : null,
      retiredEntries.length > 0 ? `仍含退役插件：${retiredEntries.join(", ")}` : null,
    ].filter((item): item is string => item !== null);
    checks.push({ id: "profile-bundles", level: "error", message: `Web profile 的默认插件集合不完整（${details.join("；")}）` });
  } else {
    checks.push({ id: "profile-bundles", level: "ok", message: "Web profile 包含默认插件" });
  }
  const mismatches = deps.sandbox ? [] : defaultPluginSpecMismatches(pkg, DEFAULT_PLUGINS);
  checks.push(mismatches.length === 0
    ? { id: "profile-default-specs", level: "ok", message: "默认插件规格与当前产品一致" }
    : {
      id: "profile-default-specs",
      level: "error",
      message: `默认插件不是当前产品快照：${mismatches.join(", ")}；请运行 xtz restart`,
    });

  const nodeModules = join(profileDir, "node_modules");
  const missingInstalls: string[] = [];
  const escapedInstalls: string[] = [];
  const invalidInstalls: string[] = [];
  const retiredInstalls: string[] = [];
  if (!(await deps.pathExists(nodeModules))) {
    missingInstalls.push("node_modules");
  } else {
    try {
      const canonicalProfile = await deps.realPath(profileDir);
      const canonicalNodeModules = await deps.realPath(nodeModules);
      if (!isContained(canonicalNodeModules, canonicalProfile)) {
        escapedInstalls.push("node_modules（越出 Web profile）");
      }
      for (const name of OFFICIAL_BUNDLED_PLUGINS) {
        const install = join(nodeModules, name);
        if (!(await deps.pathExists(install))) {
          missingInstalls.push(name);
          continue;
        }
        try {
          const canonicalInstall = await deps.realPath(install);
          const inProfile = isContained(canonicalInstall, canonicalNodeModules);
          const inSandboxPlugin = deps.sandbox && deps.repoRoot !== null
            && isContained(canonicalInstall, sandboxPluginDir(deps.repoRoot, name));
          if (!inProfile && !inSandboxPlugin) escapedInstalls.push(`${name}（越出 node_modules）`);
        } catch {
          escapedInstalls.push(`${name}（无法解析真实路径）`);
        }
        const manifestText = await deps.readText(join(install, "package.json"));
        if (manifestText === null) {
          invalidInstalls.push(`${name}（缺少 package.json）`);
        } else {
          try {
            const manifest = JSON.parse(manifestText) as { name?: unknown; version?: unknown };
            if (manifest.name !== name || typeof manifest.version !== "string" || manifest.version.length === 0) {
              invalidInstalls.push(`${name}（package.json 的 name/version 无效）`);
            }
          } catch {
            invalidInstalls.push(`${name}（package.json 不是有效 JSON）`);
          }
        }
      }
      for (const name of RETIRED_OFFICIAL_PLUGINS) {
        if (await pathKind(deps, join(nodeModules, name)) !== "missing") retiredInstalls.push(name);
      }
    } catch {
      escapedInstalls.push("node_modules（无法验证真实路径）");
    }
  }
  if (escapedInstalls.length > 0) {
    checks.push({
      id: "profile-install-safety",
      level: "error",
      message: `Web profile 安装路径不安全：${escapedInstalls.join("，")}`,
    });
  }
  if (missingInstalls.length > 0 || invalidInstalls.length > 0 || retiredInstalls.length > 0) {
    const details = [
      ...missingInstalls.map((name) => `缺少 ${name}`),
      ...invalidInstalls,
      ...retiredInstalls.map((name) => `仍安装退役插件 ${name}`),
    ];
    checks.push({ id: "profile-install", level: "error", message: `Web profile 安装不完整：${details.join("，")}` });
  } else {
    checks.push({
      id: "profile-install",
      level: "ok",
      message: deps.sandbox
        ? "Web profile 的默认插件已通过沙箱 link: 安装"
        : "Web profile 的默认插件均已安装在 profile 内",
    });
  }

  const unsafe: string[] = [];
  const fileEntries: Array<[string, string, string]> = [];
  for (const [name, spec] of dependencyEntries(pkg)) {
    if (spec.startsWith("link:")) {
      if (deps.sandbox && deps.repoRoot !== null && sandboxLinkTarget(name, spec, packageJson, deps.repoRoot) !== null) {
        continue;
      }
      unsafe.push(`${name}（link: 不允许）`);
      continue;
    }
    if (isLocalDependencySpec(spec)) {
      unsafe.push(`${name}（正式 profile 禁止本地路径 dependency）`);
      continue;
    }
    if (spec.startsWith("file:")) {
      if (!packedVendorSpec(name, spec)) {
        unsafe.push(`${name}（仅允许 file:./vendor/*.tgz 历史制品）`);
        continue;
      }
    } else {
      const isPlugin = name.startsWith("dsh-") || bundles.has(name);
      if (isPlugin && !isAllowedPluginSpec(spec)) {
        unsafe.push(`${name}（插件必须来自 github: / npm，或遗留的 file:./vendor/*.tgz）`);
        continue;
      }
      continue;
    }
    const target = localFileTarget(spec, packageJson);
    if (target === null) {
      unsafe.push(`${name}（file: 路径无效或为绝对路径）`);
    } else {
      fileEntries.push([name, spec, target]);
    }
  }

  if (fileEntries.length > 0) {
    const vendor = join(profileDir, "vendor");
    if (!(await deps.pathExists(vendor))) {
      unsafe.push("profile vendor（目录不存在）");
    } else {
      let canonicalVendor: string | null = null;
      try {
        canonicalVendor = await deps.realPath(vendor);
      } catch {
        unsafe.push("profile vendor（无法解析真实路径）");
      }
      if (canonicalVendor !== null) {
        try {
          const canonicalProfile = await deps.realPath(profileDir);
          if (!isContained(canonicalVendor, canonicalProfile)) {
            unsafe.push("profile vendor（越出 Web profile）");
            canonicalVendor = null;
          }
        } catch {
          unsafe.push("Web profile（无法解析真实路径）");
          canonicalVendor = null;
        }
      }
      if (canonicalVendor !== null) {
        for (const [name, , target] of fileEntries) {
          if (await pathKind(deps, target) !== "file") {
            unsafe.push(`${name}（file: 目标必须是普通 tarball 文件）`);
            continue;
          }
          try {
            const canonicalTarget = await deps.realPath(target);
            if (!isContained(canonicalTarget, canonicalVendor)) {
              unsafe.push(`${name}（file: 目标越出 profile/vendor）`);
            }
          } catch {
            unsafe.push(`${name}（file: 无法解析真实路径）`);
          }
        }
      }
    }
  }

  checks.push(unsafe.length === 0
    ? {
      id: "profile-links",
      level: "ok",
      message: deps.sandbox
        ? "沙箱 Web profile 的自研插件 link: 均指向仓库 plugins/"
        : "Web profile 插件来自 Git/npm 或遗留 vendor，且未发现 link: 或越界 file: 依赖",
    }
    : { id: "profile-links", level: "error", message: `Web profile 含不安全依赖来源：${unsafe.join("，")}` });
  if (!deps.sandbox) checks.push(await inspectHostTools(deps));
  return checks;
}

async function pathKind(deps: CliDependencies, path: string): Promise<PathKind> {
  if (deps.lstatKind) return await deps.lstatKind(path);
  try {
    const stats = await lstat(path);
    if (stats.isSymbolicLink()) return "symlink";
    if (stats.isDirectory()) return "directory";
    if (stats.isFile()) return "file";
    return "other";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return "missing";
    throw error;
  }
}

async function sameRealPath(deps: CliDependencies, left: string, right: string): Promise<boolean> {
  try {
    return await deps.realPath(left) === await deps.realPath(right);
  } catch {
    return false;
  }
}

async function safeProfilesRoot(deps: CliDependencies): Promise<boolean> {
  const profiles = join(deps.home, "profiles");
  if (await pathKind(deps, deps.home) !== "directory" || await pathKind(deps, profiles) !== "directory") return false;
  try {
    const canonicalHome = resolve(await deps.realPath(deps.home));
    const canonicalProfiles = resolve(await deps.realPath(profiles));
    return canonicalProfiles === resolve(canonicalHome, "profiles");
  } catch {
    return false;
  }
}

async function safeOfficialDirectory(
  deps: CliDependencies,
  path: string,
  name: string,
): Promise<boolean> {
  const profiles = join(deps.home, "profiles");
  if (!await safeProfilesRoot(deps) || await pathKind(deps, path) !== "directory") return false;
  try {
    const canonicalProfiles = resolve(await deps.realPath(profiles));
    const canonicalPath = resolve(await deps.realPath(path));
    return canonicalPath === resolve(canonicalProfiles, name);
  } catch {
    return false;
  }
}

async function removeContainedProfileInstall(deps: CliDependencies, name: string): Promise<boolean> {
  const profile = officialProfileDir(deps.home);
  const nodeModules = join(profile, "node_modules");
  const install = join(nodeModules, name);
  if (!await safeOfficialDirectory(deps, profile, "web") || await pathKind(deps, nodeModules) !== "directory") return false;
  try {
    const canonicalProfile = resolve(await deps.realPath(profile));
    const canonicalNodeModules = resolve(await deps.realPath(nodeModules));
    if (canonicalNodeModules !== resolve(canonicalProfile, "node_modules")) return false;
  } catch {
    return false;
  }
  const kind = await pathKind(deps, install);
  if (kind === "missing") return true;
  if (kind === "symlink" || kind === "file" || kind === "other") {
    await deps.removePath(install);
    return true;
  }
  try {
    if (resolve(await deps.realPath(install)) !== resolve(await deps.realPath(nodeModules), name)) return false;
  } catch {
    return false;
  }
  await deps.removeTree(install);
  return true;
}

function withoutRetiredBundles(manifest: ProfileManifest): ProfileManifest {
  const copy = structuredClone(manifest);
  const bundles = copy.dsh?.profile?.bundles;
  if (Array.isArray(bundles)) {
    const retired = new Set<string>(RETIRED_OFFICIAL_PLUGINS);
    copy.dsh!.profile!.bundles = bundles.filter((name) => typeof name !== "string" || !retired.has(name));
  }
  return copy;
}

async function safeHostToolsParent(deps: CliDependencies): Promise<boolean> {
  const profile = officialProfileDir(deps.home);
  const nodeModules = join(profile, "node_modules");
  const scope = join(nodeModules, "@deepseek-ai");
  if (!await safeOfficialDirectory(deps, profile, "web")
    || await pathKind(deps, nodeModules) !== "directory"
    || await pathKind(deps, scope) !== "directory") return false;
  try {
    const canonicalProfile = resolve(await deps.realPath(profile));
    const canonicalNodeModules = resolve(await deps.realPath(nodeModules));
    const canonicalScope = resolve(await deps.realPath(scope));
    return canonicalNodeModules === resolve(canonicalProfile, "node_modules")
      && canonicalScope === resolve(canonicalNodeModules, "@deepseek-ai");
  } catch {
    return false;
  }
}

async function readHostTools(deps: CliDependencies) {
  const profilePath = hostToolsProfilePath(deps.home);
  const fallbackPath = hostToolsFallbackPath(deps.home);
  const profileKind = await pathKind(deps, profilePath);
  const fallbackKind = await pathKind(deps, fallbackPath);
  const alreadySame = await sameRealPath(deps, profilePath, fallbackPath);
  return {
    profilePath,
    profileKind,
    alreadySame,
    profileVersion: packageVersionFromJson(await deps.readText(join(profilePath, "package.json"))),
    fallbackKind,
    fallbackVersion: packageVersionFromJson(await deps.readText(join(fallbackPath, "package.json"))),
  };
}

async function inspectHostTools(deps: CliDependencies): Promise<DoctorCheck> {
  const state = await readHostTools(deps);
  if (state.profileKind === "other" || state.fallbackKind === "other") {
    return { id: "host-tools-path", level: "error", message: `${HOST_TOOLS_PACKAGE} 必须是普通文件、目录或符号链接` };
  }
  const plan = planHostToolsHeal(state);
  if (plan.action === "link" && !await safeHostToolsParent(deps)) {
    return {
      id: "host-tools-path",
      level: "error",
      message: `${HOST_TOOLS_PACKAGE} 的父目录不安全；拒绝自动修复`,
    };
  }
  if (plan.action === "skip-version-mismatch") {
    return {
      id: "host-tools",
      level: "error",
      message: `Web profile 的 ${HOST_TOOLS_PACKAGE} 与 DSH 安装树版本不同（${plan.profileVersion} / ${plan.fallbackVersion}），未替换。工具调度器可能空指针。`,
    };
  }
  if (plan.action === "link") {
    return {
      id: "host-tools",
      level: "error",
      message: `Web profile 含第二份 ${HOST_TOOLS_PACKAGE}，工具调度器会空指针。请再运行 xtz start 以链回 DSH 安装树。`,
    };
  }
  return {
    id: "host-tools",
    level: "ok",
    message: state.alreadySame
      ? `${HOST_TOOLS_PACKAGE} 与 DSH 安装树为同一份`
      : `未发现第二份 ${HOST_TOOLS_PACKAGE}`,
  };
}

async function healOfficialHostTools(deps: CliDependencies): Promise<void> {
  const state = await readHostTools(deps);
  const plan = planHostToolsHeal(state);
  if (plan.action === "none") return;
  if (plan.action === "link" && !await safeHostToolsParent(deps)) {
    line(deps.stderr, `${HOST_TOOLS_PACKAGE} 的父目录不安全；拒绝自动修复。`);
    return;
  }
  if (plan.action === "skip-version-mismatch") {
    line(
      deps.stderr,
      `${HOST_TOOLS_PACKAGE} 在 Web profile 与 DSH 安装树版本不同（${plan.profileVersion} / ${plan.fallbackVersion}），未替换。`,
    );
    return;
  }
  const replace = deps.replaceWithSymlink ?? replacePathWithSymlink;
  try {
    await replace(state.profilePath, HOST_TOOLS_RELATIVE_LINK);
  } catch {
    line(
      deps.stderr,
      `未能将 ${HOST_TOOLS_PACKAGE} 链回 DSH 安装树（无法创建符号链接）。xtz start 继续；请运行 xtz doctor。`,
    );
    return;
  }
  line(deps.stdout, `已将 ${HOST_TOOLS_PACKAGE} 链回 DSH 安装树，避免第二份调度器。`);
}

async function replacePathWithSymlink(path: string, target: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
  await mkdir(dirname(path), { recursive: true });
  await symlink(target, path);
}

async function inspectTransactions(deps: CliDependencies): Promise<DoctorCheck> {
  const profilesDir = join(deps.home, "profiles");
  if (await pathKind(deps, join(profilesDir, PROFILE_RECONCILE_BACKUP)) !== "missing") {
    return {
      id: "profile-transaction",
      level: "error",
      message: `发现未完成的 Web profile 同步事务：${PROFILE_RECONCILE_BACKUP}；start/restart 会先恢复`,
    };
  }
  const active: string[] = [];
  for (const name of PROFILE_TRANSACTION_DIRS) {
    if (await deps.pathExists(join(profilesDir, name))) active.push(name);
  }
  return active.length === 0
    ? { id: "profile-transaction", level: "ok", message: "未发现未完成的遗留 Desktop profile 事务" }
    : { id: "profile-transaction", level: "error", message: `发现未完成的遗留 Desktop profile 事务：${active.join(", ")}` };
}

async function rememberedPort(deps: CliDependencies): Promise<number> {
  if (deps.sandbox) return SANDBOX_PORT;
  const stamp = parseXtzStamp(await deps.readText(stampPath(deps.home)));
  return stamp?.port ?? OFFICIAL_PORT;
}

async function serviceCommand(deps: CliDependencies, args: string[]): Promise<number> {
  const json = optionalJson(args);
  if (json === null) return usageError(deps, "status 只接受一个 --json");
  const port = await rememberedPort(deps);
  const status = await deps.probe(port);
  if (json) {
    line(deps.stdout, JSON.stringify({ ...status, home: deps.home }));
  } else if (status.state === "running") {
    line(deps.stdout, "小桃子正在运行，服务身份已验证。");
    line(deps.stdout, `地址：${status.url}`);
    line(deps.stdout, `Home：${deps.home}`);
  } else if (status.state === "http-occupied") {
    line(deps.stderr, `${status.host}:${status.port} 有 HTTP 服务响应，但不是小桃子。`);
    line(deps.stderr, "xtz 不会把未知服务当成自己的，也不会结束那个进程。");
  } else if (status.state === "port-conflict") {
    line(deps.stderr, `${status.host}:${status.port} 已被其他程序占用；xtz 不会结束那个进程。`);
  } else {
    line(deps.stdout, "小桃子未运行。");
    line(deps.stdout, `地址：${status.url}`);
    line(deps.stdout, `Home：${deps.home}`);
  }
  return status.state === "running" ? 0 : status.state === "stopped" ? 1 : 2;
}

function blockedLifecycleCommand(deps: CliDependencies, command: string): number {
  if (command === "init") {
    line(deps.stderr, "xtz init 已取消。第一次 xtz start 会备好环境和自研插件。");
    return 2;
  }
  const detail = command === "run" || command === "ask"
    ? "对话和任务在浏览器或 IM 里进行，不在终端里派活。"
    : "DSH 展开配置前会准备并改写 profile，当前不能把它作为只读操作。";
  line(deps.stderr, `xtz ${command} 暂未开放：${detail}`);
  line(deps.stderr, "请用 xtz start / stop / restart。额外插件请在小桃子市场里安装。");
  return 2;
}

function pidPath(home: string): string {
  return join(home, WEB_PID_FILE);
}

function stampPath(home: string): string {
  return join(home, XTZ_STAMP_FILE);
}

async function ownedWebPid(deps: CliDependencies): Promise<number | null> {
  const inspected = await inspectWebPid(deps);
  return inspected?.state === "owned" ? inspected.record.pid : null;
}

type WebPidState = "owned" | "not-running" | "reused" | "unavailable";

interface InspectedWebPid {
  record: WebPidRecord;
  state: WebPidState;
}

async function inspectWebPid(deps: CliDependencies): Promise<InspectedWebPid | null> {
  const record = parseWebPidRecord(await deps.readText(pidPath(deps.home)));
  if (record === null) return null;
  if (!deps.processAlive(record.pid)) return { record, state: "not-running" };
  if (record.identity === undefined || deps.processIdentity === undefined) {
    return { record, state: "unavailable" };
  }
  const actual = await deps.processIdentity(record.pid);
  if (actual === null) {
    return { record, state: deps.processAlive(record.pid) ? "unavailable" : "not-running" };
  }
  return { record, state: actual === record.identity ? "owned" : "reused" };
}

async function writeWebPid(deps: CliDependencies, pid: number, identity?: string): Promise<void> {
  await deps.writeText(pidPath(deps.home), JSON.stringify({ pid, startedAt: deps.now(), identity }));
}

async function stopRecordedPid(
  deps: CliDependencies,
  pid: number,
  identity: string | undefined,
): Promise<StopProcessResult> {
  if (identity === undefined) return "identity-unavailable";
  return await deps.stopPid(pid, identity) ?? "identity-unavailable";
}

async function clearWebPid(deps: CliDependencies): Promise<void> {
  await deps.removePath(pidPath(deps.home));
}

async function waitUntilReady(deps: CliDependencies, port: number): Promise<ServiceStatus> {
  let status = await deps.probe(port);
  for (let i = 0; i < WEB_READY_ATTEMPTS && status.state === "stopped"; i += 1) {
    await deps.wait(WEB_READY_DELAY_MS);
    status = await deps.probe(port);
  }
  return status;
}

async function writeXtzStamp(deps: CliDependencies, port: number): Promise<void> {
  const previous = parseXtzStamp(await deps.readText(stampPath(deps.home)));
  await deps.writeText(stampPath(deps.home), JSON.stringify({
    writer: "xtz",
    createdAt: previous?.createdAt ?? deps.now(),
    productVersion: deps.metadata.version,
    plugins: previous?.plugins ?? DEFAULT_PLUGINS.map((plugin) => plugin.name),
    port,
  }));
}

async function tryOpen(deps: CliDependencies, url: string): Promise<void> {
  try {
    await deps.openUrl(url);
  } catch {
    line(deps.stderr, `无法自动打开浏览器，请手动访问 ${url}`);
  }
}

async function warnRunningProfileDrift(deps: CliDependencies): Promise<void> {
  if (deps.sandbox) return;
  try {
    const drift = await officialProfileDrift(deps);
    if (drift.unreadable) {
      line(deps.stdout, "无法安全读取 Web profile；服务保持不动，请运行 xtz doctor。");
    } else if (drift.reasons.length > 0) {
      line(deps.stdout, "检测到新的小桃子产品快照，请运行 xtz restart 完成同步。");
    }
  } catch {
    line(deps.stdout, "无法安全读取 Web profile；服务保持不动，请运行 xtz doctor。");
  }
}

async function announceRunning(deps: CliDependencies, status: ServiceStatus, noOpen = false): Promise<number> {
  line(deps.stdout, `小桃子已启动：${status.url}`);
  if (!noOpen) await tryOpen(deps, status.url);
  return 0;
}

function occupyMessage(status: ServiceStatus): string {
  if (status.state === "port-conflict") {
    return `${status.host}:${status.port} 已被其他程序占用，不是小桃子。`;
  }
  return `${status.host}:${status.port} 有 HTTP 服务，但不是小桃子。`;
}

async function findFreeAlternatePort(deps: CliDependencies): Promise<number | null> {
  for (const port of alternatePorts()) {
    const status = await deps.probe(port);
    if (status.state === "stopped") return port;
  }
  return null;
}

interface OfficialProfileDrift {
  reasons: string[];
  unreadable: boolean;
}

function reconcileBackupDir(home: string): string {
  return join(home, "profiles", PROFILE_RECONCILE_BACKUP);
}

function reconcileLockPath(home: string, token: string): string {
  return join(home, `${PROFILE_RECONCILE_LOCK_PREFIX}${token}`);
}

interface ReconcileLockRecord {
  pid: number;
  identity?: string;
  token: string;
  state: "choosing" | "ready";
  ticket: number;
}

function parseReconcileLock(text: string | null): ReconcileLockRecord | null {
  if (text === null) return null;
  try {
    const parsed = JSON.parse(text) as Partial<ReconcileLockRecord>;
    if (!Number.isInteger(parsed.pid) || (parsed.pid ?? 0) <= 1 || typeof parsed.token !== "string") return null;
    if (parsed.identity !== undefined && typeof parsed.identity !== "string") return null;
    if (parsed.state !== "choosing" && parsed.state !== "ready") return null;
    if (!Number.isSafeInteger(parsed.ticket) || (parsed.ticket ?? -1) < 0) return null;
    return parsed as ReconcileLockRecord;
  } catch {
    return null;
  }
}

interface AcquiredReconcileLock {
  path: string;
  text: string;
}

async function acquireReconcileLock(deps: CliDependencies): Promise<AcquiredReconcileLock | null> {
  const token = randomUUID();
  const path = reconcileLockPath(deps.home, token);
  const identity = deps.processIdentity ? await deps.processIdentity(process.pid) : null;
  let text = JSON.stringify({ pid: process.pid, token, ...(identity ? { identity } : {}), state: "choosing", ticket: 0 });
  if (!await deps.createExclusive(path, text) || !await deps.ownsExclusive(path, text)) return null;

  async function activeContenders(): Promise<ReconcileLockRecord[] | null> {
    const contenders: ReconcileLockRecord[] = [];
    for (const name of await deps.listDirectory(deps.home)) {
      const contenderToken = name.startsWith(PROFILE_RECONCILE_LOCK_PREFIX)
        ? name.slice(PROFILE_RECONCILE_LOCK_PREFIX.length)
        : "";
      if (!RECONCILE_LOCK_TOKEN.test(contenderToken)) continue;
      const contenderPath = join(deps.home, name);
      const contenderText = await deps.readExclusive(contenderPath);
      if (contenderText === null) continue;
      const owner = parseReconcileLock(contenderText);
      if (owner === null || owner.token !== contenderToken) return null;
      let active = owner.token === token || deps.processAlive(owner.pid);
      if (active && owner.token !== token && owner.identity !== undefined && deps.processIdentity) {
        const actual = await deps.processIdentity(owner.pid);
        active = actual === null || actual === owner.identity;
      }
      if (active) contenders.push(owner);
      else await deps.removeExclusive(contenderPath, contenderText);
    }
    return contenders;
  }

  let acquired = false;
  try {
    const choosing = await activeContenders();
    if (choosing === null || choosing.some((owner) => owner.token !== token && owner.state === "choosing")) return null;
    const ticket = Math.max(0, ...choosing.map((owner) => owner.ticket)) + 1;
    text = JSON.stringify({ pid: process.pid, token, ...(identity ? { identity } : {}), state: "ready", ticket });
    await deps.replaceExclusive(path, text);
    if (!await deps.ownsExclusive(path, text)) return null;

    const ready = await activeContenders();
    if (ready === null || ready.some((owner) => owner.state === "choosing")) return null;
    const first = ready.sort((left, right) => left.ticket - right.ticket || left.token.localeCompare(right.token))[0];
    if (first?.token !== token || !await deps.ownsExclusive(path, text)) return null;
    acquired = true;
    return { path, text };
  } finally {
    if (!acquired) await deps.removeExclusive(path, text);
  }
}

async function releaseReconcileLock(deps: CliDependencies, lock: AcquiredReconcileLock): Promise<void> {
  if (await deps.ownsExclusive(lock.path, lock.text)) await deps.removeExclusive(lock.path, lock.text);
}

async function officialProfileDrift(deps: CliDependencies): Promise<OfficialProfileDrift> {
  const profileDir = officialProfileDir(deps.home);
  const manifest = parseProfileManifest(await deps.readText(join(profileDir, "package.json")));
  if (manifest === null) return { reasons: ["Web profile manifest 无法读取"], unreadable: true };
  const reasons = defaultPluginSpecMismatches(manifest, DEFAULT_PLUGINS)
    .map((name) => `${name} 规格不匹配`);
  const bundles = new Set(profileBundles(manifest));
  for (const plugin of DEFAULT_PLUGINS) {
    if (!bundles.has(plugin.name)) reasons.push(`${plugin.name} bundle 缺失`);
    if (hasDependencyOutsidePrimary(manifest, plugin.name)) reasons.push(`${plugin.name} 位于非 dependencies 字段`);
    const install = join(profileDir, "node_modules", plugin.name);
    if (!await deps.pathExists(install)) {
      reasons.push(`${plugin.name} 未安装`);
      continue;
    }
    const installed = parseProfileManifest(await deps.readText(join(install, "package.json")));
    if (installed?.name !== plugin.name || typeof installed.version !== "string" || installed.version.length === 0) {
      reasons.push(`${plugin.name} 安装 manifest 无效`);
    }
  }
  for (const name of RETIRED_OFFICIAL_PLUGINS) {
    if (hasDependency(manifest, name)
      || bundles.has(name)
      || await pathKind(deps, join(profileDir, "node_modules", name)) !== "missing") {
      reasons.push(`${name} 已退役但仍存在`);
    }
  }
  return { reasons, unreadable: false };
}

async function safeReconcileBackup(deps: CliDependencies, backup: string): Promise<boolean> {
  return safeOfficialDirectory(deps, backup, PROFILE_RECONCILE_BACKUP);
}

async function restoreReconcileBackup(deps: CliDependencies): Promise<boolean> {
  const profile = officialProfileDir(deps.home);
  const backup = reconcileBackupDir(deps.home);
  const committed = join(profile, PROFILE_RECONCILE_COMMITTED);
  if (await pathKind(deps, backup) === "missing") {
    const markerKind = await pathKind(deps, committed);
    if (markerKind === "missing") return true;
    if (!await safeOfficialDirectory(deps, profile, "web") || markerKind !== "file") {
      line(deps.stderr, "Web profile 或同步提交标记不是固定路径上的真实文件；拒绝清理。");
      return false;
    }
    await deps.removePath(committed);
    return true;
  }
  if (!await safeReconcileBackup(deps, backup)) {
    line(deps.stderr, `${backup} 不是官方 profiles 内可恢复的真实目录；未修改任何 profile。`);
    return false;
  }
  const safeCandidate = await safeOfficialDirectory(deps, profile, "web");
  let marker: ProfileManifest | null = null;
  if (safeCandidate && await pathKind(deps, committed) === "file") {
    try {
      marker = parseProfileManifest(await deps.readText(committed));
    } catch (error) {
      line(deps.stderr, `无法读取同步提交标记：${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
  if (marker?.writer === "xtz" && marker.state === "committed") {
    try {
      await deps.removeTree(backup);
      await deps.removePath(committed);
      line(deps.stdout, "已完成上次已验证同步的备份清理。");
      return true;
    } catch (error) {
      line(deps.stderr, `清理旧 Web profile 备份失败：${error instanceof Error ? error.message : String(error)}`);
      line(deps.stderr, "已验证候选 profile 保持不动；下次 start/restart 会重试清理。");
      return false;
    }
  }
  try {
    if (await pathKind(deps, profile) !== "missing") await deps.removeTree(profile);
    await deps.movePath(backup, profile);
    line(deps.stdout, "已恢复上次未完成同步前的 Web profile。");
    return true;
  } catch (error) {
    line(deps.stderr, `恢复旧 Web profile 失败：${error instanceof Error ? error.message : String(error)}`);
    line(deps.stderr, `完整备份仍保留在 ${backup}`);
    return false;
  }
}

async function rollbackReconcile(deps: CliDependencies, profile: string, backup: string): Promise<boolean> {
  if (!await safeReconcileBackup(deps, backup)) {
    line(deps.stderr, `无法安全确认旧 Web profile 备份；完整备份仍保留在 ${backup}`);
    return false;
  }
  try {
    if (await pathKind(deps, profile) !== "missing") await deps.removeTree(profile);
    await deps.movePath(backup, profile);
    return true;
  } catch (error) {
    line(deps.stderr, `恢复旧 Web profile 失败：${error instanceof Error ? error.message : String(error)}`);
    line(deps.stderr, `完整备份仍保留在 ${backup}`);
    return false;
  }
}

async function ensureOfficialProfile(deps: CliDependencies): Promise<number> {
  const profileDir = officialProfileDir(deps.home);

  if (deps.sandbox) {
    const prepared = await deps.runDsh(["web", "--dump-default-config"], { capture: true });
    if (prepared.code !== 0) {
      line(deps.stderr, prepared.stderr.trim() || "xtz 无法准备官方 web profile。");
      return prepared.code;
    }
    const packageJson = join(profileDir, "package.json");
    const seededManifest = parseProfileManifest(await deps.readText(packageJson));
    if (seededManifest === null) return 1;
    const seededDependencies = seededManifest.dependencies ?? {};
    const missing = [] as string[];
    for (const plugin of DEFAULT_PLUGINS) {
      const current = seededDependencies[plugin.name];
      const spec = typeof current === "string" ? current : "";
      const target = deps.repoRoot === null ? null : sandboxLinkTarget(plugin.name, spec, packageJson, deps.repoRoot);
      if (!await deps.pathExists(join(profileDir, "node_modules", plugin.name))
        || target !== sandboxPluginDir(deps.repoRoot ?? "", plugin.name)
        || hasDependencyOutsidePrimary(seededManifest, plugin.name)) {
        missing.push(pluginPathSpec(pluginSlugFromPackage(plugin.name)));
      }
    }
    if (missing.length > 0) line(deps.stdout, "正在把自研插件 link 进沙箱…");
    const addOptions = { capture: true as const, ...(deps.repoRoot ? { cwd: deps.repoRoot } : {}) };
    for (const [index, spec] of missing.entries()) {
      line(deps.stdout, `正在安装 ${pluginNameFromSpec(spec)}（${String(index + 1)}/${String(missing.length)}）…`);
      const added = await addOfficialPlugins(deps, [spec], addOptions);
      if (added !== 0) return added;
    }
    let manifest = parseProfileManifest(await deps.readText(join(profileDir, "package.json")));
    if (manifest === null) return 1;
    for (const name of RETIRED_OFFICIAL_PLUGINS) {
      if (!hasDependency(manifest, name)) continue;
      const removed = await deps.runDsh(["plugin", "--profile", "web", "remove", name], addOptions);
      if (removed.code !== 0) return removed.code;
    }
    manifest = parseProfileManifest(await deps.readText(join(profileDir, "package.json")));
    if (manifest === null) return 1;
    const bundles = profileBundles(manifest);
    if (RETIRED_OFFICIAL_PLUGINS.some((name) => bundles.includes(name))) {
      await deps.writeText(join(profileDir, "package.json"), `${JSON.stringify(withoutRetiredBundles(manifest), null, 2)}\n`);
    }
    for (const name of RETIRED_OFFICIAL_PLUGINS) {
      if (await pathKind(deps, join(profileDir, "node_modules", name)) !== "missing") {
        if (!await removeContainedProfileInstall(deps, name)) return 1;
      }
    }
    return 0;
  }

  const profiles = join(deps.home, "profiles");
  if (await pathKind(deps, profiles) === "missing") await deps.ensureDirectory(profiles);
  if (!await safeProfilesRoot(deps)) {
    line(deps.stderr, "官方 DSH home/profiles 必须是固定路径上的真实目录；拒绝同步。");
    return 1;
  }
  if (!await restoreReconcileBackup(deps)) return 1;
  const profileKind = await pathKind(deps, profileDir);
  if (profileKind !== "missing" && !await safeOfficialDirectory(deps, profileDir, "web")) {
    line(deps.stderr, "Web profile 必须是官方 DSH home/profiles 下的真实目录；拒绝同步。");
    return 1;
  }
  if (await deps.readText(join(profileDir, "package.json")) === null) {
    const prepared = await deps.runDsh(["web", "--dump-default-config"], { capture: true });
    if (prepared.code !== 0) {
      line(deps.stderr, prepared.stderr.trim() || "xtz 无法准备官方 web profile。");
      return prepared.code;
    }
  }
  const preflight = await inspectProfile(deps);
  const repairable = new Set(["profile-bundles", "profile-default-specs", "profile-install", "host-tools"]);
  const unsafe = preflight.find((check) => check.level === "error" && !repairable.has(check.id));
  if (unsafe) {
    line(deps.stderr, unsafe.message);
    return 1;
  }
  const drift = await officialProfileDrift(deps);
  if (drift.reasons.length === 0) {
    await healOfficialHostTools(deps);
    return 0;
  }

  const originalManifest = parseProfileManifest(await deps.readText(join(profileDir, "package.json")));
  if (originalManifest === null) {
    line(deps.stderr, "Web profile manifest 无法读取；拒绝同步。");
    return 1;
  }
  const managedNames = [...DEFAULT_PLUGINS.map(({ name }) => name), ...RETIRED_OFFICIAL_PLUGINS];
  const managedBundles = [...REQUIRED_PROFILE_BUNDLES, ...RETIRED_OFFICIAL_PLUGINS];
  const preservedManifest = preservedManifestJson(originalManifest, managedNames, managedBundles);
  let preservedFiles: Record<string, string>;
  try {
    preservedFiles = await deps.profileSnapshot(profileDir);
  } catch (error) {
    line(deps.stderr, `无法验证应保留的用户文件：${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  const backup = reconcileBackupDir(deps.home);
  if (await pathKind(deps, backup) !== "missing") {
    line(deps.stderr, `${backup} 已存在；xtz 拒绝覆盖最后一份完整 profile。`);
    return 1;
  }
  try {
    if (!await safeOfficialDirectory(deps, profileDir, "web")) {
      line(deps.stderr, "Web profile 必须是官方 DSH home/profiles 下的真实目录；拒绝同步。");
      return 1;
    }
    await deps.movePath(profileDir, backup);
  } catch (error) {
    line(deps.stderr, `无法备份旧 Web profile：${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  let commitStarted = false;
  try {
    await deps.copyProfile(backup, profileDir);
    line(deps.stdout, `正在同步 ${DEFAULT_PLUGINS.length} 个官方插件到小桃子 ${deps.metadata.version}…`);
    await allowOfficialBuilds(deps, seedAllowBuildKeys());
    const added = await addOfficialPlugins(
      deps,
      DEFAULT_PLUGINS.map(({ spec }) => spec),
      { capture: true },
    );
    if (added !== 0) throw new Error("默认插件同步失败");
    let candidateManifest = parseProfileManifest(await deps.readText(join(profileDir, "package.json")));
    if (candidateManifest === null) throw new Error("同步后的 Web profile manifest 无法读取");
    for (const name of RETIRED_OFFICIAL_PLUGINS) {
      if (!hasDependency(candidateManifest, name)) continue;
      line(deps.stdout, `正在移除已退役插件 ${name}…`);
      const removed = await deps.runDsh(["plugin", "--profile", "web", "remove", name], { capture: true });
      if (removed.code !== 0) throw new Error(removed.stderr.trim() || `xtz 移除 ${name} 失败。`);
    }
    candidateManifest = parseProfileManifest(await deps.readText(join(profileDir, "package.json")));
    if (candidateManifest === null) throw new Error("移除退役插件后的 Web profile manifest 无法读取");
    const candidateBundleNames = profileBundles(candidateManifest);
    if (RETIRED_OFFICIAL_PLUGINS.some((name) => candidateBundleNames.includes(name))) {
      candidateManifest = withoutRetiredBundles(candidateManifest);
      await deps.writeText(join(profileDir, "package.json"), `${JSON.stringify(candidateManifest, null, 2)}\n`);
    }
    for (const name of RETIRED_OFFICIAL_PLUGINS) {
      if (await pathKind(deps, join(profileDir, "node_modules", name)) !== "missing"
        && !await removeContainedProfileInstall(deps, name)) {
        throw new Error(`无法安全移除退役插件安装目录 ${name}`);
      }
    }
    const finalManifest = parseProfileManifest(await deps.readText(join(profileDir, "package.json")));
    if (finalManifest === null
      || preservedManifestJson(finalManifest, managedNames, managedBundles) !== preservedManifest) {
      throw new Error("同步改动了用户 manifest；已拒绝提交。");
    }
    if (JSON.stringify(await deps.profileSnapshot(profileDir)) !== JSON.stringify(preservedFiles)) {
      throw new Error("同步改动了应保留的用户文件；已拒绝提交。");
    }
    await healOfficialHostTools(deps);
    const validation = await inspectProfile(deps);
    const failed = validation.find((check) => check.level === "error");
    if (failed) throw new Error(failed.message);
    const dumped = await deps.runDsh(["web", "--dump-config"], { capture: true });
    if (dumped.code !== 0) throw new Error(dumped.stderr.trim() || "Web profile 配置验证失败");
    const missingLayers = DEFAULT_PLUGINS.filter(({ name }) => !dumped.stdout.includes(`# == ${name}`));
    if (missingLayers.length > 0) throw new Error(`Web profile 配置缺少 bundle 层：${missingLayers.map(({ name }) => name).join(", ")}`);
    await deps.writeText(join(profileDir, PROFILE_RECONCILE_COMMITTED), JSON.stringify({ writer: "xtz", state: "committed" }));
    commitStarted = true;
    await deps.removeTree(backup);
    await deps.removePath(join(profileDir, PROFILE_RECONCILE_COMMITTED));
    return 0;
  } catch (error) {
    line(deps.stderr, error instanceof Error ? error.message : String(error));
    if (commitStarted) {
      line(deps.stderr, "候选 profile 已验证并保留；下次 start/restart 会继续清理旧备份。");
    } else {
      await rollbackReconcile(deps, profileDir, backup);
    }
    return 1;
  }
}

async function addOfficialPlugins(
  deps: CliDependencies,
  specs: readonly string[],
  addOptions: { capture: true; cwd?: string },
): Promise<number> {
  const args = ["plugin", "--profile", "web", "add", ...specs, "--save-prod"];
  const added = await deps.runDsh(args, addOptions);
  if (added.code === 0) return 0;
  const log = `${added.stdout}\n${added.stderr}`;
  const keys = parseAllowBuildKeys(log);
  if (keys.length === 0 || deps.sandbox) {
    if (added.stdout.trim()) line(deps.stderr, added.stdout.trim());
    line(deps.stderr, added.stderr.trim() || `xtz 安装 ${specs.join(", ")} 失败。`);
    return added.code;
  }
  const expanded = [...keys, ...expandAllowBuildKeysForDefaultPlugins(keys, DEFAULT_PLUGINS)];
  if (!await allowOfficialBuilds(deps, expanded)) {
    if (added.stdout.trim()) line(deps.stderr, added.stdout.trim());
    line(deps.stderr, added.stderr.trim() || `xtz 安装 ${specs.join(", ")} 失败。`);
    return added.code;
  }
  line(deps.stdout, "已允许 git 插件在安装时编译，正在重试默认插件同步…");
  const retried = await deps.runDsh(args, addOptions);
  if (retried.code !== 0) {
    if (retried.stdout.trim()) line(deps.stderr, retried.stdout.trim());
    line(deps.stderr, retried.stderr.trim() || `xtz 安装 ${specs.join(", ")} 失败。`);
    return retried.code;
  }
  return 0;
}

async function allowOfficialBuilds(deps: CliDependencies, keys: string[]): Promise<boolean> {
  const workspacePath = join(officialProfileDir(deps.home), "pnpm-workspace.yaml");
  const current = await deps.readText(workspacePath) ?? "";
  const next = withAllowBuilds(current, keys);
  if (next === current) return false;
  await deps.writeText(workspacePath, next);
  return true;
}

async function launchOn(
  deps: CliDependencies,
  port: number,
  options: { foreground: boolean; noOpen: boolean; passthrough?: string[] },
  existingLock?: AcquiredReconcileLock,
): Promise<number> {
  if (deps.sandbox) return launchUnlocked(deps, port, options);
  if (await pathKind(deps, deps.home) === "missing") await deps.ensureDirectory(deps.home);
  if (await pathKind(deps, deps.home) !== "directory") {
    line(deps.stderr, "官方 DSH home 必须是真实目录；拒绝启动。");
    return 1;
  }
  const lock = existingLock ?? await acquireReconcileLock(deps);
  if (lock === null) {
    line(deps.stderr, "另一个 xtz 正在启动或同步 Web profile；本次启动已取消。");
    return 1;
  }
  const heldLock = lock;
  let released = false;
  async function releaseLock(): Promise<void> {
    if (released) return;
    released = true;
    try {
      await releaseReconcileLock(deps, heldLock);
    } catch (error) {
      line(deps.stderr, `清理 xtz 启动锁失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  try {
    return await launchUnlocked(deps, port, options, releaseLock);
  } finally {
    await releaseLock();
  }
}

async function launchUnlocked(
  deps: CliDependencies,
  port: number,
  options: { foreground: boolean; noOpen: boolean; passthrough?: string[] },
  releaseLock?: () => Promise<void>,
): Promise<number> {
  if (!deps.sandbox) {
    const inspected = await inspectWebPid(deps);
    if (inspected?.state === "owned") {
      const live = await deps.probe(await rememberedPort(deps));
      if (live.state === "running") {
        await warnRunningProfileDrift(deps);
        return announceRunning(deps, live, options.noOpen);
      }
      line(deps.stderr, `pid ${inspected.record.pid} 仍在运行，但 Web 尚未通过健康检查；拒绝另起服务。`);
      return 2;
    }
    if (inspected?.state === "unavailable") {
      line(deps.stderr, `pid ${inspected.record.pid} 仍存在，但进程身份无法验证；拒绝另起服务。`);
      return 2;
    }
    if (inspected !== null) await clearWebPid(deps);
  }
  const prepared = await ensureOfficialProfile(deps);
  if (prepared !== 0) return prepared;
  const passthrough = options.passthrough ?? [];
  if (passthrough.some((arg) => arg === "--port" || arg === "--host" || arg.startsWith("--port=") || arg.startsWith("--host="))) {
    return usageError(deps, "透传参数不能包含 --port 或 --host");
  }
  await writeXtzStamp(deps, port);
  let spawned: SpawnedDsh;
  try {
    spawned = await deps.spawnWeb([...webLaunchArgs(port), ...passthrough], { foreground: options.foreground });
  } catch (error) {
    line(deps.stderr, error instanceof Error ? error.message : String(error));
    return 1;
  }
  const identity = spawned.identity;
  if (identity === undefined) {
    await writeWebPid(deps, spawned.pid);
    line(deps.stderr, `spawnWeb 没有返回 pid ${spawned.pid} 的进程身份；xtz 拒绝继续，并保留 pid 记录。`);
    return 1;
  }
  await writeWebPid(deps, spawned.pid, identity);
  const ready = await waitUntilReady(deps, port);
  if (ready.state !== "running") {
    const stopped = await stopRecordedPid(deps, spawned.pid, identity);
    if (stopped === "stopped" || stopped === "not-running") {
      await clearWebPid(deps);
      line(deps.stderr, `xtz 拉起了服务，但 ${OFFICIAL_HOST}:${port} 未通过小桃子身份验证；已停止该进程。`);
    } else {
      line(deps.stderr, `xtz 拉起了服务，但 ${OFFICIAL_HOST}:${port} 未通过小桃子身份验证。`);
      line(deps.stderr, `pid ${spawned.pid} 的进程身份随后无法确认；xtz 拒绝发送停止信号，并保留 pid 记录。`);
    }
    return 1;
  }
  await announceRunning(deps, ready, options.noOpen);
  await releaseLock?.();
  if (options.foreground && spawned.closed) {
    const stopChild = () => {
      void stopRecordedPid(deps, spawned.pid, identity);
    };
    process.once("SIGINT", stopChild);
    process.once("SIGTERM", stopChild);
    try {
      const finished = await spawned.closed;
      await clearWebPid(deps);
      return finished.code === 0 ? 0 : 1;
    } finally {
      process.removeListener("SIGINT", stopChild);
      process.removeListener("SIGTERM", stopChild);
    }
  }
  return 0;
}

async function startCommand(
  deps: CliDependencies,
  args: string[],
  reconcileLock?: AcquiredReconcileLock,
): Promise<number> {
  const parsed = parseStartArgs(args);
  if (!parsed.ok) return usageError(deps, parsed.error);
  if (!deps.sandbox && parsed.options.passthrough.length > 0) {
    return usageError(deps, "start 只接受 --port、--foreground、--no-open");
  }
  const resolved = resolveStartPort(parsed.options, deps.sandbox);
  if (!resolved.ok) return usageError(deps, resolved.error);
  if (!deps.sandbox && reconcileLock === undefined) {
    if (await pathKind(deps, deps.home) === "missing") await deps.ensureDirectory(deps.home);
    if (await pathKind(deps, deps.home) !== "directory") {
      line(deps.stderr, "官方 DSH home 必须是真实目录；拒绝启动。");
      return 1;
    }
    const lock = await acquireReconcileLock(deps);
    if (lock === null) {
      line(deps.stderr, "另一个 xtz 正在启动或同步 Web profile；本次启动已取消。");
      return 1;
    }
    try {
      return await startCommand(deps, args, lock);
    } finally {
      await releaseReconcileLock(deps, lock);
    }
  }
  const noOpen = parsed.options.noOpen;
  const foreground = parsed.options.foreground;
  const passthrough = parsed.options.passthrough;
  const inspected = await inspectWebPid(deps);
  const remembered = await rememberedPort(deps);
  if (inspected?.state === "owned") {
    const live = await deps.probe(remembered);
    if (live.state === "running") {
      await warnRunningProfileDrift(deps);
      const code = await announceRunning(deps, live, noOpen);
      if (foreground && live.state === "running") {
        line(deps.stdout, "服务已在运行。前台模式不会接管已有进程。");
      }
      return code;
    }
    if (!deps.sandbox && remembered !== OFFICIAL_PORT) {
      const preferred = await deps.probe(OFFICIAL_PORT);
      if (preferred.state === "running") {
        await warnRunningProfileDrift(deps);
        return await announceRunning(deps, preferred, noOpen);
      }
    }
    line(deps.stderr, `pid ${inspected.record.pid} 仍在运行，但 Web 尚未通过健康检查。`);
    line(deps.stderr, "xtz 拒绝改动 profile 或另起服务；请运行 xtz restart。");
    return 2;
  } else if (inspected?.state === "unavailable") {
    line(deps.stderr, `pid ${inspected.record.pid} 仍存在，但旧 pid 记录没有可验证的进程身份。`);
    line(deps.stderr, "xtz 拒绝另起服务；请先确认该进程，再处理 pid 文件。");
    return 2;
  } else if (inspected !== null) {
    // A dead process or a positively identified PID reuse cannot be the process
    // xtz originally launched. Clearing this stale record sends no signal.
    await clearWebPid(deps);
  }

  const port = resolved.port;
  const status = await deps.probe(port);
  if (status.state === "stopped") {
    return await launchOn(deps, port, { foreground, noOpen, passthrough }, reconcileLock);
  }
  if (status.state === "running") {
    line(deps.stderr, `${status.host}:${status.port} 已经是小桃子，但不是 xtz 记下的进程。`);
    line(deps.stderr, "xtz 不会再起一份，也不会结束那个进程。");
    return 2;
  }
  if (deps.sandbox || parsed.options.port !== undefined) {
    line(deps.stderr, occupyMessage(status));
    line(deps.stderr, deps.sandbox
      ? "沙箱固定 3081。请停掉占用该端口的程序，或让 pnpm dev 接管已验证的沙箱进程。"
      : "xtz 不会结束那个进程。请换 --port 或先停掉占用的程序。");
    return 2;
  }

  line(deps.stderr, occupyMessage(status));
  line(deps.stderr, "xtz 不会结束那个进程。");
  if (!deps.isInteractive()) {
    line(deps.stderr, "非交互环境请加 --port，或先停掉占用的程序。");
    return 2;
  }
  line(deps.stdout, "[1] 改用空闲端口启动（避开 3081）");
  line(deps.stdout, "[2] 取消，我自己去停占用该端口的程序");
  const answer = (await deps.ask("选 1 或 2："))?.trim();
  if (answer === "2") {
    line(deps.stdout, "已取消。");
    return 2;
  }
  if (answer !== "1") return usageError(deps, "请输入 1 或 2");
  const alternate = await findFreeAlternatePort(deps);
  if (alternate === null) {
    line(deps.stderr, "3082–3099 没有空闲端口。");
    return 1;
  }
  line(deps.stdout, `将使用 ${OFFICIAL_HOST}:${alternate}`);
  return await launchOn(deps, alternate, { foreground, noOpen, passthrough }, reconcileLock);
}

async function stopCommand(deps: CliDependencies, args: string[]): Promise<number> {
  if (args.length > 0) return usageError(deps, "stop 不接受参数");
  const inspected = await inspectWebPid(deps);
  if (inspected === null) {
    line(deps.stderr, "没有 xtz 拉起的进程。");
    return 1;
  }
  const { record } = inspected;
  if (inspected.state === "not-running") {
    await clearWebPid(deps);
    line(deps.stdout, "xtz 进程已不在，已清理 pid 文件。");
    return 0;
  }
  if (inspected.state === "reused") {
    await clearWebPid(deps);
    line(deps.stderr, `pid ${record.pid} 已被其他进程复用；xtz 未发送信号，并已清理旧 pid 记录。`);
    return 2;
  }
  if (inspected.state === "unavailable" || record.identity === undefined) {
    line(deps.stderr, `无法验证 pid ${record.pid} 是否仍是 xtz 拉起的进程；xtz 拒绝发送停止信号。`);
    return 2;
  }
  const stopped = await stopRecordedPid(deps, record.pid, record.identity);
  if (stopped === "identity-mismatch") {
    await clearWebPid(deps);
    line(deps.stderr, `pid ${record.pid} 在停止前已被复用；xtz 未发送信号，并已清理旧 pid 记录。`);
    return 2;
  }
  if (stopped === "identity-unavailable") {
    line(deps.stderr, `停止前无法再次验证 pid ${record.pid}；xtz 拒绝继续发送信号，并保留 pid 记录。`);
    return 2;
  }
  await clearWebPid(deps);
  line(deps.stdout, stopped === "not-running"
    ? "xtz 进程已不在，已清理 pid 文件。"
    : `已停止小桃子（pid ${record.pid}）。`);
  return 0;
}

async function stopForRestart(deps: CliDependencies): Promise<number | null> {
  const inspected = await inspectWebPid(deps);
  if (inspected?.state === "owned" && inspected.record.identity !== undefined) {
    const stopped = await stopRecordedPid(deps, inspected.record.pid, inspected.record.identity);
    if (stopped === "identity-mismatch") {
      await clearWebPid(deps);
      line(deps.stderr, `pid ${inspected.record.pid} 在重启前已被复用；xtz 未发送信号，也不会另起服务。`);
      return 2;
    }
    if (stopped === "identity-unavailable") {
      line(deps.stderr, `重启前无法再次验证 pid ${inspected.record.pid}；xtz 拒绝发送信号，也不会另起服务。`);
      return 2;
    }
    await clearWebPid(deps);
  } else if (inspected?.state === "reused") {
    await clearWebPid(deps);
    line(deps.stderr, `pid ${inspected.record.pid} 已被其他进程复用；xtz 未发送信号，也不会另起服务。`);
    return 2;
  } else if (inspected?.state === "unavailable") {
    line(deps.stderr, `无法验证 pid ${inspected.record.pid} 是否仍是 xtz 拉起的进程；xtz 拒绝重启。`);
    return 2;
  } else if (inspected?.state === "not-running") {
    await clearWebPid(deps);
  }
  return null;
}

async function restartCommand(deps: CliDependencies, args: string[]): Promise<number> {
  if (args.length > 0) return usageError(deps, "restart 不接受参数");
  let lock: AcquiredReconcileLock | null = null;
  if (!deps.sandbox) {
    if (await pathKind(deps, deps.home) === "missing") await deps.ensureDirectory(deps.home);
    if (await pathKind(deps, deps.home) !== "directory") return 1;
    lock = await acquireReconcileLock(deps);
    if (lock === null) {
      line(deps.stderr, "另一个 xtz 正在启动或同步 Web profile；本次重启已取消。");
      return 1;
    }
  }
  try {
    const stopped = await stopForRestart(deps);
    return stopped ?? await startCommand(deps, [], lock ?? undefined);
  } finally {
    if (lock !== null) await releaseReconcileLock(deps, lock);
  }
}

async function openCommand(deps: CliDependencies, args: string[]): Promise<number> {
  if (args.length > 0) return usageError(deps, "open 不接受参数");
  const port = await rememberedPort(deps);
  const status = await deps.probe(port);
  if (status.state !== "running") {
    line(deps.stderr, "小桃子未运行。请先 xtz start。");
    return 1;
  }
  line(deps.stdout, status.url);
  await tryOpen(deps, status.url);
  return 0;
}

async function configCommand(deps: CliDependencies, args: string[]): Promise<number> {
  if (args.length === 1 && args[0] === "path") {
    line(deps.stdout, join(officialProfileDir(deps.home), "cordis.patch.yml"));
    return 0;
  }
  if (args.length === 1 && (args[0] === "dump" || args[0] === "defaults")) {
    return blockedLifecycleCommand(deps, `config ${args[0]}`);
  }
  return usageError(deps, "config 当前只开放 path；dump/defaults 仍拒绝，避免 DSH 改写 profile");
}

async function pluginCommand(deps: CliDependencies, _args: string[]): Promise<number> {
  line(deps.stderr, "xtz 不管理插件。第一次 xtz start 会装好自研插件。");
  line(deps.stderr, "额外插件请打开小桃子后在市场里安装。");
  return 2;
}

async function detailedVersion(deps: CliDependencies, args: string[]): Promise<number> {
  const json = optionalJson(args);
  if (json === null) return usageError(deps, "version 只接受一个 --json");
  const dsh = await deps.runDsh(["--version"], { capture: true });
  const actualDsh = dsh.code === 0 ? dsh.stdout.trim() : null;
  const result = {
    xtz: deps.metadata.version,
    dsh: actualDsh,
    expectedDsh: deps.metadata.expectedDsh,
    node: deps.nodeVersion,
    expectedNode: deps.metadata.expectedNode,
  };
  if (json) line(deps.stdout, JSON.stringify(result));
  else {
    line(deps.stdout, `xtz ${result.xtz}`);
    line(deps.stdout, `dsh ${result.dsh ?? "未找到"}（需要 ${result.expectedDsh}）`);
    line(deps.stdout, `node ${result.node}（需要 ${result.expectedNode}）`);
  }
  if (dsh.code !== 0 && dsh.stderr) line(deps.stderr, dsh.stderr.trim());
  return actualDsh === deps.metadata.expectedDsh && nodeSatisfiesEngine(deps.nodeVersion, deps.metadata.expectedNode) ? 0 : 1;
}

async function doctorCommand(deps: CliDependencies, args: string[]): Promise<number> {
  const json = optionalJson(args);
  if (json === null) return usageError(deps, "doctor 只接受一个 --json");
  const checks: DoctorCheck[] = [];
  checks.push(nodeSatisfiesEngine(deps.nodeVersion, deps.metadata.expectedNode)
    ? { id: "node", level: "ok", message: `Node ${deps.nodeVersion}` }
    : { id: "node", level: "error", message: `Node ${deps.nodeVersion} 不满足 ${deps.metadata.expectedNode}` });

  try {
    const dsh = await deps.runDsh(["--version"], { capture: true });
    const actualDsh = dsh.code === 0 ? dsh.stdout.trim() : null;
    checks.push(actualDsh === deps.metadata.expectedDsh
      ? { id: "dsh", level: "ok", message: `DSH ${actualDsh}` }
      : { id: "dsh", level: "error", message: `DSH ${actualDsh ?? "未找到"}，需要 ${deps.metadata.expectedDsh}` });
  } catch (error) {
    checks.push({ id: "dsh", level: "error", message: `无法检查 DSH：${error instanceof Error ? error.message : String(error)}` });
  }

  try {
    checks.push(inspectXtzStamp(await deps.readText(stampPath(deps.home)), deps.metadata.version));
    const leftoverDesktop = inspectLeftoverDesktopStamp(await deps.readText(join(deps.home, DESKTOP_STAMP)));
    if (leftoverDesktop !== null) checks.push(leftoverDesktop);
    checks.push(await inspectTransactions(deps));
  } catch (error) {
    checks.push({
      id: "profile-transaction",
      level: "error",
      message: `无法检查 Web profile 事务：${error instanceof Error ? error.message : String(error)}`,
    });
  }
  try {
    checks.push(...await inspectProfile(deps));
  } catch (error) {
    checks.push({
      id: "profile",
      level: "error",
      message: `无法读取或验证 Web profile：${error instanceof Error ? error.message : String(error)}`,
    });
  }

  let occupied = false;
  try {
    const port = await rememberedPort(deps);
    const status = await deps.probe(port);
    occupied = status.state === "http-occupied" || status.state === "port-conflict";
    const url = serviceUrl(port);
    checks.push(status.state === "running"
      ? { id: "service", level: "ok", message: `${url} 的小桃子服务身份已验证` }
      : status.state === "port-conflict"
      ? { id: "service", level: "error", message: `${OFFICIAL_HOST}:${port} 被其他程序占用` }
      : status.state === "stopped"
        ? { id: "service", level: "error", message: "小桃子未运行" }
        : { id: "service", level: "error", message: `${url} 有 HTTP 响应，但不是小桃子` });
    if (status.state === "running" && (await ownedWebPid(deps)) === null) {
      checks.push({
        id: "service-owner",
        level: "warning",
        message: `${url} 已是小桃子，但不是 xtz 记下的进程；xtz stop 停不掉它`,
      });
    }
  } catch (error) {
    checks.push({ id: "service", level: "error", message: `无法检查服务：${error instanceof Error ? error.message : String(error)}` });
  }

  const failed = checks.some((check) => check.level === "error");
  if (json) {
    line(deps.stdout, JSON.stringify({ ok: !failed, ready: !failed, home: deps.home, checks }));
  } else {
    line(deps.stdout, `小桃子 CLI 诊断（Home：${deps.home}）`);
    for (const check of checks) {
      const mark = check.level === "ok" ? "✓" : check.level === "warning" ? "!" : "✗";
      line(deps.stdout, `${mark} ${check.message}`);
    }
  }
  if (!failed) return 0;
  return occupied ? 2 : 1;
}

export async function runCli(argv: string[], deps: CliDependencies): Promise<number> {
  const command = argv[0];
  const args = argv.slice(1);
  if (command === "help" || command === "--help" || command === "-h") {
    if (args.length > 0) return usageError(deps, "help 不接受参数");
    deps.stdout(HELP);
    return 0;
  }
  if (command === "--version" || command === "-v") {
    if (args.length > 0) return usageError(deps, `${command} 不接受参数`);
    line(deps.stdout, deps.metadata.version);
    return 0;
  }
  if (command !== "version" && !nodeSatisfiesEngine(deps.nodeVersion, deps.metadata.expectedNode)) {
    line(deps.stderr, `xtz 需要 Node.js ${deps.metadata.expectedNode}；当前是 ${deps.nodeVersion}。`);
    return 1;
  }
  if (command === undefined || command === "start" || command === "web") return await startCommand(deps, args);
  if (command === "stop") return await stopCommand(deps, args);
  if (command === "restart") return await restartCommand(deps, args);
  if (command === "open") return await openCommand(deps, args);
  if (command === "status") return await serviceCommand(deps, args);
  if (["init", "run", "ask", "update"].includes(command)) {
    return blockedLifecycleCommand(deps, command);
  }
  if (command === "config") return await configCommand(deps, args);
  if (command === "plugin") return await pluginCommand(deps, args);
  if (command === "doctor") return await doctorCommand(deps, args);
  if (command === "version") return await detailedVersion(deps, args);
  return usageError(deps, `未知命令 ${command}`);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    throw error;
  }
}

export interface CliBootOptions {
  home?: string;
  sandbox?: boolean;
  repoRoot?: string | null;
}

export async function createDefaultDependencies(boot: CliBootOptions = {}): Promise<CliDependencies> {
  const metadata = await readCliMetadata();
  const sandbox = boot.sandbox === true;
  const repoRoot = boot.repoRoot ?? null;
  const home = boot.home ?? officialDshHome();
  const extraEnv: NodeJS.ProcessEnv = {};
  if (sandbox) {
    extraEnv.DSH_PLUGIN_TRACE = process.env.DSH_PLUGIN_TRACE === "0" ? "0" : "1";
    if (repoRoot !== null) extraEnv.XIAOTAOZI_DSH_SANDBOX = sandboxProcessMarker(repoRoot);
  }
  const launchCwd = repoRoot ?? process.cwd();
  return {
    metadata,
    home,
    sandbox,
    repoRoot,
    nodeVersion: process.versions.node,
    cwd: process.cwd(),
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    runDsh: async (args, options) => await executeDsh(args, home, { ...options, cwd: options?.cwd ?? launchCwd }),
    spawnWeb: async (args, options) => options?.foreground === true
      ? await spawnDshForeground(args, home, launchCwd, extraEnv)
      : await spawnDshDetached(args, home, launchCwd, extraEnv),
    probe: async (port = OFFICIAL_PORT) => await probeService(OFFICIAL_HOST, port),
    openUrl,
    isInteractive: () => process.stdin.isTTY === true && process.stdout.isTTY === true,
    ask: async (question) => {
      if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) return null;
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        return await rl.question(question);
      } finally {
        rl.close();
      }
    },
    readText: async (path) => {
      try {
        return await readFile(path, "utf8");
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTDIR") return null;
        throw error;
      }
    },
    ensureDirectory: async (path) => { await mkdir(path, { recursive: true }); },
    writeText: async (path, text) => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, text);
    },
    createExclusive: async (path, text) => {
      await mkdir(dirname(path), { recursive: true });
      const temporary = join(dirname(path), `.xiaotaozi-exclusive-tmp.${String(process.pid)}.${randomUUID()}`);
      await writeFile(temporary, text, { flag: "wx", mode: 0o600 });
      try {
        await link(temporary, path);
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
        throw error;
      } finally {
        await unlink(temporary).catch(() => {});
      }
    },
    readExclusive: async (path) => {
      try {
        return await readFile(path, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    replaceExclusive: async (path, text) => {
      const temporary = join(dirname(path), `.xiaotaozi-exclusive-tmp.${String(process.pid)}.${randomUUID()}`);
      await writeFile(temporary, text, { flag: "wx", mode: 0o600 });
      try {
        await rename(temporary, path);
      } finally {
        await unlink(temporary).catch(() => {});
      }
    },
    ownsExclusive: async (path, text) => {
      try {
        return await readFile(path, "utf8") === text;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
      }
    },
    removeExclusive: async (path, text) => {
      const quarantine = join(dirname(path), `.xiaotaozi-exclusive-remove.${String(process.pid)}.${randomUUID()}`);
      try {
        await rename(path, quarantine);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
      }
      try {
        if (await readFile(quarantine, "utf8") === text) return true;
        await link(quarantine, path).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "EEXIST") throw error;
        });
        return false;
      } finally {
        await unlink(quarantine).catch(() => {});
      }
    },
    listDirectory: async (path) => await readdir(path),
    removePath: async (path) => {
      try {
        await unlink(path);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOENT") throw error;
      }
    },
    copyProfile: copyProfileWithoutNodeModules,
    profileSnapshot,
    movePath: async (source, target) => { await rename(source, target); },
    removeTree: async (path) => { await rm(path, { recursive: true, force: true }); },
    pathExists,
    realPath: async (path) => await realpath(path),
    processAlive,
    processIdentity: async (pid) => await readProcessIdentity(pid),
    stopPid: async (pid, identity) => identity === undefined
      ? "identity-unavailable"
      : await stopProcess(pid, identity),
    wait: async (ms) => await new Promise((resolveWait) => setTimeout(resolveWait, ms)),
    now: () => new Date().toISOString(),
  };
}
