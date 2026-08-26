import { access, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { officialDshHome, officialProfileDir } from "./home";
import type { CliMetadata } from "./metadata";
import { readCliMetadata } from "./metadata";
import type { CommandResult } from "./runtime";
import { executeDsh } from "./runtime";
import type { ServiceStatus } from "./status";
import { OFFICIAL_HOST, OFFICIAL_PORT, OFFICIAL_URL, probeService } from "./status";

type Writer = (text: string) => void;

export interface CliDependencies {
  metadata: CliMetadata;
  home: string;
  nodeVersion: string;
  stdout: Writer;
  stderr: Writer;
  runDsh(args: string[], options?: { capture?: boolean }): Promise<CommandResult>;
  probe(): Promise<ServiceStatus>;
  readText(path: string): Promise<string | null>;
  pathExists(path: string): Promise<boolean>;
  realPath(path: string): Promise<string>;
}

interface DoctorCheck {
  id: string;
  level: "ok" | "warning" | "error";
  message: string;
}

const DESKTOP_STAMP = "xiaotaozi-desktop.json";
const DESKTOP_STAMP_SOURCES = new Set(["bundled", "cdn", "cdn-next-launch"]);
const PROFILE_TRANSACTION_DIRS = [
  ".web-staging",
  ".web-backup",
  ".web-retired",
  ".web-seeding",
  ".xiaotaozi-pack",
];
const OFFICIAL_BUNDLED_PLUGINS = ["dsh-hello", "dsh-sidebar", "dsh-providers", "dsh-memory", "dsh-im"] as const;
const REQUIRED_PROFILE_BUNDLES = [
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app",
  ...OFFICIAL_BUNDLED_PLUGINS,
] as const;

const HELP = `小桃子 CLI（xtz）

用法：
  xtz <命令> [参数]

当前可用（只读）：
  status [--json]        验证 127.0.0.1:3080 的小桃子服务身份
  config path            显示官方 Web 配置补丁路径
  plugin list [--json]   直接读取官方 Web profile 声明的插件
  doctor [--json]        诊断 Node、DSH、Desktop seed、profile 与端口
  version [--json]       显示 xtz、DSH 与 Node 版本

等待共享 supervisor 后开放：
  start / web / open / run / ask / config dump / config defaults / stop / update

说明：
  正式命令固定使用 ~/.dsh 和 3080，不读取 .dsh-home/3081。
  当前版本不会启动、停止或准备 DSH profile，也不会修改 Desktop 管理的正式 home。
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

function inspectDesktopStamp(text: string | null): DoctorCheck {
  if (text === null) {
    return { id: "desktop-seed", level: "error", message: "缺少 Desktop 安装戳；请先运行小桃子 Desktop 完成首次安装" };
  }
  try {
    const stamp = JSON.parse(text) as { packVersion?: unknown; source?: unknown };
    const validVersion = typeof stamp.packVersion === "string" && stamp.packVersion.trim().length > 0;
    const validSource = typeof stamp.source === "string" && DESKTOP_STAMP_SOURCES.has(stamp.source);
    return validVersion && validSource
      ? { id: "desktop-seed", level: "ok", message: `Desktop pack ${stamp.packVersion}（${stamp.source}）` }
      : { id: "desktop-seed", level: "error", message: "Desktop 安装戳字段无效" };
  } catch {
    return { id: "desktop-seed", level: "error", message: "Desktop 安装戳不是有效 JSON" };
  }
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
    return [{ id: "profile", level: "error", message: "官方 Web profile 尚未初始化；请先运行小桃子 Desktop" }];
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
    checks.push({ id: "profile-bundles", level: "error", message: `Web profile 的 Desktop bundled 插件集合不完整（${details.join("；")}）` });
  } else {
    checks.push({ id: "profile-bundles", level: "ok", message: "Web profile 包含完整的 Desktop bundled 插件集合" });
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
          if (!isContained(canonicalInstall, canonicalNodeModules)) escapedInstalls.push(`${name}（越出 node_modules）`);
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
    checks.push({ id: "profile-install", level: "ok", message: "Web profile 的 Desktop bundled 插件均已安装在 profile 内" });
  }

  const unsafe: string[] = [];
  const fileEntries: Array<[string, string, string]> = [];
  for (const [name, spec] of dependencyEntries(pkg)) {
    if (spec.startsWith("link:")) {
      unsafe.push(`${name}（link: 不允许）`);
      continue;
    }
    const isPlugin = name.startsWith("dsh-") || bundles.has(name);
    if (isPlugin && !packedVendorSpec(name, spec)) {
      unsafe.push(`${name}（插件必须来自 Desktop pack 的 file:./vendor/*.tgz）`);
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
    ? { id: "profile-links", level: "ok", message: "Web profile 插件均来自 profile/vendor，且未发现 link: 或越界 file: 依赖" }
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
    ? { id: "profile-transaction", level: "ok", message: "未发现未完成的 Desktop profile 事务" }
    : { id: "profile-transaction", level: "error", message: `发现未完成的 Desktop profile 事务：${active.join(", ")}` };
}

async function serviceCommand(deps: CliDependencies, args: string[]): Promise<number> {
  const json = optionalJson(args);
  if (json === null) return usageError(deps, "status 只接受一个 --json");
  const status = await deps.probe();
  if (json) {
    line(deps.stdout, JSON.stringify({ ...status, home: deps.home }));
  } else if (status.state === "running") {
    line(deps.stdout, "小桃子 Web 正在运行，服务身份已验证。");
    line(deps.stdout, `地址：${status.url}`);
    line(deps.stdout, `Home：${deps.home}`);
  } else if (status.state === "http-occupied") {
    line(deps.stderr, `${status.host}:${status.port} 有 HTTP 服务响应，但当前无法验证它是小桃子 DSH。`);
    line(deps.stderr, "xtz 不会把未知服务标记为健康，也不会自动打开或接管它。");
  } else if (status.state === "port-conflict") {
    line(deps.stderr, `${status.host}:${status.port} 已被非 HTTP 服务占用；xtz 不会抢占或换端口。`);
  } else {
    line(deps.stdout, "小桃子 Web 未运行。");
    line(deps.stdout, `地址：${status.url}`);
    line(deps.stdout, `Home：${deps.home}`);
  }
  return status.state === "running" ? 0 : status.state === "stopped" ? 1 : 2;
}

function blockedLifecycleCommand(deps: CliDependencies, command: string): number {
  const detail = command === "run" || command === "ask"
    ? "小桃子还没有受 Desktop 管理的 headless profile；直接委托 DSH 会在正式 home 创建 vanilla profile。"
    : command === "config dump" || command === "config defaults"
      ? "DSH 展开配置前会准备并改写 profile，当前不能把它作为只读操作。"
      : "Desktop 与 CLI 尚未共享可信的进程锁、服务身份和 profile 事务协议。";
  line(deps.stderr, `xtz ${command} 暂未开放：${detail}`);
  line(deps.stderr, "当前版本保持零写入；请使用小桃子 Desktop。此命令会在 shared supervisor 落地后开放。");
  return 2;
}

async function configCommand(deps: CliDependencies, args: string[]): Promise<number> {
  if (args.length === 1 && args[0] === "path") {
    line(deps.stdout, join(officialProfileDir(deps.home), "cordis.patch.yml"));
    return 0;
  }
  if (args.length === 1 && (args[0] === "dump" || args[0] === "defaults")) {
    return blockedLifecycleCommand(deps, `config ${args[0]}`);
  }
  return usageError(deps, "config 当前只开放 path；dump/defaults 等待 shared supervisor");
}

async function pluginCommand(deps: CliDependencies, args: string[]): Promise<number> {
  const packageJson = join(officialProfileDir(deps.home), "package.json");
  const text = await deps.readText(packageJson);
  if (text === null) {
    line(deps.stderr, "官方 Web profile 尚未初始化；xtz plugin 不会替你创建它。请先运行小桃子 Desktop。");
    return 1;
  }
  const action = args[0];
  if (action === "list") {
    const json = optionalJson(args.slice(1));
    if (json === null) return usageError(deps, "plugin list 只接受一个 --json");
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("profile manifest must be an object");
      }
      const pkg = parsed as Record<string, unknown>;
      const dependencies = pkg.dependencies !== null
        && typeof pkg.dependencies === "object"
        && !Array.isArray(pkg.dependencies)
        ? pkg.dependencies as Record<string, unknown>
        : {};
      const declaredBundles = new Set(profileBundles(pkg).filter((name) => !name.startsWith("@deepseek-ai/")));
      const plugins = Object.entries(dependencies)
        .filter(([name, spec]) => typeof spec === "string" && (name.startsWith("dsh-") || declaredBundles.has(name)))
        .map(([name, spec]) => ({ name, spec: spec as string }))
        .sort((left, right) => left.name.localeCompare(right.name));
      if (json) {
        line(deps.stdout, JSON.stringify({ profile: "web", home: deps.home, plugins }));
      } else if (plugins.length === 0) {
        line(deps.stdout, "Web profile 没有直接声明 dsh-* 插件。");
      } else {
        for (const plugin of plugins) line(deps.stdout, `${plugin.name}\t${plugin.spec}`);
      }
      return 0;
    } catch {
      line(deps.stderr, `${packageJson} 不是有效 JSON。`);
      return 1;
    }
  }
  return usageError(deps, "plugin 只开放零写入的 list [--json]；正式 profile 不接受 add/remove/update");
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

  checks.push(inspectDesktopStamp(await deps.readText(join(deps.home, DESKTOP_STAMP))));
  checks.push(await inspectTransactions(deps));
  checks.push(...await inspectProfile(deps));

  const status = await deps.probe();
  checks.push(status.state === "running"
    ? { id: "service", level: "ok", message: `${OFFICIAL_URL} 的小桃子服务身份已验证` }
    : status.state === "port-conflict"
    ? { id: "service", level: "error", message: `${OFFICIAL_HOST}:${OFFICIAL_PORT} 被非 HTTP 服务占用` }
    : status.state === "stopped"
      ? { id: "service", level: "error", message: "小桃子 Web 未运行" }
      : { id: "service", level: "error", message: `${OFFICIAL_URL} 有 HTTP 响应，但服务身份尚未验证` });

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
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    if (args.length > 0) return usageError(deps, "help 不接受参数");
    deps.stdout(HELP);
    return 0;
  }
  if (command === "--version" || command === "-v") {
    if (args.length > 0) return usageError(deps, `${command} 不接受参数`);
    line(deps.stdout, deps.metadata.version);
    return 0;
  }
  // Help and the bare CLI version remain available for recovery/diagnosis,
  // but every command that inspects or delegates the product runtime fails
  // closed before touching the official home on an unsupported Node.
  if (command !== "version" && deps.nodeVersion !== deps.metadata.expectedNode) {
    line(deps.stderr, `xtz 要求精确的 Node.js ${deps.metadata.expectedNode}；当前是 ${deps.nodeVersion}。`);
    return 1;
  }
  if (command === "status") return await serviceCommand(deps, args);
  if (["start", "web", "open", "run", "ask", "stop", "update"].includes(command)) {
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

export async function createDefaultDependencies(): Promise<CliDependencies> {
  const metadata = await readCliMetadata();
  const home = officialDshHome();
  return {
    metadata,
    home,
    nodeVersion: process.versions.node,
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    runDsh: async (args, options) => await executeDsh(args, home, options),
    probe: async () => await probeService(),
    readText: async (path) => {
      try {
        return await readFile(path, "utf8");
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTDIR") return null;
        throw error;
      }
    },
    pathExists,
    realPath: async (path) => await realpath(path),
  };
}
