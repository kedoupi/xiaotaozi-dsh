export const css = `
[class*="_options"]:has(.dshWo-wrap) {
  position: relative !important;
  padding: 0 !important;
  overflow: hidden !important;
}
.dshWo-wrap {
  --dshWo-action: var(--dsw-alias-button-info-fill, #a84c2c);
  --dshWo-action-hover: var(--dsw-alias-button-info-hover, #8f3f27);
  --dshWo-action-pressed: var(--dsw-static-deepseek-800, #5a3228);
  --dshWo-focus: var(--dsw-alias-state-business-primary, #a84c2c);
  --dshWo-text: var(--dsw-alias-label-primary, #1f2329);
  --dshWo-muted: var(--dsw-alias-label-secondary, #646a73);
  --dshWo-dim: var(--dsw-alias-label-secondary, #646a73);
  --dshWo-line: var(--dsw-alias-border-l2, #dfe1e5);
  --dshWo-line-soft: var(--dsw-alias-border-l1, #eef0f3);
  --dshWo-surface: var(--dsw-alias-bg-layer-1, #fff);
  --dshWo-surface-raised: var(--dsw-alias-bg-layer-3, #fff);
  --dshWo-surface-muted: var(--dsw-alias-bg-module-platform, #f7f8fa);
  --dshWo-hover: var(--dsw-alias-interactive-bg-hover, #f2f3f5);
  --dshWo-ok: var(--dsw-alias-state-success-primary, #20a162);
  --dshWo-danger: var(--dsw-alias-state-error-primary, #d54941);
  --dshWo-danger-ink: color-mix(in srgb, var(--dshWo-text) 78%, var(--dshWo-danger));
  --dshWo-warn: var(--dsw-alias-state-warn-primary, #d97706);
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  min-height: 0;
  color: var(--dshWo-text);
  background: var(--dshWo-surface);
  pointer-events: auto;
}
.dshWo-wrap, .dshWo-wrap *, .dshWo-wrap *::before, .dshWo-wrap *::after { box-sizing: border-box; }
.dshWo-body { flex: 1; min-height: 0; overflow: auto; padding: 16px 20px 24px; }
.dshWo-pane { width: min(100%, 760px); display: flex; flex-direction: column; gap: 16px; }
.dshWo-title { margin: 0; font-size: 18px; font-weight: 650; line-height: 24px; }
.dshWo-intro, .dshWo-note {
  margin: 0;
  color: var(--dshWo-dim);
  font-size: 13px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.dshWo-intro { margin-top: 4px; color: var(--dshWo-muted); font-size: 14px; }
.dshWo-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--dshWo-line);
  border-radius: 12px;
  color: var(--dshWo-text);
  background: var(--dshWo-surface-raised);
}
.dshWo-statusCard { gap: 8px; background: var(--dshWo-surface-muted); }
.dshWo-statusHead { display: flex; align-items: center; gap: 8px; font-size: 14px; }
.dshWo-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--dshWo-warn); }
.dshWo-dot[data-tone="success"] { background: var(--dshWo-ok); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dshWo-ok) 14%, transparent); }
.dshWo-dot[data-tone="error"] { background: var(--dshWo-danger); }
.dshWo-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dshWo-btn {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 14px;
  border: 1px solid var(--dshWo-line);
  border-radius: 8px;
  color: var(--dshWo-text);
  background: var(--dshWo-surface);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  touch-action: manipulation;
  transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease;
}
.dshWo-btn:hover:not(:disabled) { border-color: var(--dsw-alias-border-l3, #bbbfc4); background: var(--dshWo-hover); }
.dshWo-btn:active:not(:disabled) { background: var(--dshWo-surface-muted); }
.dshWo-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.dshWo-btn.is-primary { border-color: var(--dshWo-action); color: #fff; background: var(--dshWo-action); }
.dshWo-btn.is-primary:hover:not(:disabled) { border-color: var(--dshWo-action-hover); background: var(--dshWo-action-hover); }
.dshWo-btn.is-primary:active:not(:disabled) { border-color: var(--dshWo-action-pressed); background: var(--dshWo-action-pressed); }
.dshWo-btn.is-danger { color: var(--dshWo-danger-ink); }
.dshWo-btn.is-danger:hover:not(:disabled) { border-color: color-mix(in srgb, var(--dshWo-danger) 35%, var(--dshWo-line)); background: color-mix(in srgb, var(--dshWo-danger) 8%, var(--dshWo-surface)); }
.dshWo-btn:focus-visible,
.dshWo-input:focus-visible,
.dshWo-select:focus-visible,
.dshWo-details > summary:focus-visible,
.dshWo-errorSummary:focus-visible {
  outline: 2px solid var(--dshWo-focus);
  outline-offset: 2px;
}
.dshWo-select, .dshWo-input {
  width: 100%;
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid var(--dshWo-line);
  border-radius: 8px;
  color: var(--dshWo-text);
  background: var(--dshWo-surface);
  font: inherit;
  font-size: 14px;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
.dshWo-select:hover:not(:disabled), .dshWo-input:hover:not(:disabled) { border-color: var(--dsw-alias-border-l3, #bbbfc4); }
.dshWo-input::placeholder { color: var(--dshWo-muted); opacity: 1; }
.dshWo-input[aria-invalid="true"] { border-color: var(--dshWo-danger); }
.dshWo-form { gap: 16px; }
.dshWo-formHead h3 { margin: 0; font-size: 15px; line-height: 20px; font-weight: 650; }
.dshWo-formHead p { margin: 4px 0 0; color: var(--dshWo-muted); font-size: 12px; line-height: 1.5; }
.dshWo-field { display: grid; gap: 8px; color: var(--dshWo-muted); font-size: 13px; font-weight: 600; }
.dshWo-fieldError { color: var(--dshWo-danger-ink); font-size: 12px; font-weight: 400; line-height: 1.5; }
.dshWo-errorSummary {
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--dshWo-danger) 30%, var(--dshWo-line));
  border-radius: 8px;
  color: var(--dshWo-danger-ink);
  background: color-mix(in srgb, var(--dshWo-danger) 8%, var(--dshWo-surface));
  font-size: 13px;
  line-height: 1.5;
}
.dshWo-qrCard { align-items: flex-start; }
.dshWo-qr { width: min(200px, 100%); height: auto; aspect-ratio: 1; border: 1px solid var(--dshWo-line); border-radius: 8px; background: #fff; }
.dshWo-err { margin: 0; color: var(--dshWo-danger-ink); font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
.dshWo-details { border: 1px solid var(--dshWo-line); border-radius: 12px; padding: 0 14px 12px; background: var(--dshWo-surface-raised); }
.dshWo-details > summary { min-height: 40px; display: flex; align-items: center; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; line-height: 20px; touch-action: manipulation; }
.dshWo-stack { display: flex; flex-direction: column; gap: 12px; padding-top: 4px; border-top: 1px solid var(--dshWo-line-soft); }
.dshWo-stack label.dshWo-note { min-height: 36px; display: flex; align-items: flex-start; gap: 8px; padding-top: 8px; color: var(--dshWo-muted); }
.dshWo-stack input[type="checkbox"] { width: 18px; height: 18px; flex: none; margin: 1px 0 0; accent-color: var(--dshWo-action); }
.dshWo-ol { margin: 0; padding-left: 20px; color: var(--dshWo-muted); font-size: 13px; line-height: 1.6; }
.dshWo-state { min-height: 220px; display: grid; place-content: center; justify-items: center; gap: 12px; padding: 24px; color: var(--dshWo-muted); text-align: center; }
.dshWo-state strong { color: var(--dshWo-text); font-size: 16px; }
.dshWo-state p { max-width: 520px; margin: 0; font-size: 13px; line-height: 1.6; }
.dshWo-state.is-error { color: var(--dshWo-danger-ink); }
.dshWo-spinner { width: 24px; height: 24px; border: 3px solid var(--dshWo-line); border-top-color: var(--dshWo-focus); border-radius: 50%; animation: dshWo-spin 800ms linear infinite; }
.dshWo-srOnly { position: absolute !important; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@keyframes dshWo-spin { to { transform: rotate(360deg); } }
@media (max-width: 768px) {
  .dshWo-body { padding: 16px; }
  .dshWo-pane { gap: 12px; }
  .dshWo-card { padding: 12px; }
  .dshWo-btn, .dshWo-input, .dshWo-select, .dshWo-details > summary { min-height: 44px; }
  .dshWo-actions .dshWo-btn { flex: 1 1 auto; }
  .dshWo-stack label.dshWo-note { min-height: 44px; }
}
@media (pointer: coarse) {
  .dshWo-btn, .dshWo-input, .dshWo-select, .dshWo-details > summary, .dshWo-stack label.dshWo-note { min-height: 44px; }
}
@media (prefers-reduced-motion: reduce) {
  .dshWo-wrap *, .dshWo-wrap *::before, .dshWo-wrap *::after { scroll-behavior: auto !important; transition: none !important; }
  .dshWo-spinner { animation: none !important; }
}
`;
