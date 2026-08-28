#!/usr/bin/env node
import { spawn } from "node:child_process";
import { lstat, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ensureXtzCli,
  listListenPids,
  pinnedNodePath,
  spawnSandboxWeb,
} from "./sandbox-web.mjs";
import {
  repoRoot,
  SANDBOX_PORT,
  sandboxEnv,
  sandboxHome,
} from "./sandbox-home.mjs";

export const REQUIRED_SANDBOX_PLUGINS = Object.freeze([
  "dsh-xtz-ui",
  "dsh-sidebar",
  "dsh-providers",
  "dsh-im",
  "dsh-market",
  "dsh-wecom-office",
]);

export const REQUIRED_MOUNT_MARKERS = Object.freeze({
  "dsh-xtz-ui": "[dsh-xtz-ui] mounted",
  "dsh-sidebar": "[dsh-sidebar] ready pty=ok",
  "dsh-providers": "[dsh-providers] mounted",
  "dsh-im": "[dsh-im] mounted",
  "dsh-market": "[dsh-market] ready",
  "dsh-wecom-office": "[dsh-wecom-office] mounted",
});

const READY_ATTEMPTS = 120;
const READY_INTERVAL_MS = 250;
const STOP_TIMEOUT_MS = 8_000;
const PROCESS_GONE_INTERVAL_MS = 100;
const COMMAND_TIMEOUT_MS = 5_000;
const OUTPUT_LIMIT = 2 * 1024 * 1024;
const WEB_PID_FILE = "xiaotaozi-xtz-web.pid";

function usage() {
  return `Disposable Xiaotaozi sandbox cold-start smoke.

Usage:
  pnpm smoke:sandbox

Requires a checkout without .dsh-home and an empty 127.0.0.1:3081.
Builds the current CLI/plugins, starts the pinned DSH, verifies identity and
all six first-party plugin mount traces, stops only its exact wrapper and the
identity-recorded DSH child, then removes the
smoke-created .dsh-home. Never reads or writes ~/.dsh or port 3080.
`;
}

export function parseSmokeArgs(argv) {
  if (argv.length === 0) return { help: false };
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) return { help: true };
  throw new Error(`Unknown argument: ${argv.join(" ")}`);
}

