import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  createDefaultDependencies,
  DEFAULT_PLUGINS,
  IDENTITY_PATH,
  OFFICIAL_HOST,
  officialDshHome,
  probeService,
  runCli,
  WEB_PID_FILE,
  XTZ_STAMP_FILE,
  extractGlobalFlags,
  installSpecError,
  isAllowedPluginSpec,
  expandAllowBuildKeysForDefaultPlugins,
  HOST_TOOLS_RELATIVE_LINK,
  nodeEngineRange,
  nodeSatisfiesEngine,
  parseAllowBuildKeys,
  parseStartArgs,
  planHostToolsHeal,
  withAllowBuilds,
  resolveStartPort,
  sandboxHomeFromRepo,
  sandboxProcessMarker,
} from "../lib/index.js";

const HOME = "/user/.dsh";
const ACTIVE_LOCK_TOKEN = "00000000-0000-4000-8000-000000000001";
const STALE_LOCK_TOKEN = "00000000-0000-4000-8000-000000000002";
const PROFILE_PACKAGE = `${HOME}/profiles/web/package.json`;
const PROCESS_IDENTITY = "test-process:4242";
const VALID_PID_RECORD = JSON.stringify({
  pid: 4242,
  startedAt: "2026-08-27T00:00:00.000Z",
  identity: PROCESS_IDENTITY,
});
const CURRENT_DEFAULT_DEPENDENCIES = Object.fromEntries(
  DEFAULT_PLUGINS.map(({ name, spec }) => [name, spec]),
);
const VALID_XTZ_STAMP = JSON.stringify({
  writer: "xtz",
  createdAt: "2026-08-27T00:00:00.000Z",
  productVersion: "0.1.0",
});
const VALID_PROFILE_OBJECT = {
  name: "dsh-profile-web",
  private: true,
  dependencies: CURRENT_DEFAULT_DEPENDENCIES,
  dsh: {
    profile: {
      bundles: [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        ...DEFAULT_PLUGINS.map(({ name }) => name),
      ],
    },
  },
};
const VALID_PROFILE = JSON.stringify(VALID_PROFILE_OBJECT);
const OLD_PROFILE = JSON.stringify({
  ...VALID_PROFILE_OBJECT,
  dependencies: Object.fromEntries(
    DEFAULT_PLUGINS.map(({ name, spec }) => [name, spec.replace("#v0.5.0&", "#v0.4.0&")]),
  ),
});
const VENDOR_PROFILE = JSON.stringify({
  ...VALID_PROFILE_OBJECT,
  dependencies: Object.fromEntries(
    DEFAULT_PLUGINS.map(({ name }) => [name, `file:./vendor/${name}-0.1.0.tgz`]),
  ),
});
const THIRD_PARTY_PLUGIN = "dsh-context-market-plugin";
const PRESERVED_PROFILE_OBJECT = {
  ...VALID_PROFILE_OBJECT,
  dependencies: { ...CURRENT_DEFAULT_DEPENDENCIES, [THIRD_PARTY_PLUGIN]: "github:example/context#v1.2.3" },
  dsh: {
    profile: {
      bundles: [...VALID_PROFILE_OBJECT.dsh.profile.bundles, THIRD_PARTY_PLUGIN],
    },
  },
};
const PRESERVED_OLD_PROFILE = JSON.stringify({
  ...PRESERVED_PROFILE_OBJECT,
  dependencies: {
    ...PRESERVED_PROFILE_OBJECT.dependencies,
    "dsh-im": CURRENT_DEFAULT_DEPENDENCIES["dsh-im"].replace("#v0.5.0&", "#v0.4.0&"),
  },
});
const PRESERVED_CURRENT_PROFILE = JSON.stringify(PRESERVED_PROFILE_OBJECT);

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
  const copiedProfiles = [];
  const movedPaths = [];
  const removedTrees = [];
  const files = new Map();
  const events = [];
  const pathKinds = new Map([
    [HOME, "directory"],
    [`${HOME}/profiles`, "directory"],
    [`${HOME}/profiles/web`, "directory"],
  ]);
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
    copiedProfiles,
    movedPaths,
    removedTrees,
    files,
    pathKinds,
    events,
    dependencies: {
      metadata: {
        name: "xiaotaozi-dsh-cli",
        version: "0.1.0",
        expectedDsh: "0.1.1-rc.2",
        expectedNode: "^22.19.0 || >=24.0.0",
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
        events.push(`dsh:${args.join(" ")}`);
        const stdout = args[0] === "web" && args[1] === "--dump-config"
          ? DEFAULT_PLUGINS.map(({ name }) => `# == ${name}`).join("\n")
          : options?.capture ? "0.1.1-rc.2\n" : "";
        return { code: 0, stdout, stderr: "", signal: null };
      },
      spawnWeb: async (args, options) => {
        events.push("spawn");
        spawned.push(args);
        spawnOptions.push(options);
        return { pid: 4242, identity: PROCESS_IDENTITY };
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
      ensureDirectory: async (path) => {
        pathKinds.set(path, "directory");
      },
      writeText: async (path, text) => {
        events.push(`write:${path}`);
        writes.push({ path, text });
        files.set(path, text);
        pathKinds.set(path, "file");
      },
      createExclusive: async (path, text) => {
        if (files.has(path)) return false;
        writes.push({ path, text });
        files.set(path, text);
        pathKinds.set(path, "file");
        return true;
      },
      readExclusive: async (path) => files.get(path) ?? null,
      replaceExclusive: async (path, text) => {
        files.set(path, text);
      },
      ownsExclusive: async (path, text) => files.get(path) === text,
      removeExclusive: async (path, text) => {
        if (files.get(path) !== text) return false;
        files.delete(path);
        pathKinds.delete(path);
        return true;
      },
      listDirectory: async (path) => [...files.keys()]
        .filter((entry) => entry.startsWith(`${path}/`) && !entry.slice(path.length + 1).includes("/"))
        .map((entry) => entry.slice(path.length + 1)),
      removePath: async (path) => {
        events.push(`remove:${path}`);
        removed.push(path);
        files.delete(path);
        pathKinds.delete(path);
      },
      pathExists: async (path) => defaultPathExists(path),
      realPath: async (path) => path,
      lstatKind: async (path) => pathKinds.get(path) ?? "missing",
      copyProfile: async (source, target) => {
        copiedProfiles.push({ source, target });
        pathKinds.set(target, "directory");
      },
      profileSnapshot: async () => ({ "cordis.patch.yml": "unchanged" }),
      movePath: async (source, target) => {
        events.push(`move:${source}->${target}`);
        movedPaths.push({ source, target });
        const kind = pathKinds.get(source) ?? "directory";
        pathKinds.delete(source);
        pathKinds.set(target, kind);
      },
      removeTree: async (path) => {
        events.push(`removeTree:${path}`);
        removedTrees.push(path);
        pathKinds.delete(path);
      },
      processAlive: () => false,
      processIdentity: async () => PROCESS_IDENTITY,
      stopPid: async (pid) => {
        stopped.push(pid);
        return "stopped";
      },
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
  const fixture = fakeDependencies({
    sandbox: true,
    repoRoot: "/repo",
    home: SANDBOX_HOME,
    ...overrides,
  });
  for (const path of [
    SANDBOX_HOME,
    `${SANDBOX_HOME}/profiles`,
    `${SANDBOX_HOME}/profiles/web`,
    `${SANDBOX_HOME}/profiles/web/node_modules`,
  ]) fixture.pathKinds.set(path, "directory");
  return fixture;
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
  assert.equal(sandboxHomeFromRepo("/repo"), join("/repo", ".dsh-home"));
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

test("first official start creates a missing home before preparing the profile", async () => {
  let probes = 0;
  const fixture = fakeDependencies({
    probe: async (port = 3080) => {
      probes += 1;
      return probes === 1
        ? { state: "stopped", healthy: false, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "none" }
        : { state: "running", healthy: true, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "xiaotaozi-dsh" };
    },
  });
  fixture.pathKinds.clear();
  fixture.dependencies.readText = async (path) => fixture.files.has(path)
    ? fixture.files.get(path)
    : path === PROFILE_PACKAGE ? null : defaultReadText(path);
  fixture.dependencies.runDsh = async (args, options) => {
    fixture.calls.push({ args, options });
    if (args[0] === "web" && args[1] === "--dump-default-config") {
      fixture.pathKinds.set(`${HOME}/profiles/web`, "directory");
      fixture.files.set(PROFILE_PACKAGE, VALID_PROFILE);
    }
    return {
      code: 0,
      stdout: args[0] === "web" && args[1] === "--dump-config"
        ? DEFAULT_PLUGINS.map(({ name }) => `# == ${name}`).join("\n")
        : "",
      stderr: "",
      signal: null,
    };
  };
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 0);
  assert.deepEqual(fixture.calls[0].args, ["web", "--dump-default-config"]);
  assert.equal(fixture.spawned.length, 1);
});

test("an empty Web profile directory is initialized from its missing manifest", async () => {
  let probes = 0;
  const fixture = fakeDependencies({
    readText: async (path) => path === PROFILE_PACKAGE ? null : defaultReadText(path),
    runDsh: async (args, options) => {
      fixture.calls.push({ args, options });
      if (args[0] === "web" && args[1] === "--dump-default-config") fixture.files.set(PROFILE_PACKAGE, VALID_PROFILE);
      return { code: 0, stdout: options?.capture ? "" : "", stderr: "", signal: null };
    },
    probe: async (port = 3080) => {
      probes += 1;
      return probes === 1
        ? { state: "stopped", healthy: false, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "none" }
        : { state: "running", healthy: true, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "xiaotaozi-dsh" };
    },
  });
  const previousRead = fixture.dependencies.readText;
  fixture.dependencies.readText = async (path) => fixture.files.has(path) ? fixture.files.get(path) : previousRead(path);
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 0);
  assert.deepEqual(fixture.calls[0].args, ["web", "--dump-default-config"]);
});

