import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertFreshSandboxHome,
  assertSandboxPortEmpty,
  cleanupSmokeRun,
  missingPluginMounts,
  parseSmokeArgs,
  readSandboxPidRecord,
  REQUIRED_SANDBOX_PLUGINS,
  REQUIRED_MOUNT_MARKERS,
  stopOwnedChild,
  validateDoctorReport,
  validateSandboxProfile,
  waitForPluginMounts,
  waitForRecordedProcessGone,
  waitForSandboxReady,
} from "./smoke-sandbox.mjs";

function validProfile() {
  return JSON.stringify({
    dependencies: Object.fromEntries(REQUIRED_SANDBOX_PLUGINS.map((name) => [name, `link:../../../plugins/${name.slice(4)}`])),
    dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", ...REQUIRED_SANDBOX_PLUGINS] } },
  });
}

function validDoctor(home) {
  const ids = [
    "node", "dsh", "xtz-seed", "profile-transaction", "profile-path",
    "profile-bundles", "profile-install", "profile-links", "service",
  ];
  return { ok: true, ready: true, home, checks: ids.map((id) => ({ id, level: "ok" })) };
}

test("smoke arguments have no unsafe home or port overrides", () => {
  assert.deepEqual(parseSmokeArgs([]), { help: false });
  assert.equal(parseSmokeArgs(["--help"]).help, true);
  assert.throws(() => parseSmokeArgs(["--port", "3999"]), /Unknown argument/u);
  assert.throws(() => parseSmokeArgs(["--home=/tmp/other"]), /Unknown argument/u);
});

