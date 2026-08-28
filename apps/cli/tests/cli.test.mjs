import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { join } from "node:path";
import { test } from "node:test";
import {
  IDENTITY_PATH,
  OFFICIAL_HOST,
  officialDshHome,
  probeService,
  runCli,
  WEB_PID_FILE,
  XTZ_STAMP_FILE,
  extractGlobalFlags,
  installSpecError,
  parseStartArgs,
  resolveStartPort,
  sandboxHomeFromRepo,
  sandboxProcessMarker,
} from "../lib/index.js";

const HOME = "/user/.dsh";
const PROFILE_PACKAGE = `${HOME}/profiles/web/package.json`;
const VALID_XTZ_STAMP = JSON.stringify({ writer: "xtz", createdAt: "2026-08-27T00:00:00.000Z" });
const VALID_PROFILE = JSON.stringify({
  name: "dsh-profile-web",
  private: true,
  dependencies: {
    "dsh-xtz-ui": "file:./vendor/dsh-xtz-ui-0.2.1.tgz",
    "dsh-sidebar": "file:./vendor/dsh-sidebar-0.1.0.tgz",
    "dsh-providers": "file:./vendor/dsh-providers-0.2.1.tgz",
    "dsh-im": "file:./vendor/dsh-im-0.1.0.tgz",
    "dsh-market": "file:./vendor/dsh-market-0.1.0.tgz",
    "dsh-wecom-office": "file:./vendor/dsh-wecom-office-0.1.0.tgz",
  },
  dsh: {
    profile: {
      bundles: [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-xtz-ui",
        "dsh-sidebar",
        "dsh-providers",
        "dsh-im",
        "dsh-market",
        "dsh-wecom-office",
      ],
    },
  },
});

function defaultReadText(path) {
  const portablePath = path.replaceAll("\\", "/");
  if (portablePath.endsWith(XTZ_STAMP_FILE)) return VALID_XTZ_STAMP;
  if (portablePath.endsWith("profiles/web/package.json")) return VALID_PROFILE;
  const installed = /\/profiles\/web\/node_modules\/(dsh-(?:xtz-ui|sidebar|providers|im|market|wecom-office))\/package\.json$/u.exec(portablePath);
  if (installed !== null) return JSON.stringify({ name: installed[1], version: "0.1.0" });
  return null;
}

function defaultPathExists(path) {
  const portable = path.replaceAll("\\", "/");
  if (portable.includes("/node_modules/dsh-hello")) return false;
  return ![".web-staging", ".web-backup", ".web-retired", ".web-seeding", ".xiaotaozi-pack"].some((name) => path.endsWith(name));
}

function fakeDependencies(overrides = {}) {
  const output = { stdout: "", stderr: "" };
  const calls = [];
  const writes = [];
  const removed = [];
  const spawned = [];
  const spawnOptions = [];
  const stopped = [];
  const opened = [];
  const asked = [];
  const files = new Map();
  return {
    output,
    calls,
    writes,
    removed,
    spawned,
    spawnOptions,
    stopped,
    opened,
    asked,
    files,
    dependencies: {
      metadata: {
        name: "xiaotaozi-dsh-cli",
        version: "0.1.0",
        expectedDsh: "0.1.1-rc.2",
        expectedNode: "22.19.0",
        expectedPnpm: "11.22.0",
      },
      home: HOME,
      sandbox: false,
      repoRoot: null,
      nodeVersion: "22.19.0",
      cwd: "/user/project",
      stdout: (text) => { output.stdout += text; },
      stderr: (text) => { output.stderr += text; },
      runDsh: async (args, options) => {
        calls.push({ args, options });
        return { code: 0, stdout: options?.capture ? "0.1.1-rc.2\n" : "", stderr: "", signal: null };
      },
      spawnWeb: async (args, options) => {
        spawned.push(args);
        spawnOptions.push(options);
        return { pid: 4242 };
      },
      probe: async (port = 3080) => ({
        state: "stopped",
        healthy: false,
        host: "127.0.0.1",
        port,
        url: `http://127.0.0.1:${port}/`,
        owner: "none",
      }),
      openUrl: async (url) => {
        opened.push(url);
      },
      isInteractive: () => false,
      ask: async (question) => {
        asked.push(question);
        return null;
      },
      readText: async (path) => files.has(path) ? files.get(path) : defaultReadText(path),
      writeText: async (path, text) => {
        writes.push({ path, text });
        files.set(path, text);
      },
      removePath: async (path) => {
        removed.push(path);
        files.delete(path);
      },
      pathExists: async (path) => defaultPathExists(path),
      realPath: async (path) => path,
      processAlive: () => false,
      stopPid: async (pid) => { stopped.push(pid); },
      wait: async () => {},
      now: () => "2026-08-27T00:00:00.000Z",
      ...overrides,
    },
  };
}

const SANDBOX_HOME = "/repo/.dsh-home";
const SANDBOX_PLUGINS = [
  "./plugins/xtz-ui",
  "./plugins/sidebar",
  "./plugins/providers",
  "./plugins/im",
  "./plugins/market",
  "./plugins/wecom-office",
];

