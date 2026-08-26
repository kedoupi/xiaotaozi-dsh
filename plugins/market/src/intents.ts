import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { marketStatePath } from "./dsh-home.ts";

const INTENTS_FILE = "intents.json";
const MAX_INTENTS = 100;

/** Queued request for the desktop shell, which owns download / verify / apply.
 * The plugin only records what the user asked for. */
export interface InstallIntent {
  entryId: string;
  sourceId: string;
  action: "install" | "remove";
  requestedAt: string;
  status: "pending";
}

export function pickIntents(value: unknown): InstallIntent[] {
  if (!Array.isArray(value)) return [];
  const intents: InstallIntent[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.entryId !== "string" || record.entryId === "") continue;
    if (typeof record.sourceId !== "string" || record.sourceId === "") continue;
    if (record.action !== "install" && record.action !== "remove") continue;
    intents.push({
      entryId: record.entryId,
      sourceId: record.sourceId,
      action: record.action,
      requestedAt: typeof record.requestedAt === "string" ? record.requestedAt : new Date(0).toISOString(),
      status: "pending",
    });
  }
  return intents;
}

/** Latest request per entry wins; bounded queue. */
export function appendIntent(intents: InstallIntent[], next: InstallIntent): InstallIntent[] {
  const rest = intents.filter((intent) => intent.entryId !== next.entryId);
  return [...rest, next].slice(-MAX_INTENTS);
}

export function loadIntents(env: NodeJS.ProcessEnv = process.env): InstallIntent[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(marketStatePath(INTENTS_FILE, env), "utf8"));
    return pickIntents(parsed);
  } catch {
    return [];
  }
}

export function saveIntents(intents: InstallIntent[], env: NodeJS.ProcessEnv = process.env): void {
  const path = marketStatePath(INTENTS_FILE, env);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(intents, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, path);
}
