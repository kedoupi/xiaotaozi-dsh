import { randomUUID } from "node:crypto";
import {
  THIRD_PARTY_SOURCES_SUPPORTED,
  PROFILE_SOURCE_ID,
  catalogEntriesFor,
  installedPluginsFor,
  publicInstallSpec,
  sourceIdFor,
  validateSourceInput,
  type CatalogEntry,
  type InstalledPlugin,
  type MarketSource,
} from "./catalog.ts";
import type { MarketConfig } from "./config.ts";
import { RouteError, readJsonBody, rejectUntrusted, sendJson, type WebServer } from "./http.ts";
import { appendIntent, settleIntent, type InstallIntent } from "./intents.ts";
import { MARKET_CATALOG_ROUTE, MARKET_INTENTS_ROUTE, MARKET_SOURCES_ROUTE } from "./names.ts";
import type { PluginEntryInspection } from "./plugin-entry.ts";
import { installedPluginLoadError } from "./plugin-entry.ts";
import type { PluginMutator } from "./plugin-mutate.ts";
import { ProfileDependenciesError } from "./profile-deps.ts";
import { MarketStateError } from "./state-store.ts";
import { pluginTrace, shortId } from "./trace.ts";

export type { WebServer };

let mutationQueue: Promise<void> = Promise.resolve();

async function serializeMutation<T>(work: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(work, work);
  mutationQueue = result.then(() => undefined, () => undefined);
  return await result;
}

function publicStateError(error: MarketStateError): string {
  if (error.code === "invalid-json") return `Market ${error.kind} state is not valid JSON; the original file was kept. Fix it or move it aside, then retry.`;
  if (error.code === "invalid-schema") return `Market ${error.kind} state has an invalid schema; the original file was kept. Fix it or move it aside, then retry.`;
  if (error.code === "read-failed") return `Market ${error.kind} state could not be read. Fix its permissions, then retry.`;
  return `Market ${error.kind} state could not be written. Fix permissions or disk space, then retry.`;
}

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
  installedPlugins: InstalledPlugin[];
}

