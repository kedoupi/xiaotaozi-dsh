import { access, mkdir, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parseStartArgs, resolveStartPort } from "./flags";
import { officialDshHome, officialProfileDir } from "./home";
import type { CliMetadata } from "./metadata";
import { readCliMetadata } from "./metadata";
import { DEFAULT_PLUGINS, OFFICIAL_BUNDLED_PLUGINS, RETIRED_OFFICIAL_PLUGINS, isAllowedPluginSpec } from "./plugin-spec";
import { pluginPathSpec, pluginSlugFromPackage, sandboxProcessMarker } from "./repo";
import type { CommandResult, SpawnedDsh } from "./runtime";
import { executeDsh, processAlive, spawnDshDetached, spawnDshForeground, stopProcess } from "./runtime";
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
  writeText(path: string, text: string): Promise<void>;
  removePath(path: string): Promise<void>;
  pathExists(path: string): Promise<boolean>;
  realPath(path: string): Promise<string>;
  processAlive(pid: number): boolean;
  stopPid(pid: number): Promise<void>;
  wait(ms: number): Promise<void>;
  now(): string;
}

interface DoctorCheck {
  id: string;
  level: "ok" | "warning" | "error";
  message: string;
}

const DESKTOP_STAMP = "xiaotaozi-desktop.json";
const PROFILE_TRANSACTION_DIRS = [
  ".web-staging",
  ".web-backup",
  ".web-retired",
  ".web-seeding",
  ".xiaotaozi-pack",
];
const REQUIRED_PROFILE_BUNDLES = [
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app",
  ...OFFICIAL_BUNDLED_PLUGINS,
] as const;

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