function sandboxDependencies(overrides = {}) {
  return fakeDependencies({
    sandbox: true,
    repoRoot: "/repo",
    home: SANDBOX_HOME,
    ...overrides,
  });
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, OFFICIAL_HOST, resolve);
  });
  return server.address().port;
}

async function close(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("extractGlobalFlags strips --sandbox anywhere in argv", () => {
  assert.deepEqual(extractGlobalFlags(["--sandbox", "start", "--foreground"]), {
    sandbox: true,
    rest: ["start", "--foreground"],
  });
  assert.deepEqual(extractGlobalFlags(["start", "--sandbox", "--no-open"]), {
    sandbox: true,
    rest: ["start", "--no-open"],
  });
  assert.deepEqual(extractGlobalFlags(["start", "--port", "3080"]), {
    sandbox: false,
    rest: ["start", "--port", "3080"],
  });
});

test("parseStartArgs and resolveStartPort pin sandbox to 3081", () => {
  assert.deepEqual(parseStartArgs(["--foreground", "--no-open"]), {
    ok: true,
    options: { port: undefined, foreground: true, noOpen: true, passthrough: [] },
  });
  assert.deepEqual(parseStartArgs(["--no-open", "--", "--patch", "x.yml"]), {
    ok: true,
    options: { port: undefined, foreground: false, noOpen: true, passthrough: ["--patch", "x.yml"] },
  });
  assert.deepEqual(resolveStartPort({ foreground: true, noOpen: true, passthrough: [] }, true), {
    ok: true,
    port: 3081,
  });
  assert.deepEqual(resolveStartPort({ port: 3082, foreground: false, noOpen: false, passthrough: [] }, true), {
    ok: false,
    error: "沙箱固定使用 3081",
  });
  assert.match(resolveStartPort({ port: 3081, foreground: false, noOpen: false, passthrough: [] }, false).error ?? "", /3081/u);
});

test("sandboxProcessMarker matches the scripts hash of a repo root", () => {
  assert.equal(sandboxHomeFromRepo("/repo"), "/repo/.dsh-home");
  assert.equal(sandboxProcessMarker("/repo"), sandboxProcessMarker("/repo/"));
  assert.notEqual(sandboxProcessMarker("/repo"), sandboxProcessMarker("/other"));
});

test("officialDshHome ignores HOME on Windows in favor of USERPROFILE", () => {
  const userProfile = "C:\\Users\\peach";
  assert.equal(
    officialDshHome("win32", { HOME: "C:\\wrong", USERPROFILE: userProfile }, "C:\\fallback"),
    join(userProfile, ".dsh"),
  );
});

test("blocked commands fail closed without invoking DSH", async () => {
  for (const command of ["run", "ask", "update"]) {
    const fixture = fakeDependencies();
    const code = await runCli([command, "ignored"], fixture.dependencies);
    assert.equal(code, 2, command);
    assert.equal(fixture.calls.length, 0, command);
    assert.match(fixture.output.stderr, /暂未开放/u, command);
  }
});

test("init is refused because xtz web prepares the official home", async () => {
  const fixture = fakeDependencies();
  const code = await runCli(["init"], fixture.dependencies);
  assert.equal(code, 2);
  assert.equal(fixture.calls.length, 0);
  assert.match(fixture.output.stderr, /xtz init 已取消/u);
});

test("config dump and defaults fail closed without preparing a profile", async () => {
  for (const action of ["dump", "defaults"]) {
    const fixture = fakeDependencies();
    const code = await runCli(["config", action], fixture.dependencies);
    assert.equal(code, 2, action);
    assert.equal(fixture.calls.length, 0, action);
    assert.match(fixture.output.stderr, /改写 profile/u, action);
  }
});

test("config path is a zero-write local lookup", async () => {
  const fixture = fakeDependencies();
  const code = await runCli(["config", "path"], fixture.dependencies);
  assert.equal(code, 0);
  assert.equal(fixture.calls.length, 0);
  assert.equal(fixture.output.stdout, `${join(HOME, "profiles", "web", "cordis.patch.yml")}\n`);
});

test("plugin commands tell the user to use the market", async () => {
  const fixture = fakeDependencies();
  const code = await runCli(["plugin", "add", "github:kedoupi/xiaotaozi-dsh#path:plugins/market"], fixture.dependencies);
  assert.equal(code, 2);
  assert.equal(fixture.calls.length, 0);
  assert.match(fixture.output.stderr, /xtz 不管理插件/u);
  assert.match(fixture.output.stderr, /市场/u);
});

test("plugin list is refused", async () => {
  const fixture = fakeDependencies();
  const code = await runCli(["plugin", "list"], fixture.dependencies);
  assert.equal(code, 2);
  assert.equal(fixture.calls.length, 0);
});

test("start refuses an occupied port in non-interactive mode", async () => {
  const fixture = fakeDependencies({
    probe: async (port = 3080) => ({
      state: "http-occupied",
      healthy: false,
      host: "127.0.0.1",
      port,
      url: `http://127.0.0.1:${port}/`,
      owner: "unknown",
    }),
  });
  const code = await runCli(["start"], fixture.dependencies);
  assert.equal(code, 2);
  assert.equal(fixture.spawned.length, 0);
  assert.equal(fixture.asked.length, 0);
  assert.match(fixture.output.stderr, /不会结束那个进程/u);
});

test("start refuses a second Xiaotaozi instance it does not own", async () => {
  const fixture = fakeDependencies({
    probe: async (port = 3080) => ({
      state: "running",
      healthy: true,
      host: "127.0.0.1",
      port,
      url: `http://127.0.0.1:${port}/`,
      owner: "xiaotaozi-dsh",
    }),
  });
  const code = await runCli(["start"], fixture.dependencies);
  assert.equal(code, 2);
  assert.equal(fixture.spawned.length, 0);
  assert.match(fixture.output.stderr, /已经是小桃子/u);
});

test("web prepares missing default plugins then starts dsh web", async () => {
  let probes = 0;
  const fixture = fakeDependencies({
    pathExists: async (path) => {
      const portable = path.replaceAll("\\", "/");
      if (portable.includes("/node_modules/dsh-")) return false;
      return defaultPathExists(path);
    },
    probe: async () => {
      probes += 1;
      return probes === 1
        ? { state: "stopped", healthy: false, host: "127.0.0.1", port: 3080, url: "http://127.0.0.1:3080/", owner: "none" }
        : { state: "running", healthy: true, host: "127.0.0.1", port: 3080, url: "http://127.0.0.1:3080/", owner: "xiaotaozi-dsh" };
    },
  });
  const code = await runCli(["start"], fixture.dependencies);
  assert.equal(code, 0);
  assert.equal(fixture.calls[0].args[0], "web");
  assert.equal(fixture.calls.length, 7);
  assert.deepEqual(fixture.spawned[0], ["web", "--host", "127.0.0.1", "--port", "3080", "--no-open"]);
  assert.equal(fixture.writes.some((entry) => entry.path.endsWith(WEB_PID_FILE) && /4242/u.test(entry.text)), true);
  assert.ok(fixture.calls.slice(1).every((call) => call.args[0] === "plugin" && call.args[2] === "web" && call.args[3] === "add"));
  assert.deepEqual(fixture.opened, ["http://127.0.0.1:3080/"]);
});

test("web retires dsh-hello after seeding dsh-xtz-ui", async () => {
  let probes = 0;
  const fixture = fakeDependencies({
    pathExists: async (path) => {
      const portable = path.replaceAll("\\", "/");
      if (portable.includes("/node_modules/dsh-hello")) return true;
      if (portable.includes("/node_modules/dsh-")) return false;
      return defaultPathExists(path);
    },
    probe: async () => {
      probes += 1;
      return probes === 1
        ? { state: "stopped", healthy: false, host: "127.0.0.1", port: 3080, url: "http://127.0.0.1:3080/", owner: "none" }
        : { state: "running", healthy: true, host: "127.0.0.1", port: 3080, url: "http://127.0.0.1:3080/", owner: "xiaotaozi-dsh" };
    },
  });
  const code = await runCli(["start"], fixture.dependencies);
  assert.equal(code, 0);
  assert.equal(fixture.calls.length, 8);
  assert.ok(fixture.calls.slice(1, 7).every((call) => call.args[0] === "plugin" && call.args[3] === "add"));
  assert.deepEqual(fixture.calls[7].args, ["plugin", "--profile", "web", "remove", "dsh-hello"]);
  assert.match(fixture.output.stdout, /正在移除已退役插件 dsh-hello/u);
});

test("bare xtz starts like start", async () => {
  let probes = 0;
  const fixture = fakeDependencies({
    probe: async (port = 3080) => {
      probes += 1;
      return probes === 1
        ? { state: "stopped", healthy: false, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "none" }
        : { state: "running", healthy: true, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "xiaotaozi-dsh" };
    },
  });
  assert.equal(await runCli([], fixture.dependencies), 0);
  assert.equal(fixture.spawned.length, 1);
  assert.deepEqual(fixture.opened, ["http://127.0.0.1:3080/"]);
});

test("start reprints the url and opens the browser when already running", async () => {
  const fixture = fakeDependencies({
    readText: async (path) => path.replaceAll("\\", "/").endsWith(WEB_PID_FILE)
      ? JSON.stringify({ pid: 4242, startedAt: "2026-08-27T00:00:00.000Z" })
      : defaultReadText(path),
    processAlive: (pid) => pid === 4242,
    probe: async (port = 3080) => ({
      state: "running",
      healthy: true,
      host: "127.0.0.1",
      port,
      url: `http://127.0.0.1:${port}/`,
      owner: "xiaotaozi-dsh",
    }),
  });
  assert.equal(await runCli(["start"], fixture.dependencies), 0);
  assert.equal(fixture.spawned.length, 0);
  assert.match(fixture.output.stdout, /http:\/\/127\.0\.0\.1:3080\//u);
  assert.deepEqual(fixture.opened, ["http://127.0.0.1:3080/"]);
});

test("start --port 3081 is refused", async () => {
  const fixture = fakeDependencies();
  assert.equal(await runCli(["start", "--port", "3081"], fixture.dependencies), 2);
  assert.equal(fixture.spawned.length, 0);
  assert.match(fixture.output.stderr, /3081/u);
});

test("sandbox start seeds local plugin paths on 3081 and does not open a browser", async () => {
  let probes = 0;
  const fixture = sandboxDependencies({
    pathExists: async (path) => {
      const portable = path.replaceAll("\\", "/");
      if (portable.includes("/node_modules/dsh-")) return false;
      return defaultPathExists(path);
    },
    probe: async (port = 3081) => {
      probes += 1;
      return probes === 1
        ? { state: "stopped", healthy: false, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "none" }
        : { state: "running", healthy: true, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "xiaotaozi-dsh" };
    },
  });
  assert.equal(await runCli(["start", "--foreground", "--no-open"], fixture.dependencies), 0);
  assert.deepEqual(fixture.calls[0].args, ["web", "--dump-default-config"]);
  const added = fixture.calls.slice(1).filter((call) => call.args[3] === "add").map((call) => call.args[4]);
  assert.deepEqual(added, SANDBOX_PLUGINS);
  assert.ok(fixture.calls.slice(1).every((call) => call.options?.cwd === "/repo"));
  assert.deepEqual(fixture.spawned[0], ["web", "--host", "127.0.0.1", "--port", "3081", "--no-open"]);
  assert.equal(fixture.spawnOptions[0]?.foreground, true);
  assert.deepEqual(fixture.opened, []);
  assert.match(fixture.output.stdout, /http:\/\/127\.0\.0\.1:3081\//u);
});

test("sandbox start refuses a non-3081 --port and does not fall back when 3081 is occupied", async () => {
  const portFixture = sandboxDependencies();
  assert.equal(await runCli(["start", "--port", "3082"], portFixture.dependencies), 2);
  assert.equal(portFixture.spawned.length, 0);
  assert.match(portFixture.output.stderr, /3081/u);

  const occupied = sandboxDependencies({
    isInteractive: () => true,
    ask: async () => "1",
    probe: async (port = 3081) => ({
      state: "http-occupied",
      healthy: false,
      host: "127.0.0.1",
      port,
      url: `http://127.0.0.1:${port}/`,
      owner: "unknown",
    }),
  });
  assert.equal(await runCli(["start"], occupied.dependencies), 2);
  assert.equal(occupied.spawned.length, 0);
  assert.equal(occupied.asked.length, 0);
  assert.match(occupied.output.stderr, /沙箱固定 3081/u);
});

test("sandbox --foreground waits for the child to exit", async () => {
  let resolveClose;
  const closed = new Promise((resolvePromise) => {
    resolveClose = resolvePromise;
  });
  let probes = 0;
  const fixture = sandboxDependencies({
    spawnWeb: async (args, options) => {
      fixture.spawned.push(args);
      fixture.spawnOptions.push(options);
      queueMicrotask(() => resolveClose({ code: 0, signal: null }));
      return { pid: 4242, closed };
    },
    probe: async (port = 3081) => {
      probes += 1;
      return probes === 1
        ? { state: "stopped", healthy: false, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "none" }
        : { state: "running", healthy: true, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "xiaotaozi-dsh" };
    },
  });
  assert.equal(await runCli(["start", "--foreground", "--no-open"], fixture.dependencies), 0);
  assert.equal(fixture.spawnOptions[0]?.foreground, true);
  assert.equal(fixture.removed.some((path) => path.endsWith(WEB_PID_FILE)), true);
});

test("official start rejects dsh passthrough after --", async () => {
  const fixture = fakeDependencies();
  assert.equal(await runCli(["start", "--", "--patch", "x.yml"], fixture.dependencies), 2);
  assert.equal(fixture.spawned.length, 0);
});

test("sandbox start forwards passthrough dsh args", async () => {
  let probes = 0;
  const fixture = sandboxDependencies({
    probe: async (port = 3081) => {
      probes += 1;
      return probes === 1
        ? { state: "stopped", healthy: false, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "none" }
        : { state: "running", healthy: true, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "xiaotaozi-dsh" };
    },
  });
  assert.equal(await runCli(["start", "--no-open", "--", "--patch", "x.yml"], fixture.dependencies), 0);
  assert.deepEqual(fixture.spawned[0], ["web", "--host", "127.0.0.1", "--port", "3081", "--no-open", "--patch", "x.yml"]);
});

test("start --port 3082 launches on the requested free port", async () => {
  let probes = 0;
  const fixture = fakeDependencies({
    probe: async (port = 3080) => {
      probes += 1;
      return probes === 1
        ? { state: "stopped", healthy: false, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "none" }
        : { state: "running", healthy: true, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "xiaotaozi-dsh" };
    },
  });
  assert.equal(await runCli(["start", "--port", "3082"], fixture.dependencies), 0);
  assert.deepEqual(fixture.spawned[0], ["web", "--host", "127.0.0.1", "--port", "3082", "--no-open"]);
  assert.deepEqual(fixture.opened, ["http://127.0.0.1:3082/"]);
});

test("interactive start can move to 3082 when 3080 is occupied", async () => {
  const fixture = fakeDependencies({
    isInteractive: () => true,
    ask: async () => "1",
  });
  let launched = false;
  const innerSpawn = fixture.dependencies.spawnWeb;
  fixture.dependencies.spawnWeb = async (args) => {
    launched = true;
    return innerSpawn(args);
  };
  fixture.dependencies.probe = async (port = 3080) => {
    if (port === 3080) {
      return { state: "http-occupied", healthy: false, host: "127.0.0.1", port, url: "http://127.0.0.1:3080/", owner: "unknown" };
    }
    if (launched && port === 3082) {
      return { state: "running", healthy: true, host: "127.0.0.1", port, url: "http://127.0.0.1:3082/", owner: "xiaotaozi-dsh" };
    }
    return { state: "stopped", healthy: false, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "none" };
  };
  assert.equal(await runCli(["start"], fixture.dependencies), 0);
  assert.deepEqual(fixture.spawned[0], ["web", "--host", "127.0.0.1", "--port", "3082", "--no-open"]);
  assert.deepEqual(fixture.opened, ["http://127.0.0.1:3082/"]);
  assert.match(fixture.output.stdout, /将使用 127\.0\.0\.1:3082/u);
});

test("interactive start cancels when the user picks 2", async () => {
  const fixture = fakeDependencies({
    isInteractive: () => true,
    ask: async () => "2",
    probe: async (port = 3080) => ({
      state: "http-occupied",
      healthy: false,
      host: "127.0.0.1",
      port,
      url: `http://127.0.0.1:${port}/`,
      owner: "unknown",
    }),
  });
  assert.equal(await runCli(["start"], fixture.dependencies), 2);
  assert.equal(fixture.spawned.length, 0);
  assert.match(fixture.output.stdout, /已取消/u);
});

test("restart stops the recorded pid then starts again", async () => {
  const fixture = fakeDependencies({
    processAlive: (pid) => pid === 4242 && !fixture.stopped.includes(pid),
  });
  fixture.files.set(`${HOME}/${"xiaotaozi-xtz-web.pid"}`, JSON.stringify({ pid: 4242, startedAt: "2026-08-27T00:00:00.000Z" }));
  const innerSpawn = fixture.dependencies.spawnWeb;
  fixture.dependencies.spawnWeb = async (args) => innerSpawn(args);
  fixture.dependencies.probe = async (port = 3080) => {
    if (fixture.spawned.length > 0) {
      return { state: "running", healthy: true, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "xiaotaozi-dsh" };
    }
    return { state: "stopped", healthy: false, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "none" };
  };
  fixture.dependencies.readText = async (path) => (
    fixture.files.has(path) ? fixture.files.get(path) : defaultReadText(path)
  );
  assert.equal(await runCli(["restart"], fixture.dependencies), 0);
  assert.deepEqual(fixture.stopped, [4242]);
  assert.equal(fixture.spawned.length, 1);
});

test("open opens the running url", async () => {
  const fixture = fakeDependencies({
    probe: async (port = 3080) => ({
      state: "running",
      healthy: true,
      host: "127.0.0.1",
      port,
      url: `http://127.0.0.1:${port}/`,
      owner: "xiaotaozi-dsh",
    }),
  });
  assert.equal(await runCli(["open"], fixture.dependencies), 0);
  assert.deepEqual(fixture.opened, ["http://127.0.0.1:3080/"]);
});

test("help lists start/stop/restart and not plugin add", async () => {
  const fixture = fakeDependencies();
  assert.equal(await runCli(["help"], fixture.dependencies), 0);
  assert.match(fixture.output.stdout, /start \[--port/u);
  assert.match(fixture.output.stdout, /restart/u);
  assert.match(fixture.output.stdout, /市场/u);
  assert.doesNotMatch(fixture.output.stdout, /仍拒绝/u);
  assert.doesNotMatch(fixture.output.stdout, /dsh plugin --profile web add/u);
});

test("stop only kills the pid xtz recorded", async () => {
  const fixture = fakeDependencies({
    readText: async (path) => path.replaceAll("\\", "/").endsWith(WEB_PID_FILE)
      ? JSON.stringify({ pid: 4242, startedAt: "2026-08-27T00:00:00.000Z" })
      : defaultReadText(path),
    processAlive: (pid) => pid === 4242,
  });
  const code = await runCli(["stop"], fixture.dependencies);
  assert.equal(code, 0);
  assert.deepEqual(fixture.stopped, [4242]);
  assert.equal(fixture.removed.some((path) => path.endsWith(WEB_PID_FILE)), true);
});

test("installSpecError rejects leftover pack paths", () => {
  assert.equal(installSpecError("link:/repo/plugins/xtz-ui")?.includes("link:"), true);
  assert.equal(installSpecError("github:kedoupi/xiaotaozi-dsh#path:plugins/xtz-ui"), null);
  assert.equal(installSpecError("github:kedoupi/xiaotaozi-dsh#v0.2.0&path:plugins/xtz-ui"), null);
  assert.equal(installSpecError("github:kedoupi/xiaotaozi-dsh#v0.2.0"), null);
  assert.equal(installSpecError("github:kedoupi/xiaotaozi-dsh#path:externals/opencontext") !== null, true);
});

test("status reports an arbitrary HTTP server as unverified occupancy", async () => {
  const server = createHttpServer((_request, response) => response.end("ok"));
  const port = await listen(server);
  try {
    const status = await probeService(OFFICIAL_HOST, port, 500);
    assert.equal(status.state, "http-occupied");
    assert.equal(status.healthy, false);
    assert.equal(status.owner, "unknown");
  } finally {
    await close(server);
  }
});

test("status verifies the exact Xiaotaozi identity contract", async () => {
  const server = createHttpServer((request, response) => {
    if (request.url !== IDENTITY_PATH) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify({
      product: "xiaotaozi-dsh",
      protocol: "xiaotaozi-dsh.identity.v1",
      profile: "web",
      ready: true,
      instanceToken: "ab".repeat(32),
    }));
  });
  const port = await listen(server);
  try {
    const status = await probeService(OFFICIAL_HOST, port, 500);
    assert.equal(status.state, "running");
    assert.equal(status.healthy, true);
    assert.equal(status.owner, "xiaotaozi-dsh");
  } finally {
    await close(server);
  }
});

test("status rejects identity lookalikes with loose headers or fields", async () => {
  const bodies = [
    { product: "other", protocol: "xiaotaozi-dsh.identity.v1", profile: "web", ready: true },
    { product: "xiaotaozi-dsh", protocol: "xiaotaozi-dsh.identity.v1", profile: "web", ready: false },
    { product: "xiaotaozi-dsh", protocol: "xiaotaozi-dsh.identity.v1", profile: "web", ready: true, instanceToken: "bad" },
    { product: "xiaotaozi-dsh", protocol: "xiaotaozi-dsh.identity.v1", profile: "web", ready: true, unexpected: true },
  ];
  for (const body of bodies) {
    const server = createHttpServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(JSON.stringify(body));
    });
    const port = await listen(server);
    try {
      assert.equal((await probeService(OFFICIAL_HOST, port, 500)).state, "http-occupied");
    } finally {
      await close(server);
    }
  }
});

test("status command returns a safety refusal for unverified HTTP", async () => {
  const fixture = fakeDependencies({
    probe: async () => ({
      state: "http-occupied",
      healthy: false,
      host: "127.0.0.1",
      port: 3080,
      url: "http://127.0.0.1:3080/",
      owner: "unknown",
    }),
  });
  const code = await runCli(["status", "--json"], fixture.dependencies);
  assert.equal(code, 2);
  assert.equal(JSON.parse(fixture.output.stdout).healthy, false);
});

test("status and doctor succeed only for the verified Xiaotaozi service", async () => {
  const running = {
    state: "running",
    healthy: true,
    host: "127.0.0.1",
    port: 3080,
    url: "http://127.0.0.1:3080/",
    owner: "xiaotaozi-dsh",
  };
  const statusFixture = fakeDependencies({ probe: async () => running });
  assert.equal(await runCli(["status", "--json"], statusFixture.dependencies), 0);
  assert.equal(JSON.parse(statusFixture.output.stdout).owner, "xiaotaozi-dsh");

  const doctorFixture = fakeDependencies({ probe: async () => running });
  assert.equal(await runCli(["doctor", "--json"], doctorFixture.dependencies), 0);
  const report = JSON.parse(doctorFixture.output.stdout);
  assert.equal(report.ok, true);
  assert.ok(report.checks.some((check) => check.id === "service" && check.level === "ok"));
});

test("status distinguishes a non-HTTP listener from a stopped port", async () => {
  const server = createTcpServer((socket) => {
    socket.write("not-http");
    socket.destroy();
  });
  const port = await listen(server);
  try {
    const conflict = await probeService(OFFICIAL_HOST, port, 300);
    assert.equal(conflict.state, "port-conflict");
  } finally {
    await close(server);
  }
  const stopped = await probeService(OFFICIAL_HOST, port, 300);
  assert.equal(stopped.state, "stopped");
});

test("doctor validates a complete xtz-seeded profile but returns 1 while stopped", async () => {
  const fixture = fakeDependencies();
  const code = await runCli(["doctor", "--json"], fixture.dependencies);
  assert.equal(code, 1);
  assert.equal(fixture.calls.length, 1);
  assert.deepEqual(fixture.calls[0], { args: ["--version"], options: { capture: true } });
  const report = JSON.parse(fixture.output.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.ready, false);
  assert.ok(report.checks.some((check) => check.id === "xtz-seed" && check.level === "ok"));
  assert.ok(report.checks.some((check) => check.id === "profile-bundles" && check.level === "ok"));
  assert.ok(report.checks.some((check) => check.id === "profile-links" && check.level === "ok"));
  assert.ok(report.checks.some((check) => check.id === "service" && check.level === "error"));
});

test("doctor returns 2 for an unverified HTTP listener", async () => {
  const fixture = fakeDependencies({
    probe: async () => ({
      state: "http-occupied",
      healthy: false,
      host: "127.0.0.1",
      port: 3080,
      url: "http://127.0.0.1:3080/",
      owner: "unknown",
    }),
  });
  const code = await runCli(["doctor", "--json"], fixture.dependencies);
  assert.equal(code, 2);
  const report = JSON.parse(fixture.output.stdout);
  assert.equal(report.ok, false);
  assert.ok(report.checks.some((check) => check.id === "service" && /不是小桃子/u.test(check.message)));
});

test("sandbox doctor allows link: into repo plugins and still rejects link: elsewhere", async () => {
  const names = ["dsh-xtz-ui", "dsh-sidebar", "dsh-providers", "dsh-im", "dsh-market", "dsh-wecom-office"];
  const slugs = ["xtz-ui", "sidebar", "providers", "im", "market", "wecom-office"];
  const sandboxProfile = JSON.stringify({
    name: "dsh-profile-web",
    private: true,
    dependencies: Object.fromEntries(names.map((name, index) => [name, `link:/repo/plugins/${slugs[index]}`])),
    dsh: {
      profile: {
        bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", ...names],
      },
    },
  });
  const allowed = sandboxDependencies({
    readText: async (path) => {
      const portable = path.replaceAll("\\", "/");
      if (portable.endsWith("profiles/web/package.json")) return sandboxProfile;
      const installed = /\/node_modules\/(dsh-(?:xtz-ui|sidebar|providers|im|market|wecom-office))\/package\.json$/u.exec(portable);
      if (installed !== null) return JSON.stringify({ name: installed[1], version: "0.1.0" });
      return defaultReadText(path);
    },
    realPath: async (path) => {
      const portable = path.replaceAll("\\", "/");
      const match = /\/node_modules\/(dsh-(?:xtz-ui|sidebar|providers|im|market|wecom-office))$/u.exec(portable);
      if (match !== null) return `/repo/plugins/${match[1].slice("dsh-".length)}`;
      return path;
    },
    probe: async (port = 3081) => ({
      state: "stopped",
      healthy: false,
      host: "127.0.0.1",
      port,
      url: `http://127.0.0.1:${port}/`,
      owner: "none",
    }),
  });
  assert.equal(await runCli(["doctor", "--json"], allowed.dependencies), 1);
  const allowedReport = JSON.parse(allowed.output.stdout);
  assert.ok(allowedReport.checks.some((check) => check.id === "profile-links" && check.level === "ok"));
  assert.ok(allowedReport.checks.some((check) => check.id === "profile-install" && check.level === "ok"));
  assert.ok(allowedReport.checks.some((check) => check.id === "service" && check.level === "error"));

  const escaped = sandboxDependencies({
    readText: async (path) => path.replaceAll("\\", "/").endsWith("profiles/web/package.json")
      ? JSON.stringify({
        dependencies: { "dsh-xtz-ui": "link:/tmp/evil", "dsh-sidebar": "link:/repo/plugins/sidebar" },
        dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-xtz-ui", "dsh-sidebar"] } },
      })
      : defaultReadText(path),
  });
  assert.equal(await runCli(["doctor", "--json"], escaped.dependencies), 1);
  const escapedReport = JSON.parse(escaped.output.stdout);
  assert.ok(escapedReport.checks.some((check) => check.id === "profile-links" && check.level === "error" && /dsh-xtz-ui/u.test(check.message)));
});

test("doctor requires every default plugin and still rejects link:", async () => {
  const incomplete = fakeDependencies({
    readText: async (path) => path.replaceAll("\\", "/") === PROFILE_PACKAGE
      ? JSON.stringify({
        dependencies: {
          "dsh-xtz-ui": "github:kedoupi/xiaotaozi-dsh#path:plugins/xtz-ui",
          "dsh-sidebar": "file:./vendor/dsh-sidebar.tgz",
          "dsh-providers": "link:/repo/plugins/providers",
        },
        dsh: {
          profile: {
            bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-xtz-ui", "dsh-sidebar", "dsh-providers"],
          },
        },
      })
      : defaultReadText(path),
  });
  const code = await runCli(["doctor", "--json"], incomplete.dependencies);
  assert.equal(code, 1);
  const report = JSON.parse(incomplete.output.stdout);
  assert.ok(report.checks.some((check) => check.id === "profile-bundles" && check.level === "error" && /dsh-im/u.test(check.message)));
  assert.ok(report.checks.some((check) => check.id === "profile-links" && check.level === "error" && /link:/u.test(check.message)));
});

test("doctor rejects bundled plugin installs that resolve outside profile node_modules", async () => {
  const fixture = fakeDependencies({
    realPath: async (path) => path.replaceAll("\\", "/").endsWith("node_modules/dsh-im")
      ? "/repo/plugins/im"
      : path,
  });
  const code = await runCli(["doctor", "--json"], fixture.dependencies);
  assert.equal(code, 1);
  const report = JSON.parse(fixture.output.stdout);
  assert.ok(report.checks.some((check) => check.id === "profile-install" && check.level === "error" && /dsh-im/u.test(check.message)));
});

test("doctor rejects a Web profile symlinked outside the official home", async () => {
  const fixture = fakeDependencies({
    realPath: async (path) => path.replaceAll("\\", "/").endsWith("/profiles/web")
      ? "/repo/.dsh-home/profiles/web"
      : path,
  });
  const code = await runCli(["doctor", "--json"], fixture.dependencies);
  assert.equal(code, 1);
  const report = JSON.parse(fixture.output.stdout);
  assert.ok(report.checks.some((check) => check.id === "profile-path" && check.level === "error"));
});

test("doctor validates installed bundled plugin manifests", async () => {
  const fixture = fakeDependencies({
    readText: async (path) => path.replaceAll("\\", "/").endsWith("node_modules/dsh-im/package.json")
      ? JSON.stringify({ name: "dsh-other", version: "0.1.0" })
      : defaultReadText(path),
  });
  const code = await runCli(["doctor", "--json"], fixture.dependencies);
  assert.equal(code, 1);
  const report = JSON.parse(fixture.output.stdout);
  assert.ok(report.checks.some((check) => check.id === "profile-install" && check.level === "error" && /name\/version/u.test(check.message)));
});

test("doctor treats a missing xtz stamp and profile as not ready", async () => {
  const fixture = fakeDependencies({ readText: async () => null });
  const code = await runCli(["doctor", "--json"], fixture.dependencies);
  assert.equal(code, 1);
  const report = JSON.parse(fixture.output.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.ready, false);
  assert.ok(report.checks.some((check) => check.id === "xtz-seed" && check.level === "error"));
  assert.ok(report.checks.some((check) => check.id === "profile" && check.level === "error"));
});

test("doctor flags traversal, link, and symlink escapes from profile vendor", async () => {
  const unsafeProfiles = [
    {
      dependencies: { "dsh-hello": "link:/repo/plugins/hello" },
      dsh: { profile: { bundles: ["dsh-hello"] } },
    },
    {
      dependencies: { "dsh-hello": "file:./../../repo/dsh-hello.tgz" },
      dsh: { profile: { bundles: ["dsh-hello"] } },
    },
    {
      dependencies: { "dsh-hello": "file:..\\..\\repo\\dsh-hello.tgz" },
      dsh: { profile: { bundles: ["dsh-hello"] } },
    },
    {
      dependencies: { "dsh-hello": "file:./vendor/dsh-hello-%00.tgz" },
      dsh: { profile: { bundles: ["dsh-hello"] } },
    },
  ];
  for (const profile of unsafeProfiles) {
    const fixture = fakeDependencies({
      readText: async (path) => path.replaceAll("\\", "/") === PROFILE_PACKAGE ? JSON.stringify(profile) : defaultReadText(path),
    });
    const code = await runCli(["doctor", "--json"], fixture.dependencies);
    assert.equal(code, 1);
    const report = JSON.parse(fixture.output.stdout);
    assert.ok(report.checks.some((check) => check.id === "profile-links" && check.level === "error"));
  }

  const fixture = fakeDependencies({
    realPath: async (path) => path.endsWith(".tgz") ? "/outside/dsh-hello.tgz" : path,
  });
  const code = await runCli(["doctor", "--json"], fixture.dependencies);
  assert.equal(code, 1);
  assert.match(fixture.output.stdout, /目标越出/u);
});

test("doctor rejects an unfinished Desktop profile transaction", async () => {
  for (const residue of [".web-staging", ".web-backup", ".web-retired", ".web-seeding", ".xiaotaozi-pack"]) {
    const fixture = fakeDependencies({
      pathExists: async (path) => path.endsWith(residue) || defaultPathExists(path),
    });
    const code = await runCli(["doctor", "--json"], fixture.dependencies);
    assert.equal(code, 1, residue);
    const report = JSON.parse(fixture.output.stdout);
    assert.ok(report.checks.some((check) => check.id === "profile-transaction" && check.level === "error" && check.message.includes(residue)));
  }
});

test("version requires exact Node and DSH versions", async () => {
  const fixture = fakeDependencies({ nodeVersion: "24.6.0" });
  const code = await runCli(["version", "--json"], fixture.dependencies);
  assert.equal(code, 1);
  assert.equal(JSON.parse(fixture.output.stdout).expectedNode, "22.19.0");
});

test("business commands fail before probing or reading the official home on the wrong Node", async () => {
  for (const argv of [[], ["status"], ["config", "path"], ["plugin", "list"], ["doctor"], ["start"], ["open"], ["restart"]]) {
    let probes = 0;
    let reads = 0;
    const fixture = fakeDependencies({
      nodeVersion: "24.18.0",
      probe: async () => {
        probes += 1;
        throw new Error("must not probe");
      },
      readText: async () => {
        reads += 1;
        throw new Error("must not read");
      },
    });
    assert.equal(await runCli(argv, fixture.dependencies), 1, argv.join(" "));
    assert.equal(probes, 0, argv.join(" "));
    assert.equal(reads, 0, argv.join(" "));
    assert.match(fixture.output.stderr, /要求精确的 Node\.js 22\.19\.0/u);
  }

  const help = fakeDependencies({ nodeVersion: "24.18.0" });
  assert.equal(await runCli(["--help"], help.dependencies), 0);
  const bareVersion = fakeDependencies({ nodeVersion: "24.18.0" });
  assert.equal(await runCli(["--version"], bareVersion.dependencies), 0);
});

test("JSON flags and shorthand version reject trailing arguments", async () => {
  const status = fakeDependencies();
  assert.equal(await runCli(["status", "--json", "--json"], status.dependencies), 2);
  const version = fakeDependencies();
  assert.equal(await runCli(["-v", "extra"], version.dependencies), 2);
});
