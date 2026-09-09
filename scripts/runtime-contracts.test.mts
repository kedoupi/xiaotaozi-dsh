import assert from "node:assert/strict";
import { test } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { runtimeCredentialsFromRemote } from "../plugins/xtz-ui/src/client/runtime-credentials.ts";
import { hostApiFromRemote } from "../plugins/providers/src/client/host-api.ts";
import { loadPluginInventory } from "../plugins/market/src/client/plugin-inventory.ts";
import { createHarnessHostTransport } from "../plugins/im/src/host-transport.ts";
import { HarnessClient } from "../plugins/im/src/channels/shared/harness-client.ts";
import { boardHostFromContext } from "../plugins/xtz-ui/src/board/live.ts";
import {
  launchTask,
  inspectSession,
  cancelSession,
} from "../plugins/xtz-ui/src/board/runner.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const store = join(root, "apps/cli/node_modules/.pnpm");
const entries = await readdir(store);
async function published(name, path = "lib/index.js") {
  const prefix = name.replace("/", "+") + "@";
  const entry = entries.find((entry) => entry.startsWith(prefix));
  assert.ok(entry, `Install apps/cli dependencies: ${name}`);
  return import(
    pathToFileURL(join(store, entry, "node_modules", name, path)).href
  );
}
const { Context } = await published("@deepseek-ai/cordis");
const clientGateway = await published(
  "@deepseek-ai/dsh-api-gateway",
  "lib/types/client/index.js",
);
const hostGateway = await published("@deepseek-ai/dsh-api-gateway");
const namespaces = [
  "dsh-api-settings-controller",
  "dsh-host-plugin-inventory",
  "dsh-llm",
  "dsh-api-session-controller",
  "dsh-api-workspace-controller",
];
const contributions = await Promise.all(
  namespaces.map((name) =>
    published(`@deepseek-ai/${name}`, "lib/typert.remote-client.js").then(
      (m) => m.TYPERT_REMOTE,
    ),
  ),
);

async function clientFixture(plugin, fn, call) {
  const ctx = new Context();
  ctx.provide("connection", {
    rpc: { open() {}, call },
    start: () => ({ stop() {} }),
    registerGenerationSource: () => () => {},
  });
  ctx.provide("typert", {
    remotes: { register: () => () => {} },
    contexts: { getClient() {} },
  });
  const fiber = ctx.plugin(clientGateway);
  await fiber;
  try {
    for (const contribution of contributions)
      await ctx.get("remote").$mount(contribution);
    const source = await readFile(
      join(root, `plugins/${plugin}/src/client/index.ts`),
      "utf8",
    );
    const inject = JSON.parse(
      source
        .match(/export const inject = (\[[\s\S]*?\]);/)[1]
        .replace(/,\s*]/, "]"),
    ).filter((name) => name.startsWith("remote"));
    let result;
    const consumer = ctx.plugin({
      name: "contract-consumer",
      inject,
      apply(c) {
        result = fn(c.get("remote"));
      },
    });
    await consumer;
    try {
      return await result;
    } finally {
      await consumer.dispose();
    }
  } finally {
    await fiber.dispose();
  }
}

test("Advanced uses real Cordis namespace injection and positional RC1 credential calls", async () => {
  const calls = [];
  await clientFixture(
    "xtz-ui",
    async (remote) => {
      const credentials = runtimeCredentialsFromRemote(remote);
      assert.deepEqual(await credentials.describe({ refs: ["CR_FAKE_KEY"] }), {
        result: {
          ok: true,
          value: {
            credentials: { CR_FAKE_KEY: { configured: false, writable: true } },
          },
        },
      });
      assert.deepEqual(
        await credentials.set({ ref: "CR_FAKE_KEY", value: "fake-value" }),
        { result: { ok: true, value: undefined } },
      );
    },
    async (channel, endpoint, payload) => {
      calls.push(JSON.parse(JSON.stringify([channel, endpoint, payload])));
      return {
        ok: true,
        value:
          endpoint === "credentials/describe"
            ? { CR_FAKE_KEY: { configured: false, writable: true } }
            : undefined,
      };
    },
  );
  assert.deepEqual(calls, [
    ["/api", "credentials/describe", { args: { refs: ["CR_FAKE_KEY"] } }],
    [
      "/api",
      "credentials/set",
      { args: { ref: "CR_FAKE_KEY", value: "fake-value" } },
    ],
  ]);
});

