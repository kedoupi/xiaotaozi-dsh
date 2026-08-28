/** Cordis-free catalog: third-party plugins listed in MARKET_PLUGINS, with
 * install state taken from the current profile's package.json. */

export interface MarketSource {
  id: string;
  label: string;
  indexUrl: string;
  builtin: boolean;
}

export type EntryKind = "plugin" | "workflow";

export interface CatalogEntry {
  id: string;
  name: string;
  version: string;
  summary: string;
  tags: string[];
  kind: EntryKind;
  sourceId: string;
  installed: boolean;
  packageName?: string;
  installSpec?: string;
}

/** Third-party plugins the market sells. First-party `plugins/` are seeded, not sold here. */
export const MARKET_PLUGINS: ReadonlyArray<Omit<CatalogEntry, "sourceId" | "installed">> = [
  {
    id: "agent-teams",
    name: "Agent Teams",
    version: "0.1.11",
    summary: "队长 + 可续成员的多 Agent 协作（NanmiCoder）。",
    tags: ["协作"],
    kind: "plugin",
    packageName: "@nanmicoder/dsh-agent-teams",
    installSpec: "github:NanmiCoder/dsh-agent-teams",
  },
  {
    id: "context",
    name: "会话上下文",
    version: "0.21.1",
    summary: "组成条、历史、事件和 /context（bowenliang123）。",
    tags: ["界面"],
    kind: "plugin",
    packageName: "dsh-context",
    installSpec: "github:bowenliang123/dsh-context",
  },
  {
    id: "opencontext",
    name: "OpenContext",
    version: "0.3.2",
    summary: "时序记忆图谱与自动召回（melandlabs）。",
    tags: ["记忆"],
    kind: "plugin",
    packageName: "dsh-opencontext",
    installSpec: "github:melandlabs/opencontext#path:plugins/dsh-opencontext",
  },
];

/** Stable short id for a source URL (djb2 hex). */
export function sourceIdFor(indexUrl: string): string {
  let hash = 5381;
  for (const char of indexUrl) hash = ((hash * 33) ^ char.charCodeAt(0)) >>> 0;
  return `src-${hash.toString(16)}`;
}

function isLoopbackHttpUrl(url: URL): boolean {
  return url.protocol === "http:"
    && (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]");
}

/** Third-party source input. HTTPS only; plain HTTP is allowed for loopback dev sources. */
export function validateSourceInput(value: unknown): { ok: true; label: string; indexUrl: string } | { ok: false; error: string } {
  if (typeof value !== "object" || value === null) return { ok: false, error: "invalid source" };
  const record = value as Record<string, unknown>;
  const label = typeof record.label === "string" ? record.label.trim() : "";
  const indexUrl = typeof record.indexUrl === "string" ? record.indexUrl.trim() : "";
  if (label === "" || label.length > 64) return { ok: false, error: "invalid label" };
  if (indexUrl.length > 2048) return { ok: false, error: "invalid url" };
  let url: URL;
  try {
    url = new URL(indexUrl);
  } catch {
    return { ok: false, error: "invalid url" };
  }
  if (url.username !== "" || url.password !== "" || url.hash !== "") return { ok: false, error: "invalid url" };
  if (url.protocol !== "https:" && !isLoopbackHttpUrl(url)) return { ok: false, error: "https required" };
  return { ok: true, label, indexUrl: url.toString() };
}

export function searchCatalog(entries: CatalogEntry[], query: string, tag?: string): CatalogEntry[] {
  const needle = query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (tag !== undefined && tag !== "" && !entry.tags.includes(tag)) return false;
    if (needle === "") return true;
    return entry.name.toLowerCase().includes(needle)
      || entry.summary.toLowerCase().includes(needle)
      || entry.tags.some((current) => current.toLowerCase().includes(needle));
  });
}

export function tagsOf(entries: CatalogEntry[]): string[] {
  return [...new Set(entries.flatMap((entry) => entry.tags))].sort((a, b) => a.localeCompare(b));
}

export function isCatalogEntryInstalled(
  entry: Pick<CatalogEntry, "packageName" | "installSpec">,
  dependencies: Record<string, string>,
): boolean {
  if (typeof entry.packageName === "string" && entry.packageName !== "" && Object.hasOwn(dependencies, entry.packageName)) {
    return true;
  }
  const spec = entry.installSpec;
  if (typeof spec !== "string" || spec === "") return false;
  return Object.values(dependencies).some((value) => value === spec);
}

export function withInstallState(
  entries: CatalogEntry[],
  dependencies: Record<string, string>,
): CatalogEntry[] {
  return entries.map((entry) => ({ ...entry, installed: isCatalogEntryInstalled(entry, dependencies) }));
}

/** Official catalog is MARKET_PLUGINS. Extra user sources stay empty until a real index exists. */
export function catalogEntriesFor(source: MarketSource, dependencies: Record<string, string> = {}): CatalogEntry[] {
  if (!source.builtin) return [];
  return withInstallState(
    MARKET_PLUGINS.map((entry) => ({ ...entry, sourceId: source.id, installed: false })),
    dependencies,
  );
}
