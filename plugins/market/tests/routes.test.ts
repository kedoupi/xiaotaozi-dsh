import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { sourceIdFor, type MarketSource } from "../src/catalog.ts";
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
        body: { ok: false, error: "simulated install failure", intents: [] },
      });
      expect(intents).toEqual([]);

      const retry = await post();
      expect(retry).toMatchObject({ status: 200, body: { ok: true, intents: [] } });
      expect(mutation).toBe(3);
      expect(pendingDuringMutation.every((current) => current.length === 1)).toBe(true);
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
      readDependencies: () => { throw new Error("profile dependencies unavailable"); },
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
      expect(response.body.error).toContain("Plugin install failed (plugin mutation failed)");
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
