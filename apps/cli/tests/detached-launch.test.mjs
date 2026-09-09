import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
const runtime = new URL("../src/runtime.ts", import.meta.url).href;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const windows = process.platform === "win32";
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}
const imports = `
  import { existsSync } from 'node:fs';
  import { registerHooks } from 'node:module';
  registerHooks({ resolve(specifier, context, next) {
    if (specifier.startsWith('.') && context.parentURL?.includes('/src/')) {
      const candidate = new URL(specifier + '.ts', context.parentURL);
      if (existsSync(candidate)) return next(candidate.href, context);
    }
    return next(specifier, context);
  } });
  const { spawnDshDetached, runtimeInternals } = await import(${JSON.stringify(runtime)});
`;

for (const mode of [
  "url",
  "no-url",
  "invalid",
  "unterminated",
  "oversize",
  "early-disconnect",
  "malformed-ipc",
]) {
  test(`detached production launcher exits while child keeps writing both streams: ${mode}`, {
    timeout: windows ? 45000 : 7000,
  }, async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "xtz-detached-"));
    const readyMarker = join(dir, "wrapper-ready");
    const marker = join(dir, "progress.json");
    const childFile = join(dir, "child.mjs");
    const wrapperFile = join(dir, "wrapper.mjs");
    await writeFile(
      childFile,
      `
      import { existsSync, writeFileSync } from 'node:fs';
      let ticks = 0; let failures = 0; let ready = false;
      const windows = ${JSON.stringify(windows)};
      const readyMarker = ${JSON.stringify(readyMarker)};
      const marker = ${JSON.stringify(marker)};
      const record = () => writeFileSync(marker, JSON.stringify({ pid: process.pid, ticks, failures }));
      process.stdout.on('error', () => { failures++; record(); });
      process.stderr.on('error', () => { failures++; record(); });
      const mode = ${JSON.stringify(mode)};
      if (mode === 'url') {
        process.stdout.write('dsh web: http://127.0.0.1:43210/?token=synthetic-');
        process.stderr.write('unrelated error line\\n');
        setTimeout(() => process.stdout.write('token\\n'), 25);
      } else if (mode === 'early-disconnect') process.disconnect();
      else if (mode === 'malformed-ipc') process.send({ kind: 'xtz-startup-url', version: 2, url: 'http://127.0.0.1:43210/?token=synthetic' });
      else if (mode === 'invalid') process.stdout.write('dsh web: http://remote.invalid/?token=x\\n');
      else if (mode === 'unterminated') process.stdout.write('dsh web: http://127.0.0.1:43210/?token=partial');
      else if (mode === 'oversize') process.stdout.write('x'.repeat(70000) + 'dsh web: http://127.0.0.1:43210/?token=x\\n');
      const interval = setInterval(() => {
        process.stdout.write(Buffer.alloc(65536, 120)); process.stderr.write(Buffer.alloc(65536, 121));
        ticks++; record();
        if (windows && !ready && existsSync(readyMarker)) {
          ready = true;
          clearTimeout(watchdog);
          setTimeout(finish, 1400);
        }
      }, 40);
      function finish() { clearInterval(interval); record(); }
      // Real PowerShell identity may take 25s; wait for actual wrapper readiness,
      // never a guessed timer, with a hard 30s pre-readiness watchdog.
      const watchdog = setTimeout(() => {
        if (windows && !ready) failures++;
        finish();
      }, windows ? 30000 : 1400);
    `,
    );
    await writeFile(
      wrapperFile,
      `${imports}
      import { writeFileSync } from 'node:fs';
      runtimeInternals.resolveLaunch = async () => ({ command: process.execPath, prefixArgs: [${JSON.stringify(childFile)}] });
      runtimeInternals.captureTimeoutMs = 180;
      const child = await spawnDshDetached([], ${JSON.stringify(dir)}, ${JSON.stringify(dir)});
      const url = await child.authenticatedUrl;
      writeFileSync(${JSON.stringify(readyMarker)}, 'ready');
      console.log(JSON.stringify({ pid: child.pid, valid: url === 'http://127.0.0.1:43210/?token=synthetic-token', missing: url === undefined }));
    `,
    );
    const wrapper = spawn(
      process.execPath,
      ["--experimental-strip-types", wrapperFile],
      { stdio: ["ignore", "pipe", "pipe"], shell: false },
    );
    let output = "";
    let errors = "";
    let readyAt;
    wrapper.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.includes("\n")) readyAt ??= Date.now();
    });
    wrapper.stderr.on("data", (chunk) => {
      errors += chunk;
    });
    const closed = once(wrapper, "close");
    let childPid;
    let deadline;
    try {
      const outcome = await Promise.race([
        closed,
        new Promise((_, reject) => {
          deadline = setTimeout(
            () => reject(new Error("wrapper did not exit")),
            windows ? 35000 : 3000,
          );
        }),
      ]);
      assert.deepEqual(outcome, [0, null], errors);
      assert.ok(readyAt);
      const exitAfterReadyMs = Date.now() - readyAt;
      assert.ok(exitAfterReadyMs < 750, "wrapper retained startup handles");
      const result = JSON.parse(output);
      childPid = result.pid;
      assert.equal(result.valid, mode === "url");
      assert.equal(result.missing, mode !== "url");
      assert.equal(alive(wrapper.pid), false);
      assert.equal(alive(childPid), true);
      await delay(100);
      const first = JSON.parse(await readFile(marker, "utf8"));
      await delay(180);
      const later = JSON.parse(await readFile(marker, "utf8"));
      assert.ok(
        later.ticks > first.ticks,
        "child progress must increase after wrapper death",
      );
      assert.equal(later.failures, 0);
      for (let i = 0; i < 60 && alive(childPid); i++) await delay(40);
      assert.equal(alive(childPid), false, "owned child must eventually exit");
      assert.equal(JSON.parse(await readFile(marker, "utf8")).failures, 0);
      t.diagnostic(
        `mode=${mode} wrapperExitAfterReadyMs=${exitAfterReadyMs} postExitTicks=${first.ticks}->${later.ticks} wrapperPid=${wrapper.pid} childPid=${childPid} bothAbsent=true`,
      );
    } finally {
      clearTimeout(deadline);
      if (alive(wrapper.pid)) wrapper.kill("SIGKILL");
      if (!childPid) {
        try {
          childPid = JSON.parse(await readFile(marker, "utf8")).pid;
        } catch {}
      }
      if (childPid && alive(childPid)) process.kill(childPid, "SIGKILL");
      for (
        let i = 0;
        i < 50 && (alive(wrapper.pid) || (childPid && alive(childPid)));
        i++
      )
        await delay(40);
      assert.equal(alive(wrapper.pid), false, "fixture wrapper cleanup");
      if (childPid)
        assert.equal(alive(childPid), false, "fixture child cleanup");
    }
  });
}

test("failed spawn rejects without unhandled child errors or capture handles", {
  timeout: 5000,
}, async () => {
  const dir = await mkdtemp(join(tmpdir(), "xtz-detached-error-"));
  const file = join(dir, "wrapper.mjs");
  await writeFile(
    file,
    `${imports}
    runtimeInternals.resolveLaunch = async () => ({ command: ${JSON.stringify(join(dir, "missing-node"))}, prefixArgs: [] });
    try { await spawnDshDetached([], ${JSON.stringify(dir)}); process.exitCode = 3; }
    catch { console.log('rejected'); }
  `,
  );
  const child = spawn(process.execPath, ["--experimental-strip-types", file], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  let errors = "";
  child.stderr.on("data", (chunk) => {
    errors += chunk;
  });
  try {
    assert.deepEqual(await once(child, "close"), [0, null], errors);
    assert.equal(output.trim(), "rejected");
    assert.equal(alive(child.pid), false);
  } finally {
    if (alive(child.pid)) child.kill("SIGKILL");
  }
});