test("cold-start guard refuses every pre-existing sandbox home", async () => {
  const parent = join(tmpdir(), `dsh-smoke-test-${process.pid}-${Date.now()}`);
  const home = join(parent, ".dsh-home");
  try {
    await assertFreshSandboxHome(home);
    await mkdir(home, { recursive: true });
    await assert.rejects(() => assertFreshSandboxHome(home), /already exists/u);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("fixed sandbox port must be empty before smoke", () => {
  assert.doesNotThrow(() => assertSandboxPortEmpty([]));
  assert.throws(() => assertSandboxPortEmpty([43123]), /3081.*already listening/u);
  assert.throws(() => assertSandboxPortEmpty([1]), /invalid process ids/u);
});

test("profile verification requires all six link-installed bundles", () => {
  assert.deepEqual(validateSandboxProfile(validProfile()), [...REQUIRED_SANDBOX_PLUGINS]);
  const parsed = JSON.parse(validProfile());
  parsed.dependencies[REQUIRED_SANDBOX_PLUGINS[0]] = "github:user/repo";
  assert.throws(() => validateSandboxProfile(JSON.stringify(parsed)), /must link dsh-xtz-ui/u);
  delete parsed.dependencies[REQUIRED_SANDBOX_PLUGINS[0]];
  assert.throws(() => validateSandboxProfile(JSON.stringify(parsed)), /must link dsh-xtz-ui/u);
});

test("doctor verification requires identity, pinned runtime, install, and link checks", () => {
  const home = "/repo/.dsh-home";
  assert.equal(validateDoctorReport(validDoctor(home), home).ok, true);
  const failed = validDoctor(home);
  failed.checks.find((check) => check.id === "profile-links").level = "error";
  assert.throws(() => validateDoctorReport(failed, home), /profile-links/u);
  assert.throws(() => validateDoctorReport(validDoctor("/other"), home), /ready sandbox home/u);
});

test("identity wait retries stopped state and requires the exact healthy owner", async () => {
  const replies = [
    { state: "stopped", healthy: false, owner: "none" },
    { state: "running", healthy: true, owner: "unknown" },
    { state: "running", healthy: true, owner: "xiaotaozi-dsh" },
  ];
  let sleeps = 0;
  const ready = await waitForSandboxReady(async () => replies.shift(), {
    attempts: 3,
    intervalMs: 1,
    sleep: async () => { sleeps += 1; },
  });
  assert.equal(ready.owner, "xiaotaozi-dsh");
  assert.equal(sleeps, 2);
  await assert.rejects(
    () => waitForSandboxReady(async () => ({ state: "stopped" }), { attempts: 2, sleep: async () => {} }),
    /not ready after 2 probes/u,
  );
});

test("mount verification requires an activation trace from every first-party plugin", async () => {
  assert.equal(REQUIRED_MOUNT_MARKERS["dsh-sidebar"], "[dsh-sidebar] ready pty=ok");
  assert.equal(REQUIRED_MOUNT_MARKERS["dsh-market"], "[dsh-market] ready");
  const degraded = Object.values(REQUIRED_MOUNT_MARKERS)
    .filter((marker) => !marker.startsWith("[dsh-sidebar]"))
    .concat("[dsh-sidebar] ready pty=degraded")
    .join("\n");
  assert.deepEqual(missingPluginMounts(degraded), ["dsh-sidebar"]);

  let output = Object.values(REQUIRED_MOUNT_MARKERS).slice(0, -1).join("\n");
  assert.deepEqual(missingPluginMounts(output), ["dsh-wecom-office"]);
  let sleeps = 0;
  const mounted = await waitForPluginMounts(() => {
    if (sleeps === 1) output += `\n${REQUIRED_MOUNT_MARKERS["dsh-wecom-office"]}`;
    return output;
  }, { attempts: 2, sleep: async () => { sleeps += 1; } });
  assert.deepEqual(mounted, [...REQUIRED_SANDBOX_PLUGINS]);
});

test("owned wrapper shutdown is bounded before and after SIGKILL", async () => {
  const signals = [];
  const child = {
    exitCode: null,
    signalCode: null,
    kill(signal) { signals.push(signal); },
  };
  const results = [null, { code: null, signal: "SIGKILL" }];
  const stopped = await stopOwnedChild(child, new Promise(() => {}), {
    waitFor: async () => results.shift(),
  });
  assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
  assert.equal(stopped.signal, "SIGKILL");
});

test("sandbox PID records require the generation identity used by xtz stop", async () => {
  const record = {
    pid: 42001,
    startedAt: "2026-08-28T00:00:00.000Z",
    identity: "darwin:Thu Aug 28 08:00:00 2026",
  };
  assert.deepEqual(await readSandboxPidRecord("/repo/.dsh-home", {
    readFile: async () => JSON.stringify(record),
  }), record);
  assert.equal(await readSandboxPidRecord("/repo/.dsh-home", {
    readFile: async () => { throw Object.assign(new Error("missing"), { code: "ENOENT" }); },
  }), null);
  await assert.rejects(() => readSandboxPidRecord("/repo/.dsh-home", {
    readFile: async () => JSON.stringify({ ...record, identity: undefined }),
  }), /no valid process identity/u);
});

test("recorded process confirmation accepts exit or PID generation reuse", async () => {
  const record = { pid: 42001, identity: "generation-a" };
  const identities = ["generation-a", "generation-b"];
  let sleeps = 0;
  await waitForRecordedProcessGone(record, {
    processAlive: () => true,
    readProcessIdentity: async () => identities.shift(),
    sleep: async () => { sleeps += 1; },
  });
  assert.equal(sleeps, 1);
  await waitForRecordedProcessGone(record, {
    processAlive: () => false,
    readProcessIdentity: async () => { throw new Error("must not inspect a dead pid"); },
  });
});

test("cleanup stops a PID-recorded child before bind even when port 3081 is empty", async () => {
  const calls = [];
  const record = {
    pid: 42001,
    startedAt: "2026-08-28T00:00:00.000Z",
    identity: "generation-a",
  };
  const observed = [record, record];
  await cleanupSmokeRun({
    child: {},
    closed: Promise.resolve({ code: 0, signal: null }),
    home: "/repo/.dsh-home",
    nodePath: "/node",
    cliJs: "/repo/apps/cli/lib/cli.js",
  }, {
    stopChild: async () => { calls.push("wrapper"); },
    readRecord: async () => { calls.push("read-record"); return observed.shift(); },
    listPids: async () => { calls.push("list-port"); return []; },
    stopRecorded: async () => { calls.push("recorded"); },
    waitRecordedGone: async (actual) => {
      assert.deepEqual(actual, record);
      calls.push("gone");
    },
    removeHome: async () => { calls.push("remove"); },
  });
  assert.deepEqual(calls, [
    "read-record",
    "wrapper",
    "read-record",
    "recorded",
    "gone",
    "list-port",
    "remove",
  ]);
});

test("cleanup preserves the smoke home when an unknown listener remains", async () => {
  let removed = false;
  let stopCalls = 0;
  await assert.rejects(() => cleanupSmokeRun({
    home: "/repo/.dsh-home",
    nodePath: "/node",
    cliJs: "/cli.js",
  }, {
    readRecord: async () => null,
    listPids: async () => [42002],
    stopRecorded: async () => { stopCalls += 1; },
    removeHome: async () => { removed = true; },
  }), /already listening/u);
  assert.equal(stopCalls, 1);
  assert.equal(removed, false);
});