test("Providers adapter mounts with the published RC1 client and handles credential write failures", async () => {
  const calls = [];
  await clientFixture(
    "providers",
    async (remote) => {
      const api = hostApiFromRemote(remote);
      assert.ok(api);
      assert.deepEqual(await api.llm.providers({}), {
        result: { ok: true, value: { providers: [] } },
      });
      assert.equal(
        (await api.credentials.describe({ refs: ["CR_FAKE_KEY"] })).result.ok,
        true,
      );
      assert.equal(
        (await api.credentials.set({ ref: "CR_FAKE_KEY", value: "fake" }))
          .result.ok,
        false,
      );
      assert.equal(
        (await api.credentials.unset({ ref: "CR_FAKE_KEY" })).result.ok,
        true,
      );
    },
    async (_channel, endpoint) => {
      calls.push(endpoint);
      return endpoint === "credentials/set"
        ? {
            ok: false,
            error: {
              code: "gateway/internal",
              message: "read only",
              details: {},
            },
          }
        : {
            ok: true,
            value:
              endpoint === "llm/listConfigurableProviders"
                ? []
                : endpoint === "credentials/describe"
                  ? {}
                  : undefined,
          };
    },
  );
  assert.deepEqual(calls, [
    "llm/listConfigurableProviders",
    "credentials/describe",
    "credentials/set",
    "credentials/unset",
  ]);
});

test("Market reaches RC1 pluginInventory instead of swallowing a missing Cordis injection", async () => {
  let invoked = 0;
  await clientFixture(
    "market",
    async (remote) => {
      assert.deepEqual(await loadPluginInventory(remote), [
        { moduleName: "test-plugin", enabled: true, fiberPhase: "active" },
      ]);
    },
    async (_channel, endpoint, payload) => {
      invoked++;
      assert.equal(endpoint, "pluginInventory/list");
      assert.deepEqual(JSON.parse(JSON.stringify(payload)), { args: {} });
      return {
        ok: true,
        value: {
          entries: [
            { moduleName: "test-plugin", enabled: true, fiberPhase: "active" },
          ],
        },
      };
    },
  );
  assert.equal(invoked, 1);
});

async function hostFixture(run) {
  const ctx = new Context();
  const descriptors = contributions.flatMap((c) => c.descriptors);
  ctx.provide("typert", {
    local: {
      get: (key) =>
        descriptors.find((d) => `${d.namespace}/${d.method}` === key),
      hasSeen: () => false,
    },
    contexts: { identifyHost: () => ({ kind: "agent", identity: "s-cr" }) },
  });
  const events = [];
  const calls = [];
  let running = false;
  const session = {
    async create(request) {
      calls.push(["create", request]);
      return { sessionId: "s-cr" };
    },
    async rename(request) {
      calls.push(["rename", request]);
      return { title: request.title };
    },
    async prompt(request) {
      calls.push(["prompt", request]);
      running = true;
      return { accepted: true };
    },
    async list() {
      return {
        items: [{ sessionId: "s-cr", running, cwd: "/tmp/cr-project" }],
      };
    },
    cancel() {
      running = false;
      return { accepted: true };
    },
    async inspect() {
      return { events, meta: { cwd: "/tmp/cr-project" } };
    },
    async modelCatalog() {
      return {
        groups: [],
        failures: [],
        default: { provider: "test", model: "fake" },
        routableProviders: ["test"],
      };
    },
  };
  const workspace = {
    async *follow() {
      yield {
        type: "baseline",
        value: {
          items: [
            {
              workspaceId: "w-cr",
              path: "/tmp/cr-project",
              title: "CR",
              sessionIds: ["s-cr"],
            },
          ],
          archivedSessionIds: [],
        },
      };
    },
  };
  for (const [key, namespace, service] of [
    ["sessionController", "session", session],
    ["workspaceController", "workspace", workspace],
  ]) {
    service.typertRemote = { service, serviceKey: key, namespace };
    ctx.provide(key, service);
  }
  const fiber = ctx.plugin(hostGateway.default, {});
  await fiber;
  try {
    await run({
      ctx,
      session,
      events,
      calls,
      idle: () => {
        running = false;
      },
    });
  } finally {
    await fiber.dispose();
  }
}

