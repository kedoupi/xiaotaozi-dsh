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
  color: var(--dsw-alias-label-secondary, #646a73);
  pointer-events: none;
  user-select: none;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  font: inherit;
  line-height: inherit;
  z-index: 1;
}

${COMPOSER_HERO_PHASE_SELECTOR} [data-composer-card] textarea[data-phase] {
  caret-color: var(--dsw-alias-button-info-fill, #B94305);
}

/* Legacy textarea only, and only while our sibling fallback actually exists. */
${COMPOSER_HERO_PHASE_SELECTOR} [data-composer-card] textarea[data-phase]:has(~ [${COMPOSER_HINT_ATTR}])::placeholder {
  color: transparent !important;
  -webkit-text-fill-color: transparent !important;
  opacity: 0;
}
`;