export function catalogPayload(
  config: MarketConfig,
  userSources: MarketSource[],
  dependencies: Record<string, string> = {},
): CatalogPayload {
  const sources = [officialSource(config), ...userSources];
  return {
    ok: true,
    allowThirdPartySources: config.allowThirdPartySources && THIRD_PARTY_SOURCES_SUPPORTED,
    sources,
    entries: sources.flatMap((source) => catalogEntriesFor(source, dependencies)),
    installedPlugins: installedPluginsFor(dependencies).map((row) => ({
      ...row,
      installSpec: publicInstallSpec(row.installSpec),
    })),
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

export function resolveIntentTarget(
  config: MarketConfig,
  sources: MarketSource[],
  dependencies: Record<string, string>,
  intent: InstallIntent,
): CatalogEntry | undefined {
  if (intent.sourceId !== PROFILE_SOURCE_ID) {
    const entry = catalogPayload(config, sources, dependencies).entries.find(
      (row) => row.id === intent.entryId && row.sourceId === intent.sourceId,
    );
    if (entry === undefined || intent.action === "install") return entry;
    const installed = installedPluginsFor(dependencies).find((row) => row.catalogEntryId === entry.id);
    return installed === undefined ? { ...entry, installed: false }
      : { ...entry, packageName: installed.packageName, installed: true };
  }
  if (intent.action !== "remove") throw new RouteError(400, "profile entries support removal only");
  const installed = installedPluginsFor(dependencies).find((row) => row.id === intent.entryId);
  if (installed === undefined) return undefined;
  return {
    id: installed.id, name: installed.name, version: installed.version ?? "",
    summary: "", tags: [], kind: "plugin", sourceId: PROFILE_SOURCE_ID,
    installed: true, packageName: installed.packageName,
  };
}

/** Remove a saved source; adding fails closed until remote catalogs have a security contract. */
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
  if (!THIRD_PARTY_SOURCES_SUPPORTED) {
    throw new RouteError(501, "third-party source catalogs are not supported in this build");
  }
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
export function intentFromBody(
  body: unknown,
  now: () => Date = () => new Date(),
  createRequestId: () => string = randomUUID,
): InstallIntent {
  const record = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (typeof record.entryId !== "string" || record.entryId === "") throw new RouteError(400, "entryId required");
  if (typeof record.sourceId !== "string" || record.sourceId === "") throw new RouteError(400, "sourceId required");
  if (record.action !== "install" && record.action !== "remove") throw new RouteError(400, "invalid action");
  return {
    requestId: createRequestId(),
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
  inspectInstalled?: (entry: CatalogEntry) => PluginEntryInspection;
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
      if (error instanceof MarketStateError) {
        pluginTrace(`state kind=${error.kind} code=${error.code}`);
        sendJson(res, 500, { ok: false, code: `market-state-${error.code}`, error: publicStateError(error) });
        return;
      }
      if (error instanceof ProfileDependenciesError) {
        sendJson(res, 500, {
          ok: false,
          code: "market-profile-unavailable",
          error: error.message,
        });
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
      const snapshot = catalogPayload(config, next, stores.readDependencies());
      stores.writeSources(next);
      sendJson(res, 200, snapshot);
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
      const entry = resolveIntentTarget(config, stores.readSources(), stores.readDependencies(), intent);
      if (entry === undefined) throw new RouteError(404, "unknown catalog entry");
      pluginTrace(`intent action=${intent.action} entry=${shortId(intent.entryId)}`);
      const queued = appendIntent(stores.readIntents(), intent);
      stores.writeIntents(queued);
      let mutated: Awaited<ReturnType<PluginMutator>>;
      try {
        mutated = await serializeMutation(async () => {
          const current = resolveIntentTarget(config, stores.readSources(), stores.readDependencies(), intent);
          // Only a successful fresh projection can establish that a queued removal is already done.
          if (current === undefined) return intent.sourceId === PROFILE_SOURCE_ID
            ? { ok: true } : { ok: false, error: "catalog entry unavailable" };
          if ((intent.action === "install") === current.installed) return { ok: true };
          const outcome = await stores.mutatePlugin(intent.action, current);
          if (intent.action !== "install" || !outcome.ok || stores.inspectInstalled === undefined) return outcome;
          const inspection = stores.inspectInstalled(current);
          if (inspection.ok) return outcome;
          const removed = await stores.mutatePlugin("remove", current);
          if (!removed.ok) {
            return { ok: false, error: `${inspection.reason}; rollback failed (${removed.error})` };
          }
          return { ok: false, error: installedPluginLoadError(inspection) };
        });
      } catch {
        mutated = { ok: false, error: "plugin mutation failed" };
      }
      let settled: InstallIntent[];
      try {
        settled = settleIntent(stores.readIntents(), intent);
        stores.writeIntents(settled);
      } catch (error) {
        if (!(error instanceof MarketStateError)) throw error;
        const logicalSettled = settleIntent(queued, intent);
        const stateDetail = publicStateError(error);
        const outcome = mutated.ok
          ? `Plugin ${intent.action} completed, but intent cleanup failed. ${stateDetail} Do not retry the plugin mutation until the state file is repaired.`
          : `Plugin ${intent.action} failed (${mutated.error}), and intent cleanup also failed. ${stateDetail} Repair the state file before retrying.`;
        pluginTrace(`intent action=${intent.action} entry=${shortId(intent.entryId)} settle=${error.code}`);
        sendJson(res, 500, {
          ok: false,
          code: `market-state-${error.code}`,
          error: outcome,
          mutationApplied: mutated.ok,
          intents: logicalSettled,
        });
        return;
      }
      let snapshot: CatalogPayload;
      try {
        snapshot = catalogPayload(config, stores.readSources(), stores.readDependencies());
      } catch (error) {
        // A response refresh must not erase a settled mutation outcome or invite a repeat write.
        const code =
          error instanceof ProfileDependenciesError
            ? "market-profile-unavailable"
            : error instanceof MarketStateError
              ? `market-state-${error.code}`
              : undefined;
        const detail =
          error instanceof ProfileDependenciesError
            ? "Web profile could not be read. Check it with xtz doctor, then refresh."
            : error instanceof MarketStateError
              ? publicStateError(error)
              : "Market could not be refreshed. Check it with xtz doctor, then refresh.";
        sendJson(res, 500, {
          ok: false,
          code,
          error: mutated.ok
            ? `Plugin ${intent.action} completed, but the catalog could not be refreshed. ${detail} Do not retry the plugin mutation; refresh only after repair.`
            : `Plugin ${intent.action} failed (${mutated.error}). ${detail}`,
          ...(mutated.ok ? { mutationApplied: true } : {}),
          intents: settled,
        });
        return;
      }
      if (!mutated.ok) {
        pluginTrace(`intent action=${intent.action} entry=${shortId(intent.entryId)} error=mutation-failed`);
        sendJson(res, 500, {
          ...snapshot,
          ok: false,
          error: mutated.error,
          intents: settled,
        });
        return;
      }
      pluginTrace(`intent action=${intent.action} entry=${shortId(intent.entryId)} ok`);
      sendJson(res, 200, {
        ...snapshot,
        ok: true,
        intents: settled,
      });
    }),
  });
  return () => {
    offCatalog();
    offSources();
    offIntents();
  };
}
