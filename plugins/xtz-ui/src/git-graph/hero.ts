/** Gap between official hero chips (WorkspaceChip / AgentPresetSeat). */
export const HERO_CHIP_GAP = 2;

/** Right edge of the rightmost painted descendant of `root`, excluding `root`. */
export function paintedRight(root: Element): number | null {
  let right: number | null = null;
  const visit = (node: Element): void => {
    if (node !== root) {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        right = right === null ? rect.right : Math.max(right, rect.right);
      }
    }
    for (const child of node.children) visit(child);
  };
  visit(root);
  return right;
}

export function heroOffset(
  stack: { left: number; top: number },
  row: { top: number; height: number },
  anchor: { height: number },
  right: number,
): { left: number; top: number } {
  return {
    left: Math.max(0, right - stack.left + HERO_CHIP_GAP),
    top: Math.max(0, row.top - stack.top + (row.height - anchor.height) / 2),
  };
}

/** Viewport coordinates so the chip can `position: fixed` after the mode seat. */
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

export const GIT_GRAPH_CHIP_ANCHOR = "[data-gitgraph-chip-anchor]";
export const SMART_UX_ROOT = "[data-dsh-providers-smart-ux]";

/** Official Workspace / mode seats — not the composer card or our dock chips. */
export function looksLikeHeroChipRow(el: Element): boolean {
  if (el.matches("[data-composer-card]")) return false;
  if (el.matches(GIT_GRAPH_CHIP_ANCHOR) || el.querySelector(GIT_GRAPH_CHIP_ANCHOR) !== null) {
    return false;
  }
  if (el.querySelector(SMART_UX_ROOT) !== null) return false;
  return el.querySelectorAll("button").length >= 1;
}

/**
 * Official hero chips may sit before or after the dock. Prefer a sibling that
 * actually looks like WorkspaceChip / AgentPresetSeat; fall back to the
 * previous sibling so a missing row still has a measured home.
 */
export function heroContext(anchor: HTMLElement): { stack: Element; heroRow: Element } | undefined {
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