function inspectXtzStamp(text: string | null): DoctorCheck {
  if (text === null) {
    return { id: "xtz-seed", level: "error", message: "缺少 xtz 安装戳；请先运行 xtz start" };
  }
  try {
    const stamp = JSON.parse(text) as { writer?: unknown; createdAt?: unknown };
    if (stamp.writer !== "xtz") {
      return { id: "xtz-seed", level: "error", message: "xtz 安装戳 writer 无效" };
    }
    if (typeof stamp.createdAt !== "string" || stamp.createdAt.length === 0) {
      return { id: "xtz-seed", level: "error", message: "xtz 安装戳缺少 createdAt" };
    }
    return { id: "xtz-seed", level: "ok", message: `xtz 已初始化（${stamp.createdAt}）` };
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

  let pkg: Record<string, unknown>;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid object");
    pkg = parsed as Record<string, unknown>;
  } catch {
    return [{ id: "profile", level: "error", message: "官方 Web profile/package.json 不是有效 JSON object" }];
  }

  const checks: DoctorCheck[] = [];
  try {
    const canonicalHome = await deps.realPath(deps.home);
    const canonicalProfile = await deps.realPath(profileDir);
    checks.push(isContained(canonicalProfile, canonicalHome)
      ? { id: "profile-path", level: "ok", message: "Web profile 位于官方 DSH home 内" }
      : { id: "profile-path", level: "error", message: "Web profile 的真实路径越出官方 DSH home" });
  } catch {
    checks.push({ id: "profile-path", level: "error", message: "无法验证 Web profile 的真实路径" });
  }
  const dependencies = pkg.dependencies !== null
    && typeof pkg.dependencies === "object"
    && !Array.isArray(pkg.dependencies)
    ? pkg.dependencies as Record<string, unknown>
    : {};
  const bundles = new Set(profileBundles(pkg));
  const missingBundles = REQUIRED_PROFILE_BUNDLES.filter((name) => !bundles.has(name));
  const missingDependencies = OFFICIAL_BUNDLED_PLUGINS.filter((name) => typeof dependencies[name] !== "string");
  if (missingBundles.length > 0 || missingDependencies.length > 0) {
    const details = [
      missingBundles.length > 0 ? `缺少 bundles：${missingBundles.join(", ")}` : null,
      missingDependencies.length > 0 ? `缺少依赖：${missingDependencies.join(", ")}` : null,
    ].filter((item): item is string => item !== null);
    checks.push({ id: "profile-bundles", level: "error", message: `Web profile 的默认插件集合不完整（${details.join("；")}）` });
  } else {
    checks.push({ id: "profile-bundles", level: "ok", message: "Web profile 包含默认插件" });
  }

  const nodeModules = join(profileDir, "node_modules");
  const missingInstalls: string[] = [];
  const escapedInstalls: string[] = [];
  const invalidInstalls: string[] = [];
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
    } catch {
      escapedInstalls.push("node_modules（无法验证真实路径）");
    }
  }
  if (missingInstalls.length > 0 || escapedInstalls.length > 0 || invalidInstalls.length > 0) {
    const details = [...missingInstalls.map((name) => `缺少 ${name}`), ...escapedInstalls, ...invalidInstalls];
    checks.push({ id: "profile-install", level: "error", message: `Web profile 安装不完整或不安全：${details.join("，")}` });
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
    const isPlugin = name.startsWith("dsh-") || bundles.has(name);
    if (isPlugin && !isAllowedPluginSpec(spec) && !packedVendorSpec(name, spec)) {
      unsafe.push(`${name}（插件必须来自 github: / npm，或遗留的 file:./vendor/*.tgz）`);
      if (!spec.startsWith("file:")) continue;
    }
    if (!spec.startsWith("file:")) continue;
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
          if (!(await deps.pathExists(target))) {
            unsafe.push(`${name}（file: 目标不存在）`);
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
  return checks;
}

async function inspectTransactions(deps: CliDependencies): Promise<DoctorCheck> {
  const profilesDir = join(deps.home, "profiles");
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
  const record = parseWebPidRecord(await deps.readText(pidPath(deps.home)));
  if (record === null) return null;
  return deps.processAlive(record.pid) ? record.pid : null;
}

async function writeWebPid(deps: CliDependencies, pid: number): Promise<void> {
  await deps.writeText(pidPath(deps.home), JSON.stringify({ pid, startedAt: deps.now() }));
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

async function ensureOfficialProfile(deps: CliDependencies): Promise<number> {
  const profileDir = officialProfileDir(deps.home);
  const prepared = await deps.runDsh(["web", "--dump-default-config"], { capture: true });
  if (prepared.code !== 0) {
    line(deps.stderr, prepared.stderr.trim() || "xtz 无法准备官方 web profile。");
    return prepared.code;
  }
  const missing: string[] = [];
  for (const plugin of DEFAULT_PLUGINS) {
    const install = join(profileDir, "node_modules", plugin.name);
    if (await deps.pathExists(install)) continue;
    const spec = deps.sandbox
      ? pluginPathSpec(pluginSlugFromPackage(plugin.name))
      : plugin.spec;
    missing.push(spec);
  }
  if (missing.length > 0) {
    line(deps.stdout, deps.sandbox ? "正在把自研插件 link 进沙箱…" : "正在准备官方默认插件…");
  }
  const addOptions = { capture: true as const, ...(deps.repoRoot ? { cwd: deps.repoRoot } : {}) };
  for (const spec of missing) {
    const added = await deps.runDsh(["plugin", "--profile", "web", "add", spec], addOptions);
    if (added.code !== 0) {
      if (added.stdout.trim()) line(deps.stderr, added.stdout.trim());
      line(deps.stderr, added.stderr.trim() || `xtz 安装 ${spec} 失败。`);
      return added.code;
    }
  }
  for (const name of RETIRED_OFFICIAL_PLUGINS) {
    const install = join(profileDir, "node_modules", name);
    if (!await deps.pathExists(install)) continue;
    line(deps.stdout, `正在移除已退役插件 ${name}…`);
    const removed = await deps.runDsh(["plugin", "--profile", "web", "remove", name], { capture: true });
    if (removed.code !== 0) {
      if (removed.stdout.trim()) line(deps.stderr, removed.stdout.trim());
      line(deps.stderr, removed.stderr.trim() || `xtz 移除 ${name} 失败。`);
      return removed.code;
    }
  }
  const stamp = await deps.readText(stampPath(deps.home));
  if (stamp === null) {
    await writeXtzStamp(deps, deps.sandbox ? SANDBOX_PORT : OFFICIAL_PORT);
  }
  return 0;
}

async function launchOn(
  deps: CliDependencies,
  port: number,
  options: { foreground: boolean; noOpen: boolean; passthrough?: string[] },
): Promise<number> {
  const prepared = await ensureOfficialProfile(deps);
  if (prepared !== 0) return prepared;
  const passthrough = options.passthrough ?? [];
  if (passthrough.some((arg) => arg === "--port" || arg === "--host" || arg.startsWith("--port=") || arg.startsWith("--host="))) {
    return usageError(deps, "透传参数不能包含 --port 或 --host");
  }
  let spawned: SpawnedDsh;
  try {
    spawned = await deps.spawnWeb([...webLaunchArgs(port), ...passthrough], { foreground: options.foreground });
  } catch (error) {
    line(deps.stderr, error instanceof Error ? error.message : String(error));
    return 1;
  }
  await writeWebPid(deps, spawned.pid);
  const ready = await waitUntilReady(deps, port);
  if (ready.state !== "running") {
    await deps.stopPid(spawned.pid);
    await clearWebPid(deps);
    line(deps.stderr, `xtz 拉起了服务，但 ${OFFICIAL_HOST}:${port} 未通过小桃子身份验证；已停止该进程。`);
    return 1;
  }
  await writeXtzStamp(deps, port);
  await announceRunning(deps, ready, options.noOpen);
  if (options.foreground && spawned.closed) {
    const stopChild = () => {
      void deps.stopPid(spawned.pid);
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

async function startCommand(deps: CliDependencies, args: string[]): Promise<number> {
  const parsed = parseStartArgs(args);
  if (!parsed.ok) return usageError(deps, parsed.error);
  if (!deps.sandbox && parsed.options.passthrough.length > 0) {
    return usageError(deps, "start 只接受 --port、--foreground、--no-open");
  }
  const resolved = resolveStartPort(parsed.options, deps.sandbox);
  if (!resolved.ok) return usageError(deps, resolved.error);
  const noOpen = parsed.options.noOpen;
  const foreground = parsed.options.foreground;
  const passthrough = parsed.options.passthrough;
  const owned = await ownedWebPid(deps);
  const remembered = await rememberedPort(deps);
  if (owned !== null) {
    const live = await deps.probe(remembered);
    if (live.state === "running") {
      const code = await announceRunning(deps, live, noOpen);
      if (foreground && live.state === "running") {
        line(deps.stdout, "服务已在运行。前台模式不会接管已有进程。");
      }
      return code;
    }
    if (!deps.sandbox && remembered !== OFFICIAL_PORT) {
      const preferred = await deps.probe(OFFICIAL_PORT);
      if (preferred.state === "running") return await announceRunning(deps, preferred, noOpen);
    }
    await clearWebPid(deps);
  }

  const port = resolved.port;
  const status = await deps.probe(port);
  if (status.state === "stopped") return await launchOn(deps, port, { foreground, noOpen, passthrough });
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
  return await launchOn(deps, alternate, { foreground, noOpen, passthrough });
}

async function stopCommand(deps: CliDependencies, args: string[]): Promise<number> {
  if (args.length > 0) return usageError(deps, "stop 不接受参数");
  const record = parseWebPidRecord(await deps.readText(pidPath(deps.home)));
  if (record === null) {
    line(deps.stderr, "没有 xtz 拉起的进程。");
    return 1;
  }
  if (!deps.processAlive(record.pid)) {
    await clearWebPid(deps);
    line(deps.stdout, "xtz 进程已不在，已清理 pid 文件。");
    return 0;
  }
  await deps.stopPid(record.pid);
  await clearWebPid(deps);
  line(deps.stdout, `已停止小桃子（pid ${record.pid}）。`);
  return 0;
}

async function restartCommand(deps: CliDependencies, args: string[]): Promise<number> {
  if (args.length > 0) return usageError(deps, "restart 不接受参数");
  const record = parseWebPidRecord(await deps.readText(pidPath(deps.home)));
  if (record !== null && deps.processAlive(record.pid)) {
    await deps.stopPid(record.pid);
    await clearWebPid(deps);
  } else if (record !== null) {
    await clearWebPid(deps);
  }
  return await startCommand(deps, []);
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
    line(deps.stdout, `node ${result.node}（需要精确版本 ${result.expectedNode}）`);
  }
  if (dsh.code !== 0 && dsh.stderr) line(deps.stderr, dsh.stderr.trim());
  return actualDsh === deps.metadata.expectedDsh && deps.nodeVersion === deps.metadata.expectedNode ? 0 : 1;
}

async function doctorCommand(deps: CliDependencies, args: string[]): Promise<number> {
  const json = optionalJson(args);
  if (json === null) return usageError(deps, "doctor 只接受一个 --json");
  const checks: DoctorCheck[] = [];
  checks.push(deps.nodeVersion === deps.metadata.expectedNode
    ? { id: "node", level: "ok", message: `Node ${deps.nodeVersion}` }
    : { id: "node", level: "error", message: `Node ${deps.nodeVersion} 与要求的精确版本 ${deps.metadata.expectedNode} 不一致` });

  const dsh = await deps.runDsh(["--version"], { capture: true });
  const actualDsh = dsh.code === 0 ? dsh.stdout.trim() : null;
  checks.push(actualDsh === deps.metadata.expectedDsh
    ? { id: "dsh", level: "ok", message: `DSH ${actualDsh}` }
    : { id: "dsh", level: "error", message: `DSH ${actualDsh ?? "未找到"}，需要 ${deps.metadata.expectedDsh}` });

  checks.push(inspectXtzStamp(await deps.readText(stampPath(deps.home))));
  const leftoverDesktop = inspectLeftoverDesktopStamp(await deps.readText(join(deps.home, DESKTOP_STAMP)));
  if (leftoverDesktop !== null) checks.push(leftoverDesktop);
  checks.push(await inspectTransactions(deps));
  checks.push(...await inspectProfile(deps));

  const port = await rememberedPort(deps);
  const status = await deps.probe(port);
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
  return status.state === "http-occupied" || status.state === "port-conflict" ? 2 : 1;
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
  if (command !== "version" && deps.nodeVersion !== deps.metadata.expectedNode) {
    line(deps.stderr, `xtz 要求精确的 Node.js ${deps.metadata.expectedNode}；当前是 ${deps.nodeVersion}。`);
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
    writeText: async (path, text) => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, text);
    },
    removePath: async (path) => {
      try {
        await unlink(path);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOENT") throw error;
      }
    },
    pathExists,
    realPath: async (path) => await realpath(path),
    processAlive,
    stopPid: async (pid) => await stopProcess(pid),
    wait: async (ms) => await new Promise((resolveWait) => setTimeout(resolveWait, ms)),
    now: () => new Date().toISOString(),
  };
}