export async function assertFreshSandboxHome(home, options = {}) {
  const inspect = options.lstat ?? lstat;
  try {
    await inspect(home);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Refusing cold-start smoke because sandbox home already exists: ${home}`);
}

export function assertSandboxPortEmpty(pids) {
  if (!Array.isArray(pids) || pids.some((pid) => !Number.isInteger(pid) || pid <= 1)) {
    throw new Error("Sandbox listener inspection returned invalid process ids");
  }
  if (pids.length > 0) {
    throw new Error(`Refusing cold-start smoke because fixed sandbox port ${SANDBOX_PORT} is already listening (pid ${pids.join(", ")})`);
  }
}

function profileBundles(value) {
  const profile = value?.dsh?.profile;
  return Array.isArray(profile?.bundles) ? profile.bundles : [];
}

export function validateSandboxProfile(text) {
  let profile;
  try {
    profile = JSON.parse(text);
  } catch (error) {
    throw new Error(`Sandbox profile package.json is invalid JSON: ${error.message}`, { cause: error });
  }
  if (profile === null || typeof profile !== "object" || Array.isArray(profile)) {
    throw new Error("Sandbox profile package.json must be an object");
  }
  const dependencies = profile.dependencies;
  const bundles = new Set(profileBundles(profile));
  for (const name of REQUIRED_SANDBOX_PLUGINS) {
    const spec = dependencies?.[name];
    if (typeof spec !== "string" || !spec.startsWith("link:")) {
      throw new Error(`Sandbox profile must link ${name} from this checkout`);
    }
    if (!bundles.has(name)) throw new Error(`Sandbox profile bundle list is missing ${name}`);
  }
  return [...REQUIRED_SANDBOX_PLUGINS];
}

export function validateDoctorReport(report, expectedHome = sandboxHome()) {
  if (report === null || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("xtz doctor did not return an object");
  }
  if (report.ok !== true || report.ready !== true
    || typeof report.home !== "string"
    || resolve(report.home) !== resolve(expectedHome)) {
    throw new Error("xtz doctor did not report a ready sandbox home");
  }
  const checks = Array.isArray(report.checks) ? report.checks : [];
  const required = [
    "node",
    "dsh",
    "xtz-seed",
    "profile-transaction",
    "profile-path",
    "profile-bundles",
    "profile-install",
    "profile-links",
    "service",
  ];
  for (const id of required) {
    if (!checks.some((check) => check?.id === id && check?.level === "ok")) {
      throw new Error(`xtz doctor did not pass required check: ${id}`);
    }
  }
  return report;
}

export async function waitForSandboxReady(probe, options = {}) {
  const attempts = options.attempts ?? READY_ATTEMPTS;
  const intervalMs = options.intervalMs ?? READY_INTERVAL_MS;
  const sleep = options.sleep ?? ((ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)));
  let lastState = "unknown";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const status = await probe();
      lastState = typeof status?.state === "string" ? status.state : "invalid";
      if (status?.state === "running" && status?.healthy === true && status?.owner === "xiaotaozi-dsh") {
        return status;
      }
    } catch (error) {
      lastState = error instanceof Error ? error.message : String(error);
    }
    if (attempt + 1 < attempts) await sleep(intervalMs);
  }
  throw new Error(`Sandbox identity was not ready after ${attempts} probes (last: ${lastState})`);
}

export function missingPluginMounts(output) {
  const text = typeof output === "string" ? output : "";
  return Object.entries(REQUIRED_MOUNT_MARKERS)
    .filter(([, marker]) => !text.includes(marker))
    .map(([name]) => name);
}

export async function waitForPluginMounts(readOutput, options = {}) {
  const attempts = options.attempts ?? 100;
  const intervalMs = options.intervalMs ?? 100;
  const sleep = options.sleep ?? ((ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)));
  let missing = missingPluginMounts(readOutput());
  for (let attempt = 0; attempt < attempts && missing.length > 0; attempt += 1) {
    await sleep(intervalMs);
    missing = missingPluginMounts(readOutput());
  }
  if (missing.length > 0) throw new Error(`Sandbox Host did not mount: ${missing.join(", ")}`);
  return [...REQUIRED_SANDBOX_PLUGINS];
}

function runCommand(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? sandboxEnv(),
      stdio: "inherit",
      windowsHide: true,
      shell: process.platform === "win32",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal !== null) reject(new Error(`${command} ${args.join(" ")} exited via ${signal}`));
      else if (code !== 0) reject(new Error(`${command} ${args.join(" ")} exited ${code}`));
      else resolvePromise();
    });
  });
}

function runCli(nodePath, cliJs, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const json = options.json === true;
    const timeoutMs = options.timeoutMs ?? COMMAND_TIMEOUT_MS;
    const child = spawn(nodePath, [cliJs, "--sandbox", ...args, ...(json ? ["--json"] : [])], {
      cwd: repoRoot,
      env: sandboxEnv({ ...process.env, DSH_PLUGIN_TRACE: "0" }),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error !== undefined) reject(error);
      else resolvePromise(value);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error(`${args[0]} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.once("error", (error) => finish(error));
    child.once("exit", (code, signal) => {
      const toleratedMissingRecord = options.allowMissingRecord === true
        && signal === null
        && code === 1
        && stdout.trim() === ""
        && stderr.trim() === "没有 xtz 拉起的进程。";
      if (signal !== null || (code !== 0 && !toleratedMissingRecord)) {
        finish(new Error(stderr.trim() || stdout.trim() || `${args[0]} exited ${signal ?? code}`));
        return;
      }
      if (!json) {
        finish(undefined, { stdout, stderr });
        return;
      }
      try {
        finish(undefined, JSON.parse(stdout));
      } catch (error) {
        finish(new Error(`${args[0]} returned invalid JSON: ${stdout.trim()}`, { cause: error }));
      }
    });
  });
}

function runCliJson(nodePath, cliJs, args) {
  return runCli(nodePath, cliJs, args, { json: true });
}

function childExit(child) {
  return new Promise((resolvePromise) => {
    child.once("exit", (code, signal) => resolvePromise({ code, signal }));
    child.once("error", (error) => resolvePromise({ code: null, signal: null, error }));
  });
}

async function waitForResult(promise, timeoutMs) {
  return await Promise.race([
    promise,
    new Promise((resolvePromise) => setTimeout(() => resolvePromise(null), timeoutMs)),
  ]);
}

