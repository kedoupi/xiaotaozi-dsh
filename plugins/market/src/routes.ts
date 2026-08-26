import { mockEntriesFor, sourceIdFor, validateSourceInput, type CatalogEntry, type MarketSource } from "./catalog.ts";
import type { MarketConfig } from "./config.ts";
import { RouteError, readJsonBody, rejectUntrusted, sendJson, type WebServer } from "./http.ts";
import { appendIntent, type InstallIntent } from "./intents.ts";
import { MARKET_CATALOG_ROUTE, MARKET_INTENTS_ROUTE, MARKET_SOURCES_ROUTE } from "./names.ts";

export type { WebServer };

export function officialSource(config: MarketConfig): MarketSource {
  return {
    id: sourceIdFor(config.indexUrl),
    label: config.officialLabel,
    indexUrl: config.indexUrl,
    builtin: true,
  };
}

export interface CatalogPayload {
  ok: true;
  allowThirdPartySources: boolean;
  sources: MarketSource[];
  entries: CatalogEntry[];
}

export function catalogPayload(config: MarketConfig, userSources: MarketSource[]): CatalogPayload {
  const sources = [officialSource(config), ...userSources];
  return {
    ok: true,
    allowThirdPartySources: config.allowThirdPartySources,
    sources,
    entries: sources.flatMap((source) => mockEntriesFor(source)),
  };
}

/** Apply an add / remove mutation to the user source list. Throws RouteError on bad input. */
export function mutateSources(
  config: MarketConfig,
  userSources: MarketSource[],
  body: unknown,
): MarketSource[] {
  const record = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (typeof record.remove === "string" && record.remove !== "") {
    return userSources.filter((source) => source.id !== record.remove);
  }
  if (record.add === undefined) throw new RouteError(400, "add or remove required");
  if (!config.allowThirdPartySources) throw new RouteError(403, "third-party sources disabled");
  const valid = validateSourceInput(record.add);
  if (!valid.ok) throw new RouteError(400, valid.error);
  const id = sourceIdFor(valid.indexUrl);
  if (id === officialSource(config).id || userSources.some((source) => source.id === id)) {
    throw new RouteError(409, "source exists");
  }
  return [...userSources, { id, label: valid.label, indexUrl: valid.indexUrl, builtin: false }];
}

/** Build the queued intent from a client request body. Throws RouteError on bad input. */
export function intentFromBody(body: unknown, now: () => Date = () => new Date()): InstallIntent {
  const record = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (typeof record.entryId !== "string" || record.entryId === "") throw new RouteError(400, "entryId required");
  if (typeof record.sourceId !== "string" || record.sourceId === "") throw new RouteError(400, "sourceId required");
  if (record.action !== "install" && record.action !== "remove") throw new RouteError(400, "invalid action");
  return {
    entryId: record.entryId,
    sourceId: record.sourceId,
    action: record.action,
    requestedAt: now().toISOString(),
    status: "pending",
  };
}

export interface MarketStores {
  readSources: () => MarketSource[];
  writeSources: (sources: MarketSource[]) => void;
  readIntents: () => InstallIntent[];
  writeIntents: (intents: InstallIntent[]) => void;
}

export function registerMarketRoutes(
  webServer: WebServer,
  config: MarketConfig,
  stores: MarketStores,
): () => void {
  const guard = (
    handler: (req: Parameters<Parameters<WebServer["register"]>[0]["handler"]>[0], res: Parameters<Parameters<WebServer["register"]>[0]["handler"]>[1]) => Promise<void>,
  ): Parameters<WebServer["register"]>[0]["handler"] => async (req, res) => {
    if (rejectUntrusted(req, res)) return;
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof RouteError) {
        sendJson(res, error.status, { ok: false, error: error.message });
        return;
      }
      sendJson(res, 500, { ok: false, error: "internal" });
    }
  };
  const offCatalog = webServer.register({
    kind: "exact",
    path: MARKET_CATALOG_ROUTE,
    handler: guard(async (req, res) => {
      if (req.method !== "GET" && req.method !== "HEAD") throw new RouteError(405, "method not allowed");
      sendJson(res, 200, catalogPayload(config, stores.readSources()));
    }),
  });
  const offSources = webServer.register({
    kind: "exact",
    path: MARKET_SOURCES_ROUTE,
    handler: guard(async (req, res) => {
      if (req.method !== "POST") throw new RouteError(405, "method not allowed");
      const next = mutateSources(config, stores.readSources(), await readJsonBody(req));
      stores.writeSources(next);
      sendJson(res, 200, catalogPayload(config, next));
    }),
  });
  const offIntents = webServer.register({
    kind: "exact",
    path: MARKET_INTENTS_ROUTE,
    handler: guard(async (req, res) => {
      if (req.method === "GET" || req.method === "HEAD") {
        sendJson(res, 200, { ok: true, intents: stores.readIntents() });
        return;
      }
      if (req.method !== "POST") throw new RouteError(405, "method not allowed");
      const next = appendIntent(stores.readIntents(), intentFromBody(await readJsonBody(req)));
      stores.writeIntents(next);
      sendJson(res, 200, { ok: true, intents: next });
    }),
  });
  return () => {
    offCatalog();
    offSources();
    offIntents();
  };
}
