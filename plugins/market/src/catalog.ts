/** Cordis-free catalog model. Phase 1 serves a mock catalog; the desktop
 * shell owns real pack download / verification / switching. */

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
}

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

/** Mock entries: the shipped desktop plugins plus workflow packs on the official
 * source; third-party sources answer with a small demo listing. */
export function mockEntriesFor(source: MarketSource): CatalogEntry[] {
  if (!source.builtin) {
    return [
      {
        id: `${source.id}-sample`,
        name: `${source.label} 示例插件`,
        version: "0.1.0",
        summary: "第三方源的演示条目（假数据）。",
        tags: ["第三方"],
        kind: "plugin",
        sourceId: source.id,
        installed: false,
      },
    ];
  }
  const official = (entry: Omit<CatalogEntry, "sourceId">): CatalogEntry => ({ ...entry, sourceId: source.id });
  return [
    official({ id: "hello", name: "小桃子壳", version: "0.8.0", summary: "品牌界面、归档、任务看板、Git 图谱与设置页。", tags: ["界面", "官方"], kind: "plugin", installed: true }),
    official({ id: "sidebar", name: "右侧工作台", version: "0.1.0", summary: "对话右侧的文件、编辑器、Git 和终端。", tags: ["界面", "官方"], kind: "plugin", installed: true }),
    official({ id: "providers", name: "模型服务", version: "0.2.1", summary: "DeepSeek 与兼容模型提供方配置。", tags: ["模型", "官方"], kind: "plugin", installed: true }),
    official({ id: "memory", name: "记忆", version: "0.1.0", summary: "跨会话记忆（Noema 引擎）。", tags: ["记忆", "官方"], kind: "plugin", installed: true }),
    official({ id: "im", name: "消息通道", version: "0.1.1", summary: "微信、企业微信、飞书、钉钉、QQ 等通道接入。", tags: ["消息", "官方"], kind: "plugin", installed: true }),
    official({ id: "wf-weekly-ppt", name: "周报 PPT 工作流", version: "0.1.0", summary: "一句话生成可播放的周报演示（示例条目，假数据）。", tags: ["办公", "工作流"], kind: "workflow", installed: false }),
    official({ id: "wf-excel-report", name: "Excel 报表工作流", version: "0.1.0", summary: "本地 Excel 生成可交互报表（示例条目，假数据）。", tags: ["数据", "工作流"], kind: "workflow", installed: false }),
  ];
}
