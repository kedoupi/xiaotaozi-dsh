import {
  COMPOSER_HERO_PHASE_SELECTOR,
  COMPOSER_HINT_ATTR,
  COMPOSER_HINT_PADDING,
} from "./composer-hint.ts";

/** Host chrome: padding-box twin of the hero draft column. */
export const composerHintCss = `
${COMPOSER_HERO_PHASE_SELECTOR} [${COMPOSER_HINT_ATTR}] {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  width: 100%;
  padding: ${COMPOSER_HINT_PADDING.top} ${COMPOSER_HINT_PADDING.right} ${COMPOSER_HINT_PADDING.bottom} ${COMPOSER_HINT_PADDING.left};
  color: var(--dsw-alias-label-caption, #81858c);
  pointer-events: none;
  user-select: none;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  font: inherit;
  line-height: inherit;
  z-index: 1;
}

/* Hero only: never paint the native ghost (Chromium drops its pad). */
${COMPOSER_HERO_PHASE_SELECTOR} [data-composer-card] textarea[data-phase]::placeholder {
  color: transparent !important;
  -webkit-text-fill-color: transparent !important;
  opacity: 0;
}
`;
