import { sourceIdFor, validateSourceInput, type MarketSource } from "./catalog.ts";
import { marketStatePath } from "./dsh-home.ts";
import { loadMarketState, saveMarketState, type MarketStateIo } from "./state-store.ts";

const SOURCES_FILE = "sources.json";

function parseStoredSources(value: unknown): MarketSource[] {
  if (!Array.isArray(value)) throw new Error("expected an array");
  const seen = new Set<string>();
  return value.map((item, index) => {
    const valid = validateSourceInput(item);
    if (!valid.ok) throw new Error(`entry ${index}: ${valid.error}`);
    const id = sourceIdFor(valid.indexUrl);
    if (seen.has(id)) throw new Error(`entry ${index} duplicates source ${id}`);
    seen.add(id);
    return { id, label: valid.label, indexUrl: valid.indexUrl, builtin: false };
  });
}

export function loadSources(
  env: NodeJS.ProcessEnv = process.env,
  io?: MarketStateIo,
): MarketSource[] {
  return loadMarketState(marketStatePath(SOURCES_FILE, env), "sources", parseStoredSources, io) ?? [];
}

export function saveSources(
  sources: MarketSource[],
  env: NodeJS.ProcessEnv = process.env,
  io?: MarketStateIo,
): void {
  const payload = sources.map(({ label, indexUrl }) => ({ label, indexUrl }));
  try {
    parseStoredSources(payload);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new TypeError(`refusing to save invalid Market sources: ${detail}`);
  }
  saveMarketState(marketStatePath(SOURCES_FILE, env), "sources", payload, io);
}
