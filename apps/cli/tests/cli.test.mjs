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
} from "../lib/index.js";

const HOME = "/user/.dsh";
const PROFILE_PACKAGE = `${HOME}/profiles/web/package.json`;
const VALID_STAMP = JSON.stringify({ packVersion: "20260826T000000000Z", source: "bundled" });
const VALID_PROFILE = JSON.stringify({
  name: "dsh-profile-web",
  private: true,
  dependencies: {
    "dsh-hello": "file:./vendor/dsh-hello-0.2.1.tgz",
    "dsh-sidebar": "file:./vendor/dsh-sidebar-0.1.0.tgz",
    "dsh-providers": "file:./vendor/dsh-providers-0.2.1.tgz",
    "dsh-memory": "file:./vendor/dsh-memory-0.1.0.tgz",
    "dsh-im": "file:./vendor/dsh-im-0.1.0.tgz",
  },
  dsh: {
    profile: {
      bundles: [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-hello",
        "dsh-sidebar",
        "dsh-providers",
        "dsh-memory",
        "dsh-im",
      ],
    },
  },
});

function defaultReadText(path) {
  const portablePath = path.replaceAll("\\", "/");
  if (portablePath.endsWith("xiaotaozi-desktop.json")) return VALID_STAMP;
  if (portablePath.endsWith("profiles/web/package.json")) return VALID_PROFILE;
  const installed = /\/profiles\/web\/node_modules\/(dsh-(?:hello|sidebar|providers|memory|im))\/package\.json$/u.exec(portablePath);
  if (installed !== null) return JSON.stringify({ name: installed[1], version: "0.1.0" });
  return null;
}

function defaultPathExists(path) {
  return ![".web-staging", ".web-backup", ".web-retired", ".web-seeding", ".xiaotaozi-pack"].some((name) => path.endsWith(name));
}

function fakeDependencies(overrides = {}) {
  const output = { stdout: "", stderr: "" };
  const calls = [];
  return {
    output,
    calls,
    dependencies: {
      metadata: {
        name: "xiaotaozi-dsh-cli",
        version: "0.1.0",
        expectedDsh: "0.1.1-rc.2",
        expectedNode: "22.19.0",
        expectedPnpm: "11.22.0",
      },
      home: HOME,
      nodeVersion: "22.19.0",
      stdout: (text) => { output.stdout += text; },
      stderr: (text) => { output.stderr += text; },
      runDsh: async (args, options) => {
        calls.push({ args, options });
        return { code: 0, stdout: options?.capture ? "0.1.1-rc.2\n" : "", stderr: "", signal: null };
      },
      probe: async () => ({
        state: "stopped",
        healthy: false,
        host: "127.0.0.1",
        port: 3080,
        url: "http://127.0.0.1:3080/",
        owner: "none",
      }),
      readText: async (path) => defaultReadText(path),
      pathExists: async (path) => defaultPathExists(path),
      realPath: async (path) => path,
      ...overrides,
    },
  };
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

test("officialDshHome ignores HOME on Windows in favor of USERPROFILE", () => {
  const userProfile = "C:\\Users\\peach";
  assert.equal(
    officialDshHome("win32", { HOME: "C:\\wrong", USERPROFILE: userProfile }, "C:\\fallback"),
    join(userProfile, ".dsh"),
  );
});

test("lifecycle commands fail closed without invoking DSH", async () => {
  for (const command of ["start", "web", "open", "run", "ask", "stop", "update"]) {
    const fixture = fakeDependencies();
    const code = await runCli([command, "ignored"], fixture.dependencies);
    assert.equal(code, 2, command);
    assert.equal(fixture.calls.length, 0, command);
    assert.match(fixture.output.stderr, /shared supervisor/u, command);
  }
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

test("plugin rejects mutations on the official profile", async () => {
  const fixture = fakeDependencies();
  const code = await runCli(["plugin", "add", "example"], fixture.dependencies);
  assert.equal(code, 2);
  assert.equal(fixture.calls.length, 0);
  assert.match(fixture.output.stderr, /不接受 add\/remove\/update/u);
});

test("plugin list reads package.json without invoking dsh or pnpm", async () => {
  const fixture = fakeDependencies({
    readText: async (path) => path.replaceAll("\\", "/") === PROFILE_PACKAGE
      ? JSON.stringify({
        dependencies: {
          "@nanmicoder/dsh-agent-teams": "^0.1.12",
          "dsh-memory": "file:./vendor/dsh-memory.tgz",
          "dsh-hello": "file:./vendor/dsh-hello.tgz",
          "dsh-sidebar": "file:./vendor/dsh-sidebar.tgz",
          react: "18.3.1",
        },
        dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "@nanmicoder/dsh-agent-teams", "dsh-hello", "dsh-memory", "dsh-sidebar"] } },
      })
      : defaultReadText(path),
  });
  const code = await runCli(["plugin", "list", "--json"], fixture.dependencies);
  assert.equal(code, 0);
  assert.equal(fixture.calls.length, 0);
  assert.deepEqual(JSON.parse(fixture.output.stdout).plugins.map((plugin) => plugin.name), [
    "@nanmicoder/dsh-agent-teams",
    "dsh-hello",
    "dsh-memory",
    "dsh-sidebar",
  ]);
});