test("web prepares missing default plugins then starts dsh web", async () => {
  let probes = 0;
  let installed = false;
  const fixture = fakeDependencies({
    pathExists: async (path) => {
      const portable = path.replaceAll("\\", "/");
      if (portable.includes("/node_modules/dsh-") && !portable.includes("/node_modules/dsh-hello")) return installed;
      return defaultPathExists(path);
    },
    runDsh: async (args, options) => {
      fixture.calls.push({ args, options });
      if (args[0] === "web" && args[1] === "--dump-default-config" && !installed) {
        return { code: 1, stdout: "", stderr: "missing profile bundle", signal: null };
      }
      if (args[0] === "plugin" && args[3] === "add") installed = true;
      const stdout = args[0] === "web" && args[1] === "--dump-config"
        ? DEFAULT_PLUGINS.map(({ name }) => `# == ${name}`).join("\n")
        : options?.capture ? "0.1.1-rc.2\n" : "";
      return { code: 0, stdout, stderr: "", signal: null };
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
  assert.deepEqual(fixture.calls.map(({ args }) => args.slice(0, 4)), [
    ["plugin", "--profile", "web", "add"],
    ["web", "--dump-config"],
  ]);
  assert.deepEqual(fixture.calls[0].args.slice(4), [...DEFAULT_PLUGINS.map(({ spec }) => spec), "--save-prod"]);
  assert.deepEqual(fixture.spawned[0], ["web", "--host", "127.0.0.1", "--port", "3080", "--no-open"]);
  const pidWrite = fixture.writes.find((entry) => entry.path.endsWith(WEB_PID_FILE));
  assert.deepEqual(JSON.parse(pidWrite.text), {
    pid: 4242,
    startedAt: "2026-08-27T00:00:00.000Z",
    identity: PROCESS_IDENTITY,
  });
  assert.deepEqual(fixture.opened, ["http://127.0.0.1:3080/"]);
});

test("web retires dsh-hello in the same default-plugin transaction", async () => {
  let probes = 0;
  let installed = false;
  let retired = true;
  const fixture = fakeDependencies({
    pathExists: async (path) => {
      const portable = path.replaceAll("\\", "/");
      if (portable.includes("/node_modules/dsh-hello")) return retired;
      if (portable.includes("/node_modules/dsh-")) return installed;
      return defaultPathExists(path);
    },
    lstatKind: async (path) => {
      if ([HOME, `${HOME}/profiles`, `${HOME}/profiles/web`, `${HOME}/profiles/web/node_modules`].includes(path)) return "directory";
      if (path.endsWith("/node_modules/dsh-hello")) return retired ? "directory" : "missing";
      return "missing";
    },
    removeTree: async (path) => {
      fixture.removedTrees.push(path);
      if (path.endsWith("/node_modules/dsh-hello")) retired = false;
      fixture.pathKinds.delete(path);
    },
    runDsh: async (args, options) => {
      fixture.calls.push({ args, options });
      if (args[0] === "plugin" && args[3] === "add") installed = true;
      const stdout = args[0] === "web" && args[1] === "--dump-config"
        ? DEFAULT_PLUGINS.map(({ name }) => `# == ${name}`).join("\n")
        : options?.capture ? "0.1.1-rc.2\n" : "";
      return { code: 0, stdout, stderr: "", signal: null };
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
  assert.equal(fixture.calls.some((call) => call.args[3] === "remove"), false);
  assert.ok(fixture.removedTrees.some((path) => path.endsWith("/node_modules/dsh-hello")));
});

test("web removes retired plugin manifest residue even when its install directory is gone", async () => {
  const retiredProfile = JSON.stringify({
    ...VALID_PROFILE_OBJECT,
    dependencies: { ...CURRENT_DEFAULT_DEPENDENCIES, "dsh-hello": "github:example/hello#v0.1.0" },
    dsh: { profile: { bundles: [...VALID_PROFILE_OBJECT.dsh.profile.bundles, "dsh-hello"] } },
  });
  let retired = true;
  let probes = 0;
  const fixture = fakeDependencies({
    readText: async (path) => path.replaceAll("\\", "/") === PROFILE_PACKAGE && retired
      ? retiredProfile
      : defaultReadText(path),
    pathExists: async (path) => path.replaceAll("\\", "/").includes("/node_modules/dsh-hello")
      ? false
      : defaultPathExists(path),
    runDsh: async (args, options) => {
      fixture.calls.push({ args, options });
      if (args[0] === "plugin" && args[3] === "remove") retired = false;
      const stdout = args[0] === "web" && args[1] === "--dump-config"
        ? DEFAULT_PLUGINS.map(({ name }) => `# == ${name}`).join("\n")
        : options?.capture ? "0.1.1-rc.2\n" : "";
      return { code: 0, stdout, stderr: "", signal: null };
    },
    probe: async (port = 3080) => {
      probes += 1;
      return probes === 1
        ? { state: "stopped", healthy: false, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "none" }
        : { state: "running", healthy: true, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "xiaotaozi-dsh" };
    },
  });
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 0);
  assert.deepEqual(fixture.calls.find((call) => call.args[3] === "remove").args, ["plugin", "--profile", "web", "remove", "dsh-hello"]);
});

test("web prunes retired bundle-only residue without asking pnpm to remove a missing dependency", async () => {
  const bundleOnly = JSON.stringify({
    ...VALID_PROFILE_OBJECT,
    dsh: { profile: { bundles: [...VALID_PROFILE_OBJECT.dsh.profile.bundles, "dsh-hello"] } },
  });
  let probes = 0;
  const fixture = fakeDependencies({
    readText: async (path) => fixture.files.has(path)
      ? fixture.files.get(path)
      : path === PROFILE_PACKAGE ? bundleOnly : defaultReadText(path),
    runDsh: async (args, options) => {
      fixture.calls.push({ args, options });
      const stdout = args[0] === "web" && args[1] === "--dump-config"
        ? DEFAULT_PLUGINS.map(({ name }) => `# == ${name}`).join("\n")
        : options?.capture ? "0.1.1-rc.2\n" : "";
      return { code: 0, stdout, stderr: "", signal: null };
    },
    probe: async (port = 3080) => {
      probes += 1;
      return probes === 1
        ? { state: "stopped", healthy: false, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "none" }
        : { state: "running", healthy: true, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "xiaotaozi-dsh" };
    },
  });
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 0);
  assert.equal(fixture.calls.some((call) => call.args[3] === "remove"), false);
  assert.equal(JSON.parse(fixture.files.get(PROFILE_PACKAGE)).dsh.profile.bundles.includes("dsh-hello"), false);
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
  assert.equal(fixture.copiedProfiles.length, 0);
  assert.equal(fixture.movedPaths.length, 0);
  assert.equal(fixture.spawned.length, 1);
  assert.deepEqual(fixture.opened, ["http://127.0.0.1:3080/"]);
});

test("start reprints the url and opens the browser when already running", async () => {
  const fixture = fakeDependencies({
    readText: async (path) => path.replaceAll("\\", "/").endsWith(WEB_PID_FILE)
      ? VALID_PID_RECORD
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

test("start refuses profile mutation while its recorded process is still alive but not ready", async () => {
  const fixture = fakeDependencies({
    readText: async (path) => path.replaceAll("\\", "/").endsWith(WEB_PID_FILE)
      ? VALID_PID_RECORD
      : defaultReadText(path),
    processAlive: (pid) => pid === 4242,
  });
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 2);
  assert.equal(fixture.removed.some((path) => path.endsWith(WEB_PID_FILE)), false);
  assert.equal(fixture.calls.length, 0);
  assert.equal(fixture.spawned.length, 0);
  assert.match(fixture.output.stderr, /仍在运行[\s\S]*restart/u);
});

test("running start reports plugin drift without mutating or restarting", async () => {
  const fixture = fakeDependencies({
    readText: async (path) => {
      const portable = path.replaceAll("\\", "/");
      if (portable.endsWith(WEB_PID_FILE)) return VALID_PID_RECORD;
      if (portable === PROFILE_PACKAGE) return OLD_PROFILE;
      return defaultReadText(path);
    },
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
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 0);
  assert.equal(fixture.calls.some((call) => call.args[0] === "plugin"), false);
  assert.equal(fixture.spawned.length, 0);
  assert.match(fixture.output.stdout, /xtz restart/u);
});

test("running start sends unreadable profile to doctor without mutation", async () => {
  const fixture = fakeDependencies({
    readText: async (path) => {
      const portable = path.replaceAll("\\", "/");
      if (portable.endsWith(WEB_PID_FILE)) return VALID_PID_RECORD;
      if (portable === PROFILE_PACKAGE) return "{";
      return defaultReadText(path);
    },
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
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 0);
  assert.match(fixture.output.stdout, /xtz doctor/u);
  assert.equal(fixture.movedPaths.length, 0);
  assert.equal(fixture.spawned.length, 0);
});

test("running start turns profile read failures into read-only doctor guidance", async () => {
  const fixture = fakeDependencies({
    readText: async (path) => {
      const portable = path.replaceAll("\\", "/");
      if (portable.endsWith(WEB_PID_FILE)) return VALID_PID_RECORD;
      if (portable === PROFILE_PACKAGE) throw new Error("EACCES");
      return defaultReadText(path);
    },
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
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 0);
  assert.match(fixture.output.stdout, /xtz doctor/u);
  assert.equal(fixture.movedPaths.length, 0);
  assert.equal(fixture.spawned.length, 0);
});

test("stopped start reconciles all default plugins before spawning web", async () => {
  let reconciled = false;
  let probes = 0;
  const fixture = fakeDependencies({
    readText: async (path) => fixture.files.has(path)
      ? fixture.files.get(path)
      : path.replaceAll("\\", "/") === PROFILE_PACKAGE
        ? reconciled ? PRESERVED_CURRENT_PROFILE : PRESERVED_OLD_PROFILE
        : defaultReadText(path),
    runDsh: async (args, options) => {
      fixture.calls.push({ args, options });
      fixture.events.push(`dsh:${args.join(" ")}`);
      if (args[0] === "plugin" && args[3] === "add") reconciled = true;
      const stdout = args[0] === "web" && args[1] === "--dump-config"
        ? DEFAULT_PLUGINS.map(({ name }) => `# == ${name}`).join("\n")
        : options?.capture ? "0.1.1-rc.2\n" : "";
      return { code: 0, stdout, stderr: "", signal: null };
    },
    probe: async (port = 3080) => {
      probes += 1;
      return probes === 1
        ? { state: "stopped", healthy: false, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "none" }
        : { state: "running", healthy: true, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "xiaotaozi-dsh" };
    },
  });
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 0);
  const adds = fixture.calls.filter((call) => call.args[0] === "plugin" && call.args[3] === "add");
  assert.equal(adds.length, 1);
  assert.deepEqual(adds[0].args.slice(4), [...DEFAULT_PLUGINS.map(({ spec }) => spec), "--save-prod"]);
  assert.deepEqual(fixture.movedPaths, [{
    source: `${HOME}/profiles/web`,
    target: `${HOME}/profiles/.web-reconcile-backup`,
  }]);
  assert.equal(fixture.copiedProfiles.length, 1);
  assert.equal(fixture.spawned.length, 1);
  const stamp = fixture.writes.find((entry) => entry.path.endsWith(XTZ_STAMP_FILE));
  assert.equal(JSON.parse(stamp.text).productVersion, "0.1.0");
  const validation = fixture.events.findIndex((event) => event === "dsh:web --dump-config");
  const backupRemoval = fixture.events.findIndex((event) => event === `removeTree:${HOME}/profiles/.web-reconcile-backup`);
  const stampWrite = fixture.events.findIndex((event) => event === `write:${HOME}/${XTZ_STAMP_FILE}`);
  const spawn = fixture.events.indexOf("spawn");
  assert.ok(validation >= 0 && validation < backupRemoval);
  assert.ok(backupRemoval < stampWrite && stampWrite < spawn);
});

test("stopped start moves defaults from non-primary bags with save-prod", async () => {
  for (const bag of ["devDependencies", "optionalDependencies"]) {
    const dependencies = { ...CURRENT_DEFAULT_DEPENDENCIES };
    const dshIm = dependencies["dsh-im"];
    delete dependencies["dsh-im"];
    const misplaced = JSON.stringify({ ...VALID_PROFILE_OBJECT, dependencies, [bag]: { "dsh-im": dshIm } });
    let reconciled = false;
    const fixture = fakeDependencies({
      readText: async (path) => path.replaceAll("\\", "/") === PROFILE_PACKAGE
        ? reconciled ? JSON.stringify({ ...VALID_PROFILE_OBJECT, [bag]: {} }) : misplaced
        : defaultReadText(path),
      runDsh: async (args, options) => {
        fixture.calls.push({ args, options });
        if (args[0] === "plugin" && args[3] === "add") reconciled = true;
        const stdout = args[0] === "web" && args[1] === "--dump-config"
          ? DEFAULT_PLUGINS.map(({ name }) => `# == ${name}`).join("\n")
          : options?.capture ? "0.1.1-rc.2\n" : "";
        return { code: 0, stdout, stderr: "", signal: null };
      },
      probe: async (port = 3080) => fixture.spawned.length > 0
        ? { state: "running", healthy: true, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "xiaotaozi-dsh" }
        : { state: "stopped", healthy: false, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "none" },
    });
    assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 0, `${bag}: ${fixture.output.stderr}`);
    const add = fixture.calls.find((call) => call.args[3] === "add");
    assert.equal(add.args.at(-1), "--save-prod");
  }
});

test("stopped start removes a retired optional dependency even when pnpm leaves an empty bag", async () => {
  const retired = JSON.stringify({ ...VALID_PROFILE_OBJECT, optionalDependencies: { "dsh-hello": "github:example/hello#v0.1.0" } });
  let removed = false;
  const fixture = fakeDependencies({
    readText: async (path) => path.replaceAll("\\", "/") === PROFILE_PACKAGE
      ? removed ? JSON.stringify({ ...VALID_PROFILE_OBJECT, optionalDependencies: {} }) : retired
      : defaultReadText(path),
    runDsh: async (args, options) => {
      fixture.calls.push({ args, options });
      if (args[0] === "plugin" && args[3] === "remove") removed = true;
      const stdout = args[0] === "web" && args[1] === "--dump-config"
        ? DEFAULT_PLUGINS.map(({ name }) => `# == ${name}`).join("\n")
        : options?.capture ? "0.1.1-rc.2\n" : "";
      return { code: 0, stdout, stderr: "", signal: null };
    },
    probe: async (port = 3080) => fixture.spawned.length > 0
      ? { state: "running", healthy: true, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "xiaotaozi-dsh" }
      : { state: "stopped", healthy: false, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "none" },
  });
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 0, fixture.output.stderr);
  assert.deepEqual(fixture.calls.find((call) => call.args[3] === "remove")?.args, ["plugin", "--profile", "web", "remove", "dsh-hello"]);
});

test("stopped start rejects a local-path non-plugin dependency before reinstall", async () => {
  const unsafe = JSON.stringify({
    ...VALID_PROFILE_OBJECT,
    dependencies: { ...CURRENT_DEFAULT_DEPENDENCIES, helper: "../../outside" },
  });
  const fixture = fakeDependencies({
    readText: async (path) => path.replaceAll("\\", "/") === PROFILE_PACKAGE
      ? unsafe
      : defaultReadText(path),
  });
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 1);
  assert.equal(fixture.movedPaths.length, 0);
  assert.equal(fixture.spawned.length, 0);
  assert.match(fixture.output.stderr, /helper.*本地路径/u);
});

test("stopped start rejects local dependency protocols in every dependency bag", async () => {
  for (const bag of ["dependencies", "devDependencies", "optionalDependencies"]) {
    const unsafe = JSON.stringify({
      ...VALID_PROFILE_OBJECT,
      dependencies: { ...CURRENT_DEFAULT_DEPENDENCIES },
      [bag]: { ...(bag === "dependencies" ? CURRENT_DEFAULT_DEPENDENCIES : {}), helper: "git+file:///outside/repo" },
    });
    const fixture = fakeDependencies({
      readText: async (path) => path.replaceAll("\\", "/") === PROFILE_PACKAGE
        ? unsafe
        : defaultReadText(path),
    });
    assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 1, bag);
    assert.equal(fixture.movedPaths.length, 0, bag);
  }
});

test("stopped start rejects a vendor directory disguised as a tarball", async () => {
  const vendorTarball = `${HOME}/profiles/web/vendor/helper.tgz`;
  const manifest = JSON.stringify({
    ...VALID_PROFILE_OBJECT,
    dependencies: { ...CURRENT_DEFAULT_DEPENDENCIES, helper: "file:./vendor/helper.tgz" },
  });
  const fixture = fakeDependencies({
    readText: async (path) => path.replaceAll("\\", "/") === PROFILE_PACKAGE
      ? manifest
      : defaultReadText(path),
  });
  fixture.pathKinds.set(`${HOME}/profiles/web/vendor`, "directory");
  fixture.pathKinds.set(vendorTarball, "directory");
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 1);
  assert.equal(fixture.movedPaths.length, 0);
  assert.match(fixture.output.stderr, /普通 tarball 文件/u);
});

test("stopped start does not reconcile over a profile missing a DSH core bundle", async () => {
  const missingBase = JSON.stringify({
    ...VALID_PROFILE_OBJECT,
    dsh: {
      profile: {
        bundles: VALID_PROFILE_OBJECT.dsh.profile.bundles.filter((name) => name !== "@deepseek-ai/dsh-base"),
      },
    },
  });
  const fixture = fakeDependencies({
    readText: async (path) => path.replaceAll("\\", "/") === PROFILE_PACKAGE
      ? missingBase
      : defaultReadText(path),
  });
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 1);
  assert.equal(fixture.movedPaths.length, 0);
  assert.equal(fixture.spawned.length, 0);
  assert.match(fixture.output.stderr, /DSH 核心 bundle/u);
});

test("stopped start fails closed when a default install resolves outside the profile", async () => {
  const escaped = `${HOME}/profiles/web/node_modules/dsh-im`;
  const fixture = fakeDependencies({
    realPath: async (path) => path === escaped ? "/outside/dsh-im" : path,
  });
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 1);
  assert.equal(fixture.movedPaths.length, 0);
  assert.equal(fixture.spawned.length, 0);
  assert.match(fixture.output.stderr, /越出 node_modules/u);
});

test("reconciliation fails before backup when preserved profile files cannot be inspected", async () => {
  const fixture = fakeDependencies({
    readText: async (path) => path.replaceAll("\\", "/") === PROFILE_PACKAGE
      ? OLD_PROFILE
      : defaultReadText(path),
    profileSnapshot: async () => { throw new Error("profile contains symlink"); },
  });
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 1);
  assert.equal(fixture.movedPaths.length, 0);
  assert.equal(fixture.spawned.length, 0);
  assert.match(fixture.output.stderr, /无法验证应保留的用户文件/u);
});

test("reconciliation rolls back when plugin mutation drops a third-party manifest entry", async () => {
  let reconciled = false;
  const fixture = fakeDependencies({
    readText: async (path) => path.replaceAll("\\", "/") === PROFILE_PACKAGE
      ? reconciled ? VALID_PROFILE : PRESERVED_OLD_PROFILE
      : defaultReadText(path),
    runDsh: async (args, options) => {
      if (args[0] === "plugin" && args[3] === "add") reconciled = true;
      const stdout = args[0] === "web" && args[1] === "--dump-config"
        ? DEFAULT_PLUGINS.map(({ name }) => `# == ${name}`).join("\n")
        : options?.capture ? "0.1.1-rc.2\n" : "";
      return { code: 0, stdout, stderr: "", signal: null };
    },
  });
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 1);
  assert.equal(fixture.spawned.length, 0);
  assert.match(fixture.output.stderr, /用户 manifest/u);
  assert.deepEqual(fixture.movedPaths.at(-1), {
    source: `${HOME}/profiles/.web-reconcile-backup`,
    target: `${HOME}/profiles/web`,
  });
});

