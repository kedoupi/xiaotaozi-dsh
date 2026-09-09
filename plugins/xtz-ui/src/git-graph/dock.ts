/**
 * Host paints `conversation.input.dock` as a sibling *before* the composer
 * card. Compact sessions keep the git chip on that card edge (same idea as
 * providers smart-ux). Blank hero still uses fixed placement onto the
 * official Workspace / mode row.
 */

export function pickComposerCardFromChildren<T extends { contains?(other: T): boolean }>(
  children: readonly T[],
  dockRow: T,
): T | undefined {
  const last = children.at(-1);
  if (last === undefined || last === dockRow) return undefined;
  if (dockRow.contains?.(last) === true || last.contains?.(dockRow) === true) return undefined;
  return last;
}

export function findComposerStack(hostCell: Element): { stack: Element; dockRow: Element } | undefined {
  let row: Element = hostCell;
  let parent = hostCell.parentElement;
  while (parent !== null) {
    if (parent.hasAttribute("data-composer-seat")) return undefined;
    if (parent.childElementCount >= 2) {
      const kids = Array.from(parent.children);
      const index = kids.indexOf(row);
      if (index >= 0 && index < kids.length - 1) {
        return { stack: parent, dockRow: row };
      }
    }
    row = parent;
    parent = parent.parentElement;
  }
  return undefined;
}

export function pickComposerCard(stack: Element, dockRow: Element): Element | undefined {
  return pickComposerCardFromChildren(Array.from(stack.children), dockRow);
}

/** Move the dock host cell to the top of the composer card. Restores on dispose. */
export function attachDockToComposerCard(root: HTMLElement): () => void {
  const hostCell = root.parentElement;
  if (hostCell === null) return () => {};
  const found = findComposerStack(hostCell);
  if (found === undefined) return () => {};
  const card = pickComposerCard(found.stack, found.dockRow);
  if (card === undefined || hostCell.parentElement === card) return () => {};
  const home = hostCell.parentNode;
  if (home === null) return () => {};
  const marker = hostCell.ownerDocument.createComment("dsh-xtz-ui-gitgraph-dock");
  home.insertBefore(marker, hostCell);
  card.insertBefore(hostCell, card.firstChild);
  return () => {
    if (marker.parentNode !== null) {
      marker.parentNode.insertBefore(hostCell, marker);
      marker.remove();
    }
  };
}
