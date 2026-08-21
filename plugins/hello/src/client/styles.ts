export const css = `
.dshH-overlay {
  --dshH-text: var(--dsw-alias-label-primary, #111827);
  --dshH-muted: var(--dsw-alias-label-secondary, #475569);
  --dshH-surface: var(--dsw-alias-bg-layer-1, #fff);
  --dshH-accent: var(--dsw-alias-button-info-fill, var(--dsw-static-deepseek-500, #4176e6));
  --dshH-peach: color-mix(in srgb, #e08a62 35%, var(--dshH-accent));
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
`;