export async function stopOwnedChild(child, closed, options = {}) {
  const timeoutMs = options.timeoutMs ?? STOP_TIMEOUT_MS;
  const waitFor = options.waitFor ?? waitForResult;
  if (child.exitCode !== null || child.signalCode !== null) return await closed;
  child.kill("SIGTERM");
  const result = await waitFor(closed, timeoutMs);
  if (result !== null) return result;
  child.kill("SIGKILL");
  const killed = await waitFor(closed, Math.min(timeoutMs, 2_000));
  if (killed === null) throw new Error("sandbox wrapper did not exit after SIGKILL");
  return killed;
}

export async function readSandboxPidRecord(home, options = {}) {
  const read = options.readFile ?? readFile;
  let text;
  try {
    text = await read(join(home, WEB_PID_FILE), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error("Sandbox PID record is invalid JSON; preserving .dsh-home", { cause: error });
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)
    || !Number.isInteger(parsed.pid) || parsed.pid <= 1
    || typeof parsed.startedAt !== "string" || parsed.startedAt.length === 0
    || typeof parsed.identity !== "string" || parsed.identity.length === 0
    || parsed.identity.length > 512 || /[\u0000-\u001f\u007f]/u.test(parsed.identity)) {
    throw new Error("Sandbox PID record has no valid process identity; preserving .dsh-home");
  }
  return { pid: parsed.pid, startedAt: parsed.startedAt, identity: parsed.identity };
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

let cliProcessTools;
async function readProcessIdentity(pid) {
  cliProcessTools ??= import(pathToFileURL(join(repoRoot, "apps", "cli", "lib", "index.js")).href);
  const tools = await cliProcessTools;
  if (typeof tools.readProcessIdentity !== "function") {
    throw new Error("Built xtz CLI does not export readProcessIdentity");
  }
  return await tools.readProcessIdentity(pid);
}

export async function waitForRecordedProcessGone(record, options = {}) {
  if (record === null || typeof record !== "object"
    || !Number.isInteger(record.pid) || record.pid <= 1
    || typeof record.identity !== "string" || record.identity.length === 0) {
    throw new Error("Cannot confirm an invalid sandbox PID record");
  }
  const timeoutMs = options.timeoutMs ?? STOP_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? PROCESS_GONE_INTERVAL_MS;
  const alive = options.processAlive ?? processAlive;
  const inspectIdentity = options.readProcessIdentity ?? readProcessIdentity;
  const sleep = options.sleep ?? ((ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)));
  const deadline = Date.now() + timeoutMs;
  do {
    if (!alive(record.pid)) return;
    const currentIdentity = await inspectIdentity(record.pid);
    if (currentIdentity !== null && currentIdentity !== record.identity) return;
    if (currentIdentity === null && !alive(record.pid)) return;
    if (Date.now() >= deadline) break;
    await sleep(intervalMs);
  } while (true);
  throw new Error(`Sandbox PID ${record.pid} still has the recorded process identity; preserving .dsh-home`);
}

export async function cleanupSmokeRun(run, options = {}) {
  const stopChild = options.stopChild ?? stopOwnedChild;
  const listPids = options.listPids ?? (async () => await listListenPids(Number(SANDBOX_PORT)));
  const readRecord = options.readRecord ?? readSandboxPidRecord;
  const waitRecordedGone = options.waitRecordedGone ?? waitForRecordedProcessGone;
  const stopRecorded = options.stopRecorded ?? (async () => {
    await runCli(run.nodePath, run.cliJs, ["stop"], {
      timeoutMs: 10_000,
      allowMissingRecord: true,
    });
  });
  const removeHome = options.removeHome ?? (async (home) => await rm(home, { recursive: true, force: true }));

  const failures = [];
  const records = new Map();
  const observeRecord = async () => {
    try {
      const record = await readRecord(run.home);
      if (record !== null) records.set(`${record.pid}\0${record.identity}`, record);
    } catch (error) {
      failures.push(error);
    }
  };

  // Capture the child generation before stopping the foreground wrapper: the
  // wrapper may remove the record as it exits, but cleanup must still prove
  // that the recorded generation disappeared.
  await observeRecord();
  if (run.child !== undefined && run.closed !== undefined) {
    try {
      await stopChild(run.child, run.closed);
    } catch (error) {
      failures.push(error);
    }
  }
  await observeRecord();

  // This is unconditional and independent of whether 3081 is listening. The
  // CLI validates the PID record's generation identity before signalling.
  try {
    await stopRecorded();
  } catch (error) {
    failures.push(error);
  }
  for (const record of records.values()) {
    try {
      await waitRecordedGone(record);
    } catch (error) {
      failures.push(error);
    }
  }
  try {
    assertSandboxPortEmpty(await listPids());
  } catch (error) {
    failures.push(error);
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "Sandbox smoke cleanup failed; preserving .dsh-home");
  await removeHome(run.home);
}