test("plugin list rejects non-object profile manifests", async () => {
  for (const manifest of ["[]", "42", '"profile"', "null"]) {
    const fixture = fakeDependencies({
      readText: async (path) => path.replaceAll("\\", "/") === PROFILE_PACKAGE
        ? manifest
        : defaultReadText(path),
    });
    assert.equal(await runCli(["plugin", "list"], fixture.dependencies), 1);
    assert.match(fixture.output.stderr, /不是有效 JSON/u);
  }
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

test("doctor validates a complete Desktop-seeded profile but returns 1 while stopped", async () => {
  const fixture = fakeDependencies();
  const code = await runCli(["doctor", "--json"], fixture.dependencies);
  assert.equal(code, 1);
  assert.equal(fixture.calls.length, 1);
  assert.deepEqual(fixture.calls[0], { args: ["--version"], options: { capture: true } });
  const report = JSON.parse(fixture.output.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.ready, false);
  assert.ok(report.checks.some((check) => check.id === "desktop-seed" && check.level === "ok"));
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
  assert.ok(report.checks.some((check) => check.id === "service" && /身份尚未验证/u.test(check.message)));
});

test("doctor requires every Desktop bundled plugin and a packed vendor source", async () => {
  const incomplete = fakeDependencies({
    readText: async (path) => path.replaceAll("\\", "/") === PROFILE_PACKAGE
      ? JSON.stringify({
        dependencies: {
          "dsh-hello": "^0.2.1",
          "dsh-sidebar": "file:./vendor/dsh-sidebar.tgz",
          "dsh-providers": "github:example/providers",
          "dsh-memory": "file:./vendor/dsh-memory.tgz",
        },
        dsh: {
          profile: {
            bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-hello", "dsh-sidebar", "dsh-providers", "dsh-memory"],
          },
        },
      })
      : defaultReadText(path),
  });
  const code = await runCli(["doctor", "--json"], incomplete.dependencies);
  assert.equal(code, 1);
  const report = JSON.parse(incomplete.output.stdout);
  assert.ok(report.checks.some((check) => check.id === "profile-bundles" && check.level === "error" && /dsh-im/u.test(check.message)));
  assert.ok(report.checks.some((check) => check.id === "profile-links" && check.level === "error" && /Desktop pack/u.test(check.message)));
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
    readText: async (path) => path.replaceAll("\\", "/").endsWith("node_modules/dsh-memory/package.json")
      ? JSON.stringify({ name: "dsh-other", version: "0.1.0" })
      : defaultReadText(path),
  });
  const code = await runCli(["doctor", "--json"], fixture.dependencies);
  assert.equal(code, 1);
  const report = JSON.parse(fixture.output.stdout);
  assert.ok(report.checks.some((check) => check.id === "profile-install" && check.level === "error" && /name\/version/u.test(check.message)));
});

test("doctor treats a missing Desktop stamp and profile as not ready", async () => {
  const fixture = fakeDependencies({ readText: async () => null });
  const code = await runCli(["doctor", "--json"], fixture.dependencies);
  assert.equal(code, 1);
  const report = JSON.parse(fixture.output.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.ready, false);
  assert.ok(report.checks.some((check) => check.id === "desktop-seed" && check.level === "error"));
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
  for (const argv of [["status"], ["config", "path"], ["plugin", "list"], ["doctor"], ["start"]]) {
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
