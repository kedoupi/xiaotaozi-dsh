import type { ArchiveRecord } from "./ledger.ts";

export type ArchiveSort = "newest" | "oldest";

export interface ArchiveQuery {
  query: string;
  workspace: string;
  sort: ArchiveSort;
}

export function filterArchives(
  items: readonly ArchiveRecord[],
  query: ArchiveQuery,
  untitled: string,
): ArchiveRecord[] {
  const needle = query.query.trim().toLowerCase();
  const filtered = items.filter((item) => {
    const group = item.workspaceTitle && item.workspaceTitle !== "" ? item.workspaceTitle : untitled;
    if (query.workspace !== "ALL" && group !== query.workspace) return false;
    if (needle === "") return true;
    return item.title.toLowerCase().includes(needle) || group.toLowerCase().includes(needle);
  });
  const copy = [...filtered];
  copy.sort((a, b) => {
    const left = a.createdAt ?? 0;
    const right = b.createdAt ?? 0;
    return query.sort === "oldest" ? left - right : right - left;
  });
  return copy;
}

export function groupArchives(
  items: readonly ArchiveRecord[],
  untitled: string,
): Array<{ title: string; items: ArchiveRecord[] }> {
  const groups = new Map<string, ArchiveRecord[]>();
  for (const item of items) {
    const title = item.workspaceTitle && item.workspaceTitle !== "" ? item.workspaceTitle : untitled;
    const list = groups.get(title) ?? [];
    list.push(item);
    groups.set(title, list);
  }
  return [...groups.entries()].map(([title, grouped]) => ({ title, items: grouped }));
}

export function workspaceNames(items: readonly ArchiveRecord[], untitled: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const title = item.workspaceTitle && item.workspaceTitle !== "" ? item.workspaceTitle : untitled;
    if (seen.has(title)) continue;
    seen.add(title);
    names.push(title);
  }
  return names;
}
