import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { sourceIdFor, validateSourceInput, type MarketSource } from "./catalog.ts";
import { marketStatePath } from "./dsh-home.ts";

const SOURCES_FILE = "sources.json";

/** Keep only valid, deduplicated third-party sources. */
export function pickSources(value: unknown): MarketSource[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const sources: MarketSource[] = [];
  for (const item of value) {
    const valid = validateSourceInput(item);
    if (!valid.ok) continue;
    const id = sourceIdFor(valid.indexUrl);
    if (seen.has(id)) continue;
    seen.add(id);
    sources.push({ id, label: valid.label, indexUrl: valid.indexUrl, builtin: false });
  }
  return sources;
}

export function loadSources(env: NodeJS.ProcessEnv = process.env): MarketSource[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(marketStatePath(SOURCES_FILE, env), "utf8"));
    return pickSources(parsed);
  } catch {
    return [];
  }
}

export function saveSources(sources: MarketSource[], env: NodeJS.ProcessEnv = process.env): void {
  const path = marketStatePath(SOURCES_FILE, env);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const payload = sources.map(({ label, indexUrl }) => ({ label, indexUrl }));
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, path);
}