test("reconciliation rolls back when a preserved user file changes", async () => {
  let reconciled = false;
  let snapshots = 0;
  const fixture = fakeDependencies({
    readText: async (path) => path.replaceAll("\\", "/") === PROFILE_PACKAGE
      ? reconciled ? VALID_PROFILE : OLD_PROFILE
      : defaultReadText(path),
    profileSnapshot: async () => (++snapshots === 1
      ? { "cordis.patch.yml": "before" }
      : { "cordis.patch.yml": "after" }),
    runDsh: async (args, options) => {
      if (args[0] === "plugin" && args[3] === "add") reconciled = true;
      const stdout = args[0] === "web" && args[1] === "--dump-config"
        ? DEFAULT_PLUGINS.map(({ name }) => `# == ${name}`).join("\n")
        : options?.capture ? "0.1.1-rc.2\n" : "";
      return { code: 0, stdout, stderr: "", signal: null };
    },
  });
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 1);
  assert.equal(fixture.spawned.length, 0);
  assert.match(fixture.output.stderr, /用户文件/u);
});

test("failed default plugin reconciliation restores the old profile and does not spawn", async () => {
  const fixture = fakeDependencies({
    readText: async (path) => path.replaceAll("\\", "/") === PROFILE_PACKAGE
      ? OLD_PROFILE
      : defaultReadText(path),
    runDsh: async (args, options) => args[0] === "plugin"
      ? { code: 1, stdout: "", stderr: "install failed", signal: null }
      : { code: 0, stdout: options?.capture ? "0.1.1-rc.2\n" : "", stderr: "", signal: null },
  });
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 1);
  assert.deepEqual(fixture.movedPaths.map(({ source, target }) => [source, target]), [
    [`${HOME}/profiles/web`, `${HOME}/profiles/.web-reconcile-backup`],
    [`${HOME}/profiles/.web-reconcile-backup`, `${HOME}/profiles/web`],
  ]);
  assert.deepEqual(fixture.removedTrees, [`${HOME}/profiles/web`]);
  assert.equal(fixture.writes.some(({ path }) => path.endsWith(XTZ_STAMP_FILE)), false);
  assert.equal(fixture.spawned.length, 0);
});

