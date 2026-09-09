import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
const reporter = new URL("../lib/startup-reporter.js", import.meta.url);
const url = "http://127.0.0.1:43210/?token=synthetic-token";

async function fixture(source, before = "") {
  const dir = await mkdtemp(join(tmpdir(), "xtz-reporter-"));
  const pre = join(dir, "before.mjs");
  const main = join(dir, "main.mjs");
  await writeFile(
    pre,
    `globalThis.originalWrites = [process.stdout.write, process.stderr.write];\n${before}`,
  );
  await writeFile(main, source);
  const child = spawn(
    process.execPath,
    ["--import", pathToFileURL(pre).href, "--import", reporter.href, main],
    {
      stdio: ["ignore", "ignore", "pipe", "ipc"],
      shell: false,
    },
  );
  let errors = "";
  child.stderr.on("data", (chunk) => {
    errors += chunk;
  });
  const messages = [];
  child.on("message", (message) => messages.push(message));
  const closed = once(child, "close");
  const exited = once(child, "exit");
  const drained = once(child.stderr, "close");
  return {
    child,
    messages,
    closed,
    exited,
    drained,
    errors: () => errors,
    dir,
  };
}

test("actual packaged preload preserves Buffer/UTF8, callbacks and restores both hooks after one URL", {
  timeout: 5000,
}, async (t) => {
  const f = await fixture(`
    import assert from 'node:assert/strict';
    import { writeFileSync } from 'node:fs';
    let callbacks = 0;
    const bytes = Buffer.from('noise界\\ndsh web: ${url}\\r\\n');
    for (const byte of bytes) process.stdout.write(Buffer.from([byte]), () => callbacks++);
    process.stderr.write('independent partial');
    setTimeout(() => {
      assert.equal(process.stdout.write, originalWrites[0]);
      assert.equal(process.stderr.write, originalWrites[1]);
      assert.equal(callbacks, bytes.length);
      process.stdout.write('dsh web: http://localhost:43210/?token=second\\n');
      writeFileSync(new URL('./restored', import.meta.url), 'yes');
    }, 80);
  `);
  t.after(() => {
    if (f.child.exitCode === null) f.child.kill();
  });
  assert.deepEqual(await f.closed, [0, null], f.errors());
  assert.deepEqual(f.messages, [{ kind: "xtz-startup-url", version: 1, url }]);
  assert.equal(await readFile(join(f.dir, "restored"), "utf8"), "yes");
});

test("actual preload handles EOF final line and early exit without retaining child lifetime", {
  timeout: 5000,
}, async (t) => {
  for (const source of [`process.stderr.write('dsh web: ${url}');`, ""]) {
    const f = await fixture(source);
    t.after(() => {
      if (f.child.exitCode === null) f.child.kill();
    });
    assert.deepEqual(await f.closed, [0, null], f.errors());
    assert.equal(f.messages.length, source ? 1 : 0);
    if (source) assert.equal(f.messages[0].url, url);
  }
});

test("parent done, malformed IPC and early disconnect restore actual hooks", {
  timeout: 5000,
}, async (t) => {
  for (const message of [
    { kind: "xtz-startup-done", version: 1 },
    { kind: "wrong", version: 1 },
    "disconnect",
  ]) {
    const f = await fixture(`
      process.send({ fixture: 'ready' });
      setTimeout(() => {
        if (process.stdout.write !== originalWrites[0] || process.stderr.write !== originalWrites[1]) process.exitCode = 3;
      }, 150);
    `);
    t.after(() => {
      if (f.child.exitCode === null) f.child.kill();
    });
    await Promise.race([
      once(f.child, "message"),
      f.closed.then((outcome) => {
        throw new Error(
          `fixture exited before ready: ${JSON.stringify(outcome)} ${f.errors()}`,
        );
      }),
    ]);
    if (message === "disconnect") f.child.disconnect();
    else f.child.send(message);
    // Node may omit ChildProcess close after parent-initiated IPC disconnect.
    // Prove both OS exit and the only piped stream's closure explicitly instead.
    const [outcome] = await Promise.all([f.exited, f.drained]);
    assert.deepEqual(outcome, [0, null], f.errors());
  }
});

