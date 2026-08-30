import type { ArchiveRecord } from "./ledger.ts";

export type ArchiveSort = "newest" | "oldest";

export interface ArchiveQuery {
  query: string;
  workspace: string;
  sort: ArchiveSort;
}

function workspaceTitle(item: ArchiveRecord, untitled: string): string {
  return item.workspaceTitle && item.workspaceTitle !== "" ? item.workspaceTitle : untitled;
}

export function archiveWorkspaceKey(item: ArchiveRecord): string {
  if (item.workspaceId) return `id:${item.workspaceId}`;
  if (item.workspacePath) return `path:${item.workspacePath}`;
  return `session:${item.sessionId}`;
}

export function filterArchives(
  items: readonly ArchiveRecord[],
  query: ArchiveQuery,
  untitled: string,
): ArchiveRecord[] {
  const needle = query.query.trim().toLowerCase();
  const filtered = items.filter((item) => {
    const title = workspaceTitle(item, untitled);
    if (query.workspace !== "ALL" && archiveWorkspaceKey(item) !== query.workspace) return false;
    if (needle === "") return true;
    return item.title.toLowerCase().includes(needle) || title.toLowerCase().includes(needle);
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
): Array<{ key: string; title: string; items: ArchiveRecord[] }> {
  const groups = new Map<string, { title: string; items: ArchiveRecord[] }>();
  for (const item of items) {
    const key = archiveWorkspaceKey(item);
    const group = groups.get(key) ?? { title: workspaceTitle(item, untitled), items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => ({ key, ...group }));
}

export function workspaceOptions(
  items: readonly ArchiveRecord[],
  untitled: string,
): Array<{ key: string; title: string; label: string }> {
  const groups = groupArchives(items, untitled);
  const counts = new Map<string, number>();
  for (const group of groups) counts.set(group.title, (counts.get(group.title) ?? 0) + 1);
  const positions = new Map<string, number>();
  return groups.map(({ key, title }) => {
    const position = (positions.get(title) ?? 0) + 1;
    positions.set(title, position);
    const count = counts.get(title) ?? 1;
    return { key, title, label: count === 1 ? title : `${title} (${String(position)}/${String(count)})` };
  });
}