test("dump-config validation failure restores the old profile and does not spawn", async () => {
  let reconciled = false;
  const fixture = fakeDependencies({
    readText: async (path) => path.replaceAll("\\", "/") === PROFILE_PACKAGE
      ? reconciled ? VALID_PROFILE : OLD_PROFILE
      : defaultReadText(path),
    runDsh: async (args, options) => {
      if (args[0] === "plugin" && args[3] === "add") reconciled = true;
      return {
        code: 0,
        stdout: args[0] === "web" && args[1] === "--dump-config"
          ? "# == dsh-xtz-ui\n"
          : options?.capture ? "0.1.1-rc.2\n" : "",
        stderr: "",
        signal: null,
      };
    },
  });
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 1);
  assert.deepEqual(fixture.movedPaths.map(({ source, target }) => [source, target]), [
    [`${HOME}/profiles/web`, `${HOME}/profiles/.web-reconcile-backup`],
    [`${HOME}/profiles/.web-reconcile-backup`, `${HOME}/profiles/web`],
  ]);
  assert.equal(fixture.spawned.length, 0);
  assert.match(fixture.output.stderr, /bundle 层/u);
});

test("a concurrent official start cannot recover or mutate an active reconciliation", async () => {
  const lock = `${HOME}/xiaotaozi-xtz-reconcile.lock.${ACTIVE_LOCK_TOKEN}`;
  const fixture = fakeDependencies({
    processAlive: (pid) => pid === 31337,
    processIdentity: async (pid) => pid === 31337 ? "active-cli" : PROCESS_IDENTITY,
  });
  fixture.files.set(lock, JSON.stringify({ pid: 31337, identity: "active-cli", token: ACTIVE_LOCK_TOKEN, state: "ready", ticket: 1 }));
  fixture.pathKinds.set(`${HOME}/profiles/.web-reconcile-backup`, "directory");
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 1);
  assert.equal(fixture.removedTrees.length, 0);
  assert.equal(fixture.movedPaths.length, 0);
  assert.equal(fixture.spawned.length, 0);
  assert.match(fixture.output.stderr, /另一个 xtz/u);
});

test("three simultaneous official starts never pass the contender lock together", async () => {
  const fixture = fakeDependencies({
    processAlive: (pid) => pid === process.pid,
    probe: async (port = 3080) => fixture.spawned.length > 0
      ? { state: "running", healthy: true, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "xiaotaozi-dsh" }
      : { state: "stopped", healthy: false, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "none" },
  });
  const stale = `${HOME}/xiaotaozi-xtz-reconcile.lock.${STALE_LOCK_TOKEN}`;
  fixture.files.set(stale, JSON.stringify({ pid: 31337, identity: "dead-cli", token: STALE_LOCK_TOKEN, state: "ready", ticket: 1 }));
  const results = await Promise.all([
    runCli(["start", "--no-open"], fixture.dependencies),
    runCli(["start", "--no-open"], fixture.dependencies),
    runCli(["start", "--no-open"], fixture.dependencies),
  ]);
  assert.ok(results.every((code) => code === 0 || code === 1));
  assert.ok(fixture.spawned.length <= 1);
  assert.equal([...fixture.files.keys()].some((path) => path.startsWith(`${HOME}/xiaotaozi-xtz-reconcile.lock.`)), false);
});

test("a delayed second start rechecks ownership under the startup lock", async () => {
  let pidReads = 0;
  let probes = 0;
  const fixture = fakeDependencies({
    readText: async (path) => {
      if (path.endsWith(WEB_PID_FILE)) return ++pidReads === 1 ? null : VALID_PID_RECORD;
      return defaultReadText(path);
    },
    processAlive: (pid) => pid === 4242,
    probe: async (port = 3080) => {
      probes += 1;
      return probes === 1
        ? { state: "stopped", healthy: false, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "none" }
        : { state: "running", healthy: true, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "xiaotaozi-dsh" };
    },
  });
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 0);
  assert.equal(fixture.spawned.length, 0);
});

test("foreground start releases the startup lock after readiness", async () => {
  let resolveClose;
  const closed = new Promise((resolve) => { resolveClose = resolve; });
  let probes = 0;
  const fixture = fakeDependencies({
    spawnWeb: async (args, options) => {
      fixture.spawned.push(args);
      fixture.spawnOptions.push(options);
      return { pid: 4242, identity: PROCESS_IDENTITY, closed };
    },
    probe: async (port = 3080) => {
      probes += 1;
      return probes < 3
        ? { state: "stopped", healthy: false, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "none" }
        : { state: "running", healthy: true, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "xiaotaozi-dsh" };
    },
  });
  const running = runCli(["start", "--foreground", "--no-open"], fixture.dependencies);
  for (let i = 0; i < 10 && fixture.spawned.length === 0; i += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fixture.spawned.length, 1);
  assert.equal([...fixture.files.keys()].some((path) => path.startsWith(`${HOME}/xiaotaozi-xtz-reconcile.lock.`)), false);
  resolveClose({ code: 0, signal: null });
  assert.equal(await running, 0);
});

test("official start reclaims a dead reconciliation lock", async () => {
  const lock = `${HOME}/xiaotaozi-xtz-reconcile.lock.${STALE_LOCK_TOKEN}`;
  let probes = 0;
  const fixture = fakeDependencies({
    probe: async (port = 3080) => {
      probes += 1;
      return probes === 1
        ? { state: "stopped", healthy: false, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "none" }
        : { state: "running", healthy: true, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "xiaotaozi-dsh" };
    },
  });
  fixture.files.set(lock, JSON.stringify({ pid: 31337, identity: "dead-cli", token: STALE_LOCK_TOKEN, state: "ready", ticket: 1 }));
  fixture.files.set(`${HOME}/xiaotaozi-xtz-reconcile.lock.${STALE_LOCK_TOKEN}.tmp`, "partial");
  fixture.files.set(`${HOME}/.xiaotaozi-exclusive-remove.crash`, "partial");
  fixture.pathKinds.set(lock, "file");
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 0);
  assert.equal(fixture.files.has(lock), false);
  assert.equal(fixture.spawned.length, 1);
});

test("start restores an interrupted profile transaction before reconciling again", async () => {
  let reconciled = false;
  let probes = 0;
  const fixture = fakeDependencies({
    readText: async (path) => path.replaceAll("\\", "/") === PROFILE_PACKAGE
      ? reconciled ? VALID_PROFILE : OLD_PROFILE
      : defaultReadText(path),
    runDsh: async (args, options) => {
      if (args[0] === "plugin" && args[3] === "add") reconciled = true;
      return {
        code: 0,
        stdout: args[0] === "web" && args[1] === "--dump-config"
          ? DEFAULT_PLUGINS.map(({ name }) => `# == ${name}`).join("\n")
          : options?.capture ? "0.1.1-rc.2\n" : "",
        stderr: "",
        signal: null,
      };
    },
    probe: async (port = 3080) => {
      probes += 1;
      return probes === 1
        ? { state: "stopped", healthy: false, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "none" }
        : { state: "running", healthy: true, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "xiaotaozi-dsh" };
    },
  });
  fixture.pathKinds.set(`${HOME}/profiles/.web-reconcile-backup`, "directory");
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 0);
  assert.deepEqual(fixture.movedPaths.slice(0, 2), [
    { source: `${HOME}/profiles/.web-reconcile-backup`, target: `${HOME}/profiles/web` },
    { source: `${HOME}/profiles/web`, target: `${HOME}/profiles/.web-reconcile-backup` },
  ]);
  assert.match(fixture.output.stdout, /已恢复上次未完成同步前的 Web profile/u);
});

test("start refuses a symlinked reconciliation backup without deleting the candidate", async () => {
  const fixture = fakeDependencies();
  fixture.pathKinds.set(`${HOME}/profiles/.web-reconcile-backup`, "symlink");
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 1);
  assert.equal(fixture.removedTrees.length, 0);
  assert.equal(fixture.movedPaths.length, 0);
  assert.equal(fixture.spawned.length, 0);
  assert.match(fixture.output.stderr, /未修改任何 profile/u);
});

test("start refuses recovery when profiles resolves outside the official home", async () => {
  const fixture = fakeDependencies({
    realPath: async (path) => {
      if (path === `${HOME}/profiles`) return "/outside/profiles";
      if (path === `${HOME}/profiles/.web-reconcile-backup`) return "/outside/profiles/.web-reconcile-backup";
      return path;
    },
  });
  fixture.pathKinds.set(`${HOME}/profiles/.web-reconcile-backup`, "directory");
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 1);
  assert.equal(fixture.removedTrees.length, 0);
  assert.equal(fixture.movedPaths.length, 0);
  assert.match(fixture.output.stderr, /真实目录；拒绝同步/u);
});