async function main(argv = process.argv.slice(2)) {
  const parsed = parseSmokeArgs(argv);
  if (parsed.help) {
    process.stdout.write(usage());
    return;
  }

  const home = sandboxHome();
  if (resolve(home) !== resolve(join(repoRoot, ".dsh-home")) || resolve(home) === resolve(repoRoot)) {
    throw new Error(`Unsafe sandbox home target: ${home}`);
  }
  await assertFreshSandboxHome(home);
  assertSandboxPortEmpty(await listListenPids(Number(SANDBOX_PORT)));

  const cliJs = await ensureXtzCli({ log: (message) => process.stdout.write(`${message}\n`) });
  const nodePath = await pinnedNodePath();
  await runCommand("pnpm", ["build"]);
  await runCommand("pnpm", ["build"], { cwd: join(repoRoot, "apps", "cli") });

  let webChild;
  let webClosed;
  let webOutput = "";
  let failure;
  let cleanupPromise;
  let interrupted = false;
  const cleanup = () => {
    cleanupPromise ??= cleanupSmokeRun({
      child: webChild,
      closed: webClosed,
      home,
      nodePath,
      cliJs,
    });
    return cleanupPromise;
  };
  const onSignal = (signal) => {
    if (interrupted) return;
    interrupted = true;
    void cleanup().then(
      () => {
        process.removeListener("SIGINT", onSigint);
        process.removeListener("SIGTERM", onSigterm);
        process.exit(signal === "SIGINT" ? 130 : 143);
      },
      (error) => {
        process.stderr.write(`sandbox signal cleanup failed: ${error.stack ?? error.message}\n`);
        process.exit(1);
      },
    );
  };
  const onSigint = () => onSignal("SIGINT");
  const onSigterm = () => onSignal("SIGTERM");
  // Install outer-wrapper handlers before spawning so SIGINT/SIGTERM cannot
  // land in a gap where the DSH child exists but cleanup is not registered.
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);
  try {
    webChild = spawnSandboxWeb(["--no-open"], {
      cliJs,
      nodePath,
      detached: false,
      spawn: {
        env: sandboxEnv({ ...process.env, DSH_PLUGIN_TRACE: "1" }),
        stdio: ["ignore", "pipe", "pipe"],
      },
    });
    const capture = (chunk, output) => {
      const text = chunk.toString("utf8");
      webOutput = `${webOutput}${text}`.slice(-OUTPUT_LIMIT);
      output.write(chunk);
    };
    webChild.stdout.on("data", (chunk) => capture(chunk, process.stdout));
    webChild.stderr.on("data", (chunk) => capture(chunk, process.stderr));
    webClosed = childExit(webChild);
    let exited;
    webClosed.then((value) => { exited = value; });

    await waitForSandboxReady(async () => {
      if (exited !== undefined) {
        throw new Error(`sandbox start exited early (${exited.error?.message ?? exited.signal ?? exited.code})`);
      }
      return await runCliJson(nodePath, cliJs, ["status"]);
    });
    await waitForPluginMounts(() => webOutput);
    const doctor = validateDoctorReport(await runCliJson(nodePath, cliJs, ["doctor"]), home);
    const profilePath = join(home, "profiles", "web", "package.json");
    const plugins = validateSandboxProfile(await readFile(profilePath, "utf8"));
    process.stdout.write(`sandbox smoke: identity ready; ${plugins.length} first-party plugins mounted; doctor=${doctor.ok}\n`);
  } catch (error) {
    failure = error;
  }

  let cleanupFailure;
  try {
    await cleanup();
  } catch (error) {
    cleanupFailure = error;
  } finally {
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
  }

  if (failure !== undefined && cleanupFailure !== undefined) {
    throw new AggregateError([failure, cleanupFailure], "Sandbox smoke and cleanup both failed");
  }
  if (failure !== undefined) throw failure;
  if (cleanupFailure !== undefined) throw cleanupFailure;
}

const isDirectRun = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
