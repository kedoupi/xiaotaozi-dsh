import { COMPOSER_HINT_ATTR, COMPOSER_HINT_INSET } from "./composer-hint.ts";

/** Host chrome: align the empty composer hint with the draft column. */
export const composerHintCss = `
[${COMPOSER_HINT_ATTR}] {
  position: absolute;
  inset: ${COMPOSER_HINT_INSET.top} ${COMPOSER_HINT_INSET.right} auto ${COMPOSER_HINT_INSET.left};
  color: var(--dsw-alias-label-caption, #81858c);
  pointer-events: none;
  user-select: none;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  font: inherit;
  line-height: inherit;
}

/* First paint / no overlay yet: ask the engine to honor the shared pad. */
[data-composer-card] textarea[data-phase]::placeholder {
  padding: ${COMPOSER_HINT_INSET.top} ${COMPOSER_HINT_INSET.right} 0 ${COMPOSER_HINT_INSET.left};
  line-height: inherit;
}

/* Overlay present: hide the native ghost so the hint is not painted twice. */
[data-composer-card]:has([${COMPOSER_HINT_ATTR}]) textarea[data-phase]::placeholder {
  color: transparent !important;
  -webkit-text-fill-color: transparent !important;
  opacity: 0;
}
`;
