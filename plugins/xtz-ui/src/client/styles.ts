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
.dshH-overlay {
  --dshH-text: var(--dsw-alias-label-primary, #111827);
  --dshH-muted: var(--dsw-alias-label-secondary, #475569);
  --dshH-surface: var(--dsw-alias-bg-layer-1, #fff);
  --dshH-accent: var(--dsw-alias-button-info-fill, #a84c2c);
  --dshH-accent-hover: var(--dsw-alias-button-info-hover, #8f3f27);
  --dshH-peach: var(--dsw-alias-state-business-primary, #a84c2c);
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
  display: flex;
  flex-direction: column;
  align-items: center;
  width: min(400px, 100%);
  padding: 28px 24px 22px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.1));
  border-radius: var(--xtz-radius-l, 16px);
  background: linear-gradient(160deg, var(--dshH-surface) 55%, var(--dsw-alias-state-business-tertiary, #f8e6d9));
  box-shadow: var(--dsw-shadow-lv3, 0 16px 40px rgba(15, 23, 42, 0.16));
  text-align: center;
  color: var(--dshH-text);
}
.dshH-mark {
  width: 88px;
  height: 88px;
  margin-bottom: 14px;
  border-radius: 22px;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--dshH-accent) 25%, transparent);
}
.dshH-kicker {
  margin: 0;
  color: var(--dshH-peach);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.08em;
}
.dshH-title {
  margin: 8px 0 0;
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
  min-height: 38px;
  padding: 0 16px;
  border: 0;
  border-radius: var(--xtz-radius-s, 8px);
  background: var(--dshH-accent);
  color: #fff;
  font: inherit;
  font-size: 14px;
  font-weight: 650;
  cursor: pointer;
}
.dshH-confirm:hover { background: var(--dshH-accent-hover); }
.dshH-confirm:active { background: var(--dsw-static-deepseek-800, #5a3228); }
.dshH-confirm:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #a84c2c);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .dshH-confirm { transition: none; }
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
.dshH-rowHint {
  color: var(--dsw-alias-label-secondary, #475569);
  font-size: 12px;
  line-height: 1.4;
}
.dshH-badge {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-module-platform, #f5f6f7);
  color: var(--dsw-alias-label-secondary, #475569);
  font-size: 11px;
  font-weight: 500;
}
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
.dshH-switch.is-on::before { border-color: transparent; background: var(--dsw-alias-button-info-fill, #a84c2c); }
.dshH-switch.is-on::after { transform: translateX(18px); }
.dshH-switch:disabled { opacity: 0.45; cursor: default; }
.dshH-switch:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #a84c2c);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .dshH-switch::before, .dshH-switch::after { transition: none; }
}
@media (max-width: 768px), (pointer: coarse) {
  .dshH-confirm, .dshH-switch { min-height: 44px; }
  .dshH-switch::before { top: 11px; }
  .dshH-switch::after { top: 14px; }
}
`;
