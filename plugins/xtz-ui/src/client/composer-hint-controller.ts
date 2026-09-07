import { coalesce } from "./hide-official.ts";
import {
  COMPOSER_CARD_SELECTOR,
  COMPOSER_HINT_ATTR,
  COMPOSER_TEXTAREA_SELECTOR,
  isOwnComposerHintNode,
  syncComposerHint,
} from "./composer-hint.ts";

export function mutationTouchesComposer(record: MutationRecord): boolean {
  if (isOwnComposerHintNode(record.target)) return false;
  const target = record.target instanceof Element ? record.target : record.target.parentElement;
  if (isOwnComposerHintNode(target)) return false;
  if (target?.closest(COMPOSER_CARD_SELECTOR) != null) return true;
  for (const node of Array.from(record.addedNodes).concat(Array.from(record.removedNodes))) {
    if (isOwnComposerHintNode(node)) continue;
    if (!(node instanceof Element)) continue;
    if (node.matches(`${COMPOSER_CARD_SELECTOR}, ${COMPOSER_TEXTAREA_SELECTOR}`)) return true;
    if (node.querySelector(`${COMPOSER_CARD_SELECTOR}, ${COMPOSER_TEXTAREA_SELECTOR}`) != null) return true;
  }
  return false;
}

function isComposerTextarea(target: EventTarget | null): target is HTMLTextAreaElement {
  return target instanceof HTMLTextAreaElement && target.closest(COMPOSER_CARD_SELECTOR) != null;
}

/** Keep one overlay hint per host InputBar card, aligned to the draft inset. */
export function installComposerHint(doc: Document = document): () => void {
  const refresh = coalesce(() => {
    syncComposerHint(doc);
  });
  const onDraft = (event: Event): void => {
    if (isComposerTextarea(event.target)) refresh();
  };
  const observer = new MutationObserver((records) => {
    if (records.some(mutationTouchesComposer)) refresh();
  });
  syncComposerHint(doc);
  doc.addEventListener("input", onDraft, true);
  const root = doc.body;
  if (root != null) observer.observe(root, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    doc.removeEventListener("input", onDraft, true);
    for (const hint of Array.from(doc.querySelectorAll(`[${COMPOSER_HINT_ATTR}]`))) hint.remove();
  };
}
