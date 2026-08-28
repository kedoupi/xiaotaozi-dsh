import { catalogEntriesFor, sourceIdFor, validateSourceInput, type CatalogEntry, type MarketSource } from "./catalog.ts";
import type { MarketConfig } from "./config.ts";
import { RouteError, readJsonBody, rejectUntrusted, sendJson, type WebServer } from "./http.ts";
import { appendIntent, type InstallIntent } from "./intents.ts";
import { MARKET_CATALOG_ROUTE, MARKET_INTENTS_ROUTE, MARKET_SOURCES_ROUTE } from "./names.ts";
import type { PluginMutator } from "./plugin-mutate.ts";
import { pluginTrace, shortId } from "./trace.ts";

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

export function catalogPayload(
  config: MarketConfig,
  userSources: MarketSource[],
  dependencies: Record<string, string> = {},
): CatalogPayload {
  const sources = [officialSource(config), ...userSources];
  return {
    ok: true,
    allowThirdPartySources: config.allowThirdPartySources,
    sources,
    entries: sources.flatMap((source) => catalogEntriesFor(source, dependencies)),
  };
}

export function findCatalogEntry(
  config: MarketConfig,
  userSources: MarketSource[],
  entryId: string,
  sourceId: string,
): CatalogEntry | undefined {
  return catalogPayload(config, userSources).entries.find(
    (entry) => entry.id === entryId && entry.sourceId === sourceId,
  );
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
  readDependencies: () => Record<string, string>;
  mutatePlugin: PluginMutator;
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
      sendJson(res, 200, catalogPayload(config, stores.readSources(), stores.readDependencies()));
    }),
  });
  const offSources = webServer.register({
    kind: "exact",
    path: MARKET_SOURCES_ROUTE,
    handler: guard(async (req, res) => {
      if (req.method !== "POST") throw new RouteError(405, "method not allowed");
      const body = await readJsonBody(req);
      const record = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
      pluginTrace(typeof record.remove === "string" ? `sources remove id=${shortId(record.remove)}` : "sources add");
      const next = mutateSources(config, stores.readSources(), body);
      stores.writeSources(next);
      sendJson(res, 200, catalogPayload(config, next, stores.readDependencies()));
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
      const intent = intentFromBody(await readJsonBody(req));
      const entry = findCatalogEntry(config, stores.readSources(), intent.entryId, intent.sourceId);
      if (entry === undefined) throw new RouteError(404, "unknown catalog entry");
      pluginTrace(`intent action=${intent.action} entry=${shortId(intent.entryId)}`);
      const queued = appendIntent(stores.readIntents(), intent);
      stores.writeIntents(queued);
      const mutated = await stores.mutatePlugin(intent.action, entry);
      if (!mutated.ok) {
        pluginTrace(`intent action=${intent.action} entry=${shortId(intent.entryId)} error=${mutated.error}`);
        sendJson(res, 500, {
          ...catalogPayload(config, stores.readSources(), stores.readDependencies()),
          ok: false,
          error: mutated.error,
          intents: queued,
        });
        return;
      }
      pluginTrace(`intent action=${intent.action} entry=${shortId(intent.entryId)} ok`);
      sendJson(res, 200, {
        ...catalogPayload(config, stores.readSources(), stores.readDependencies()),
        ok: true,
        intents: queued,
      });
    }),
  });
  return () => {
    offCatalog();
    offSources();
    offIntents();
  };
}
