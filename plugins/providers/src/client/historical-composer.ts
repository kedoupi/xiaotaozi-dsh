import { positionHeroChip } from "./hero-chip.ts";

/** RC1 DOM compatibility only: remove when Host offers a no-session content seat. */
export const HISTORICAL_COMPOSER_ATTR =
  "data-dsh-providers-historical-composer";
const CARD = "[data-composer-card]";

/** Owns one node, never a Host cell, sibling, style or class. Ambiguity fails closed. */
export function mountHistoricalComposer(
  doc: Document,
  text: string,
): () => void {
  const node = doc.createElement("div");
  node.setAttribute(HISTORICAL_COMPOSER_ATTR, "");
  node.className = "dshM-smartUx";
  const chip = node.appendChild(doc.createElement("p"));
  chip.className = "dshM-turnModel";
  chip.setAttribute("data-dsh-providers-turn-model", "1");
  chip.textContent = text;
  chip.setAttribute("aria-label", text);
  let disposed = false;
  let queued = false;
  let disposePlacement: (() => void) | undefined;
  const sync = (): void => {
    if (disposed) return;
    const cards = doc.querySelectorAll(CARD);
    const card = cards.length === 1 ? cards[0] : undefined;
    if (card === undefined || card.closest('[data-phase="hero"]') === null) {
      disposePlacement?.();
      disposePlacement = undefined;
      node.remove();
      return;
    }
    if (node.parentElement !== card) {
      disposePlacement?.();
      card.prepend(node);
      disposePlacement = positionHeroChip(node);
    }
  };
  const own = (target: Node): boolean =>
    target === node || node.contains(target);
  const observer = new MutationObserver((records) => {
    const relevant = records.some((record) => {
      if (own(record.target)) return false;
      if (record.type === "attributes") return true;
      return Array.from(record.addedNodes)
        .concat(Array.from(record.removedNodes))
        .some((changed) => {
          if (own(changed)) return false;
          if (changed.nodeType !== 1) return false;
          const element = changed as Element;
          return element.matches(CARD) || element.querySelector(CARD) !== null;
        });
    });
    if (!relevant || queued || disposed) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      sync();
    });
  });
  observer.observe(doc.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-composer-card", "data-phase"],
  });
  sync();
  return () => {
    disposed = true;
    observer.disconnect();
    disposePlacement?.();
    node.remove();
  };
}
