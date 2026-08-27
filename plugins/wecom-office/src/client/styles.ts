export const css = `
[class*="_options"]:has(.dshWo-wrap) {
  position: relative !important;
  padding: 0 !important;
  overflow: hidden !important;
}
.dshWo-wrap {
  --dshWo-accent: var(--dsw-alias-button-info-fill, var(--dsw-static-deepseek-500, #4176e6));
  --dshWo-text: var(--dsw-alias-label-primary, #111827);
  --dshWo-muted: var(--dsw-alias-label-secondary, #475569);
  --dshWo-dim: var(--dsw-alias-label-tertiary, #64748b);
  --dshWo-line: var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.1));
  --dshWo-surface: var(--dsw-alias-bg-layer-1, #fff);
  --dshWo-ok: var(--dsw-alias-state-success-primary, #22a06b);
  --dshWo-danger: var(--dsw-alias-state-error-primary, #dc2626);
  --dshWo-warn: var(--dsw-alias-state-warn-label, #b45309);
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--dshWo-surface);
  color: var(--dshWo-text);
  pointer-events: auto;
}
.dshWo-body { flex: 1; min-height: 0; overflow: auto; padding: 16px; }
.dshWo-pane { display: flex; flex-direction: column; gap: 12px; max-width: 720px; }
.dshWo-title { margin: 0; font-size: 16px; font-weight: 650; line-height: 24px; }
.dshWo-intro, .dshWo-note {
  margin: 0;
  color: var(--dshWo-dim);
  font-size: 13px;
  line-height: 1.55;
}
.dshWo-intro { font-size: 14px; color: var(--dshWo-muted); }
.dshWo-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--dshWo-line);
  border-radius: 12px;
}
.dshWo-statusHead { display: flex; align-items: center; gap: 8px; }
.dshWo-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.dshWo-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.dshWo-btn {
  box-sizing: border-box;
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--dshWo-line);
  border-radius: 10px;
  background: var(--dshWo-surface);
  color: inherit;
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}
.dshWo-btn:hover { background: rgba(38, 49, 72, 0.06); }
.dshWo-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.dshWo-btn.is-primary { border-color: transparent; background: var(--dshWo-accent); color: #fff; }
.dshWo-btn:focus-visible, .dshWo-input:focus-visible, .dshWo-select:focus-visible {
  outline: 2px solid var(--dshWo-text);
  outline-offset: 2px;
}
.dshWo-select, .dshWo-input {
  box-sizing: border-box;
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid var(--dshWo-line);
  border-radius: 8px;
  background: var(--dshWo-surface);
  color: inherit;
  font: inherit;
  font-size: 14px;
}
.dshWo-qr { width: 200px; height: 200px; border-radius: 8px; border: 1px solid var(--dshWo-line); }
.dshWo-ok { margin: 0; color: var(--dshWo-ok); font-size: 13px; }
.dshWo-err { margin: 0; color: var(--dshWo-danger); font-size: 13px; }
.dshWo-details { border: 1px solid var(--dshWo-line); border-radius: 12px; padding: 8px 14px 12px; }
.dshWo-details > summary { cursor: pointer; font-size: 14px; font-weight: 650; line-height: 36px; }
.dshWo-stack { display: flex; flex-direction: column; gap: 12px; margin-top: 8px; }
.dshWo-stack label.dshWo-note { display: flex; align-items: flex-start; gap: 8px; }
.dshWo-ol { margin: 0; padding-left: 18px; color: var(--dshWo-muted); font-size: 13px; line-height: 1.55; }
`;