test("IM actual Host Gateway validates health, workspace, create, history and prompt correlation", async () => {
  await hostFixture(async ({ ctx, events, calls }) => {
    const client = new HarnessClient({
      baseUrl: "http://invalid.test",
      workspace: "/tmp/cr-project",
      ...createHarnessHostTransport(ctx),
    });
    assert.equal(await client.health(), true);
    assert.equal((await client.listProjects()).length, 1);
    assert.equal(await client.createSession({ workspaceId: "w-cr" }), "s-cr");
    await client.rpc(
      "session.prompt",
      {
        sessionId: "s-cr",
        content: [{ type: "text", text: "fake prompt" }],
        mode: "queue",
      },
      1000,
      { rpcId: "cr-prompt" },
    );
    assert.equal(
      calls.find(([name]) => name === "prompt")[1].requestId,
      "cr-prompt",
    );
    events.push({ seq: 0, type: "turn/start", data: { turn: 1 } });
    assert.deepEqual(
      (await client.rpc("session.history", { sessionId: "s-cr" })).events,
      [{ event: events[0] }],
    );
    await assert.rejects(
      client.rpc("session.prompt", { sessionId: "s-cr", content: "bad" }),
      /validation/i,
    );
    assert.equal(calls.filter(([name]) => name === "prompt").length, 1);
  });
});

test("Board connects current Host service and distinguishes queued, successful and failed turns", async () => {
  await hostFixture(async ({ ctx, events, calls, idle }) => {
    const api = boardHostFromContext(ctx).apiProxy;
    assert.equal(
      await launchTask(api, {
        title: "CR",
        prompt: "fake",
        workspaceId: "w-cr",
      }),
      "s-cr",
    );
    assert.ok(
      calls
        .find(([name]) => name === "prompt")[1]
        .requestId.startsWith("xtz-ui-board-"),
    );
    idle();
    assert.equal((await inspectSession(api, "s-cr")).outcome, "pending");
    events.push({ type: "turn/start", data: { turn: 1 } });
    assert.equal((await inspectSession(api, "s-cr")).outcome, "pending");
    events.push({
      type: "turn/end",
      data: { turn: 1, reason: { kind: "completed" } },
    });
    assert.equal((await inspectSession(api, "s-cr")).outcome, "succeeded");
    events.push(
      { type: "turn/start", data: { turn: 2 } },
      { type: "turn/end", data: { turn: 2, reason: { kind: "error" } } },
    );
    assert.equal((await inspectSession(api, "s-cr")).outcome, "failed");
    events.push(
      { type: "turn/start", data: { turn: 3 } },
      { type: "turn/end", data: { turn: 3, reason: { kind: "aborted" } } },
    );
    assert.equal((await inspectSession(api, "s-cr")).outcome, "cancelled");
    await cancelSession(api, "s-cr");
  });
});

