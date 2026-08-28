import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";
import { parseWindowsIdentityTicks, processAlive, readProcessIdentity, stopProcess } from "../lib/index.js";

test("parseWindowsIdentityTicks extracts ticks from noisy PowerShell stdout", () => {
  assert.equal(parseWindowsIdentityTicks("638912345678901234\r\n"), "win32:638912345678901234");
  assert.equal(
    parseWindowsIdentityTicks("Get-Process warning\n638912345678901234"),
    "win32:638912345678901234",
  );
  assert.equal(parseWindowsIdentityTicks(null), null);
  assert.equal(parseWindowsIdentityTicks("no ticks here"), null);
});

function restoreEnv(name, previous) {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}

test("process identity protects a real short-lived child from a mismatched PID record", {
  timeout: 30_000,
}, async (context) => {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30_000)"], {
    shell: false,
    stdio: "ignore",
  });
  context.after(() => {
    if (child.pid !== undefined && processAlive(child.pid)) child.kill("SIGKILL");
  });
  await once(child, "spawn");
  assert.ok(child.pid !== undefined);

  const identity = await readProcessIdentity(child.pid);
  assert.notEqual(identity, null, "readProcessIdentity returned null (Windows PowerShell timeout or unreadable metadata)");
  assert.equal(typeof identity, "string");
  assert.equal(await readProcessIdentity(child.pid), identity);

  assert.equal(
    await stopProcess(child.pid, `${identity}:replacement`),
    "identity-mismatch",
  );
  assert.equal(processAlive(child.pid), true);

  const exited = once(child, "exit");
  assert.equal(await stopProcess(child.pid, identity), "stopped");
  await exited;
  assert.equal(await readProcessIdentity(child.pid), null);
});

test("Darwin/BSD ps identity is stable across caller locale and timezone", {
  timeout: 30_000,
  skip: process.platform === "win32",
}, async (context) => {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30_000)"], {
    shell: false,
    stdio: "ignore",
  });
  const previous = {
    LC_ALL: process.env.LC_ALL,
    LANG: process.env.LANG,
    TZ: process.env.TZ,
  };
  context.after(() => {
    restoreEnv("LC_ALL", previous.LC_ALL);
    restoreEnv("LANG", previous.LANG);
    restoreEnv("TZ", previous.TZ);
    if (child.pid !== undefined && processAlive(child.pid)) child.kill("SIGKILL");
  });
  await once(child, "spawn");
  assert.ok(child.pid !== undefined);

  process.env.LC_ALL = "C";
  process.env.LANG = "C";
  process.env.TZ = "Pacific/Honolulu";
  const first = await readProcessIdentity(child.pid, "darwin");

  process.env.LC_ALL = "POSIX";
  process.env.LANG = "POSIX";
  process.env.TZ = "Asia/Shanghai";
  const second = await readProcessIdentity(child.pid, "darwin");

  assert.equal(typeof first, "string");
  assert.equal(second, first);
});
