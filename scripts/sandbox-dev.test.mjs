import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  classifyWatchedPath,
  createChangeTracker,
  createDebouncer,
  HOST_RESTART_DEBOUNCE_MS,
  listWatchablePlugins,
  normalizePluginSlug,
  parseSandboxDevArgs,
  pnpmFilterArgs,
} from "./sandbox-dev.mjs";
import {
  dshWebArgs,
  freeSandboxListenPort,
  listenPortFromArgs,
  parseListenPids,
} from "./sandbox-web.mjs";

test("parseSandboxDevArgs defaults to --no-open and watch", () => {
  assert.deepEqual(parseSandboxDevArgs([]), {
    once: false,
    open: false,
    filters: [],
    extra: ["--no-open"],
  });
  assert.equal(parseSandboxDevArgs(["--once"]).once, true);
  assert.deepEqual(parseSandboxDevArgs(["--open"]).extra, []);
  assert.deepEqual(parseSandboxDevArgs(["--no-open", "--patch", "x.yml"]).extra, ["--no-open", "--patch", "x.yml"]);
  assert.equal(parseSandboxDevArgs(["-h"]).help, true);
});

test("parseSandboxDevArgs collects plugin filters", () => {
  assert.deepEqual(parseSandboxDevArgs(["--filter", "im"]).filters, ["im"]);
  assert.deepEqual(parseSandboxDevArgs(["--filter", "im,hello"]).filters, ["im", "hello"]);
  assert.deepEqual(parseSandboxDevArgs(["--filter", "dsh-im", "--filter", "hello"]).filters, ["im", "hello"]);
  assert.deepEqual(parseSandboxDevArgs(["--filter=im,hello"]).filters, ["im", "hello"]);
  assert.throws(() => parseSandboxDevArgs(["--filter"]), /requires/);
  assert.throws(() => parseSandboxDevArgs(["--filter", "--once"]), /requires/);
  assert.throws(() => parseSandboxDevArgs(["--filter", "../im"]), /Invalid plugin slug/);
});

test("normalizePluginSlug accepts dsh- prefix", () => {
  assert.equal(normalizePluginSlug("im"), "im");
  assert.equal(normalizePluginSlug("dsh-hello"), "hello");
  assert.throws(() => normalizePluginSlug(""), /required/);
});

test("pnpmFilterArgs matches workspace packages", () => {
  assert.deepEqual(pnpmFilterArgs([]), ["--filter", "./plugins/**"]);
  assert.deepEqual(pnpmFilterArgs(["im", "hello"]), ["--filter", "dsh-im", "--filter", "dsh-hello"]);
});

test("dshWebArgs keeps an explicit port and defaults to 3081", () => {
  assert.deepEqual(dshWebArgs(["--no-open"]), ["web", "--port", "3081", "--no-open"]);
  assert.deepEqual(dshWebArgs(["--port", "3999"]), ["web", "--port", "3999"]);
  assert.deepEqual(dshWebArgs(["--port=3999"]), ["web", "--port=3999"]);
});

test("listenPortFromArgs defaults to 3081 and never infers 3080", () => {
  assert.equal(listenPortFromArgs(["--no-open"]), 3081);
  assert.equal(listenPortFromArgs(["--port", "3999"]), 3999);
  assert.equal(listenPortFromArgs(["--port=3999"]), 3999);
});

test("parseListenPids ignores junk and pid 1", () => {
  assert.deepEqual(parseListenPids(""), []);
  assert.deepEqual(parseListenPids("1\n30623\n30623\n"), [30623]);
});

