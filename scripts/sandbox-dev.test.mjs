import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  classifyWatchedPath,
  crashRetryMessage,
  createBackoff,
  createChangeTracker,
  createDebouncer,
  CRASH_RELAUNCH_INITIAL_MS,
  CRASH_RELAUNCH_MAX_MS,
  HOST_RESTART_DEBOUNCE_MS,
  listWatchablePlugins,
  missingHostArtifacts,
  normalizePluginSlug,
  parseSandboxDevArgs,
  pnpmFilterArgs,
  waitForStableHostArtifacts,
} from "./sandbox-dev.mjs";
import {
  dshWebArgs,
  freeSandboxListenPort,
  isSandboxDshProcess,
  listListenPids,
  listenPortFromArgs,
  parseListenPids,
  xtzSandboxArgs,
} from "./sandbox-web.mjs";
import {
  SANDBOX_PROCESS_MARKER,
  sandboxAgentsHome,
  sandboxEnv,
  sandboxHome,
} from "./sandbox-home.mjs";

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
  assert.deepEqual(parseSandboxDevArgs(["--filter", "im,xtz-ui"]).filters, ["im", "xtz-ui"]);
  assert.deepEqual(parseSandboxDevArgs(["--filter", "dsh-im", "--filter", "xtz-ui"]).filters, ["im", "xtz-ui"]);
  assert.deepEqual(parseSandboxDevArgs(["--filter=im,xtz-ui"]).filters, ["im", "xtz-ui"]);
  assert.throws(() => parseSandboxDevArgs(["--filter"]), /requires/);
  assert.throws(() => parseSandboxDevArgs(["--filter", "--once"]), /requires/);
  assert.throws(() => parseSandboxDevArgs(["--filter", "../im"]), /Invalid plugin slug/);
});

test("normalizePluginSlug accepts dsh- prefix", () => {
  assert.equal(normalizePluginSlug("im"), "im");
  assert.equal(normalizePluginSlug("dsh-xtz-ui"), "xtz-ui");
  assert.throws(() => normalizePluginSlug(""), /required/);
});

test("pnpmFilterArgs matches workspace packages", () => {
  assert.deepEqual(pnpmFilterArgs([]), ["--filter", "./plugins/**"]);
  assert.deepEqual(pnpmFilterArgs(["im", "xtz-ui"]), ["--filter", "dsh-im", "--filter", "dsh-xtz-ui"]);
});

test("dshWebArgs permits only loopback host and the fixed sandbox port 3081", () => {
  assert.deepEqual(dshWebArgs(["--no-open"]), ["web", "--port", "3081", "--host", "127.0.0.1", "--no-open"]);
  assert.deepEqual(dshWebArgs(["--port", "3081", "--host", "127.0.0.1"]), ["web", "--port", "3081", "--host", "127.0.0.1"]);
  assert.deepEqual(dshWebArgs(["--port=3081", "--host=127.0.0.1"]), ["web", "--port=3081", "--host=127.0.0.1"]);
  assert.throws(() => dshWebArgs(["--port", "3999"]), /fixed to port 3081/u);
  assert.throws(() => dshWebArgs(["--port=3080"]), /fixed to port 3081/u);
  assert.throws(() => dshWebArgs(["--port"]), /requires/u);
  assert.throws(() => dshWebArgs(["--host", "::"]), /fixed to host 127\.0\.0\.1/u);
  assert.throws(() => dshWebArgs(["--host=192.168.1.8"]), /fixed to host 127\.0\.0\.1/u);
  assert.throws(() => dshWebArgs(["--host", "127.0.0.1", "--host=127.0.0.1"]), /at most once/u);
});

test("listenPortFromArgs always returns 3081 and rejects other ports", () => {
  assert.equal(listenPortFromArgs(["--no-open"]), 3081);
  assert.equal(listenPortFromArgs(["--port", "3081"]), 3081);
  assert.throws(() => listenPortFromArgs(["--port=3999"]), /fixed to port 3081/u);
  assert.throws(() => listenPortFromArgs(["--host=::"]), /fixed to host 127\.0\.0\.1/u);
});

test("xtzSandboxArgs is foreground sandbox start and strips host/port", () => {
  assert.deepEqual(xtzSandboxArgs(["--no-open"]), ["--sandbox", "start", "--foreground", "--no-open"]);
  assert.deepEqual(
    xtzSandboxArgs(["--port", "3081", "--host", "127.0.0.1", "--no-open"]),
    ["--sandbox", "start", "--foreground", "--no-open"],
  );
  assert.deepEqual(
    xtzSandboxArgs(["--no-open", "--patch", "x.yml"]),
    ["--sandbox", "start", "--foreground", "--no-open", "--", "--patch", "x.yml"],
  );
  assert.throws(() => xtzSandboxArgs(["--port", "3080"]), /fixed to port 3081/u);
});

test("sandboxEnv overwrites official DSH homes and carries an ownership marker", () => {
  const env = sandboxEnv({
    DSH_HOME: "/user/.dsh",
    DSH_AGENTS_HOME: "/user/.agents",
    KEEP_ME: "yes",
  });
  assert.equal(env.DSH_HOME, sandboxHome());
  assert.equal(env.DSH_AGENTS_HOME, sandboxAgentsHome());
  assert.equal(env.XIAOTAOZI_DSH_SANDBOX, SANDBOX_PROCESS_MARKER);
  assert.equal(env.DSH_PLUGIN_TRACE, "1");
  assert.equal(env.KEEP_ME, "yes");
  assert.notEqual(env.DSH_AGENTS_HOME, "/user/.agents");
});