function queueSource() {
  const items = [];
  let wake;
  return {
    push(value) {
      items.push(value);
      wake?.();
    },
    async *stream(signal) {
      const abort = () => wake?.();
      signal.addEventListener("abort", abort);
      try {
        while (!signal.aborted) {
          if (items.length) {
            yield items.shift();
            continue;
          }
          await new Promise((resolve) => {
            wake = resolve;
          });
        }
      } finally {
        signal.removeEventListener("abort", abort);
      }
    },
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}

test("IM RC1 event carrier round-trips questions and approvals and cleans subscriptions", {
  timeout: 5000,
}, async () => {
  await hostFixture(async ({ ctx }) => {
    const source = queueSource();
    const stop = ctx.typertGateway.registerRemoteEvents(
      (signal) => source.stream(signal),
      { home: "/tmp/cr-only" },
    );
    const life = new AbortController();
    const client = new HarnessClient({
      baseUrl: "http://invalid.test",
      ...createHarnessHostTransport(ctx),
    });
    const opened = deferred();
    const received = [];
    const watch = client.watchInteractions("s-cr", {
      signal: life.signal,
      onOpen: opened.resolve,
      async onInteraction(interaction) {
        received.push(interaction);
        assert.equal(interaction.sessionId, "s-cr");
        await assert.rejects(
          interaction.respond({
            ok: true,
            value: { sessionId: "another-session" },
          }),
          /bad-response/,
        );
        await interaction.respond({
          ok: true,
          value:
            interaction.kind === "question"
              ? {
                  sessionId: "s-cr",
                  answer: { answers: [{ id: "q1", answer: "test answer" }] },
                }
              : {
                  sessionId: "s-cr",
                  approvalId: interaction.payload.approvalId,
                  outcome: "rejected",
                },
        });
      },
    });
    try {
      await opened.promise;
      for (const event of ["user-questions/request", "approval/request"]) {
        const completed = deferred();
        const agent = {};
        source.push({
          event,
          request:
            event === "approval/request"
              ? { agent, toolName: "fake", callId: "call1" }
              : { agent, questions: [{ id: "q1", question: "Fake question" }] },
          context: { value: ctx, subject: agent },
          resolve: completed.resolve,
          reject: completed.reject,
        });
        assert.deepEqual(await completed.promise, {
          kind: "result",
          value:
            event === "approval/request"
              ? "rejected"
              : { answers: [{ id: "q1", answer: "test answer" }] },
        });
      }
      assert.equal(received.length, 2);
      assert.ok(received[1].payload.approvalId);
      await assert.rejects(
        received[0].respond({ ok: true, value: {} }),
        /not-pending/,
      );
    } finally {
      life.abort();
      await watch;
      await stop();
    }
    assert.equal(ctx.typertGateway.remoteEventClients.size, 0);
    assert.equal(ctx.typertGateway.pendingRemoteEvents.size, 0);
  });
});

test("IM global follow uses live Host events and detaches on abort", {
  timeout: 5000,
}, async () => {
  await hostFixture(async ({ ctx }) => {
    const source = queueSource();
    const stop = ctx.typertGateway.registerRemoteEvents(
      (signal) => source.stream(signal),
      { home: "/tmp/cr-only" },
    );
    const life = new AbortController();
    const opened = deferred();
    const observed = [];
    const client = new HarnessClient({
      baseUrl: "http://invalid.test",
      ...createHarnessHostTransport(ctx),
    });
    const watch = client.watchHarnessEvents({
      signal: life.signal,
      onReconnect: opened.resolve,
      onSessionEvent: (event) => observed.push(event),
    });
    try {
      await opened.promise;
      ctx.emit("session/event", { id: "s-cr" }, { type: "turn/start", seq: 0 });
      assert.deepEqual(observed, [
        { sessionId: "s-cr", event: { type: "turn/start", seq: 0 } },
      ]);
    } finally {
      life.abort();
      await watch;
      await stop();
    }
    ctx.emit("session/event", { id: "s-cr" }, { type: "turn/start", seq: 1 });
    assert.equal(observed.length, 1);
  });
});

test("IM sends a prompt through real RC1 validation and returns its completed text", {
  timeout: 5000,
}, async () => {
  await hostFixture(async ({ ctx, events, session, idle }) => {
    session.prompt = async (request) => {
      events.push(
        { seq: 0, type: "turn/start", data: { turn: 1 } },
        {
          seq: 1,
          type: "user/message",
          data: { turn: 1, source: { rpcId: request.requestId } },
        },
        {
          seq: 2,
          type: "assistant/chunk",
          data: {
            turn: 1,
            step: 0,
            chunk: { type: "text-delta", index: 0, text: "CR completed" },
          },
        },
        {
          seq: 3,
          type: "turn/end",
          data: { turn: 1, reason: { kind: "completed" } },
        },
      );
      idle();
      return { accepted: true };
    };
    const client = new HarnessClient({
      baseUrl: "http://invalid.test",
      ...createHarnessHostTransport(ctx),
    });
    assert.equal(
      await client.ask("s-cr", "fake prompt", { timeoutMs: 1000 }),
      "CR completed",
    );
  });
});

for (const plugin of ["providers", "xtz-ui"]) {
  test(`${plugin} credential round-trip preserves positional RC1 calls and readonly failures`, async () => {
    const values = new Map();
    const calls = [];
    const readonly = new Set(["CR_ENV_KEY"]);
    await clientFixture(
      plugin,
      async (remote) => {
        const credentials =
          plugin === "providers"
            ? hostApiFromRemote(remote)?.credentials
            : runtimeCredentialsFromRemote(remote);
        assert.ok(credentials);
        assert.ok(credentials.unset);
        const describe = async (ref) => {
          const response = await credentials.describe({ refs: [ref] });
          assert.equal(response.result.ok, true);
          return response.result.value.credentials[ref];
        };
        assert.deepEqual(await describe("CR_FAKE_KEY"), {
          configured: false,
          writable: true,
          source: "missing",
        });
        for (const value of ["disposable-1", "disposable-2"]) {
          assert.equal(
            (await credentials.set({ ref: "CR_FAKE_KEY", value })).result.ok,
            true,
          );
          assert.deepEqual(await describe("CR_FAKE_KEY"), {
            configured: true,
            writable: true,
            source: "file",
          });
        }
        assert.equal(
          (await credentials.set({ ref: "CR_FAKE_KEY", value: "" })).result.ok,
          false,
        );
        assert.equal(values.get("CR_FAKE_KEY"), "disposable-2");
        assert.equal(
          (await credentials.unset({ ref: "CR_FAKE_KEY" })).result.ok,
          true,
        );
        assert.equal((await describe("CR_FAKE_KEY")).configured, false);
        assert.deepEqual(await describe("CR_ENV_KEY"), {
          configured: true,
          writable: false,
          source: "env",
        });
        assert.equal(
          (
            await credentials.set({
              ref: "CR_ENV_KEY",
              value: "disposable-denied",
            })
          ).result.ok,
          false,
        );
        assert.equal(
          (await credentials.unset({ ref: "CR_ENV_KEY" })).result.ok,
          false,
        );
        assert.equal((await describe("CR_ENV_KEY")).configured, true);
      },
      async (channel, endpoint, payload) => {
        assert.equal(channel, "/api");
        const args = payload.args;
        // Inspect exact disposable payloads in memory; retain only operation/ref in call history.
        if (endpoint === "credentials/describe") {
          assert.deepEqual(Object.keys(args), ["refs"]);
          calls.push(["describe", ...args.refs]);
          return {
            ok: true,
            value: Object.fromEntries(
              args.refs.map((ref) => [
                ref,
                {
                  configured: readonly.has(ref) || values.has(ref),
                  writable: !readonly.has(ref),
                  source: readonly.has(ref)
                    ? "env"
                    : values.has(ref)
                      ? "file"
                      : "missing",
                },
              ]),
            ),
          };
        }
        if (endpoint === "credentials/set") {
          assert.deepEqual(Object.keys(args), ["ref", "value"]);
          assert.equal(typeof args.value, "string");
        } else {
          assert.equal(endpoint, "credentials/unset");
          assert.deepEqual(Object.keys(args), ["ref"]);
        }
        calls.push([endpoint.split("/")[1], args.ref]);
        if (readonly.has(args.ref) || args.value === "")
          return {
            ok: false,
            error: {
              code: readonly.has(args.ref)
                ? "credential/rejected"
                : "gateway/bad-request",
              message: readonly.has(args.ref)
                ? "Environment-owned reference is read-only"
                : "Value must not be empty",
              details: { ref: args.ref },
            },
          };
        if (endpoint === "credentials/set") values.set(args.ref, args.value);
        else values.delete(args.ref);
        return { ok: true, value: undefined };
      },
    );
    assert.deepEqual(
      calls.map(([op]) => op),
      [
        "describe",
        "set",
        "describe",
        "set",
        "describe",
        "set",
        "unset",
        "describe",
        "describe",
        "set",
        "unset",
        "describe",
      ],
    );
    assert.equal(values.size, 0);
  });
}

test("Models settings adapter carries expectedRevision and refuses a stale selection", async () => {
  let revision = 4;
  let models = ["first"];
  const calls = [];
  const namespace = () => ({
    ns: "llm-test",
    schema: {},
    value: models === undefined ? {} : { models },
    applies: "live",
    secrets: [],
    revision,
  });
  await clientFixture(
    "providers",
    async (remote) => {
      const api = hostApiFromRemote(remote);
      assert.ok(api);
      const read = await api.settings.describe({});
      assert.equal(read.result.ok, true);
      const observed = read.result.value.namespaces[0].revision;
      revision++;
      models = ["concurrent"];
      const stale = await api.settings.mutate({
        ns: "llm-test",
        ops: [{ op: "set", path: ["models"], value: ["stale"] }],
        expectedRevision: observed,
      });
      assert.equal(stale.result.ok, false);
      assert.deepEqual(models, ["concurrent"]);
      const accepted = await api.settings.mutate({
        ns: "llm-test",
        ops: [{ op: "set", path: ["models"], value: ["second"] }],
        expectedRevision: revision,
      });
      assert.equal(accepted.result.ok, true);
      assert.deepEqual(models, ["second"]);
      const reset = await api.settings.mutate({
        ns: "llm-test",
        ops: [{ op: "unset", path: ["models"] }],
        expectedRevision: revision,
      });
      assert.equal(reset.result.ok, true);
      assert.equal(models, undefined);
    },
    async (channel, endpoint, { args }) => {
      assert.equal(channel, "/api");
      if (endpoint === "settings/describe") {
        assert.deepEqual(Object.keys(args), []);
        return {
          ok: true,
          value: {
            writable: true,
            hasDocument: true,
            namespaces: [namespace()],
          },
        };
      }
      assert.equal(endpoint, "settings/mutate");
      assert.deepEqual(Object.keys(args), ["ns", "ops", "expectedRevision"]);
      assert.equal(args.ns, "llm-test");
      assert.deepEqual(args.ops[0].path, ["models"]);
      calls.push(args.expectedRevision);
      if (args.expectedRevision !== revision)
        return {
          ok: false,
          error: {
            code: "settings/conflict",
            message: "Settings changed; reload",
            details: {
              ns: args.ns,
              expected: args.expectedRevision,
              actual: revision,
            },
          },
        };
      models = args.ops[0].op === "unset" ? undefined : args.ops[0].value;
      revision++;
      return { ok: true, value: namespace() };
    },
  );
  assert.deepEqual(calls, [4, 5, 6]);
});
