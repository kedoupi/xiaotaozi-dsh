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

/** Hero row is the previous sibling of the dock outlet (or of the chip if the outlet is display:contents). */
export function heroContext(anchor: HTMLElement): { stack: Element; heroRow: Element } | undefined {
  const parent = anchor.parentElement;
  if (parent === null) return undefined;
  const prev = anchor.previousElementSibling;
  if (prev !== null) return { stack: parent, heroRow: prev };
  const stack = parent.parentElement;
  const heroRow = parent.previousElementSibling;
  if (stack === null || heroRow === null) return undefined;
  return { stack, heroRow };
}
