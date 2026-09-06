/**
 * Host InputBar (dsh 0.1.1-rc.2) paints the empty-session hint as
 * `textarea::placeholder` on an absolute, transparent-fill field. Chromium
 * then drops the 4/12/0/16 padding that `.input` / `.mirror` / `.backdrop`
 * share (figma InputText 34:10434), so “描述你想要构建的内容” sits flush
 * with the card while the toolbar keeps `padding: 2px 8px 6px`.
 *
 * Official later moved the hint to a positioned overlay. We do the same
 * against stable host attributes — hashed CSS-module names are off limits.
 */

export const COMPOSER_HINT_ATTR = "data-dsh-xtz-ui-composer-hint";
export const COMPOSER_CARD_SELECTOR = "[data-composer-card]";
export const COMPOSER_TEXTAREA_SELECTOR = "textarea[data-phase]";

/** Same inset as rc.2 `.input, .mirror, .backdrop { padding: 4px 12px 0 16px }`. */
export const COMPOSER_HINT_INSET = {
  top: "4px",
  right: "12px",
  left: "16px",
} as const;

/** Empty draft shows the host placeholder; any typed value hides it. */
export function composerHintCopy(draft: string, placeholder: string): string {
  return draft === "" ? placeholder : "";
}

export function syncComposerHint(root: ParentNode): void {
  for (const card of root.querySelectorAll(COMPOSER_CARD_SELECTOR)) applyCard(card);
}

function applyCard(card: Element): void {
  const textarea = card.querySelector<HTMLTextAreaElement>(`:scope ${COMPOSER_TEXTAREA_SELECTOR}`);
  const grow = textarea?.parentElement;
  if (textarea === null || grow === null) return;
  const existing = grow.querySelector<HTMLElement>(`:scope > [${COMPOSER_HINT_ATTR}]`);
  const text = composerHintCopy(textarea.value, textarea.placeholder);
  if (text === "") {
    existing?.remove();
    return;
  }
  const hint = existing ?? grow.appendChild(grow.ownerDocument.createElement("div"));
  hint.setAttribute(COMPOSER_HINT_ATTR, "");
  hint.setAttribute("aria-hidden", "true");
  hint.textContent = text;
}
