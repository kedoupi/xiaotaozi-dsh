export interface GraphCommit {
  oid: string;
  parents: string[];
  subject: string;
  author: string;
  authorTime: number;
  refs: string[];
}

export interface BranchRow {
  name: string;
  current: boolean;
}

export type LaneGlyph = "node" | "merge" | "pass" | "gap";

export interface GraphRowLanes {
  columns: LaneGlyph[];
  nodeColumn: number;
  merge: boolean;
}

export function parseDecoration(decoration: string): string[] {
  if (decoration === "") return [];
  return decoration.split(", ").map((part) => {
    if (part === "HEAD") return "";
    return part.replace(/^HEAD -> /u, "").replace(/^tag: /u, "").trim();
  }).filter((name) => name !== "");
}

export function parseGraph(stdout: string): GraphCommit[] {
  const commits: GraphCommit[] = [];
  for (const raw of stdout.split("\u001e")) {
    const entry = raw.replace(/^\n/u, "");
    if (entry === "") continue;
    const [oid, parentsRaw, author, authorTimeRaw, decoration, subject] = entry.split("\u0000");
    if (oid === undefined || oid === "") continue;
    commits.push({
      oid,
      parents: parentsRaw === undefined || parentsRaw === "" ? [] : parentsRaw.split(" "),
      subject: subject ?? "",
      author: author ?? "",
      authorTime: Number(authorTimeRaw ?? "0"),
      refs: parseDecoration(decoration ?? ""),
    });
  }
  return commits;
}

export function parseBranches(stdout: string): BranchRow[] {
  const rows: BranchRow[] = [];
  for (const line of stdout.split("\n")) {
    if (line === "") continue;
    const [name, head] = line.split("\u0000");
    if (name === undefined || name === "") continue;
    rows.push({ name, current: head === "*" });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

export function parsePorcelain(stdout: string): { dirtyFiles: number; untrackedFiles: number; conflicts: number } {
  let dirtyFiles = 0;
  let untrackedFiles = 0;
  let conflicts = 0;
  const unmerged = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);
  for (const line of stdout.split("\n")) {
    if (line === "") continue;
    const xy = line.slice(0, 2);
    if (unmerged.has(xy)) conflicts += 1;
    else if (xy.startsWith("??")) untrackedFiles += 1;
    else dirtyFiles += 1;
  }
  return { dirtyFiles, untrackedFiles, conflicts };
}

/** Topo-order lane assignment. Later rows are ancestors. */
export function computeLanes(rows: readonly GraphCommit[]): GraphRowLanes[] {
  const later = new Set<string>();
  for (const row of rows) {
    for (const parent of row.parents) later.add(parent);
  }
  const lanes: Array<string | null> = [];
  const result: GraphRowLanes[] = [];
  for (const row of rows) {
    let nodeColumn = lanes.findIndex((pending) => pending === row.oid);
    if (nodeColumn === -1) {
      lanes.push(row.oid);
      nodeColumn = lanes.length - 1;
    }
    const columns: LaneGlyph[] = [];
    for (let i = 0; i < lanes.length; i += 1) {
      const pending = lanes[i];
      if (pending === null) columns.push("gap");
      else if (i === nodeColumn) columns.push(row.parents.length > 1 ? "merge" : "node");
      else if (pending === row.oid) columns.push("gap");
      else if (typeof pending === "string" && later.has(pending)) columns.push("pass");
      else columns.push("gap");
    }
    const parents = row.parents.filter((parent) => later.has(parent));
    const [first, ...rest] = parents;
    for (let i = 0; i < lanes.length; i += 1) {
      if (lanes[i] === row.oid && i !== nodeColumn) lanes[i] = null;
    }
    lanes[nodeColumn] = first ?? null;
    for (const parent of rest) {
      if (!lanes.includes(parent)) lanes.push(parent);
    }
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();
    result.push({ columns, nodeColumn, merge: row.parents.length > 1 });
  }
  return result;
}

export function glyphChar(glyph: LaneGlyph): string {
  if (glyph === "node") return "●";
  if (glyph === "merge") return "◆";
  if (glyph === "pass") return "│";
  return " ";
}

/** Column pitch of the SVG commit tree (matches Git Graph / git-graph-svg). */
export const GRAPH_COL_W = 16;
/** Row height of one commit row; the SVG and the text list share this. */
export const GRAPH_ROW_H = 40;

export interface GraphNode {
  row: number;
  col: number;
  merge: boolean;
}

export interface GraphEdge {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  laneCount: number;
}

/**
 * Parent-pointer layout on top of {@link computeLanes}. Each commit is a
 * node; each parent is a bezier/straight edge into a later (older) row.
 */
export function layoutGraph(rows: readonly GraphCommit[]): GraphLayout {
  const lanes = computeLanes(rows);
  const indexByOid = new Map<string, number>();
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (row !== undefined) indexByOid.set(row.oid, i);
  }
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let laneCount = 1;
  for (let i = 0; i < rows.length; i += 1) {
    const lane = lanes[i];
    const commit = rows[i];
    if (lane === undefined || commit === undefined) continue;
    laneCount = Math.max(laneCount, lane.columns.length, lane.nodeColumn + 1);
    nodes.push({ row: i, col: lane.nodeColumn, merge: lane.merge });
    for (const parent of commit.parents) {
      const toRow = indexByOid.get(parent);
      if (toRow === undefined) continue;
      const toLane = lanes[toRow];
      if (toLane === undefined) continue;
      edges.push({ fromRow: i, fromCol: lane.nodeColumn, toRow, toCol: toLane.nodeColumn });
    }
  }
  return { nodes, edges, laneCount };
}

/** Git-style elbow: stay in the child column, then a short corner into the parent. */
export function graphPath(edge: GraphEdge, colW: number, rowH: number): string {
  const x1 = (edge.fromCol + 0.5) * colW;
  const y1 = (edge.fromRow + 0.5) * rowH;
  const x2 = (edge.toCol + 0.5) * colW;
  const y2 = (edge.toRow + 0.5) * rowH;
  if (x1 === x2) return `M ${String(x1)} ${String(y1)} L ${String(x2)} ${String(y2)}`;
  const dir = x2 > x1 ? 1 : -1;
  const radius = Math.min(colW, rowH * 0.45, Math.abs(x2 - x1));
  const yCorner = y2 - radius;
  const xCorner = x1 + dir * radius;
  return `M ${String(x1)} ${String(y1)} L ${String(x1)} ${String(yCorner)} Q ${String(x1)} ${String(y2)} ${String(xCorner)} ${String(y2)} L ${String(x2)} ${String(y2)}`;
}

/** Short-name rules mirroring git check-ref-format --branch (host still verifies). */
export function invalidBranchReason(name: string): string | undefined {
  const trimmed = name.trim();
  if (trimmed === "" || trimmed.length > 200) return "empty";
  if (trimmed.startsWith(".") || trimmed.endsWith(".") || trimmed.endsWith(".lock")) return "format";
  if (trimmed.startsWith("-") || trimmed.includes("..") || trimmed.includes("//")) return "format";
  if (/[\s~^:?*[\\]/.test(trimmed) || trimmed.includes("@{")) return "format";
  return undefined;
}
