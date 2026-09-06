import { coalesce } from "./hide-official.ts";
import {
  COMPOSER_CARD_SELECTOR,
  COMPOSER_HINT_ATTR,
  COMPOSER_TEXTAREA_SELECTOR,
  syncComposerHint,
} from "./composer-hint.ts";

function touchesComposer(record: MutationRecord): boolean {
  const target = record.target instanceof Element ? record.target : record.target.parentElement;
  if (target?.closest(`${COMPOSER_CARD_SELECTOR}, [${COMPOSER_HINT_ATTR}]`) != null) return true;
  for (const node of Array.from(record.addedNodes).concat(Array.from(record.removedNodes))) {
    if (!(node instanceof Element)) continue;
    if (node.matches(`${COMPOSER_CARD_SELECTOR}, ${COMPOSER_TEXTAREA_SELECTOR}, [${COMPOSER_HINT_ATTR}]`)) return true;
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
    if (records.some(touchesComposer)) refresh();
  });
  syncComposerHint(doc);
  doc.addEventListener("input", onDraft, true);
  observer.observe(doc.body, { childList: true, subtree: true, characterData: true });
  return () => {
    observer.disconnect();
    doc.removeEventListener("input", onDraft, true);
    for (const hint of Array.from(doc.querySelectorAll(`[${COMPOSER_HINT_ATTR}]`))) hint.remove();
  };
}
