import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";

// Source-only modules retain the package's bundler-style relative imports.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && context.parentURL?.includes("/src/")) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(candidate)) return next(candidate.href, context);
    }
    return next(specifier, context);
  },
});
const { createLaunchOutputCollector } = await import("../src/launch-output.ts");
const url = "http://127.0.0.1:43210/?token=synthetic-token";
const line = `dsh web: ${url}\n`;
const collector = (options = {}) =>
  createLaunchOutputCollector({
    timeoutMs: 1000,
    maxLineBytes: 65536,
    ...options,
  });

test("all token splits wait for line completion independently on both streams", async () => {
  for (const stream of ["stdout", "stderr"]) {
    for (let split = 1; split < line.length; split++) {
      const c = collector();
      let done = false;
      c.url.then(() => {
        done = true;
      });
      c.push(stream, line.slice(0, split));
      c.push(
        stream === "stdout" ? "stderr" : "stdout",
        "unrelated error line\npartial",
      );
      await Promise.resolve();
      assert.equal(done, false);
      c.push(stream, line.slice(split));
      assert.equal(await c.url, url);
      c.dispose();
    }
  }
});

test("multiple lines, split CRLF and EOF final logical line", async () => {
  const c = collector();
  c.push("stdout", `noise\n${line.trim()}\r`);
  let done = false;
  c.url.then(() => {
    done = true;
  });
  await Promise.resolve();
  assert.equal(done, false);
  c.push("stdout", "\n");
  assert.equal(await c.url, url);
  const eof = collector();
  eof.push("stderr", line.trim());
  eof.end("stderr");
  assert.equal(await eof.url, url);
});

test("overflow drops entire line and never salvages a suffix", async () => {
  const c = collector({ maxLineBytes: 100 });
  c.push("stdout", "x".repeat(101));
  c.push("stdout", line);
  c.push("stderr", "界".repeat(34) + line);
  let done = false;
  c.url.then(() => {
    done = true;
  });
  await Promise.resolve();
  assert.equal(done, false);
  c.push("stdout", line);
  assert.equal(await c.url, url);
});

test("invalid URLs, duplicate tokens and credentials/path confusion are rejected", async () => {
  const c = collector();
  for (const value of [
    "http://example.com/?token=x",
    "file:///tmp/?token=x",
    "http://127.0.0.1/?token=x&token=y",
    "http://127.0.0.1/",
    "http://user:pass@127.0.0.1/?token=x",
    "http://127.0.0.1/other?token=x",
    "http://127.0.0.1:99999/?token=x",
  ])
    c.push("stdout", `dsh web: ${value}\n`);
  c.end("stdout");
  c.end("stderr");
  assert.equal(await c.url, undefined);
});

test("both EOFs, deadline, failure and disposal settle once and ignore late data", async () => {
  for (const finish of [
    (c) => {
      c.end("stdout");
      c.end("stderr");
    },
    (c) => c.fail(),
    (c) => c.dispose(),
    () => {},
  ]) {
    const c = collector({ timeoutMs: 20 });
    finish(c);
    const [value] = await Promise.all([
      c.url,
      new Promise((resolve) => setTimeout(resolve, 25)),
    ]);
    assert.equal(value, undefined);
    c.push("stdout", line);
    c.end("stderr");
    c.fail();
    c.dispose();
    c.dispose();
    assert.equal(await c.url, undefined);
  }
});

test("one stream EOF does not consume the other stream and first valid line wins", async () => {
  const c = collector();
  c.end("stdout");
  c.push("stdout", line);
  c.push("stderr", line + "dsh web: http://localhost:43210/?token=other\n");
  assert.equal(await c.url, url);
});

test("startup IPC accepts only exact bounded versioned URL and done objects", async () => {
  const { isStartupDone, startupMessageUrl } = await import(
    "../src/launch-output.ts"
  );
  assert.equal(
    startupMessageUrl({ kind: "xtz-startup-url", version: 1, url }),
    url,
  );
  for (const message of [
    null,
    [],
    url,
    { kind: "xtz-startup-url", version: 2, url },
    { kind: "xtz-startup-url", version: 1, url, extra: true },
    { kind: "xtz-startup-url", version: 1, url: url + "\n" },
    { kind: "xtz-startup-url", version: 1, url: "x".repeat(65537) },
    {
      kind: "xtz-startup-url",
      version: 1,
      url: "http://127.0.0.1/path?token=x",
    },
    Object.assign(Object.create({ inherited: true }), {
      kind: "xtz-startup-url",
      version: 1,
      url,
    }),
  ])
    assert.equal(startupMessageUrl(message), undefined);
  assert.equal(isStartupDone({ kind: "xtz-startup-done", version: 1 }), true);
  assert.equal(
    isStartupDone({ kind: "xtz-startup-done", version: 1, url }),
    false,
  );
  assert.equal(isStartupDone({ kind: "xtz-startup-done", version: 2 }), false);
});
