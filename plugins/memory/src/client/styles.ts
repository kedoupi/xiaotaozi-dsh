export const css = `
[class*="_options"]:has(.dshMem-wrap) {
  position: relative !important;
  padding: 0 !important;
  overflow: hidden !important;
}
.dshMem-wrap {
  --dshMem-accent: var(--dsw-alias-button-info-fill, var(--dsw-static-deepseek-500, #4176e6));
  --dshMem-text: var(--dsw-alias-label-primary, #111827);
  --dshMem-muted: var(--dsw-alias-label-secondary, #475569);
  --dshMem-dim: var(--dsw-alias-label-tertiary, #64748b);
  --dshMem-line: var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.1));
  --dshMem-surface: var(--dsw-alias-bg-layer-1, #fff);
  --dshMem-panel: var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-layer-2, #f4f6f8));
  --dshMem-hover: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, 0.06));
  --dshMem-ok: var(--dsw-alias-state-success-primary, #22a06b);
  --dshMem-danger: var(--dsw-alias-state-error-primary, #dc2626);
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--dshMem-surface);
  color: var(--dshMem-text);
  pointer-events: auto;
}
.dshMem-tabs {
  display: flex;
  flex: none;
  gap: 4px;
  padding: 10px 16px 0;
  border-bottom: 1px solid var(--dshMem-line);
  background: var(--dshMem-surface);
}
.dshMem-tab {
  min-height: 40px;
  padding: 0 14px;
  border: 0;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  background: transparent;
  color: var(--dshMem-muted);
  font: inherit;
  font-size: 14px;
  font-weight: 650;
  cursor: pointer;
}
.dshMem-tab:hover { color: var(--dshMem-text); }
.dshMem-tab.is-on {
  color: var(--dshMem-text);
  border-bottom-color: var(--dshMem-accent);
}
.dshMem-tab:focus-visible {
  outline: 2px solid var(--dshMem-text);
  outline-offset: 2px;
}
.dshMem-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px;
}
.dshMem-pane {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 880px;
}
.dshMem-notes {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
}
.dshMem-split {
  display: flex;
  flex: 1;
  min-height: 280px;
  overflow: hidden;
  border: 1px solid var(--dshMem-line);
  border-radius: 12px;
  background: var(--dshMem-surface);
}
.dshMem-side {
  width: min(240px, 38%);
  flex: none;
  overflow: auto;
  padding: 8px;
  border-right: 1px solid var(--dshMem-line);
  background: var(--dshMem-panel);
}
.dshMem-main {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 12px 14px;
}
.dshMem-title { margin: 0; font-size: 16px; font-weight: 650; line-height: 24px; }
.dshMem-intro, .dshMem-note, .dshMem-hint {
  margin: 0;
  color: var(--dshMem-dim);
  font-size: 13px;
  line-height: 1.55;
}
.dshMem-intro { font-size: 14px; color: var(--dshMem-muted); }
.dshMem-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--dshMem-line);
  border-radius: 12px;
  background: var(--dshMem-surface);
}
.dshMem-rowText { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
.dshMem-rowLabel { font-size: 14px; font-weight: 650; line-height: 22px; }
.dshMem-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--dshMem-line);
  border-radius: 12px;
}
.dshMem-statusHead { display: flex; align-items: center; gap: 8px; }
.dshMem-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.dshMem-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.dshMem-btn {
  box-sizing: border-box;
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--dshMem-line);
  border-radius: 10px;
  background: var(--dshMem-surface);
  color: inherit;
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}
.dshMem-btn:hover { background: var(--dshMem-hover); }
.dshMem-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.dshMem-btn.is-primary {
  border-color: transparent;
  background: var(--dshMem-accent);
  color: #fff;
}
.dshMem-btn.is-on { background: var(--dshMem-hover); }
.dshMem-btn:focus-visible, .dshMem-input:focus-visible, .dshMem-tab:focus-visible {
  outline: 2px solid var(--dshMem-text);
  outline-offset: 2px;
}
.dshMem-input {
  box-sizing: border-box;
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid var(--dshMem-line);
  border-radius: 8px;
  background: var(--dshMem-surface);
  color: inherit;
  font: inherit;
  font-size: 14px;
}
.dshMem-grow { flex: 1; min-width: 0; width: 100%; }
.dshMem-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.dshMem-item {
  display: flex;
  width: 100%;
  min-height: 40px;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.dshMem-item:hover { background: var(--dshMem-hover); }
.dshMem-item.is-on { background: color-mix(in srgb, var(--dshMem-accent) 12%, transparent); }
.dshMem-noteRow {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 10px 0;
  border-top: 1px solid var(--dshMem-line);
}
.dshMem-noteText {
  margin: 0;
  flex: 1;
  min-width: 0;
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}
.dshMem-sourceGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}
.dshMem-source {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border: 1px solid var(--dshMem-line);
  border-radius: 10px;
  background: var(--dshMem-surface);
  cursor: pointer;
  text-align: left;
}
.dshMem-source input { margin-top: 3px; accent-color: var(--dshMem-accent); }
.dshMem-ok { margin: 0; color: var(--dshMem-ok); font-size: 13px; }
.dshMem-err { margin: 0; color: var(--dshMem-danger); font-size: 13px; }
.dshMem-empty {
  display: grid;
  place-items: center;
  min-height: 180px;
  padding: 24px;
  text-align: center;
  color: var(--dshMem-muted);
}
.dshMem-details { border: 1px solid var(--dshMem-line); border-radius: 12px; padding: 8px 14px 12px; }
.dshMem-details > summary {
  cursor: pointer;
  font-size: 14px;
  font-weight: 650;
  line-height: 36px;
}
.dshMem-stack { display: flex; flex-direction: column; gap: 12px; margin-top: 8px; }
@media (max-width: 720px) {
  .dshMem-split { flex-direction: column; }
  .dshMem-side { width: 100%; max-height: 36%; border-right: 0; border-bottom: 1px solid var(--dshMem-line); }
}
`;
