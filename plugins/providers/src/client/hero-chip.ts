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
  const card = anchor.closest("[data-composer-card]");
  if (card?.parentElement) {
    const heroRow = Array.from(card.parentElement.children).find(looksLikeHeroChipRow);
    if (heroRow) return { stack: card.parentElement, heroRow };
  }
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

/** Position only our owned historical node; never relocate or style a Host cell. */
export function positionHeroChip(node: HTMLElement): () => void {
  const context = findHeroChipRow(node);
  const win = node.ownerDocument.defaultView;
  if (context === undefined || win === null || !isHeroPhase(node)) return () => {};
  const hero = node.closest("[data-phase=hero]")!;
  node.classList.add("is-hero");
  const place = (): void => {
    const row = context.heroRow.getBoundingClientRect();
    const self = node.getBoundingClientRect();
    const git = hero.querySelector(GIT_GRAPH_CHIP_ANCHOR);
    const right = heroTrailRight(context.heroRow, git ? [git] : []);
    if (row.width <= 0 || self.width <= 0 || right === null) return;
    const next = heroViewport(row, self.height, right);
    const left = `${next.left}px`;
    const top = `${next.top}px`;
    if (node.style.left !== left) node.style.left = left;
    if (node.style.top !== top) node.style.top = top;
    if (!node.classList.contains("is-placed")) node.classList.add("is-placed");
  };
  const resize = new ResizeObserver(place);
  resize.observe(node);
  resize.observe(context.heroRow);
  const movement = new MutationObserver((records) => {
    if (records.some((record) => !node.contains(record.target))) place();
  });
  // Git can mount or position itself after this contribution.
  movement.observe(hero, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class"] });
  win.addEventListener("resize", place);
  win.addEventListener("scroll", place, true);
  place();
  return () => {
    resize.disconnect();
    movement.disconnect();
    win.removeEventListener("resize", place);
    win.removeEventListener("scroll", place, true);
    node.classList.remove("is-hero", "is-placed");
    node.style.removeProperty("left");
    node.style.removeProperty("top");
  };
}

/** Right edge of the official row plus any already-placed git chip. */
export function heroTrailRight(heroRow: Element, extras: readonly Element[]): number | null {
  let right = paintedRight(heroRow);
  for (const extra of extras) {
    const rect = extra.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    right = right === null ? rect.right : Math.max(right, rect.right);
  }
  return right;
}
