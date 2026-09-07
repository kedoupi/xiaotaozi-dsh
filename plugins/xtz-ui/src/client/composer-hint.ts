/**
 * Host InputBar historically painted the empty-session hint as
 * `textarea::placeholder` on an absolute, transparent-fill field. Chromium
 * then drops the 4/12/0/16 padding that `.input` / `.mirror` / `.backdrop`
 * share (figma InputText 34:10434), so “描述你想要构建的内容” sits flush
 * with the card while the toolbar keeps `padding: 2px 8px 6px`.
 *
 * DSH 0.1.2 also ships a contenteditable composer. Official later moved the
 * hint to a positioned overlay. We do the same against stable host
 * attributes — hashed CSS-module names are off limits — and keep a
 * textarea path for the older surface.
 *
 * Scope is the blank-session homepage only (`[data-phase=hero]`). The
 * overlay is a padding-box twin of the host draft layers (`inset: 0` +
 * the shared pad), not an inset conversion, so it stays on the grow
 * containing block the same way sticky-prompt anchors to the scroller.
 */

export const COMPOSER_HINT_ATTR = "data-dsh-xtz-ui-composer-hint";
export const COMPOSER_CARD_SELECTOR = "[data-composer-card]";
export const COMPOSER_TEXTAREA_SELECTOR = "textarea[data-phase]";
/** 0.1.2 contenteditable composer (A1-28). */
export const COMPOSER_EDITABLE_SELECTOR = "[contenteditable][data-phase], [contenteditable][data-input-scroll] [contenteditable]";
/** ConversationRoot phase for the empty-session homepage InputBar. */
export const COMPOSER_HERO_PHASE_SELECTOR = "[data-phase=hero]";

/** Same padding as rc.2 `.input, .mirror, .backdrop { padding: 4px 12px 0 16px }`. */
export const COMPOSER_HINT_PADDING = {
  top: "4px",
  right: "12px",
  bottom: "0",
  left: "16px",
} as const;

/** Top/right/left slice of {@link COMPOSER_HINT_PADDING} (no bottom). */
export const COMPOSER_HINT_INSET = {
  top: COMPOSER_HINT_PADDING.top,
  right: COMPOSER_HINT_PADDING.right,
  left: COMPOSER_HINT_PADDING.left,
} as const;

/** Empty draft shows the host placeholder; any typed value hides it. */
export function composerHintCopy(draft: string, placeholder: string): string {
  return draft === "" ? placeholder : "";
}

/** Homepage hero card only — compact conversation composers stay on host chrome. */
export function composerHintIsHeroCard(card: { closest(selectors: string): unknown }): boolean {
  return card.closest(COMPOSER_HERO_PHASE_SELECTOR) != null;
}

/** True when the node is our overlay (or its text). Observer must ignore these. */
export function isOwnComposerHintNode(node: Node | null): boolean {
  if (node == null) return false;
  const el = typeof (node as Element).closest === "function"
    ? node as Element
    : node.parentElement;
  return el?.closest(`[${COMPOSER_HINT_ATTR}]`) != null;
}

/** Skip DOM writes that would re-enter the MutationObserver. */
export function composerHintShouldWrite(existing: HTMLElement | null, text: string): boolean {
  if (text === "") return existing != null;
  return existing === null || existing.textContent !== text;
}

export function syncComposerHint(root: ParentNode): void {
  for (const card of root.querySelectorAll(COMPOSER_CARD_SELECTOR)) applyCard(card);
}

function composerDraft(card: Element): { grow: Element; draft: string; placeholder: string } | undefined {
  const textarea = card.querySelector<HTMLTextAreaElement>(`:scope ${COMPOSER_TEXTAREA_SELECTOR}`);
  if (textarea !== null && textarea.parentElement !== null) {
    return { grow: textarea.parentElement, draft: textarea.value, placeholder: textarea.placeholder };
  }
  const editable = card.querySelector<HTMLElement>(`:scope ${COMPOSER_EDITABLE_SELECTOR}`);
  if (editable === null || !editable.isContentEditable || editable.parentElement === null) return undefined;
  const placeholder = editable.getAttribute("data-placeholder")
    ?? editable.getAttribute("aria-placeholder")
    ?? "";
  return { grow: editable.parentElement, draft: editable.textContent ?? "", placeholder };
}

function applyCard(card: Element): void {
  const surface = composerDraft(card);
  if (surface === undefined) return;
  const existing = surface.grow.querySelector<HTMLElement>(`:scope > [${COMPOSER_HINT_ATTR}]`);
  if (!composerHintIsHeroCard(card)) {
    existing?.remove();
    return;
  }
  const text = composerHintCopy(surface.draft, surface.placeholder);
  if (!composerHintShouldWrite(existing, text)) return;
  if (text === "") {
    existing?.remove();
    return;
  }
  const hint = existing ?? surface.grow.appendChild(surface.grow.ownerDocument.createElement("div"));
  hint.setAttribute(COMPOSER_HINT_ATTR, "");
  hint.setAttribute("aria-hidden", "true");
  hint.textContent = text;
}
