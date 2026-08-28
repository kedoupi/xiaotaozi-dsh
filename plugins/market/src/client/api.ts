import type { CatalogEntry, MarketSource } from "../catalog.ts";
import type { InstallIntent } from "../intents.ts";
import { MARKET_CATALOG_ROUTE, MARKET_INTENTS_ROUTE, MARKET_SOURCES_ROUTE } from "../names.ts";

export interface CatalogSnapshot {
  allowThirdPartySources: boolean;
  sources: MarketSource[];
  entries: CatalogEntry[];
}

interface CatalogResponse extends Partial<CatalogSnapshot> {
  ok?: boolean;
  error?: string;
}

function asSnapshot(payload: CatalogResponse): CatalogSnapshot {
  if (payload.ok !== true || payload.sources === undefined || payload.entries === undefined) {
    throw new Error(payload.error ?? "market request failed");
  }
  return {
    allowThirdPartySources: payload.allowThirdPartySources === true,
    sources: payload.sources,
    entries: payload.entries,
  };
}

async function postJson(route: string, body: unknown): Promise<unknown> {
  const response = await fetch(route, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return await response.json() as unknown;
}

export async function loadCatalog(): Promise<CatalogSnapshot> {
  const response = await fetch(MARKET_CATALOG_ROUTE, { cache: "no-store" });
  return asSnapshot(await response.json() as CatalogResponse);
}

export async function addSource(label: string, indexUrl: string): Promise<CatalogSnapshot> {
  return asSnapshot(await postJson(MARKET_SOURCES_ROUTE, { add: { label, indexUrl } }) as CatalogResponse);
}

export async function removeSource(id: string): Promise<CatalogSnapshot> {
  return asSnapshot(await postJson(MARKET_SOURCES_ROUTE, { remove: id }) as CatalogResponse);
}

interface IntentsResponse {
  ok?: boolean;
  error?: string;
  intents?: InstallIntent[];
}

function asIntents(payload: IntentsResponse): InstallIntent[] {
  if (payload.ok !== true || payload.intents === undefined) throw new Error(payload.error ?? "market request failed");
  return payload.intents;
}

export async function loadIntents(): Promise<InstallIntent[]> {
  const response = await fetch(MARKET_INTENTS_ROUTE, { cache: "no-store" });
  return asIntents(await response.json() as IntentsResponse);
}

export async function queueIntent(entryId: string, sourceId: string, action: "install" | "remove"): Promise<{
  intents: InstallIntent[];
  snapshot?: CatalogSnapshot;
  error?: string;
}> {
  const payload = await postJson(MARKET_INTENTS_ROUTE, { entryId, sourceId, action }) as IntentsResponse & CatalogResponse;
  if (payload.intents === undefined) throw new Error(payload.error ?? "market request failed");
  let snapshot: CatalogSnapshot | undefined;
  if (payload.sources !== undefined && payload.entries !== undefined) {
    snapshot = {
      allowThirdPartySources: payload.allowThirdPartySources === true,
      sources: payload.sources,
      entries: payload.entries,
    };
  }
  return {
    intents: payload.intents,
    snapshot,
    error: payload.ok === true ? undefined : payload.error ?? "market request failed",
  };
}