test("freeSandboxListenPort refuses official 3080 and SIGTERMs leftover pids", async () => {
  const killed = [];
  let listed = [30623];
  await assert.rejects(
    () => freeSandboxListenPort(3080, {
      listPids: async () => [1],
      kill(pid, signal) { killed.push([pid, signal]); },
    }),
    /3080/,
  );
  assert.deepEqual(killed, []);

  const stopped = await freeSandboxListenPort(3081, {
    listPids: async () => listed,
    kill(pid, signal) {
      killed.push([pid, signal]);
      if (signal === "SIGTERM") listed = [];
    },
    sleep: async () => {},
    selfPid: 111,
    log() {},
  });
  assert.deepEqual(stopped, [30623]);
  assert.deepEqual(killed, [[30623, "SIGTERM"]]);

  killed.length = 0;
  listed = [99];
  await freeSandboxListenPort(3081, {
    listPids: async () => listed,
    kill(pid, signal) {
      killed.push([pid, signal]);
      if (signal === "SIGKILL") listed = [];
    },
    sleep: async () => {},
    timeoutMs: 0,
    selfPid: 111,
    log() {},
  });
  assert.deepEqual(killed, [[99, "SIGTERM"], [99, "SIGKILL"]]);
});

test("classifyWatchedPath only restarts host artifacts", () => {
  const root = "/repo/plugins";
  assert.equal(classifyWatchedPath("/repo/plugins/im/lib/index.js", root), "host");
  assert.equal(classifyWatchedPath("/repo/plugins/im/cordis.patch.yml", root), "host");
  assert.equal(classifyWatchedPath("/repo/plugins/im/lib/client.js", root), "client");
  assert.equal(classifyWatchedPath("/repo/plugins/im/src/index.ts", root), "ignore");
  assert.equal(classifyWatchedPath("/repo/plugins/im/lib/index.js.map", root), "ignore");
  assert.equal(classifyWatchedPath("/repo/plugins/im/node_modules/x/index.js", root), "ignore");
  assert.equal(classifyWatchedPath("/repo/AGENTS.md", root), "ignore");
});

test("change tracker restarts only when host content hash changes", () => {
  const tracker = createChangeTracker();
  tracker.seed("/p/lib/index.js", "aaa");
  tracker.seed("/p/lib/client.js", "ccc");
  assert.equal(tracker.apply("/p/lib/index.js", "host", "aaa"), "unchanged");
  assert.equal(tracker.apply("/p/lib/index.js", "host", "bbb"), "host");
  assert.equal(tracker.apply("/p/lib/client.js", "client", "ddd"), "client");
  assert.equal(tracker.apply("/p/lib/client.js", "client", "ddd"), "unchanged");
  assert.equal(tracker.apply("/p/src/index.ts", "ignore", "zzz"), "ignore");
});

test("debouncer coalesces host restarts", async () => {
  const calls = [];
  const timers = new Map();
  let nextId = 1;
  const fake = {
    setTimeout(fn, delay) {
      const id = nextId;
      nextId += 1;
      timers.set(id, { fn, delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };
  const debounce = createDebouncer(() => calls.push("run"), HOST_RESTART_DEBOUNCE_MS, fake);
  debounce.schedule();
  debounce.schedule();
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].delay, 800);
  debounce.cancel();
  assert.equal(timers.size, 0);
  debounce.schedule();
  [...timers.values()][0].fn();
  assert.deepEqual(calls, ["run"]);
});

test("listWatchablePlugins reads tsdown packages and rejects unknown filters", async () => {
  const listed = await listWatchablePlugins();
  assert.ok(listed.includes("im"));
  assert.ok(listed.includes("hello"));
  await assert.rejects(() => listWatchablePlugins(undefined, ["not-a-plugin"]), /Unknown plugin filter/);
});

test("listWatchablePlugins discovers tsdown.config.ts in a temp tree", async () => {
  const root = await mkdtemp(join(tmpdir(), "sandbox-dev-"));
  await mkdir(join(root, "im"), { recursive: true });
  await mkdir(join(root, "skip-me"), { recursive: true });
  await writeFile(join(root, "im", "tsdown.config.ts"), "export default {};\n");
  assert.deepEqual(await listWatchablePlugins(root, []), ["im"]);
  assert.deepEqual(await listWatchablePlugins(root, ["im"]), ["im"]);
});