test("sandboxEnv keeps an explicit DSH_PLUGIN_TRACE=0", () => {
  const env = sandboxEnv({ DSH_PLUGIN_TRACE: "0" });
  assert.equal(env.DSH_PLUGIN_TRACE, "0");
  assert.ok(env.XIAOTAOZI_DSH_SANDBOX);
});

test("parseListenPids ignores junk and pid 1", () => {
  assert.deepEqual(parseListenPids(""), []);
  assert.deepEqual(parseListenPids("1\n30623\n30623\n"), [30623]);
});

test("listListenPids rejects non-numeric ports before invoking platform tools", async () => {
  await assert.rejects(() => listListenPids("3081; Get-Process", "win32"), /Invalid listen port/u);
});

test("sandbox process identity requires repo cwd, dsh web 3081, and marker", () => {
  const command = `node /tools/@deepseek-ai/dsh/lib/bin.js web --port 3081 --host 127.0.0.1 XIAOTAOZI_DSH_SANDBOX=${SANDBOX_PROCESS_MARKER}`;
  assert.equal(isSandboxDshProcess({ cwd: "/repo", command }, { repoRoot: "/repo" }), true);
  assert.equal(isSandboxDshProcess({ cwd: "/other", command }, { repoRoot: "/repo" }), false);
  assert.equal(isSandboxDshProcess({ cwd: "/repo", command: command.replace("3081", "3080") }, { repoRoot: "/repo" }), false);
  assert.equal(isSandboxDshProcess({ cwd: "/repo", command: command.replace("127.0.0.1", "::") }, { repoRoot: "/repo" }), false);
  assert.equal(isSandboxDshProcess({ cwd: "/repo", command: command.replace(SANDBOX_PROCESS_MARKER, "wrong") }, { repoRoot: "/repo" }), false);
});

test("freeSandboxListenPort permits only verified sandbox listeners on 3081", async () => {
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
  await assert.rejects(
    () => freeSandboxListenPort(3999, { listPids: async () => [] }),
    /fixed to 3081/u,
  );

  const stopped = await freeSandboxListenPort(3081, {
    listPids: async () => listed,
    verifyPid: async (pid) => pid === 30623,
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
    verifyPid: async (pid) => pid === 99,
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

test("freeSandboxListenPort refuses an unknown listener without signaling it", async () => {
  const killed = [];
  await assert.rejects(
    () => freeSandboxListenPort(3081, {
      listPids: async () => [41000],
      verifyPid: async () => false,
      kill(pid, signal) { killed.push([pid, signal]); },
    }),
    /unknown listener.*refusing/u,
  );
  assert.deepEqual(killed, []);
});

test("freeSandboxListenPort fails closed when process inspection is unavailable", async () => {
  const killed = [];
  await assert.rejects(
    () => freeSandboxListenPort(3081, {
      listPids: async () => [42000],
      verifyPid: async () => { throw new Error("inspection unavailable"); },
      kill(pid, signal) { killed.push([pid, signal]); },
    }),
    /Cannot safely verify.*refusing/u,
  );
  assert.deepEqual(killed, []);
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

test("change tracker ignores deleted host artifacts until they return", () => {
  const tracker = createChangeTracker();
  tracker.seed("/p/lib/index.js", "aaa");
  assert.equal(tracker.apply("/p/lib/index.js", "host", null), "ignore");
  assert.equal(tracker.apply("/p/lib/index.js", "host", "aaa"), "unchanged");
  assert.equal(tracker.apply("/p/lib/index.js", "host", "bbb"), "host");
});

test("backoff grows then caps and reset returns to the initial delay", () => {
  const backoff = createBackoff(CRASH_RELAUNCH_INITIAL_MS, CRASH_RELAUNCH_MAX_MS);
  assert.equal(backoff.next(), 1_000);
  assert.equal(backoff.next(), 2_000);
  assert.equal(backoff.next(), 4_000);
  assert.equal(backoff.next(), 8_000);
  assert.equal(backoff.next(), 10_000);
  assert.equal(backoff.next(), 10_000);
  backoff.reset();
  assert.equal(backoff.next(), 1_000);
});

test("crashRetryMessage does not call the exit a host rebuild", () => {
  assert.equal(crashRetryMessage(1_000, 1, null), "sandbox web exited (code 1); retrying in 1000ms");
  assert.equal(crashRetryMessage(2_000, null, "SIGTERM"), "sandbox web exited (SIGTERM); retrying in 2000ms");
});

test("missingHostArtifacts lists plugins whose lib/index.js hash is null", async () => {
  const hashes = {
    "/repo/plugins/im/lib/index.js": "abc",
    "/repo/plugins/xtz-ui/lib/index.js": null,
  };
  const missing = await missingHostArtifacts(["im", "xtz-ui"], {
    pluginsRoot: "/repo/plugins",
    fileHash: async (path) => hashes[path] ?? null,
  });
  assert.deepEqual(missing, ["xtz-ui"]);
});

test("waitForStableHostArtifacts waits until lib exists and stays", async () => {
  let t = 0;
  const result = await waitForStableHostArtifacts(["im"], {
    pluginsRoot: "/repo/plugins",
    timeoutMs: 2_000,
    quietMs: 800,
    intervalMs: 50,
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
    fileHash: async () => (t >= 200 ? "abc" : null),
  });
  assert.equal(result.ready, true);
  assert.ok(t >= 1_000);
});

test("waitForStableHostArtifacts times out while lib is missing", async () => {
  let t = 0;
  const result = await waitForStableHostArtifacts(["im"], {
    pluginsRoot: "/repo/plugins",
    timeoutMs: 300,
    quietMs: 800,
    intervalMs: 50,
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
    fileHash: async () => null,
  });
  assert.equal(result.ready, false);
  assert.deepEqual(result.missing, ["im"]);
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
  assert.ok(listed.includes("xtz-ui"));
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