test("start does not remove a commit marker through a symlinked Web profile", async () => {
  const profile = `${HOME}/profiles/web`;
  const committed = `${profile}/.xiaotaozi-reconcile-committed`;
  const fixture = fakeDependencies();
  fixture.pathKinds.set(profile, "symlink");
  fixture.pathKinds.set(committed, "file");
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 1);
  assert.equal(fixture.removed.includes(committed), false);
  assert.match(fixture.output.stderr, /固定路径/u);
});

test("start rejects a non-regular commit marker without reading or removing it", async () => {
  const committed = `${HOME}/profiles/web/.xiaotaozi-reconcile-committed`;
  const fixture = fakeDependencies({
    readText: async (path) => {
      if (path === committed) throw new Error("marker must not be read");
      return defaultReadText(path);
    },
  });
  fixture.pathKinds.set(committed, "other");
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 1);
  assert.equal(fixture.removed.includes(committed), false);
  assert.doesNotMatch(fixture.output.stderr, /marker must not be read/u);
});

test("start refuses a symlinked Web profile even when it resolves inside the home", async () => {
  const fixture = fakeDependencies({
    realPath: async (path) => path === `${HOME}/profiles/web` ? `${HOME}/sessions` : path,
  });
  fixture.pathKinds.set(`${HOME}/profiles/web`, "symlink");
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 1);
  assert.equal(fixture.removedTrees.length, 0);
  assert.equal(fixture.movedPaths.length, 0);
  assert.equal(fixture.spawned.length, 0);
  assert.match(fixture.output.stderr, /真实目录/u);
});

test("a crash during committed backup cleanup keeps the validated candidate and resumes cleanup", async () => {
  let reconciled = false;
  let cleanupFailed = false;
  const backup = `${HOME}/profiles/.web-reconcile-backup`;
  const marker = `${HOME}/profiles/web/.xiaotaozi-reconcile-committed`;
  const fixture = fakeDependencies({
    readText: async (path) => fixture.files.has(path)
      ? fixture.files.get(path)
      : path.replaceAll("\\", "/") === PROFILE_PACKAGE
        ? reconciled ? VALID_PROFILE : OLD_PROFILE
        : defaultReadText(path),
    runDsh: async (args, options) => {
      if (args[0] === "plugin" && args[3] === "add") reconciled = true;
      const stdout = args[0] === "web" && args[1] === "--dump-config"
        ? DEFAULT_PLUGINS.map(({ name }) => `# == ${name}`).join("\n")
        : options?.capture ? "0.1.1-rc.2\n" : "";
      return { code: 0, stdout, stderr: "", signal: null };
    },
    removeTree: async (path) => {
      fixture.removedTrees.push(path);
      if (path === backup && fixture.files.has(marker) && !cleanupFailed) {
        cleanupFailed = true;
        throw new Error("cleanup interrupted");
      }
      fixture.pathKinds.delete(path);
    },
    probe: async (port = 3080) => fixture.spawned.length === 0
      ? { state: "stopped", healthy: false, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "none" }
      : { state: "running", healthy: true, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "xiaotaozi-dsh" },
  });
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 1);
  assert.equal(fixture.files.has(marker), true);
  assert.equal(fixture.movedPaths.filter(({ source }) => source === backup).length, 0);
  assert.equal(fixture.spawned.length, 0);

  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 0);
  assert.equal(fixture.files.has(marker), false);
  assert.equal(fixture.pathKinds.has(backup), false);
  assert.equal(fixture.movedPaths.filter(({ source }) => source === backup).length, 0);
  assert.equal(fixture.spawned.length, 1);
});

test("rollback failure preserves the backup and fails closed", async () => {
  const fixture = fakeDependencies({
    readText: async (path) => path.replaceAll("\\", "/") === PROFILE_PACKAGE
      ? OLD_PROFILE
      : defaultReadText(path),
    runDsh: async (args, options) => args[0] === "plugin"
      ? { code: 1, stdout: "", stderr: "install failed", signal: null }
      : { code: 0, stdout: options?.capture ? "0.1.1-rc.2\n" : "", stderr: "", signal: null },
    movePath: async (source, target) => {
      fixture.movedPaths.push({ source, target });
      if (source.endsWith(".web-reconcile-backup")) throw new Error("restore blocked");
      fixture.pathKinds.delete(source);
      fixture.pathKinds.set(target, "directory");
    },
  });
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 1);
  assert.equal(fixture.pathKinds.get(`${HOME}/profiles/.web-reconcile-backup`), "directory");
  assert.equal(fixture.spawned.length, 0);
  assert.match(fixture.output.stderr, /完整备份仍保留/u);
});

test("exclusive startup records publish complete content and remove only on exact match", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "xtz-exclusive-"));
  t.after(async () => { await rm(home, { recursive: true, force: true }); });
  const deps = await createDefaultDependencies({ home });
  const path = join(home, "lock");
  const record = JSON.stringify({ pid: 42, token: "one" });
  assert.equal(await deps.createExclusive(path, record), true);
  assert.equal(await readFile(path, "utf8"), record);
  assert.equal(await deps.createExclusive(path, "replacement"), false);
  assert.equal(await deps.removeExclusive(path, "replacement"), false);
  assert.equal(await readFile(path, "utf8"), record);
  assert.equal(await deps.removeExclusive(path, record), true);
  await assert.rejects(readFile(path, "utf8"), /ENOENT/u);
});

test("profile copy preserves user files and excludes node_modules", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "xtz-profile-copy-"));
  t.after(async () => { await rm(home, { recursive: true, force: true }); });
  const source = join(home, "source");
  const target = join(home, "target");
  await mkdir(join(source, "node_modules", "dsh-im"), { recursive: true });
  await mkdir(join(source, "vendor"), { recursive: true });
  await writeFile(join(source, "package.json"), PRESERVED_OLD_PROFILE);
  await writeFile(join(source, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  await writeFile(join(source, "pnpm-workspace.yaml"), "packages:\n  - .\n");
  await writeFile(join(source, "cordis.patch.yml"), "# user patch\n");
  await writeFile(join(source, "vendor", "custom.tgz"), "archive");
  await writeFile(join(source, "node_modules", "dsh-im", "package.json"), "{}");
  const deps = await createDefaultDependencies({ home });
  assert.equal(typeof deps.copyProfile, "function");
  await deps.copyProfile(source, target);
  const copied = JSON.parse(await readFile(join(target, "package.json"), "utf8"));
  assert.equal(copied.dependencies[THIRD_PARTY_PLUGIN], "github:example/context#v1.2.3");
  assert.ok(copied.dsh.profile.bundles.includes(THIRD_PARTY_PLUGIN));
  assert.equal(await readFile(join(target, "cordis.patch.yml"), "utf8"), "# user patch\n");
  assert.equal(await readFile(join(target, "pnpm-lock.yaml"), "utf8"), "lockfileVersion: '9.0'\n");
  assert.equal(await readFile(join(target, "pnpm-workspace.yaml"), "utf8"), "packages:\n  - .\n");
  assert.equal(await readFile(join(target, "vendor", "custom.tgz"), "utf8"), "archive");
  await assert.rejects(readFile(join(target, "node_modules", "dsh-im", "package.json"), "utf8"), /ENOENT/u);
});

test("profile copy rejects symlinks instead of carrying aliases into the candidate", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "xtz-profile-symlink-"));
  t.after(async () => { await rm(home, { recursive: true, force: true }); });
  const source = join(home, "source");
  const target = join(home, "target");
  await mkdir(join(source, "vendor"), { recursive: true });
  await writeFile(join(source, "package.json"), OLD_PROFILE);
  await writeFile(join(home, "outside.yml"), "secret\n");
  await symlink(join(home, "outside.yml"), join(source, "cordis.patch.yml"));
  const deps = await createDefaultDependencies({ home });
  await assert.rejects(deps.copyProfile(source, target), /symlink/u);
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
  assert.equal(fixture.copiedProfiles.length, 0);
  assert.equal(fixture.movedPaths.length, 0);
  assert.equal(fixture.removedTrees.length, 0);
  assert.match(fixture.output.stdout, /http:\/\/127\.0\.0\.1:3081\//u);
});

test("sandbox start moves an installed default from devDependencies to dependencies", async () => {
  const dependencies = Object.fromEntries(DEFAULT_PLUGINS
    .filter(({ name }) => name !== "dsh-im")
    .map(({ name }) => [name, `link:../../../plugins/${name.slice(4)}`]));
  const manifest = JSON.stringify({
    ...VALID_PROFILE_OBJECT,
    dependencies,
    devDependencies: { "dsh-im": "link:../../../plugins/im" },
  });
  const fixture = sandboxDependencies({
    readText: async (path) => path === `${SANDBOX_HOME}/profiles/web/package.json`
      ? manifest
      : defaultReadText(path),
    probe: async (port = 3081) => fixture.spawned.length > 0
      ? { state: "running", healthy: true, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "xiaotaozi-dsh" }
      : { state: "stopped", healthy: false, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "none" },
  });
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 0);
  const add = fixture.calls.find((call) => call.args[3] === "add");
  assert.equal(add.args[4], "./plugins/im");
  assert.equal(add.args.at(-1), "--save-prod");
});

test("sandbox start still removes retired plugin residue without using the official transaction", async () => {
  const retiredProfile = JSON.stringify({
    ...VALID_PROFILE_OBJECT,
    dependencies: { ...CURRENT_DEFAULT_DEPENDENCIES, "dsh-hello": "github:example/hello#v0.1.0" },
    dsh: { profile: { bundles: [...VALID_PROFILE_OBJECT.dsh.profile.bundles, "dsh-hello"] } },
  });
  let retired = true;
  let probes = 0;
  const sandboxPackage = `${SANDBOX_HOME}/profiles/web/package.json`;
  const fixture = sandboxDependencies({
    readText: async (path) => path === sandboxPackage && retired ? retiredProfile : defaultReadText(path),
    pathExists: async (path) => path.endsWith("/node_modules/dsh-hello") ? retired : defaultPathExists(path),
    runDsh: async (args, options) => {
      fixture.calls.push({ args, options });
      if (args[0] === "plugin" && args[3] === "remove") retired = false;
      return { code: 0, stdout: options?.capture ? "0.1.1-rc.2\n" : "", stderr: "", signal: null };
    },
    probe: async (port = 3081) => {
      probes += 1;
      return probes === 1
        ? { state: "stopped", healthy: false, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "none" }
        : { state: "running", healthy: true, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "xiaotaozi-dsh" };
    },
  });
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 0);
  assert.deepEqual(fixture.calls.find((call) => call.args[3] === "remove").args, ["plugin", "--profile", "web", "remove", "dsh-hello"]);
  assert.equal(fixture.movedPaths.length, 0);
});

