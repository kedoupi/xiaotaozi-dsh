import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readProfileDependencies } from "../src/profile-deps.ts";
import { describe, expect, it } from "vitest";
import { installedPluginId, PROFILE_SOURCE_ID, sourceIdFor, type MarketSource } from "../src/catalog.ts";
import { resolveMarketConfig } from "../src/config.ts";
import { RouteError } from "../src/http.ts";
import type { InstallIntent } from "../src/intents.ts";
import { MARKET_CATALOG_ROUTE, MARKET_INTENTS_ROUTE, MARKET_SOURCES_ROUTE } from "../src/names.ts";
import { catalogPayload, intentFromBody, mutateSources, officialSource, registerMarketRoutes, type MarketStores, type WebServer } from "../src/routes.ts";
import { MarketStateError } from "../src/state-store.ts";

const config = resolveMarketConfig();

function source(label: string, indexUrl: string): MarketSource {
  return { id: sourceIdFor(indexUrl), label, indexUrl, builtin: false };
}

interface RouteResponse {
  status: number;
  body: {
    ok?: boolean;
    code?: string;
    error?: string;
    allowThirdPartySources?: boolean;
    mutationApplied?: boolean;
    intents?: InstallIntent[];
  };
}

async function withMarketServer(
  stores: MarketStores,
  run: (request: (path: string, init?: RequestInit) => Promise<RouteResponse>, base: string) => Promise<void>,
): Promise<void> {
  const routes = new Map<string, (req: IncomingMessage, res: ServerResponse) => void | Promise<void>>();
  const web: WebServer = {
    register: (route) => {
      routes.set(route.path, route.handler);
      return () => { routes.delete(route.path); };
    },
  };
  const dispose = registerMarketRoutes(web, config, stores);
  const server = createServer((req, res) => {
    const handler = routes.get(req.url ?? "");
    if (handler === undefined) {
      res.statusCode = 404;
      res.end();
      return;
    }
    void handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no test server address");
  const base = `http://127.0.0.1:${String(address.port)}`;
  const request = async (path: string, init?: RequestInit): Promise<RouteResponse> => {
    const response = await fetch(base + path, init);
    return { status: response.status, body: await response.json() as RouteResponse["body"] };
  };
  try {
    await run(request, base);
  } finally {
    dispose();
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  }
}

function memoryStores(overrides: Partial<MarketStores> = {}): MarketStores {
  let sources = [source("legacy", "https://legacy.example/market.json")];
  let intents: InstallIntent[] = [];
  return {
    readSources: () => sources,
    writeSources: (next) => { sources = next; },
    readIntents: () => intents,
    writeIntents: (next) => { intents = next; },
    readDependencies: () => ({}),
    mutatePlugin: async () => ({ ok: true }),
    ...overrides,
  };
}

describe("catalogPayload", () => {
  it("projects current third-party dependencies without first-party or core packages", () => {
    const payload = catalogPayload(config, [], {
      "@deepseek-ai/dsh": "0.1.2-rc.1",
      "dsh-xtz-ui": "link:../xtz-ui",
      "dsh-sidebar": "link:../sidebar",
      "dsh-providers": "link:../providers",
      "dsh-im": "link:../im",
      "dsh-market": "link:../market",
      "dsh-wecom-office": "link:../wecom-office",
      alias: "github:bowenliang123/dsh-context",
      "@example/extra": "^2.0.0",
    });
    expect(payload).toHaveProperty("installedPlugins", [
      {
        id: "installed:%40example%2Fextra",
        packageName: "@example/extra",
        name: "@example/extra",
        installSpec: "^2.0.0",
        source: "external",
      },
      {
        id: "installed:alias",
        packageName: "alias",
        name: "会话上下文",
        installSpec: "github:bowenliang123/dsh-context",
        source: "catalog",
        catalogEntryId: "context",
        version: "0.44.0",
      },
    ]);
  });
  it.each([
    "git+https://user:secret@example.test/repo.git?token=secret#v1",
    " \u0000\thttps://user:secret@example.test/repo.git?token=secret#v1\r\n",
    "\u001fgit+https://user:secret@example.test/repo.git?token=secret#v1",
    "gi\tt+ht\ntps://user:secret@example.test/repo.git?token=secret#v1",
    "https://user:secret@[invalid/repo?token=secret",
    "ht^tps://user:secret@example.test/repo?token=secret",
    "https\u0001://user:secret@example.test/repo?token=secret",
  ])("does not serialize URL credentials/query from %j", (spec) => {
    const dependencies = {
      "dsh-context": spec,
      alias: "github:bowenliang123/dsh-context",
    };
    const payload = catalogPayload(config, [], dependencies);
    expect(payload).toHaveProperty("installedPlugins");
    expect(JSON.stringify(payload)).not.toContain("secret");
    expect(dependencies["dsh-context"]).toBe(spec);
    expect(payload.entries.find((entry) => entry.id === "context")?.installed).toBe(true);
  });
  it("merges official and user sources with their entries", () => {
    const user = [source("内网源", "https://mirror.corp/market.json")];
    const payload = catalogPayload(config, user);
    expect(payload.sources).toHaveLength(2);
    expect(payload.sources[0]!.builtin).toBe(true);
    expect(payload.entries.every((entry) => entry.sourceId === payload.sources[0]!.id)).toBe(true);
    expect(payload.entries.some((entry) => entry.id === "agent-teams")).toBe(true);
    expect(payload.allowThirdPartySources).toBe(false);
  });
  it("marks catalog entries installed from profile dependencies", () => {
    const payload = catalogPayload(config, [], { "dsh-opencontext": "github:melandlabs/opencontext#path:plugins/dsh-opencontext" });
    expect(payload.entries.find((entry) => entry.id === "opencontext")?.installed).toBe(true);
    expect(payload.entries.find((entry) => entry.id === "context")?.installed).toBe(false);
  });
});

describe("mutateSources", () => {
  it("rejects source adds honestly while remote catalogs are unavailable", () => {
    let caught: unknown;
    try {
      mutateSources(config, [], { add: { label: "内网源", indexUrl: "https://mirror.corp/market.json" } });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RouteError);
    expect(caught).toMatchObject({ status: 501, message: "third-party source catalogs are not supported in this build" });
  });
  it("still lets users remove a previously saved source", () => {
    const existing = [source("内网源", "https://mirror.corp/market.json")];
    expect(mutateSources(config, existing, { remove: existing[0]!.id })).toEqual([]);
  });
});

describe("intentFromBody", () => {
  it("builds a pending intent with a timestamp", () => {
    const now = new Date("2026-08-26T01:02:03.000Z");
    const built = intentFromBody(
      { entryId: "agent-teams", sourceId: officialSource(config).id, action: "install" },
      () => now,
      () => "request-123",
    );
    expect(built).toMatchObject({ requestId: "request-123", entryId: "agent-teams", action: "install", status: "pending", requestedAt: now.toISOString() });
  });
  it("assigns distinct request identities to otherwise identical intents", () => {
    const now = new Date("2026-08-26T01:02:03.000Z");
    const body = { entryId: "agent-teams", sourceId: officialSource(config).id, action: "install" };
    const first = intentFromBody(body, () => now);
    const second = intentFromBody(body, () => now);
    expect(first.requestedAt).toBe(second.requestedAt);
    expect(first.requestId).not.toBe(second.requestId);
  });
  it("rejects missing fields and bad actions", () => {
    expect(() => intentFromBody({ sourceId: "s", action: "install" })).toThrowError(RouteError);
    expect(() => intentFromBody({ entryId: "e", sourceId: "s", action: "upgrade" })).toThrowError(RouteError);
  });
});

describe("market route lifecycle", () => {
  it("removes only the Host-resolved installed name, ignoring a forged body spec", async () => {
    let deps: Record<string, string> = { "@example/extra": "link:/temporary/extra" };
    const calls: Array<[string, string | undefined]> = [];
    const stores = memoryStores({
      readDependencies: () => deps,
      mutatePlugin: async (action, entry) => {
        calls.push([action, entry.packageName]);
        deps = {};
        return { ok: true };
      },
    });
    await withMarketServer(stores, async (request, base) => {
      const response = await request(MARKET_INTENTS_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({
          entryId: installedPluginId("@example/extra"), sourceId: PROFILE_SOURCE_ID, action: "remove",
          packageName: "dsh-market", installSpec: "--help",
        }),
      });
      expect(response).toMatchObject({ status: 200, body: { ok: true, intents: [], installedPlugins: [] } });
      expect(calls).toEqual([["remove", "@example/extra"]]);
      expect(stores.readIntents()).toEqual([]);
    });
  });

  it.each([
    ["@example/extra", "install", 400],
    ["dsh-xtz-ui", "remove", 404],
    ["dsh-sidebar", "remove", 404],
    ["dsh-providers", "remove", 404],
    ["dsh-im", "remove", 404],
    ["dsh-market", "remove", 404],
    ["dsh-wecom-office", "remove", 404],
    ["@deepseek-ai/dsh", "remove", 404],
    ["@deepseek-ai/dsh-session", "remove", 404],
    ["unknown", "remove", 404],
  ] as const)("rejects profile target %s action %s before enqueue", async (name, action, status) => {
    let writes = 0;
    let mutations = 0;
    const stores = memoryStores({
      readDependencies: () => ({
        "@example/extra": "link:/temporary/extra",
        ...(name === "unknown" ? {} : { [name]: "github:bowenliang123/dsh-context" }),
      }),
      writeIntents: () => { writes += 1; },
      mutatePlugin: async () => { mutations += 1; return { ok: true }; },
    });
    await withMarketServer(stores, async (request, base) => {
      const response = await request(MARKET_INTENTS_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({ entryId: installedPluginId(name), sourceId: PROFILE_SOURCE_ID, action }),
      });
      expect(response.status).toBe(status);
      expect(response.body.ok).toBe(false);
      expect(writes).toBe(0);
      expect(mutations).toBe(0);
      expect(stores.readIntents()).toEqual([]);
    });
  });

  it("rejects cross-origin profile removal before reading or writing state", async () => {
    let reads = 0;
    let writes = 0;
    let mutations = 0;
    const stores = memoryStores({
      readDependencies: () => { reads += 1; return { "@example/extra": "^1" }; },
      writeIntents: () => { writes += 1; },
      mutatePlugin: async () => { mutations += 1; return { ok: true }; },
    });
    await withMarketServer(stores, async (request) => {
      const response = await request(MARKET_INTENTS_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://evil.example" },
        body: JSON.stringify({ entryId: installedPluginId("@example/extra"), sourceId: PROFILE_SOURCE_ID, action: "remove" }),
      });
      expect(response).toMatchObject({ status: 403, body: { ok: false, error: "loopback-only" } });
      expect([reads, writes, mutations]).toEqual([0, 0, 0]);
    });
  });

  it("rejects a non-loopback profile removal before consuming its body", async () => {
    let handler: Parameters<WebServer["register"]>[0]["handler"] | undefined;
    const dispose = registerMarketRoutes({ register: (route) => {
      if (route.path === MARKET_INTENTS_ROUTE) handler = route.handler;
      return () => {};
    } }, config, memoryStores({
      readDependencies: () => { throw new Error("must not read profile"); },
      writeIntents: () => { throw new Error("must not enqueue"); },
      mutatePlugin: async () => { throw new Error("must not mutate"); },
    }));
    let status = 0;
    let body = "";
    let consumed = false;
    try {
      await handler!({
        method: "POST", socket: { remoteAddress: "192.0.2.1" },
        headers: { host: "localhost:1234", origin: "http://localhost:1234", "content-type": "application/json" },
        async *[Symbol.asyncIterator]() {
          consumed = true;
          yield Buffer.from(JSON.stringify({ entryId: installedPluginId("@example/extra"), sourceId: PROFILE_SOURCE_ID, action: "remove" }));
        },
      } as IncomingMessage, {
        writeHead: (value: number) => { status = value; },
        end: (value: string) => { body = value; },
      } as unknown as ServerResponse);
      expect(status).toBe(403);
      expect(JSON.parse(body)).toEqual({ ok: false, error: "loopback-only" });
      expect(consumed).toBe(false);
    } finally { dispose(); }
  });

  it("rejects a malformed profile before enqueueing removal", async () => {
    const home = mkdtempSync(join(tmpdir(), "market-remove-profile-"));
    mkdirSync(join(home, "profiles", "web"), { recursive: true });
    writeFileSync(join(home, "profiles", "web", "package.json"), "{malformed");
    let writes = 0;
    let mutations = 0;
    const stores = memoryStores({
      readDependencies: () => readProfileDependencies({ DSH_HOME: home }),
      writeIntents: () => { writes += 1; },
      mutatePlugin: async () => { mutations += 1; return { ok: true }; },
    });
    try {
      await withMarketServer(stores, async (request, base) => {
        const response = await request(MARKET_INTENTS_ROUTE, {
          method: "POST",
          headers: { "content-type": "application/json", origin: base },
          body: JSON.stringify({ entryId: installedPluginId("@example/extra"), sourceId: PROFILE_SOURCE_ID, action: "remove" }),
        });
        expect(response).toMatchObject({ status: 500, body: { ok: false, code: "market-profile-unavailable" } });
        expect(response.body.error).toContain("xtz doctor");
        expect([writes, mutations]).toEqual([0, 0]);
        expect(stores.readIntents()).toEqual([]);
      });
    } finally { rmSync(home, { recursive: true, force: true }); }
  });

  it.each(["alias", "dsh-context"])("removes the live dependency key %s for a catalog request", async (name) => {
    const calls: Array<[string, string | undefined]> = [];
    const stores = memoryStores({
      readDependencies: () => ({ [name]: "github:bowenliang123/dsh-context" }),
      mutatePlugin: async (action, entry) => { calls.push([action, entry.packageName]); return { ok: true }; },
    });
    await withMarketServer(stores, async (request, base) => {
      const response = await request(MARKET_INTENTS_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({ entryId: "context", sourceId: officialSource(config).id, action: "remove" }),
      });
      expect(response).toMatchObject({ status: 200, body: { ok: true, intents: [] } });
      expect(calls).toEqual([["remove", name]]);
      expect(stores.readIntents()).toEqual([]);
    });
  });

  it("revalidates overlapping profile removals and settles both request identities", async () => {
    let deps: Record<string, string> = { "@example/extra": "link:/temporary/extra" };
    const calls: Array<string | undefined> = [];
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const enqueuedIds = new Set<string>();
    const stores = memoryStores({
      readDependencies: () => deps,
      mutatePlugin: async (_action, entry) => {
        calls.push(entry.packageName);
        await held;
        deps = {};
        return { ok: true };
      },
    });
    const writeIntents = stores.writeIntents;
    stores.writeIntents = (next) => {
      writeIntents(next);
      for (const intent of next) enqueuedIds.add(intent.requestId);
    };
    await withMarketServer(stores, async (request, base) => {
      const post = () => request(MARKET_INTENTS_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({ entryId: installedPluginId("@example/extra"), sourceId: PROFILE_SOURCE_ID, action: "remove" }),
      });
      const responses = Promise.all([post(), post()]);
      try {
        await expect.poll(() => enqueuedIds.size).toBe(2);
        expect(calls).toEqual(["@example/extra"]);
        expect(stores.readIntents()).toHaveLength(1);
      } finally { release(); await responses; }
      expect((await responses).every((response) => response.status === 200)).toBe(true);
      expect(calls).toEqual(["@example/extra"]);
      expect(stores.readIntents()).toEqual([]);
    });
  });

  it.each(["profile-read", "mutator"])("settles rather than claiming absence when queued %s throws", async (failure) => {
    let reads = 0;
    let mutations = 0;
    const stores = memoryStores({
      readDependencies: () => {
        reads += 1;
        if (failure === "profile-read" && reads === 2) throw new Error("synthetic private read detail");
        return { "@example/extra": "^1" };
      },
      mutatePlugin: async () => { mutations += 1; throw new Error("synthetic private mutation detail"); },
    });
    await withMarketServer(stores, async (request, base) => {
      const response = await request(MARKET_INTENTS_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({ entryId: installedPluginId("@example/extra"), sourceId: PROFILE_SOURCE_ID, action: "remove" }),
      });
      expect(response).toMatchObject({ status: 500, body: { ok: false, error: "插件操作失败：plugin mutation failed", intents: [] } });
      expect(response.body.mutationApplied).not.toBe(true);
      expect(mutations).toBe(failure === "profile-read" ? 0 : 1);
      expect(reads).toBe(3);
      expect(stores.readIntents()).toEqual([]);
      expect(JSON.stringify(response.body)).not.toContain("private");
    });
  });

  it("does not write source removal when the web profile cannot be read", async () => {
    const home = mkdtempSync(join(tmpdir(), "market-source-profile-"));
    let writes = 0;
    const stores = memoryStores({
      readDependencies: () => readProfileDependencies({ DSH_HOME: home, DSH_PROFILE: "web" }),
      writeSources: () => { writes += 1; },
    });
    const existing = stores.readSources();
    try {
      await withMarketServer(stores, async (request, base) => {
        const response = await request(MARKET_SOURCES_ROUTE, {
          method: "POST",
          headers: { "content-type": "application/json", origin: base },
          body: JSON.stringify({ remove: existing[0]!.id }),
        });
        expect(response).toMatchObject({
          status: 500,
          body: { ok: false, code: "market-profile-unavailable" },
        });
        expect(response.body.error).toContain("xtz doctor");
        expect(writes).toBe(0);
        expect(stores.readSources()).toEqual(existing);
        for (const field of ["sources", "entries", "installedPlugins"])
          expect(response.body).not.toHaveProperty(field);
        expect(JSON.stringify(response.body)).not.toContain(home);
      });
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("removes a saved source and returns the complete prepared profile snapshot", async () => {
    const dependencies = { alias: "github:bowenliang123/dsh-context", "@example/extra": "^2.0.0" };
    const order: string[] = [];
    const stores = memoryStores({
      readDependencies: () => { order.push("project"); return dependencies; },
    });
    const writeSources = stores.writeSources;
    stores.writeSources = (next) => { order.push("write"); writeSources(next); };
    const existing = stores.readSources();
    await withMarketServer(stores, async (request, base) => {
      const response = await request(MARKET_SOURCES_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({ remove: existing[0]!.id }),
      });
      expect(response).toEqual({ status: 200, body: catalogPayload(config, [], dependencies) });
      expect(stores.readSources()).toEqual([]);
      expect(order).toEqual(["project", "write"]);
    });
  });

  it("reports an unavailable web profile instead of an empty-success catalog", async () => {
    const home = mkdtempSync(join(tmpdir(), "market-route-profile-"));
    try {
      await withMarketServer(
        memoryStores({
          readDependencies: () =>
            readProfileDependencies({ DSH_HOME: home, DSH_PROFILE: "web" }),
        }),
        async (request) => {
          const response = await request(MARKET_CATALOG_ROUTE);
          expect(response).toMatchObject({
            status: 500,
            body: { ok: false, code: "market-profile-unavailable" },
          });
          expect(response.body.error).toContain("xtz doctor");
          for (const field of ["sources", "entries", "installedPlugins"])
            expect(response.body).not.toHaveProperty(field);
          expect(JSON.stringify(response.body)).not.toContain(home);
        },
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it.each([
    ["catalog", true], ["catalog", false], ["profile", true], ["profile", false],
  ] as const)(
    "retains settled %s mutation outcome after final profile read fails (ok=%s)",
    async (sourceKind, ok) => {
      const external = sourceKind === "profile";
      const action = external ? "remove" : "install";
      const entryId = external ? installedPluginId("@example/extra") : "agent-teams";
      const sourceId = external ? PROFILE_SOURCE_ID : officialSource(config).id;
      const home = mkdtempSync(join(tmpdir(), "market-outcome-profile-"));
      let reads = 0;
      let mutations = 0;
      const writes: InstallIntent[][] = [];
      let intents: InstallIntent[] = [
        {
          requestId: "unrelated",
          entryId: "context",
          sourceId: officialSource(config).id,
          action: "install",
          requestedAt: "2026-09-05T00:00:00.000Z",
          status: "pending",
        },
      ];
      const unrelated = [...intents];
      const stores = memoryStores({
        readSources: () => [],
        readDependencies: () => {
          reads += 1;
          return reads <= 2
            ? external ? { "@example/extra": "link:/temporary/extra" } : {}
            : readProfileDependencies({ DSH_HOME: home, DSH_PROFILE: "web" });
        },
        readIntents: () => intents,
        writeIntents: (next) => {
          writes.push(next);
          intents = next;
        },
        mutatePlugin: async (currentAction, entry) => {
          expect(currentAction).toBe(action);
          expect(entry.id).toBe(entryId);
          mutations += 1;
          return ok
            ? { ok: true }
            : { ok: false, error: "original install failure" };
        },
      });
      try {
        await withMarketServer(stores, async (request, base) => {
          const response = await request(MARKET_INTENTS_ROUTE, {
            method: "POST",
            headers: { "content-type": "application/json", origin: base },
            body: JSON.stringify({ entryId, sourceId, action }),
          });
          expect(mutations).toBe(1);
          expect(reads).toBe(3);
          expect(writes).toHaveLength(2);
          expect(writes[0]).toHaveLength(2);
          expect(intents).toEqual(unrelated);
          expect(response).toMatchObject({
            status: 500,
            body: {
              ok: false,
              code: "market-profile-unavailable",
              intents: unrelated,
            },
          });
          expect(response.body.error).toContain("xtz doctor");
          expect(response.body.error).toContain("refresh");
          if (ok) {
            expect(response.body.mutationApplied).toBe(true);
            expect(response.body.error).toContain("completed");
            expect(response.body.error).toContain(
              "Do not retry the plugin mutation",
            );
          } else {
            expect(response.body.mutationApplied).not.toBe(true);
            expect(response.body.error).toContain("original install failure");
          }
          for (const field of ["sources", "entries", "installedPlugins"])
            expect(response.body).not.toHaveProperty(field);
          expect(JSON.stringify(response.body)).not.toContain(home);
        });
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    },
  );
  it.each([true, false])(
    "preserves the outcome and independent state diagnostics if final sources fail (ok=%s)",
    async (ok) => {
      let sourceReads = 0;
      let mutations = 0;
      const stores = memoryStores({
        readSources: () => {
          sourceReads += 1;
          if (sourceReads === 3)
            throw new MarketStateError(
              "read-failed",
              "sources",
              "/synthetic/secret",
              "secret",
            );
          return [];
        },
        mutatePlugin: async () => {
          mutations += 1;
          return ok
            ? { ok: true }
            : { ok: false, error: "original install failure" };
        },
      });
      await withMarketServer(stores, async (request, base) => {
        const response = await request(MARKET_INTENTS_ROUTE, {
          method: "POST",
          headers: { "content-type": "application/json", origin: base },
          body: JSON.stringify({
            entryId: "agent-teams",
            sourceId: officialSource(config).id,
            action: "install",
          }),
        });
        expect(mutations).toBe(1);
        expect(sourceReads).toBe(3);
        expect(stores.readIntents()).toEqual([]);
        expect(response).toMatchObject({
          status: 500,
          body: { ok: false, code: "market-state-read-failed", intents: [] },
        });
        expect(response.body.mutationApplied).toBe(ok ? true : undefined);
        expect(response.body.error).toContain(
          ok ? "Do not retry the plugin mutation" : "original install failure",
        );
        expect(response.body.error).toContain(
          "sources state could not be read",
        );
        expect(JSON.stringify(response.body)).not.toContain("secret");
        for (const field of ["sources", "entries", "installedPlugins"])
          expect(response.body).not.toHaveProperty(field);
      });
    },
  );

  it.each([
    ["catalog", true], ["catalog", false], ["profile", true], ["profile", false],
  ] as const)("preserves %s cleanup-failure outcome without a new profile projection read (ok=%s)", async (sourceKind, ok) => {
    const external = sourceKind === "profile";
    let deps: Record<string, string> = external ? { "@example/extra": "link:/temporary/extra" } : {};
    let reads = 0;
    let writes = 0;
    let mutations = 0;
    let intents: InstallIntent[] = [];
    const stores = memoryStores({
      readDependencies: () => {
        reads += 1;
        return deps;
      },
      readIntents: () => intents,
      writeIntents: (next) => {
        writes += 1;
        if (writes === 2)
          throw new MarketStateError(
            "write-failed",
            "intents",
            "/synthetic/secret",
            "secret",
          );
        intents = next;
      },
      mutatePlugin: async (action, entry) => {
        expect(action).toBe(external ? "remove" : "install");
        expect(entry.packageName).toBe(external ? "@example/extra" : "@nanmicoder/dsh-agent-teams");
        mutations += 1;
        if (ok) deps = {};
        return ok ? { ok: true } : { ok: false, error: "original mutation failure" };
      },
    });
    await withMarketServer(stores, async (request, base) => {
      const response = await request(MARKET_INTENTS_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({
          entryId: external ? installedPluginId("@example/extra") : "agent-teams",
          sourceId: external ? PROFILE_SOURCE_ID : officialSource(config).id,
          action: external ? "remove" : "install",
        }),
      });
      expect(reads).toBe(2);
      expect(mutations).toBe(1);
      expect(writes).toBe(2);
      expect(intents).toHaveLength(1);
      expect(response).toMatchObject({
        status: 500,
        body: {
          ok: false,
          code: "market-state-write-failed",
          mutationApplied: ok,
          intents: [],
        },
      });
      expect(response.body.error).toContain(ok ? "Do not retry the plugin mutation" : "original mutation failure");
      if (!ok) expect(response.body.error).toContain("Repair the state file before retrying");
      expect(JSON.stringify(response.body)).not.toContain("secret");
      for (const field of ["sources", "entries", "installedPlugins"])
        expect(response.body).not.toHaveProperty(field);
    });
  });

  it("serializes overlapping profile mutations", async () => {
    let active = 0;
    let maxActive = 0;
    const stores = memoryStores({
      readSources: () => [],
      mutatePlugin: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return { ok: true };
      },
    });
    await withMarketServer(stores, async (request, base) => {
      const post = () => request(MARKET_INTENTS_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({
          entryId: "agent-teams",
          sourceId: officialSource(config).id,
          action: "install",
        }),
      });
      const responses = await Promise.all([post(), post()]);
      expect(responses.every((response) => response.status === 200)).toBe(true);
      expect(maxActive).toBe(1);
    });
  });
  it("settles success and failure intents so reload and retry stay available", async () => {
    let intents: InstallIntent[] = [];
    let mutation = 0;
    const pendingDuringMutation: InstallIntent[][] = [];
    const stores = memoryStores({
      readSources: () => [],
      readIntents: () => intents,
      writeIntents: (next) => { intents = next; },
      mutatePlugin: async () => {
        mutation += 1;
        pendingDuringMutation.push([...intents]);
        return mutation === 2 ? { ok: false, error: "simulated install failure" } : { ok: true };
      },
    });
    await withMarketServer(stores, async (request, base) => {
      const body = JSON.stringify({
        entryId: "agent-teams",
        sourceId: officialSource(config).id,
        action: "install",
      });
      const post = (): Promise<RouteResponse> => request(MARKET_INTENTS_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body,
      });

      const success = await post();
      expect(success).toMatchObject({ status: 200, body: { ok: true, intents: [] } });
      expect(pendingDuringMutation[0]).toHaveLength(1);
      expect(intents).toEqual([]);

      const reloaded = await request(MARKET_INTENTS_ROUTE);
      expect(reloaded).toMatchObject({ status: 200, body: { ok: true, intents: [] } });

      const failed = await post();
      expect(failed).toMatchObject({
        status: 500,
        body: { ok: false, error: "插件操作失败：simulated install failure", intents: [] },
      });
      expect(intents).toEqual([]);

      const retry = await post();
      expect(retry).toMatchObject({ status: 200, body: { ok: true, intents: [] } });
      expect(mutation).toBe(3);
      expect(pendingDuringMutation.every((current) => current.length === 1)).toBe(true);
    });
  });

  it("returns the real mutation reason and traces it instead of mutation-failed", async () => {
    const traces: string[] = [];
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      traces.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    const previous = process.env.DSH_PLUGIN_TRACE;
    process.env.DSH_PLUGIN_TRACE = "1";
    try {
      const stores = memoryStores({
        readSources: () => [],
        mutatePlugin: async () => ({
          ok: false,
          error: `[ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED] The git-hosted package "dsh-context@0.44.0" needs to execute build scripts but is not in the "allowBuilds" allowlist.`,
        }),
      });
      await withMarketServer(stores, async (request, base) => {
        const response = await request(MARKET_INTENTS_ROUTE, {
          method: "POST",
          headers: { "content-type": "application/json", origin: base },
          body: JSON.stringify({
            entryId: "context",
            sourceId: officialSource(config).id,
            action: "install",
          }),
        });
        expect(response.status).toBe(500);
        expect(response.body.ok).toBe(false);
        expect(response.body.error).toContain("allowBuilds");
        expect(response.body.error).not.toBe("mutation-failed");
        expect(response.body.error).not.toBe("dsh plugin install failed");
      });
      expect(traces.some((line) => line.includes("error=allow-builds-blocked") && line.includes("detail="))).toBe(true);
      expect(traces.some((line) => /error=mutation-failed(?:\s|$)/u.test(line))).toBe(false);
    } finally {
      process.stdout.write = write;
      if (previous === undefined) delete process.env.DSH_PLUGIN_TRACE;
      else process.env.DSH_PLUGIN_TRACE = previous;
    }
  });

  it("rolls back a failed install that left its dependency in the profile", async () => {
    let dependencies: Record<string, string> = {};
    const actions: string[] = [];
    const stores = memoryStores({
      readDependencies: () => dependencies,
      mutatePlugin: async (action) => {
        actions.push(action);
        if (action === "install") dependencies = { "dsh-context": "^0.47.0" };
        else dependencies = {};
        return action === "install"
          ? { ok: false, error: "ERR_PNPM_IGNORED_BUILDS; allowBuilds" }
          : { ok: true };
      },
      inspectInstalled: () => ({ ok: true }),
    });
    await withMarketServer(stores, async (request, base) => {
      const response = await request(MARKET_INTENTS_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({
          entryId: "context",
          sourceId: officialSource(config).id,
          action: "install",
        }),
      });
      expect(response.status).toBe(500);
      expect(response.body.error).toContain("allowBuilds");
      expect(response.body.error).toContain("已回滚");
      expect(actions).toEqual(["install", "remove"]);
      expect(dependencies).toEqual({});
      expect(response.body.intents).toEqual([]);
      expect(response.body).toHaveProperty("entries");
    });
  });

  it("reports when cleanup of a partial install also fails", async () => {
    let dependencies: Record<string, string> = {};
    const actions: string[] = [];
    const stores = memoryStores({
      readDependencies: () => dependencies,
      mutatePlugin: async (action) => {
        actions.push(action);
        if (action === "install") {
          dependencies = { "dsh-context": "^0.47.0" };
          return { ok: false, error: "ERR_PNPM_IGNORED_BUILDS; allowBuilds" };
        }
        return { ok: false, error: "profile is locked" };
      },
      inspectInstalled: () => ({ ok: true }),
    });
    await withMarketServer(stores, async (request, base) => {
      const response = await request(MARKET_INTENTS_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({
          entryId: "context",
          sourceId: officialSource(config).id,
          action: "install",
        }),
      });
      expect(response.status).toBe(500);
      expect(response.body.error).toContain("回滚失败");
      expect(response.body.error).not.toContain("已回滚");
      expect(actions).toEqual(["install", "remove"]);
      expect(dependencies).toHaveProperty("dsh-context");
    });
  });

  it("rolls back an install whose package has no loadable Host entry", async () => {
    const actions: string[] = [];
    const stores = memoryStores({
      readSources: () => [],
      mutatePlugin: async (action) => {
        actions.push(action);
        return { ok: true };
      },
      inspectInstalled: () => ({ ok: false, reason: "plugin has no loadable entry (missing lib/index.js)" }),
    });
    await withMarketServer(stores, async (request, base) => {
      const response = await request(MARKET_INTENTS_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({
          entryId: "context",
          sourceId: officialSource(config).id,
          action: "install",
        }),
      });
      expect(response).toMatchObject({
        status: 500,
        body: {
          ok: false,
          error: "上游插件没有可加载入口（缺少 lib/index.js），已回滚安装。该规格未发布构建产物，当前不可装。",
        },
      });
      expect(actions).toEqual(["install", "remove"]);
    });
  });

  it("returns actionable state diagnostics instead of an empty queue", async () => {
    const stateError = new MarketStateError("invalid-json", "intents", "/tmp/market/intents.json");
    await withMarketServer(memoryStores({ readIntents: () => { throw stateError; } }), async (request) => {
      const response = await request(MARKET_INTENTS_ROUTE);
      expect(response).toMatchObject({
        status: 500,
        body: {
          ok: false,
          code: "market-state-invalid-json",
        },
      });
      expect(response.body.error).toContain("original file was kept");
    });

    const sourceError = new MarketStateError("invalid-schema", "sources", "/tmp/market/sources.json");
    await withMarketServer(memoryStores({ readSources: () => { throw sourceError; } }), async (request) => {
      const response = await request(MARKET_CATALOG_ROUTE);
      expect(response).toMatchObject({
        status: 500,
        body: {
          ok: false,
          code: "market-state-invalid-schema",
        },
      });
      expect(response.body.error).toContain("sources state has an invalid schema");
    });
  });

  it("fails closed when queued mutation state cannot be revalidated and settlement cannot persist", async () => {
    let intents: InstallIntent[] = [];
    let writes = 0;
    let sourceReads = 0;
    const stores = memoryStores({
      readSources: () => {
        sourceReads += 1;
        if (sourceReads > 1) {
          throw new MarketStateError("read-failed", "sources", "/tmp/market/sources.json", "read denied");
        }
        return [];
      },
      readIntents: () => intents,
      writeIntents: (next) => {
        writes += 1;
        if (writes === 2) {
          throw new MarketStateError("write-failed", "intents", "/tmp/market/intents.json", "rename denied");
        }
        intents = next;
      },
      readDependencies: () => ({}),
      mutatePlugin: async () => ({ ok: true }),
    });
    await withMarketServer(stores, async (request, base) => {
      const response = await request(MARKET_INTENTS_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({
          entryId: "agent-teams",
          sourceId: officialSource(config).id,
          action: "install",
        }),
      });
      expect(response).toMatchObject({
        status: 500,
        body: {
          ok: false,
          code: "market-state-write-failed",
          mutationApplied: false,
          intents: [],
        },
      });
      expect(response.body.error).toContain("Plugin install failed (插件操作失败：plugin mutation failed)");
      expect(response.body.error).toContain("Repair the state file before retrying");
      expect(intents).toHaveLength(1);
      expect(sourceReads).toBe(2);
    });
  });

  it("reports source adding as unsupported at the route boundary", async () => {
    await withMarketServer(memoryStores(), async (request, base) => {
      const catalog = await request(MARKET_CATALOG_ROUTE);
      expect(catalog.body.allowThirdPartySources).toBe(false);
      const response = await request(MARKET_SOURCES_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({ add: { label: "demo", indexUrl: "https://demo.example/catalog.json" } }),
      });
      expect(response).toMatchObject({
        status: 501,
        body: { ok: false, error: "third-party source catalogs are not supported in this build" },
      });
    });
  });
});
