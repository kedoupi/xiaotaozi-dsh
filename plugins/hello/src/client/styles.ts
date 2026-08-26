export const css = `
.dshH-overlay {
  --dshH-text: var(--dsw-alias-label-primary, #111827);
  --dshH-muted: var(--dsw-alias-label-secondary, #475569);
  --dshH-surface: var(--dsw-alias-bg-layer-1, #fff);
  --dshH-accent: var(--dsw-alias-button-info-fill, #c45a32);
  --dshH-peach: #e08a62;
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.36);
}
.dshH-mask { position: absolute; inset: 0; }
.dshH-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: min(400px, 100%);
  padding: 28px 24px 22px;
  border: 1px solid color-mix(in srgb, #e08a62 18%, var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.1)));
  border-radius: 16px;
  background: var(--dshH-surface);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.16);
  text-align: center;
  color: var(--dshH-text);
}
.dshH-mark {
  width: 72px;
  height: 72px;
  margin-bottom: 14px;
  border-radius: 16px;
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
  min-height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: 10px;
  background: var(--dshH-accent);
  color: #fff;
  font: inherit;
  font-size: 14px;
  font-weight: 650;
  cursor: pointer;
}
.dshH-confirm:hover { filter: brightness(1.04); }
.dshH-confirm:focus-visible {
  outline: 2px solid var(--dshH-text);
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
  color: var(--dsw-alias-state-error-primary, #dc2626);
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
  color: var(--dsw-alias-label-tertiary, #86909c);
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
  width: 40px;
  height: 22px;
  margin-top: 1px;
  border: none;
  border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-active, rgba(15, 23, 42, 0.18));
  cursor: pointer;
  position: relative;
}
.dshH-switch::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.15s ease;
}
.dshH-switch.is-on {
  background: var(--dsw-alias-button-info-fill, #c45a32);
}
.dshH-switch.is-on::after { transform: translateX(18px); }
.dshH-switch:disabled { opacity: 0.45; cursor: default; }
.dshH-switch:focus-visible {
  outline: 2px solid var(--dsw-alias-label-primary, #111827);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .dshH-switch::after { transition: none; }
}
`;