test("sandbox start prunes bundle-only retired residue", async () => {
  const manifest = JSON.stringify({
    ...VALID_PROFILE_OBJECT,
    dsh: { profile: { bundles: [...VALID_PROFILE_OBJECT.dsh.profile.bundles, "dsh-hello"] } },
  });
  const fixture = sandboxDependencies({
    readText: async (path) => path === `${SANDBOX_HOME}/profiles/web/package.json`
      ? manifest
      : defaultReadText(path),
    probe: async (port = 3081) => fixture.spawned.length > 0
      ? { state: "running", healthy: true, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "xiaotaozi-dsh" }
      : { state: "stopped", healthy: false, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "none" },
  });
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 0);
  assert.equal(fixture.calls.some((call) => call.args[3] === "remove"), false);
  assert.match(fixture.writes.find((write) => write.path.endsWith("package.json"))?.text ?? "", /dsh-xtz-ui/u);
  assert.equal(fixture.writes.some((write) => write.text.includes("dsh-hello")), false);
});

test("sandbox start prunes install-only retired directories and broken symlinks", async () => {
  const install = `${SANDBOX_HOME}/profiles/web/node_modules/dsh-hello`;
  for (const kind of ["directory", "symlink"]) {
    const fixture = sandboxDependencies({
      pathExists: async (path) => kind === "directory" && path === install || defaultPathExists(path),
      probe: async (port = 3081) => fixture.spawned.length > 0
        ? { state: "running", healthy: true, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "xiaotaozi-dsh" }
        : { state: "stopped", healthy: false, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "none" },
    });
    fixture.pathKinds.set(install, kind);
    assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 0, kind);
    if (kind === "directory") assert.deepEqual(fixture.removedTrees, [install]);
    else assert.equal(fixture.removed.includes(install), true);
  }
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
      return { pid: 4242, identity: PROCESS_IDENTITY, closed };
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

test("restart does not stop Web while another startup owns the lock", async () => {
  const lock = `${HOME}/xiaotaozi-xtz-reconcile.lock.${ACTIVE_LOCK_TOKEN}`;
  const fixture = fakeDependencies({
    processAlive: (pid) => pid === 31337 || pid === 4242,
    processIdentity: async (pid) => pid === 31337 ? "active-cli" : PROCESS_IDENTITY,
  });
  fixture.files.set(join(HOME, WEB_PID_FILE), VALID_PID_RECORD);
  fixture.files.set(lock, JSON.stringify({ pid: 31337, identity: "active-cli", token: ACTIVE_LOCK_TOKEN, state: "ready", ticket: 1 }));
  assert.equal(await runCli(["restart"], fixture.dependencies), 1);
  assert.deepEqual(fixture.stopped, []);
  assert.equal(fixture.files.has(join(HOME, WEB_PID_FILE)), true);
});

test("restart stops and starts while holding one startup lock", async () => {
  let fixture;
  const hasLock = () => [...fixture.files.keys()].some((path) => path.startsWith(`${HOME}/xiaotaozi-xtz-reconcile.lock.`));
  fixture = fakeDependencies({
    processAlive: (pid) => pid === 4242 && !fixture.stopped.includes(pid),
    stopPid: async (pid) => {
      assert.equal(hasLock(), true);
      fixture.stopped.push(pid);
      return "stopped";
    },
  });
  fixture.files.set(join(HOME, WEB_PID_FILE), VALID_PID_RECORD);
  const innerSpawn = fixture.dependencies.spawnWeb;
  fixture.dependencies.spawnWeb = async (args) => {
    assert.equal(hasLock(), true);
    return innerSpawn(args);
  };
  fixture.dependencies.probe = async (port = 3080) => {
    if (fixture.spawned.length > 0) {
      return { state: "running", healthy: true, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "xiaotaozi-dsh" };
    }
    return { state: "stopped", healthy: false, host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, owner: "none" };
  };
  fixture.dependencies.readText = async (path) => (
    fixture.files.has(path) ? fixture.files.get(path) : defaultReadText(path)
  );
  assert.equal(await runCli(["restart"], fixture.dependencies), 0, fixture.output.stderr);
  assert.deepEqual(fixture.stopped, [4242]);
  assert.equal(fixture.spawned.length, 1);
  assert.equal(hasLock(), false);
});

test("restart refuses a reused pid without signaling it or starting another service", async () => {
  const fixture = fakeDependencies({
    processAlive: (pid) => pid === 4242,
    processIdentity: async () => "test-process:replacement",
  });
  fixture.files.set(join(HOME, WEB_PID_FILE), VALID_PID_RECORD);
  assert.equal(await runCli(["restart"], fixture.dependencies), 2);
  assert.deepEqual(fixture.stopped, []);
  assert.equal(fixture.spawned.length, 0);
  assert.equal(fixture.files.has(join(HOME, WEB_PID_FILE)), false);
  assert.match(fixture.output.stderr, /复用/u);
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
      ? VALID_PID_RECORD
      : defaultReadText(path),
    processAlive: (pid) => pid === 4242,
  });
  const code = await runCli(["stop"], fixture.dependencies);
  assert.equal(code, 0);
  assert.deepEqual(fixture.stopped, [4242]);
  assert.equal(fixture.removed.some((path) => path.endsWith(WEB_PID_FILE)), true);
});

test("stop clears a dead pid record without signaling any process", async () => {
  const fixture = fakeDependencies();
  fixture.files.set(join(HOME, WEB_PID_FILE), VALID_PID_RECORD);
  assert.equal(await runCli(["stop"], fixture.dependencies), 0);
  assert.deepEqual(fixture.stopped, []);
  assert.equal(fixture.files.has(join(HOME, WEB_PID_FILE)), false);
  assert.match(fixture.output.stdout, /已不在/u);
});

test("stop refuses a reused pid and never signals the replacement", async () => {
  const fixture = fakeDependencies({
    processAlive: (pid) => pid === 4242,
    processIdentity: async () => "test-process:replacement",
  });
  fixture.files.set(join(HOME, WEB_PID_FILE), VALID_PID_RECORD);
  assert.equal(await runCli(["stop"], fixture.dependencies), 2);
  assert.deepEqual(fixture.stopped, []);
  assert.equal(fixture.files.has(join(HOME, WEB_PID_FILE)), false);
  assert.match(fixture.output.stderr, /复用/u);
});

test("stop fails closed for a live legacy pid record without process identity", async () => {
  const fixture = fakeDependencies({ processAlive: (pid) => pid === 4242 });
  fixture.files.set(join(HOME, WEB_PID_FILE), JSON.stringify({
    pid: 4242,
    startedAt: "2026-08-27T00:00:00.000Z",
  }));
  assert.equal(await runCli(["stop"], fixture.dependencies), 2);
  assert.deepEqual(fixture.stopped, []);
  assert.equal(fixture.files.has(join(HOME, WEB_PID_FILE)), true);
  assert.match(fixture.output.stderr, /无法验证/u);
});

test("stop rechecks identity immediately before signaling", async () => {
  const fixture = fakeDependencies({
    processAlive: (pid) => pid === 4242,
    stopPid: async () => "identity-mismatch",
  });
  fixture.files.set(join(HOME, WEB_PID_FILE), VALID_PID_RECORD);
  assert.equal(await runCli(["stop"], fixture.dependencies), 2);
  assert.deepEqual(fixture.stopped, []);
  assert.equal(fixture.files.has(join(HOME, WEB_PID_FILE)), false);
  assert.match(fixture.output.stderr, /停止前已被复用/u);
});

test("parseAllowBuildKeys reads pnpm 11 git prepare keys", () => {
  const log = `Add the package to "allowBuilds" in your project's pnpm-workspace.yaml to allow it to run scripts. For example:
allowBuilds:
  dsh-xtz-ui@https://codeload.github.com/kedoupi/xiaotaozi-dsh/tar.gz/267d645#path:plugins/xtz-ui: true
`;
  assert.deepEqual(parseAllowBuildKeys(log), [
    "dsh-xtz-ui@https://codeload.github.com/kedoupi/xiaotaozi-dsh/tar.gz/267d645#path:plugins/xtz-ui",
  ]);
  const yaml = withAllowBuilds("packages:\n  - .\n", parseAllowBuildKeys(log));
  assert.match(yaml, /allowBuilds:/u);
  assert.match(yaml, /dsh-xtz-ui@https:\/\/codeload\.github\.com/u);
});