test("internal observer forwards once with exact this/arguments/return/exception and finite timeout", async () => {
  const { installStartupReporter } = await import(reporter.href);
  const target = new EventEmitter();
  target.connected = true;
  const sent = [];
  target.send = (message, callback) => {
    sent.push(message);
    callback?.();
    return true;
  };
  target.disconnect = () => {
    target.connected = false;
  };
  target.channel = { unref() {} };
  const calls = [];
  function write(...args) {
    calls.push([this, args]);
    if (args[0] === "throw") throw new Error("write failed");
    return false;
  }
  target.stdout = Object.assign(new EventEmitter(), { write });
  target.stderr = Object.assign(new EventEmitter(), { write });
  installStartupReporter(target, 20);
  const cb = () => {};
  assert.equal(target.stdout.write(Buffer.from("prefix"), "utf8", cb), false);
  assert.equal(calls[0][0], target.stdout);
  assert.equal(calls[0][1][2], cb);
  assert.throws(() => target.stderr.write("throw"), /write failed/);
  assert.equal(calls.length, 2);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(target.stdout.write, write);
  assert.equal(target.stderr.write, write);
  assert.equal(target.connected, false);
  assert.equal(sent.length, 0);
  assert.equal(target.listenerCount("message"), 0);
  assert.equal(target.listenerCount("disconnect"), 0);
});

test("observer exceptions cannot swallow writes and pending IPC sends have an independent deadline", async () => {
  const { installStartupReporter } = await import(reporter.href);
  for (const mode of ["observer-error", "blocked-send"]) {
    const target = new EventEmitter();
    target.connected = true;
    let writes = 0;
    let sends = 0;
    const write = () => {
      writes++;
      return true;
    };
    target.stdout = Object.assign(new EventEmitter(), { write });
    target.stderr = Object.assign(new EventEmitter(), { write });
    target.channel = { unref() {} };
    target.disconnect = () => {
      target.connected = false;
    };
    target.send = () => {
      sends++;
      return false;
    }; // Deliberately never invokes callback.
    installStartupReporter(target, 20);
    if (mode === "observer-error")
      assert.equal(target.stdout.write({ invalid: true }), true);
    else target.stdout.write(`dsh web: ${url}\n`);
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(writes, 1);
    assert.equal(sends, mode === "blocked-send" ? 1 : 0);
    assert.equal(target.stdout.write, write);
    assert.equal(target.stderr.write, write);
    assert.equal(target.connected, false);
    for (const name of ["message", "disconnect", "beforeExit", "exit"])
      assert.equal(target.listenerCount(name), 0);
    assert.equal(target.stdout.listenerCount("finish"), 0);
    assert.equal(target.stderr.listenerCount("finish"), 0);
  }
});

test("actual stream finish captures an EOF line while unrelated child work remains active", {
  timeout: 5000,
}, async (t) => {
  const f = await fixture(`
    process.stderr.write('dsh web: ${url}');
    process.stderr.end();
    setTimeout(() => {
      if (process.stdout.write !== originalWrites[0] || process.stderr.write !== originalWrites[1]) process.exitCode = 3;
    }, 100);
  `);
  t.after(() => {
    if (f.child.exitCode === null) f.child.kill();
  });
  assert.deepEqual(await f.closed, [0, null], f.errors());
  assert.equal(f.messages.length, 1);
  assert.equal(f.messages[0].url, url);
});

test("stderr fragmented UTF8 token and encoded string writes retain exact bytes", {
  timeout: 5000,
}, async (t) => {
  for (const encoding of ["bytes", "hex"]) {
    const value = "http://localhost:43210/?token=synthetic-界";
    const f = await fixture(`
      process.stdout.write('unrelated partial stdout');
      const bytes = Buffer.from('dsh web: ${value}\\n');
      if (${JSON.stringify(encoding)} === 'bytes') {
        for (const byte of bytes) process.stderr.write(Buffer.from([byte]));
      } else process.stderr.write(bytes.toString('hex'), 'hex');
      setTimeout(() => {}, 40);
    `);
    t.after(() => {
      if (f.child.exitCode === null) f.child.kill();
    });
    assert.deepEqual(await f.closed, [0, null], f.errors());
    assert.deepEqual(f.messages, [
      { kind: "xtz-startup-url", version: 1, url: new URL(value).href },
    ]);
  }
});
