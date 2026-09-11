/** Same gap as xtz-ui GitGraphChip / official WorkspaceChip. */
export const HERO_CHIP_GAP = 2;
export const GIT_GRAPH_CHIP_ANCHOR = "[data-gitgraph-chip-anchor]";
export const SMART_UX_ROOT = "[data-dsh-providers-smart-ux]";

export function isHeroPhase(node: { closest(selectors: string): unknown }): boolean {
  return node.closest("[data-phase=hero]") !== null;
}

export function paintedRight(root: Element): number | null {
  let right: number | null = null;
  const visit = (node: Element): void => {
    if (node !== root) {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        right = right === null ? rect.right : Math.max(right, rect.right);
      }
    }
    for (const child of Array.from(node.children)) visit(child);
  };
  visit(root);
  return right;
}

export function heroViewport(
  row: { top: number; height: number },
  anchorHeight: number,
  right: number,
): { left: number; top: number } {
  return {
    left: right + HERO_CHIP_GAP,
    top: row.top + (row.height - anchorHeight) / 2,
  };
}

export function looksLikeHeroChipRow(el: Element): boolean {
  if (el.matches("[data-composer-card]")) return false;
  if (el.matches(GIT_GRAPH_CHIP_ANCHOR) || el.querySelector(GIT_GRAPH_CHIP_ANCHOR) !== null) {
    return false;
  }
  if (el.querySelector(SMART_UX_ROOT) !== null) return false;
  return el.querySelectorAll("button").length >= 1;
}

export function findHeroChipRow(anchor: HTMLElement): { stack: Element; heroRow: Element } | undefined {
  const parent = anchor.parentElement;
  if (parent === null) return undefined;
  const seen = new Set<Element>();
  const candidates: Element[] = [];
  const push = (el: Element | null): void => {
    if (el === null || seen.has(el)) return;
    seen.add(el);
    candidates.push(el);
  };
  push(anchor.previousElementSibling);
  push(anchor.nextElementSibling);
  const stack = parent.parentElement;
  if (stack !== null) {
    for (const child of Array.from(stack.children)) {
      if (child !== parent) push(child);
    }
  }
  for (const el of candidates) {
    if (!looksLikeHeroChipRow(el)) continue;
    const home = el.parentElement;
    if (home === null) continue;
    return { stack: home, heroRow: el };
  }
  const prev = anchor.previousElementSibling;
  if (prev !== null) return { stack: parent, heroRow: prev };
  const heroRow = parent.previousElementSibling;
  if (stack === null || heroRow === null) return undefined;
  return { stack, heroRow };
}

/** True when a plugin chip is actually sitting on the hero row, not an unplaced fixed ghost. */
export function isPlacedHeroChip(el: Element): boolean {
  if (el.classList.contains("is-placed") === false) return false;
  if (typeof getComputedStyle === "function") {
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function placedChipBox(el: Element): { left: number; right: number } | undefined {
  if (!isPlacedHeroChip(el)) return undefined;
  const rect = el.getBoundingClientRect();
  return { left: rect.left, right: rect.right };
}

/** Right edge of the official row plus any already-placed git chip. */
export function heroTrailRight(heroRow: Element, extras: readonly Element[]): number | null {
  let right = paintedRight(heroRow);
  for (const extra of extras) {
    const box = placedChipBox(extra);
    if (box === undefined) continue;
    right = right === null ? box.right : Math.max(right, box.right);
  }
  return right;
}

/** If `left` overlaps a blocker, sit just after the rightmost overlapping chip. */
export function nudgePastOverlap(
  left: number,
  width: number,
  blockers: readonly { left: number; right: number }[],
  gap: number = HERO_CHIP_GAP,
): number {
  let next = left;
  const ordered = [...blockers].sort((a, b) => a.left - b.left);
  for (const box of ordered) {
    if (next + width <= box.left + 0.5) continue;
    if (next >= box.right - 0.5) continue;
    next = box.right + gap;
  }
  return next;
}
