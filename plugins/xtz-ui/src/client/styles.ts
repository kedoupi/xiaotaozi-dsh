export const css = `
/* Brand shape + motion broadcast (colors with light/dark pairs live in
   peach.ts via theme.overrideTokens). Spec: docs/brand.zh.md §2.2 / §2.4. */
:root {
  --xtz-radius-s: 8px;
  --xtz-radius-m: 12px;
  --xtz-radius-l: 16px;
  --xtz-radius-pill: 999px;
  --xtz-dur-fast: 120ms;
  --xtz-dur-base: 200ms;
  --xtz-ease-out: cubic-bezier(.2,.8,.2,1);
}
::selection {
  background: color-mix(in srgb, var(--dsw-xtz-brand-display, #FC8940) 28%, transparent);
  color: var(--dsw-alias-label-primary, #111827);
}
.dshH-native { position: fixed; inset: 0; margin: 0; padding: 0; border: 0; width: 100%; height: 100%; max-width: none; max-height: none; background: transparent; color: inherit; }
.dshH-native::backdrop { background: transparent; }
.dshH-overlay {
  --dshH-text: var(--dsw-alias-label-primary, #111827);
  --dshH-muted: var(--dsw-alias-label-secondary, #475569);
  --dshH-surface: var(--dsw-alias-bg-layer-1, #fff);
  --dshH-accent: var(--dsw-alias-button-info-fill, #B94305);
  --dshH-accent-hover: var(--dsw-alias-button-info-hover, #9F3703);
  --dshH-peach: var(--dsw-alias-state-business-primary, #B94305);
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: color-mix(in srgb, var(--dshH-text) 36%, transparent);
}
.dshH-mask { position: absolute; inset: 0; }
.dshH-card {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
  width: min(400px, 100%);
  padding: 28px 24px 22px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.1));
  border-radius: 24px;
  background: var(--dshH-surface);
  box-shadow: var(--dsw-shadow-lv3, 0 16px 40px rgba(15, 23, 42, 0.16));
  text-align: center;
  color: var(--dshH-text);
}
.dshH-mark {
  width: 88px;
  height: 88px;
  margin-bottom: 16px;
  border-radius: 24px;
}
.dshH-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
}
.dshH-body {
  margin: 10px 0 0;
  color: var(--dshH-muted);
  font-size: 14px;
  line-height: 1.6;
}
.dshH-actions { width: 100%; margin-top: 22px; }
.dshH-confirm {
  width: 100%;
  min-height: 40px;
  padding: 8px 14px;
  border: 0;
  border-radius: var(--xtz-radius-pill, 999px);
  background: var(--dshH-accent);
  color: #fff;
  font: inherit;
  font-size: 14px;
  font-weight: 650;
  cursor: pointer;
  transition: background-color var(--xtz-dur-fast, 120ms) var(--xtz-ease-out), transform var(--xtz-dur-fast, 120ms) var(--xtz-ease-out);
}
.dshH-confirm:hover { background: var(--dshH-accent-hover); }
.dshH-confirm:active { background: var(--dsw-static-deepseek-800, #7C2C00); transform: scale(0.99); }
.dshH-confirm:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #B94305);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .dshH-confirm, .dshH-confirm:active { transition: none; transform: none; }
}
.dshH-settings {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 560px;
  padding: 8px 4px 24px;
  color: var(--dsw-alias-label-primary, #111827);
}
.dshH-settingsTitle {
  margin: 0 0 4px;
  font-size: 18px;
  font-weight: 600;
}
.dshH-settingsLede {
  margin: 0 0 16px;
  color: var(--dsw-alias-label-secondary, #475569);
  font-size: 13px;
  line-height: 1.5;
}
.dshH-settingsStatus {
  min-height: 18px;
  margin: -8px 0 4px;
  color: var(--dsw-alias-label-secondary, #475569);
  font-size: 12px;
  line-height: 1.5;
}
.dshH-settingsError {
  margin: 0 0 12px;
  color: var(--dsw-xtz-status-error-ink, #b42318);
  font-size: 13px;
}
.dshH-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.08));
}
.dshH-rowCopy { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dshH-rowLabel {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
}
.dshH-rowHint,
.dshH-rowReason {
  color: var(--dsw-alias-label-secondary, #475569);
  font-size: 12px;
  line-height: 1.4;
}
.dshH-rowState {
  color: var(--dsw-alias-label-primary, #111827);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
}
.dshH-rowState[data-state="disabled"] { color: var(--dsw-alias-label-secondary, #475569); }
.dshH-rowControls { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.dshH-rowAction {
  min-height: 32px;
  padding: 5px 10px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.1));
  border-radius: var(--xtz-radius-s, 8px);
  background: transparent;
  color: var(--dsw-alias-label-primary, #111827);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dshH-rowAction:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.06)); }
.dshH-rowAction:disabled { opacity: 0.45; cursor: default; }
.dshH-rowAction:focus-visible { outline: 2px solid var(--dsw-alias-border-l4, currentColor); outline-offset: 2px; }
.dshH-switch {
  flex-shrink: 0;
  width: 44px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  position: relative;
}
.dshH-switch::before {
  content: "";
  position: absolute;
  top: 7px;
  left: 2px;
  width: 40px;
  height: 22px;
  box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l3, rgba(15, 23, 42, 0.24));
  border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-active, rgba(15, 23, 42, 0.18));
  transition: background-color 120ms ease;
}
.dshH-switch::after {
  content: "";
  position: absolute;
  top: 10px;
  left: 5px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  transition: transform 120ms ease;
}
.dshH-switch.is-on {
  background: transparent;
}
.dshH-switch.is-on::before { border-color: transparent; background: var(--dsw-alias-button-info-fill, #B94305); }
.dshH-switch.is-on::after { transform: translateX(18px); }
.dshH-switch:disabled { opacity: 0.45; cursor: default; }
.dshH-switch:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #B94305);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .dshH-switch::before, .dshH-switch::after { transition: none; }
}
@media (max-width: 768px), (pointer: coarse) {
  .dshH-confirm, .dshH-switch, .dshH-rowAction { min-width: 44px; min-height: 44px; }
  .dshH-switch::before { top: 11px; }
  .dshH-switch::after { top: 14px; }
}
@media (max-width: 480px) {
  .dshH-row { flex-wrap: wrap; }
  .dshH-rowCopy, .dshH-rowControls { width: 100%; }
  .dshH-rowControls { justify-content: flex-end; }
}
.dshH-advanced {
  width: 100%;
  max-width: 560px;
  min-width: 0;
  box-sizing: border-box;
  padding: 8px 4px 24px;
  color: var(--dsw-alias-label-primary, #111827);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.dshH-advanced h1 { margin: 0 0 8px; font-size: 18px; font-weight: 650; }
.dshH-advanced h2 { margin: 0 0 12px; font-size: 16px; font-weight: 600; }
.dshH-advanced section { padding: 16px 0; border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.1)); }
.dshH-advanced .dshH-advancedHint,
.dshH-advanced .dshH-advancedOverride,
.dshH-advanced .dshH-advancedStatus { margin: 4px 0; color: var(--dsw-alias-label-secondary, #475569); font-size: 12px; }
.dshH-advanced .dshH-advancedStatus { min-height: 18px; }
.dshH-advanced [data-error="true"] { color: var(--dsw-xtz-status-error-ink, #b42318); }
.dshH-advanced .dshH-advancedRow { display: flex; flex-direction: column; min-width: 0; margin-bottom: 16px; }
.dshH-advanced label { font-weight: 500; }
.dshH-advanced .dshH-advancedControls { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dshH-advanced input {
  width: 100%; min-width: 0; min-height: 36px; box-sizing: border-box; padding: 8px 12px;
  border: 1px solid var(--dsw-alias-border-l3, rgba(15, 23, 42, 0.24)); border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #111827); font: inherit;
}
.dshH-advanced input[aria-invalid="true"] { border-color: var(--dsw-xtz-status-error-ink, #b42318); }
.dshH-advanced button {
  flex-shrink: 0; min-height: 36px; padding: 8px 12px;
  border: 1px solid var(--dsw-alias-border-l3, rgba(15, 23, 42, 0.24)); border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #111827);
  font: inherit; cursor: pointer; transition: color 120ms ease, background-color 120ms ease;
}
.dshH-advanced button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.06)); }
.dshH-advanced button:active:not(:disabled) { background: var(--dsw-alias-interactive-bg-active, rgba(15, 23, 42, 0.18)); }
.dshH-advanced .dshH-advancedSave {
  border-color: transparent; border-radius: var(--xtz-radius-pill, 999px);
  background: var(--dsw-alias-button-info-fill, #B94305); color: var(--dsw-alias-label-oninverse, #fff);
}
.dshH-advanced .dshH-advancedSave:hover:not(:disabled) { background: var(--dsw-alias-button-info-hover, #9F3703); }
.dshH-advanced .dshH-advancedSave:active:not(:disabled) { background: var(--dsw-static-deepseek-800, #7C2C00); }
.dshH-advanced input:focus-visible,
.dshH-advanced button:focus-visible { outline: 2px solid var(--dsw-alias-button-info-fill, #B94305); outline-offset: 2px; }
.dshH-advanced :disabled { opacity: 0.45; cursor: default; }
.dshH-advanced .dshH-advancedActions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
@media (max-width: 768px), (pointer: coarse) {
  .dshH-advanced button, .dshH-advanced input { min-height: 44px; min-width: 44px; }
}
@media (prefers-reduced-motion: reduce) {
  .dshH-advanced button { transition: none; }
}
`;
