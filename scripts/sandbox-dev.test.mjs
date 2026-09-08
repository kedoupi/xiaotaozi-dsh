import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, stat, writeFile, utimes } from "node:fs/promises";
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
  officialXiaotaoziReady,
  parseSandboxDevArgs,
  pnpmFilterArgs,
  waitForStableHostArtifacts,
} from "./sandbox-dev.mjs";
import {
  dshWebArgs,
  ensureXtzCli,
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

test("officialXiaotaoziReady follows the injected probe", async () => {
  assert.equal(await officialXiaotaoziReady({ probe: async () => true }), true);
  assert.equal(await officialXiaotaoziReady({ probe: async () => false }), false);
});

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

test("ensureXtzCli rebuilds warm output and helper-only edits on every supervisor start", async () => {
  const cliDir = await mkdtemp(join(tmpdir(), "xtz-build-policy-"));
  for (const dir of ["src", "lib", "node_modules/@deepseek-ai/dsh"]) await mkdir(join(cliDir, dir), { recursive: true });
  for (const file of ["package.json", "node_modules/@deepseek-ai/dsh/package.json"]) await writeFile(join(cliDir, file), "{}");
  for (const file of ["app.ts", "cli.ts", "runtime.ts"]) await writeFile(join(cliDir, "src", file), "// original");
  await writeFile(join(cliDir, "lib/cli.js"), "// warm output");
  await utimes(join(cliDir, "lib/cli.js"), new Date("2099-01-01"), new Date("2099-01-01"));
  for (const bytes of ["// original", "// changed helper only"]) {
    await writeFile(join(cliDir, "src/runtime.ts"), bytes);
    const calls = []; const observed = [];
    const result = await ensureXtzCli({ cliDir, run: async args => {
      calls.push(args);
      assert.notEqual(args[0], "install", "installed DSH must not be reinstalled");
      if (args[0] === "build") observed.push(await readFile(join(cliDir, "src/runtime.ts"), "utf8"));
    } });
    assert.deepEqual(calls, [["typecheck"], ["rebuild", "--pending"], ["build"]]);
    assert.deepEqual(observed, [bytes]);
    assert.equal(result, join(cliDir, "lib/cli.js"));
  }
});

test("ensureXtzCli restores cold dependency lifecycles after typecheck and before build/return", async () => {
  const cliDir = await mkdtemp(join(tmpdir(), "xtz-build-missing-"));
  const helper = join(cliDir, "spawn-helper");
  await writeFile(helper, "fixture only", { mode: 0o644 });
  const calls = [];
  let entered;
  const rebuilding = new Promise(resolve => { entered = resolve; });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let returned = false;
  const result = ensureXtzCli({ cliDir, run: async args => {
    calls.push(args);
    if (args[0] === "rebuild") {
      assert.deepEqual(calls.slice(0, -1), [["install", "--frozen-lockfile", "--ignore-scripts"], ["typecheck"]]);
      entered();
      await gate;
      await chmod(helper, 0o755);
    }
    if (args[0] === "build") assert.equal((await stat(helper)).mode & 0o777, 0o755, "dependency helper must be executable before CLI build");
  } }).then(path => { returned = true; return path; });
  // Race against completion so the old missing-rebuild policy fails rather than hangs.
  try {
    await Promise.race([rebuilding, result]);
    assert.equal(returned, false);
    assert.equal(calls.some(args => args[0] === "build"), false);
  } finally {
    release();
  }
  assert.equal(await result, join(cliDir, "lib/cli.js"));
  assert.equal((await stat(helper)).mode & 0o777, 0o755);
  assert.deepEqual(calls, [["install", "--frozen-lockfile", "--ignore-scripts"], ["typecheck"], ["rebuild", "--pending"], ["build"]]);
});

for (const failing of ["typecheck", "rebuild"]) {
  test(`ensureXtzCli rejects cold ${failing} failure and restores pending helpers on warm retry`, async () => {
    const cliDir = await mkdtemp(join(tmpdir(), "xtz-build-failure-"));
    const marker = join(cliDir, "node_modules/@deepseek-ai/dsh/package.json");
    const helper = join(cliDir, "spawn-helper");
    const calls = [];
    await assert.rejects(ensureXtzCli({ cliDir, run: async args => {
      calls.push(args[0]);
      if (args[0] === "install") {
        await mkdir(join(cliDir, "node_modules/@deepseek-ai/dsh"), { recursive: true });
        await writeFile(marker, "{}");
        await writeFile(helper, "fixture only", { mode: 0o644 });
      }
      if (args[0] === failing) throw new Error(`fixture ${failing} failed`);
    } }), new RegExp(`fixture ${failing} failed`));
    assert.deepEqual(calls, failing === "typecheck" ? ["install", "typecheck"] : ["install", "typecheck", "rebuild"]);
    assert.equal(await readFile(marker, "utf8"), "{}", "failed cold start has already installed DSH");
    assert.equal((await stat(helper)).mode & 0o777, 0o644);
    calls.length = 0;
    const result = await ensureXtzCli({ cliDir, run: async args => {
      calls.push(args);
      assert.notEqual(args[0], "install", "warm retry must not reinstall dependencies");
      if (args[0] === "rebuild") {
        assert.deepEqual(calls, [["typecheck"], ["rebuild", "--pending"]]);
        await chmod(helper, 0o755);
      }
      if (args[0] === "build") assert.equal((await stat(helper)).mode & 0o777, 0o755, "warm retry must restore the pending helper before build");
    } });
    assert.equal(result, join(cliDir, "lib/cli.js"));
    assert.equal((await stat(helper)).mode & 0o777, 0o755);
    assert.deepEqual(calls, [["typecheck"], ["rebuild", "--pending"], ["build"]]);
  });
}
