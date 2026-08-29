import { createHash } from "node:crypto";
import { marketStatePath } from "./dsh-home.ts";
import { loadMarketState, saveMarketState, type MarketStateIo } from "./state-store.ts";

const INTENTS_FILE = "intents.json";
const MAX_INTENTS = 100;

/** Queued request. Apply is not Desktop (abandoned); next cut is xtz.
 * The plugin only records what the user asked for. */
export interface InstallIntent {
  requestId: string;
  entryId: string;
  sourceId: string;
  action: "install" | "remove";
  requestedAt: string;
  status: "pending";
}

function legacyRequestId(
  intent: Pick<InstallIntent, "entryId" | "sourceId" | "action" | "requestedAt">,
  index: number,
): string {
  const digest = createHash("sha256")
    .update(JSON.stringify([index, intent.entryId, intent.sourceId, intent.action, intent.requestedAt]))
    .digest("hex");
  return `legacy:${digest}`;
}

function storedRequestId(
  record: Record<string, unknown>,
  intent: Pick<InstallIntent, "entryId" | "sourceId" | "action" | "requestedAt">,
  index: number,
): string | null {
  if (record.requestId === undefined) return legacyRequestId(intent, index);
  return typeof record.requestId === "string" && record.requestId !== "" ? record.requestId : null;
}

/** Latest request per entry wins; bounded queue. */
export function appendIntent(intents: InstallIntent[], next: InstallIntent): InstallIntent[] {
  const rest = intents.filter((intent) => intent.entryId !== next.entryId);
  return [...rest, next].slice(-MAX_INTENTS);
}

/** Remove only the request that finished; a newer request for the same entry survives. */
export function settleIntent(intents: InstallIntent[], settled: InstallIntent): InstallIntent[] {
  return intents.filter((intent) => intent.requestId !== settled.requestId);
}

function parseStoredIntents(value: unknown): InstallIntent[] {
  if (!Array.isArray(value)) throw new Error("expected an array");
  const requestIds = new Set<string>();
  return value.map((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(`entry ${index} must be an object`);
    }
    const record = item as Record<string, unknown>;
    if (typeof record.entryId !== "string" || record.entryId === "") {
      throw new Error(`entry ${index} has an invalid entryId`);
    }
    if (typeof record.sourceId !== "string" || record.sourceId === "") {
      throw new Error(`entry ${index} has an invalid sourceId`);
    }
    if (record.action !== "install" && record.action !== "remove") {
      throw new Error(`entry ${index} has an invalid action`);
    }
    if (typeof record.requestedAt !== "string" || record.requestedAt === "" || Number.isNaN(Date.parse(record.requestedAt))) {
      throw new Error(`entry ${index} has an invalid requestedAt`);
    }
    if (record.status !== "pending") throw new Error(`entry ${index} has an invalid status`);
    const requestId = storedRequestId(record, {
      entryId: record.entryId,
      sourceId: record.sourceId,
      action: record.action,
      requestedAt: record.requestedAt,
    }, index);
    if (requestId === null) throw new Error(`entry ${index} has an invalid requestId`);
    if (requestIds.has(requestId)) throw new Error(`entry ${index} has a duplicate requestId`);
    requestIds.add(requestId);
    return {
      requestId,
      entryId: record.entryId,
      sourceId: record.sourceId,
      action: record.action,
      requestedAt: record.requestedAt,
      status: "pending",
    };
  });
}

export function loadIntents(
  env: NodeJS.ProcessEnv = process.env,
  io?: MarketStateIo,
): InstallIntent[] {
  return loadMarketState(marketStatePath(INTENTS_FILE, env), "intents", parseStoredIntents, io) ?? [];
}

export function saveIntents(
  intents: InstallIntent[],
  env: NodeJS.ProcessEnv = process.env,
  io?: MarketStateIo,
): void {
  // Validate before replacing a previously readable file.
  try {
    parseStoredIntents(intents);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new TypeError(`refusing to save invalid Market intents: ${detail}`);
  }
  saveMarketState(marketStatePath(INTENTS_FILE, env), "intents", intents, io);
}