test("withAllowBuilds preserves explicit false and unrelated pnpm settings", () => {
  const yaml = withAllowBuilds(
    "packages:\n  - .\n\nallowBuilds: # policy map\n  # preserve policy\n  'blocked-native': false # keep disabled\n\nonlyBuiltDependencies:\n  - legacy\n",
    ["blocked-native", "sharp"],
  );
  assert.match(yaml, /allowBuilds: # policy map/u);
  assert.match(yaml, /# preserve policy/u);
  assert.match(yaml, /'blocked-native': false # keep disabled/u);
  assert.equal((yaml.match(/blocked-native/gu) ?? []).length, 1);
  assert.match(yaml, /sharp: true/u);
  assert.match(yaml, /onlyBuiltDependencies:\n  - legacy/u);
  assert.match(withAllowBuilds("allowBuilds:", ["sharp"]), /^allowBuilds:\n  sharp: true\n$/u);
  const crlf = withAllowBuilds("allowBuilds: # policy\r\n  'blocked-native': false # disabled\r\n", ["blocked-native", "sharp"]);
  assert.equal(crlf, "allowBuilds: # policy\r\n  'blocked-native': false # disabled\r\n  sharp: true\r\n");
  assert.throws(
    () => withAllowBuilds("'allowBuilds':\n  blocked-native: false\n", ["sharp"]),
    /拒绝改写/u,
  );
});

test("parseAllowBuildKeys reads ignored native build scripts", () => {
  assert.deepEqual(parseAllowBuildKeys("[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: node-pty@1.1.0\n"), ["node-pty"]);
});

test("expandAllowBuildKeysForDefaultPlugins clones tarball keys across default plugins", () => {
  const keys = expandAllowBuildKeysForDefaultPlugins(
    ["dsh-xtz-ui@https://codeload.github.com/kedoupi/xiaotaozi-dsh/tar.gz/abc#path:plugins/xtz-ui"],
    [
      { name: "dsh-xtz-ui" },
      { name: "dsh-im" },
      { name: "dsh-wecom-office" },
    ],
  );
  assert.deepEqual(keys, [
    "dsh-xtz-ui@https://codeload.github.com/kedoupi/xiaotaozi-dsh/tar.gz/abc#path:plugins/xtz-ui",
    "dsh-im@https://codeload.github.com/kedoupi/xiaotaozi-dsh/tar.gz/abc#path:plugins/im",
    "dsh-wecom-office@https://codeload.github.com/kedoupi/xiaotaozi-dsh/tar.gz/abc#path:plugins/wecom-office",
  ]);
});

test("start retries the one default-plugin add after allowing git prepare scripts", async () => {
  let probes = 0;
  let adds = 0;
  let installed = false;
  const calls = [];
  const fixture = fakeDependencies({
    pathExists: async (path) => {
      const portable = path.replaceAll("\\", "/");
      if (portable.includes("/node_modules/dsh-") && !portable.includes("/node_modules/dsh-hello")) return installed;
      return defaultPathExists(path);
    },
    runDsh: async (args, options) => {
      calls.push({ args, options });
      if (args[0] === "plugin" && args[3] === "add") {
        adds += 1;
        if (adds === 1) {
          return {
            code: 1,
            stdout: "",
            stderr: `Add the package to "allowBuilds" in your project's pnpm-workspace.yaml to allow it to run scripts. For example:
allowBuilds:
  dsh-xtz-ui@https://codeload.github.com/kedoupi/xiaotaozi-dsh/tar.gz/abc#path:plugins/xtz-ui: true
`,
            signal: null,
          };
        }
        installed = true;
      }
      const stdout = args[0] === "web" && args[1] === "--dump-config"
        ? DEFAULT_PLUGINS.map(({ name }) => `# == ${name}`).join("\n")
        : options?.capture ? "0.1.1-rc.2\n" : "";
      return { code: 0, stdout, stderr: "", signal: null };
    },
    probe: async () => {
      probes += 1;
      return probes === 1
        ? { state: "stopped", healthy: false, host: "127.0.0.1", port: 3080, url: "http://127.0.0.1:3080/", owner: "none" }
        : { state: "running", healthy: true, host: "127.0.0.1", port: 3080, url: "http://127.0.0.1:3080/", owner: "xiaotaozi-dsh" };
    },
  });
  const code = await runCli(["start", "--no-open"], fixture.dependencies);
  assert.equal(code, 0);
  assert.equal(adds, 2);
  const pluginCalls = calls.filter((call) => call.args[0] === "plugin");
  assert.equal(pluginCalls.length, 2);
  assert.deepEqual(pluginCalls[0].args.slice(4), [...DEFAULT_PLUGINS.map(({ spec }) => spec), "--save-prod"]);
  const workspacePath = [...fixture.files.keys()].find((path) => path.replaceAll("\\", "/").endsWith("pnpm-workspace.yaml"));
  const yaml = workspacePath ? fixture.files.get(workspacePath) ?? "" : "";
  assert.match(yaml, /dsh-xtz-ui@https:\/\/codeload\.github\.com/u);
  assert.match(yaml, /dsh-im@https:\/\/codeload\.github\.com\/kedoupi\/xiaotaozi-dsh\/tar\.gz\/abc#path:plugins\/im/u);
  assert.match(yaml, /dsh-wecom-office@https:\/\/codeload\.github\.com/u);
  assert.match(fixture.output.stdout, /正在同步 6 个官方插件/u);
  assert.match(fixture.output.stdout, /正在重试默认插件同步/u);
});

test("planHostToolsHeal links a duplicate same-version copy", () => {
  assert.deepEqual(planHostToolsHeal({
    profileKind: "directory",
    alreadySame: false,
    profileVersion: "0.1.1-rc.2",
    fallbackKind: "symlink",
    fallbackVersion: "0.1.1-rc.2",
  }), { action: "link" });
  assert.deepEqual(planHostToolsHeal({
    profileKind: "file",
    alreadySame: false,
    profileVersion: "0.1.1-rc.2",
    fallbackKind: "symlink",
    fallbackVersion: "0.1.1-rc.2",
  }), { action: "link" });
  assert.deepEqual(planHostToolsHeal({
    profileKind: "directory",
    alreadySame: true,
    profileVersion: "0.1.1-rc.2",
    fallbackKind: "symlink",
    fallbackVersion: "0.1.1-rc.2",
  }), { action: "none" });
  assert.equal(planHostToolsHeal({
    profileKind: "directory",
    alreadySame: false,
    profileVersion: "0.1.1-rc.2",
    fallbackKind: "symlink",
    fallbackVersion: "0.1.2-alpha.1",
  }).action, "skip-version-mismatch");
});

test("start refuses host-tools healing through a symlinked scope directory", async () => {
  const links = [];
  const scope = `${HOME}/profiles/web/node_modules/@deepseek-ai`;
  const fixture = fakeDependencies({
    lstatKind: async (path) => {
      if ([HOME, `${HOME}/profiles`, `${HOME}/profiles/web`, `${HOME}/profiles/web/node_modules`].includes(path)) return "directory";
      if (path === scope) return "symlink";
      if (path.endsWith("/dsh-tools")) return path.includes("profiles/node_modules") ? "symlink" : "directory";
      return "missing";
    },
    realPath: async (path) => path === scope ? "/outside/@deepseek-ai" : path,
    readText: async (path) => path.endsWith("/dsh-tools/package.json")
      ? JSON.stringify({ name: "@deepseek-ai/dsh-tools", version: "0.1.1-rc.2" })
      : defaultReadText(path),
    replaceWithSymlink: async (path, target) => { links.push({ path, target }); },
  });
  assert.equal(await runCli(["start", "--no-open"], fixture.dependencies), 1);
  assert.equal(links.length, 0);
  assert.equal(fixture.spawned.length, 0);
  assert.match(fixture.output.stderr, /dsh-tools.*父目录/u);
});

test("start heals a duplicate dsh-tools directory onto the DSH fallback", async () => {
  const links = [];
  const kinds = new Map([
    ["profiles/web/node_modules/@deepseek-ai/dsh-tools", "directory"],
    ["profiles/node_modules/@deepseek-ai/dsh-tools", "symlink"],
  ]);
  const kindKey = (path) => {
    const portable = path.replaceAll("\\", "/");
    for (const key of kinds.keys()) {
      if (portable.endsWith(key)) return key;
    }
    return null;
  };
  let probes = 0;
  const fixture = fakeDependencies({
    lstatKind: async (path) => {
      if ([
        HOME,
        `${HOME}/profiles`,
        `${HOME}/profiles/web`,
        `${HOME}/profiles/web/node_modules`,
        `${HOME}/profiles/web/node_modules/@deepseek-ai`,
      ].includes(path)) return "directory";
      return kinds.get(kindKey(path)) ?? "missing";
    },
    replaceWithSymlink: async (path, target) => {
      links.push({ path: path.replaceAll("\\", "/"), target });
      const key = kindKey(path);
      if (key) kinds.set(key, "symlink");
    },
    realPath: async (path) => path,
    readText: async (path) => {
      const portable = path.replaceAll("\\", "/");
      if (portable.endsWith("node_modules/@deepseek-ai/dsh-tools/package.json")) {
        return JSON.stringify({ name: "@deepseek-ai/dsh-tools", version: "0.1.1-rc.2" });
      }
      return defaultReadText(path);
    },
    probe: async () => {
      probes += 1;
      return probes === 1
        ? { state: "stopped", healthy: false, host: "127.0.0.1", port: 3080, url: "http://127.0.0.1:3080/", owner: "none" }
        : { state: "running", healthy: true, host: "127.0.0.1", port: 3080, url: "http://127.0.0.1:3080/", owner: "xiaotaozi-dsh" };
    },
  });
  const code = await runCli(["start", "--no-open"], fixture.dependencies);
  assert.equal(code, 0);
  assert.equal(links.length, 1);
  assert.match(links[0].path, /profiles\/web\/node_modules\/@deepseek-ai\/dsh-tools$/u);
  assert.equal(links[0].target, HOST_TOOLS_RELATIVE_LINK);
  assert.match(fixture.output.stdout, /已将 @deepseek-ai\/dsh-tools 链回 DSH 安装树/u);
});

test("start continues when dsh-tools symlink heal fails", async () => {
  let probes = 0;
  const fixture = fakeDependencies({
    lstatKind: async (path) => {
      const portable = path.replaceAll("\\", "/");
      if ([
        HOME,
        `${HOME}/profiles`,
        `${HOME}/profiles/web`,
        `${HOME}/profiles/web/node_modules`,
        `${HOME}/profiles/web/node_modules/@deepseek-ai`,
      ].includes(path)) return "directory";
      if (portable.endsWith("profiles/web/node_modules/@deepseek-ai/dsh-tools")) return "directory";
      if (portable.endsWith("profiles/node_modules/@deepseek-ai/dsh-tools")) return "symlink";
      return "missing";
    },
    replaceWithSymlink: async () => {
      throw new Error("EPERM");
    },
    realPath: async (path) => path,
    readText: async (path) => {
      const portable = path.replaceAll("\\", "/");
      if (portable.endsWith("node_modules/@deepseek-ai/dsh-tools/package.json")) {
        return JSON.stringify({ name: "@deepseek-ai/dsh-tools", version: "0.1.1-rc.2" });
      }
      return defaultReadText(path);
    },
    probe: async () => {
      probes += 1;
      return probes === 1
        ? { state: "stopped", healthy: false, host: "127.0.0.1", port: 3080, url: "http://127.0.0.1:3080/", owner: "none" }
        : { state: "running", healthy: true, host: "127.0.0.1", port: 3080, url: "http://127.0.0.1:3080/", owner: "xiaotaozi-dsh" };
    },
  });
  const code = await runCli(["start", "--no-open"], fixture.dependencies);
  assert.equal(code, 0);
  assert.match(fixture.output.stderr, /无法创建符号链接/u);
  assert.match(fixture.output.stderr, /xtz doctor/u);
});

test("doctor reports a remaining duplicate dsh-tools copy", async () => {
  const fixture = fakeDependencies({
    lstatKind: async (path) => {
      const portable = path.replaceAll("\\", "/");
      if ([
        HOME,
        `${HOME}/profiles`,
        `${HOME}/profiles/web`,
        `${HOME}/profiles/web/node_modules`,
        `${HOME}/profiles/web/node_modules/@deepseek-ai`,
      ].includes(path)) return "directory";
      if (portable.endsWith("profiles/web/node_modules/@deepseek-ai/dsh-tools")) return "directory";
      if (portable.endsWith("profiles/node_modules/@deepseek-ai/dsh-tools")) return "symlink";
      return "missing";
    },
    realPath: async (path) => path,
  });
  const code = await runCli(["doctor", "--json"], fixture.dependencies);
  assert.equal(code, 1);
  const report = JSON.parse(fixture.output.stdout);
  const check = report.checks.find((item) => item.id === "host-tools");
  assert.equal(check?.level, "error");
  assert.match(check.message, /请再运行 xtz start/u);
});

test("doctor reports a dsh-tools version mismatch without telling the user to start again", async () => {
  const fixture = fakeDependencies({
    lstatKind: async (path) => {
      const portable = path.replaceAll("\\", "/");
      if (portable.endsWith("profiles/web/node_modules/@deepseek-ai/dsh-tools")) return "directory";
      if (portable.endsWith("profiles/node_modules/@deepseek-ai/dsh-tools")) return "symlink";
      return "missing";
    },
    realPath: async (path) => path,
    readText: async (path) => {
      const portable = path.replaceAll("\\", "/");
      if (portable.endsWith("profiles/web/node_modules/@deepseek-ai/dsh-tools/package.json")) {
        return JSON.stringify({ name: "@deepseek-ai/dsh-tools", version: "0.1.1-rc.2" });
      }
      if (portable.endsWith("profiles/node_modules/@deepseek-ai/dsh-tools/package.json")) {
        return JSON.stringify({ name: "@deepseek-ai/dsh-tools", version: "0.1.2-alpha.1" });
      }
      return defaultReadText(path);
    },
  });
  const code = await runCli(["doctor", "--json"], fixture.dependencies);
  assert.equal(code, 1);
  const report = JSON.parse(fixture.output.stdout);
  const check = report.checks.find((item) => item.id === "host-tools");
  assert.equal(check?.level, "error");
  assert.match(check.message, /版本不同/u);
  assert.equal(/请再运行 xtz start/u.test(check.message), false);
});

test("allowed plugin specs reject path-like dot names", () => {
  assert.equal(isAllowedPluginSpec(".."), false);
  assert.equal(isAllowedPluginSpec("."), false);
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

test("doctor reports transaction path failures as structured JSON checks", async () => {
  const fixture = fakeDependencies({
    lstatKind: async () => { throw new Error("EACCES"); },
  });
  const code = await runCli(["doctor", "--json"], fixture.dependencies);
  assert.equal(code, 1);
  const report = JSON.parse(fixture.output.stdout);
  assert.equal(report.ok, false);
  assert.match(report.checks.find((item) => item.id === "profile-transaction")?.message ?? "", /EACCES/u);
});

test("doctor reports profile read failures as structured checks", async () => {
  const fixture = fakeDependencies({
    readText: async (path) => {
      if (path === PROFILE_PACKAGE) throw new Error("EACCES");
      return defaultReadText(path);
    },
  });
  assert.equal(await runCli(["doctor", "--json"], fixture.dependencies), 1);
  const report = JSON.parse(fixture.output.stdout);
  assert.ok(report.checks.some((check) => check.id === "profile" && check.level === "error" && /无法读取/u.test(check.message)));
});

test("doctor rejects default and retired plugins in non-primary dependency bags", async () => {
  for (const bag of ["devDependencies", "optionalDependencies"]) {
    const dependencies = { ...CURRENT_DEFAULT_DEPENDENCIES };
    const dshIm = dependencies["dsh-im"];
    delete dependencies["dsh-im"];
    const manifest = JSON.stringify({
      ...VALID_PROFILE_OBJECT,
      dependencies,
      [bag]: { "dsh-im": dshIm, "dsh-hello": "github:example/hello#v0.1.0" },
    });
    const fixture = fakeDependencies({
      readText: async (path) => path.replaceAll("\\", "/") === PROFILE_PACKAGE
        ? manifest
        : defaultReadText(path),
    });
    assert.equal(await runCli(["doctor", "--json"], fixture.dependencies), 1, bag);
    const report = JSON.parse(fixture.output.stdout);
    assert.match(report.checks.find((item) => item.id === "profile-bundles")?.message ?? "", /非 dependencies.*退役插件/u);
  }
});

test("doctor rejects default plugins from an older product snapshot", async () => {
  const fixture = fakeDependencies({
    readText: async (path) => path.replaceAll("\\", "/") === PROFILE_PACKAGE
      ? OLD_PROFILE
      : defaultReadText(path),
  });
  assert.equal(await runCli(["doctor", "--json"], fixture.dependencies), 1);
  const report = JSON.parse(fixture.output.stdout);
  assert.ok(report.checks.some((check) => (
    check.id === "profile-default-specs"
    && check.level === "error"
    && check.message.includes("dsh-im")
    && check.message.includes("xtz restart")
  )));
});

test("doctor accepts a legacy stamp but asks restart to record the product version", async () => {
  const fixture = fakeDependencies({
    readText: async (path) => path.replaceAll("\\", "/").endsWith(XTZ_STAMP_FILE)
      ? JSON.stringify({ writer: "xtz", createdAt: "2026-08-27T00:00:00.000Z" })
      : defaultReadText(path),
  });
  await runCli(["doctor", "--json"], fixture.dependencies);
  const report = JSON.parse(fixture.output.stdout);
  assert.ok(report.checks.some((check) => (
    check.id === "xtz-seed" && check.level === "warning" && /xtz restart/u.test(check.message)
  )));
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
  assert.ok(report.checks.some((check) => check.id === "profile-install-safety" && check.level === "error" && /dsh-im/u.test(check.message)));
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
    readText: async (path) => path.replaceAll("\\", "/") === PROFILE_PACKAGE ? VENDOR_PROFILE : defaultReadText(path),
    realPath: async (path) => path.endsWith(".tgz") ? "/outside/dsh-hello.tgz" : path,
  });
  fixture.dependencies.lstatKind = async (path) => path.endsWith(".tgz")
    ? "file"
    : fixture.pathKinds.get(path) ?? "missing";
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

test("doctor reports an unfinished Web reconciliation without modifying it", async () => {
  const fixture = fakeDependencies();
  fixture.pathKinds.set(`${HOME}/profiles/.web-reconcile-backup`, "directory");
  const code = await runCli(["doctor", "--json"], fixture.dependencies);
  assert.equal(code, 1);
  const report = JSON.parse(fixture.output.stdout);
  assert.ok(report.checks.some((check) => (
    check.id === "profile-transaction"
    && check.level === "error"
    && check.message.includes(".web-reconcile-backup")
    && check.message.includes("start/restart")
  )));
  assert.equal(fixture.movedPaths.length, 0);
  assert.equal(fixture.removedTrees.length, 0);
});

test("Node engine range matches DeepSeek Harness", () => {
  const range = nodeEngineRange("22.19.0");
  assert.equal(range, "^22.19.0 || >=24.0.0");
  assert.equal(nodeSatisfiesEngine("22.19.0", range), true);
  assert.equal(nodeSatisfiesEngine("22.20.1", range), true);
  assert.equal(nodeSatisfiesEngine("24.18.0", range), true);
  assert.equal(nodeSatisfiesEngine("26.0.0", range), true);
  assert.equal(nodeSatisfiesEngine("22.18.0", range), false);
  assert.equal(nodeSatisfiesEngine("23.11.0", range), false);
  assert.equal(nodeSatisfiesEngine("18.20.0", range), false);
});

test("version requires a supported Node range and the pinned DSH version", async () => {
  const tooOld = fakeDependencies({ nodeVersion: "22.18.0" });
  assert.equal(await runCli(["version", "--json"], tooOld.dependencies), 1);
  assert.equal(JSON.parse(tooOld.output.stdout).expectedNode, "^22.19.0 || >=24.0.0");

  const current24 = fakeDependencies({ nodeVersion: "24.18.0" });
  assert.equal(await runCli(["version", "--json"], current24.dependencies), 0);
});

test("business commands fail before probing or reading the official home on an unsupported Node", async () => {
  for (const argv of [[], ["status"], ["config", "path"], ["plugin", "list"], ["doctor"], ["start"], ["open"], ["restart"]]) {
    let probes = 0;
    let reads = 0;
    const fixture = fakeDependencies({
      nodeVersion: "23.11.0",
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
    assert.match(fixture.output.stderr, /需要 Node\.js \^22\.19\.0 \|\| >=24\.0\.0/u);
  }

  const help = fakeDependencies({ nodeVersion: "23.11.0" });
  assert.equal(await runCli(["--help"], help.dependencies), 0);
  const bareVersion = fakeDependencies({ nodeVersion: "23.11.0" });
  assert.equal(await runCli(["--version"], bareVersion.dependencies), 0);
});

test("JSON flags and shorthand version reject trailing arguments", async () => {
  const status = fakeDependencies();
  assert.equal(await runCli(["status", "--json", "--json"], status.dependencies), 2);
  const version = fakeDependencies();
  assert.equal(await runCli(["-v", "extra"], version.dependencies), 2);
});
