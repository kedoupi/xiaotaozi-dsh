export const css = `
[class*="_options"]:has(.dshM-wrap) {
  position: relative !important;
  padding: 0 !important;
  overflow: hidden !important;
}
.dshM-wrap {
  --dshM-primary: var(--dsw-alias-button-info-fill, #B94305);
  --dshM-primary-hover: var(--dsw-alias-button-info-hover, #9F3703);
  --dshM-primary-pressed: var(--dsw-static-deepseek-800, #7C2C00);
  --dshM-brand-ink: var(--dsw-alias-state-business-primary, #B94305);
  --dshM-brand-soft: var(--dsw-alias-state-business-tertiary, color-mix(in srgb, var(--dshM-brand-ink) 16%, transparent));
  --dshM-focus: var(--dshM-brand-ink);
  --dshM-motion: var(--ds-transition-duration-fast, 140ms);
  --dshM-ease: var(--ds-ease-in-out, ease);
  --dshM-ok: var(--dsw-alias-state-success-primary, #22a06b);
  --dshM-danger: var(--dsw-alias-state-error-primary, #dc2626);
  --dshM-text: var(--dsw-alias-label-primary, #111827);
  --dshM-muted: var(--dsw-alias-label-secondary, #475569);
  --dshM-dim: var(--dsw-alias-label-secondary, #475569);
  --dshM-success-ink: color-mix(in srgb, var(--dshM-ok) 64%, var(--dshM-text));
  --dshM-error-ink: color-mix(in srgb, var(--dshM-danger) 64%, var(--dshM-text));
  --dshM-line: var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.1));
  --dshM-panel: var(--dsw-alias-bg-layer-2, #f4f6f8);
  --dshM-surface: var(--dsw-alias-bg-layer-1, #fff);
  --dshM-hover: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, 0.06));
  --dshM-selected: var(--dsw-specific-sidebar-nav-item-active, rgba(38, 49, 72, 0.08));
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--dshM-surface);
  pointer-events: auto;
}
.dshM-shell {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--dshM-surface);
}
.dshM-nav {
  display: flex;
  flex-direction: column;
  width: 248px;
  flex: none;
  background: var(--dshM-surface);
  border-right: 1px solid var(--dshM-line);
}
.dshM-navScroll {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  overflow: auto;
  padding: 14px 10px 10px;
}
.dshM-section { display: flex; flex-direction: column; gap: 2px; }
.dshM-label {
  padding: 0 8px 6px;
  color: var(--dshM-muted);
  font-size: 11px;
  font-weight: 650;
}
.dshM-item {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 40px;
  padding: 2px 4px 2px 2px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: left;
  transition: background-color var(--dshM-motion) var(--dshM-ease), color var(--dshM-motion) var(--dshM-ease);
}
.dshM-item:hover { background: var(--dshM-hover); }
.dshM-item.is-on,
.dshM-item.is-on:hover { background: var(--dshM-selected); }
.dshM-itemMain {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
  padding: 4px 6px;
}
.dshM-logo,
.dshM-icon,
.dshM-fallbackIcon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.dshM-logo.is-dark,
.dshM-icon.is-dark {
  border-radius: 5px;
  background: #111;
  color: #fff;
}
.dshM-fallbackIcon {
  border: 1px solid var(--dshM-line);
  border-radius: 4px;
  color: var(--dshM-dim);
  font-weight: 700;
  line-height: 1;
}
.dshM-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.dshM-name {
  display: block;
  overflow: hidden;
  font-size: 13px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dshM-item.is-on .dshM-name { font-weight: 650; }
.dshM-meta {
  display: block;
  color: var(--dshM-dim);
  font-size: 11px;
  line-height: 1.2;
}
.dshM-meta.is-ok { color: var(--dshM-success-ink); font-weight: 650; }
.dshM-item.is-wait .dshM-meta { color: var(--dshM-text); }
.dshM-foot {
  flex: none;
  padding: 10px;
  border-top: 1px solid var(--dshM-line);
}
.dshM-add {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 36px;
  border: 1px dashed var(--dshM-line);
  border-radius: 8px;
  background: none;
  color: var(--dshM-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  transition: background-color var(--dshM-motion) var(--dshM-ease), border-color var(--dshM-motion) var(--dshM-ease), color var(--dshM-motion) var(--dshM-ease);
}
.dshM-add:hover {
  border-color: var(--dshM-brand-ink);
  color: var(--dshM-brand-ink);
  background: var(--dshM-brand-soft);
}
.dshM-main {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 22px 24px 28px;
}
.dshM-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 280px;
  text-align: center;
  color: var(--dshM-dim);
}
.dshM-emptyTitle {
  margin: 0;
  color: var(--dshM-text);
  font-size: 15px;
  font-weight: 650;
}
.dshM-emptyCopy {
  margin: 0;
  max-width: 280px;
  font-size: 13px;
  line-height: 1.55;
}
.dshM-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 14px;
  padding: 0 2px;
  min-height: 32px;
  border: 0;
  background: none;
  color: var(--dshM-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  transition: color var(--dshM-motion) var(--dshM-ease);
}
.dshM-back:hover { color: var(--dshM-text); }
.dshM-back svg { flex: none; }
.dshM-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}
.dshM-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.3;
}
.dshM-hint {
  margin: 4px 0 0;
  color: var(--dshM-muted);
  font-size: 12.5px;
  line-height: 1.55;
}
.dshM-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  font-size: 12px;
  color: var(--dshM-dim);
}
.dshM-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dshM-line);
}
.dshM-status.is-on { color: var(--dshM-success-ink); }
.dshM-status.is-on .dshM-dot { background: var(--dshM-ok); }
.dshM-status.is-wait .dshM-dot {
  background: var(--dshM-brand-ink);
  animation: dshM-pulse 1.2s ease-in-out infinite;
}
.dshM-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 16px;
  margin-top: 16px;
  border-top: 1px solid var(--dshM-line);
}
.dshM-blockHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.dshM-blockTitle {
  margin: 0;
  font-size: 13px;
  font-weight: 650;
}
.dshM-row {
  display: flex;
  gap: 8px;
}
.dshM-secret {
  display: flex;
  align-items: center;
  min-height: 36px;
  margin-top: 10px;
  padding: 8px 12px;
  border: 1px solid var(--dshM-line);
  border-radius: 8px;
  background: var(--dshM-panel);
}
.dshM-secretMask {
  overflow: hidden;
  color: var(--dshM-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  letter-spacing: 0.14em;
  user-select: none;
}
.dshM-input {
  flex: 1;
  min-width: 0;
  min-height: 36px;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid var(--dshM-line);
  border-radius: 8px;
  background: var(--dshM-surface);
  color: inherit;
  font: inherit;
  font-size: 13px;
}
.dshM-input.is-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.dshM-input:focus {
  outline: none;
  border-color: var(--dshM-brand-ink);
  box-shadow: 0 0 0 3px var(--dshM-brand-soft);
}
.dshM-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.dshM-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--dshM-line);
  border-radius: 8px;
  background: var(--dshM-surface);
  color: inherit;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  transition: background-color var(--dshM-motion) var(--dshM-ease), border-color var(--dshM-motion) var(--dshM-ease), color var(--dshM-motion) var(--dshM-ease);
}
.dshM-btn:hover:not(:disabled) { background: var(--dshM-panel); }
.dshM-btn.is-primary {
  background: var(--dshM-primary);
  border-color: transparent;
  border-radius: 999px;
  color: var(--dsw-alias-label-primary-inverted, #fff);
}
.dshM-wrap .dshM-btn.is-primary:hover:not(:disabled),
.dshM-wrap .dshM-btn.is-primary:focus,
.dshM-wrap .dshM-btn.is-primary:focus-visible {
  background: var(--dshM-primary-hover);
  border-color: transparent;
  color: var(--dsw-alias-label-primary-inverted, #fff);
  filter: none;
}
.dshM-wrap .dshM-btn.is-primary:active:not(:disabled) {
  background: var(--dshM-primary-pressed);
  border-color: transparent;
  color: var(--dsw-alias-label-primary-inverted, #fff);
  filter: none;
}
.dshM-btn.is-ok { background: var(--dshM-ok); border-color: transparent; color: var(--dsw-alias-label-primary-inverted, #fff); }
.dshM-wrap .dshM-btn.is-ok:hover:not(:disabled),
.dshM-wrap .dshM-btn.is-ok:focus-visible {
  background: var(--dshM-ok);
  color: var(--dsw-alias-label-primary-inverted, #fff);
}
.dshM-btn.is-danger {
  color: var(--dshM-error-ink);
  border-color: color-mix(in srgb, var(--dshM-danger) 28%, var(--dshM-line));
}
.dshM-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.dshM-btn.is-ghost {
  border-color: transparent;
  background: transparent;
  color: var(--dshM-muted);
}
.dshM-btn.is-ghost:hover:not(:disabled) {
  color: var(--dshM-text);
  background: var(--dshM-hover);
}
.dshM-textLink {
  display: inline;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--dshM-brand-ink);
  font: inherit;
  font-size: 12.5px;
  font-weight: 650;
  cursor: pointer;
}
.dshM-textLink:hover { text-decoration: underline; }
.dshM-linkLine {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 8px;
  margin-top: 2px;
}
.dshM-customLink {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 2px;
  border: 0;
  background: none;
  color: var(--dshM-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}
.dshM-customLink:hover { color: var(--dshM-brand-ink); }
.dshM-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dshM-listBtn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 40px;
  padding: 6px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--dshM-motion) var(--dshM-ease);
}
.dshM-listBtn:hover { background: var(--dshM-hover); }
.dshM-listBtn .dshM-cardIcon {
  width: 28px;
  height: 28px;
  border-radius: 5px;
}
.dshM-live {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.dshM-errorRow {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}
.dshM-btn:focus-visible,
.dshM-item:focus-visible,
.dshM-add:focus-visible,
.dshM-back:focus-visible,
.dshM-close:focus-visible,
.dshM-textLink:focus-visible,
.dshM-customLink:focus-visible,
.dshM-listBtn:focus-visible,
.dshM-input:focus-visible,
.dshM-card:focus-visible,
.dshM-manual > summary:focus-visible {
  outline: 2px solid var(--dshM-focus);
  outline-offset: 2px;
}
.dshM-error { margin: 0; color: var(--dshM-error-ink); font-size: 12px; line-height: 1.45; }
.dshM-device,
.dshM-auth {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}
.dshM-device {
  padding: 12px 14px;
  border: 1px solid var(--dshM-line);
  border-radius: 12px;
  background: var(--dshM-panel);
  gap: 4px;
}
.dshM-deviceLabel {
  color: var(--dshM-dim);
  font-size: 11px;
  font-weight: 650;
}
.dshM-deviceName {
  font-size: 13px;
  font-weight: 650;
  line-height: 1.35;
}
.dshM-deviceMeta {
  color: var(--dshM-muted);
  font-size: 12px;
  line-height: 1.4;
}
.dshM-codebox,
.dshM-linkbox {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--dshM-panel);
}
.dshM-linkbox { align-items: flex-start; }
.dshM-linkCopy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}
.dshM-link {
  overflow: hidden;
  color: var(--dshM-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dshM-code {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.12em;
}
.dshM-models {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 280px;
  overflow: auto;
  border: 1px solid var(--dshM-line);
  border-radius: 8px;
}
.dshM-models li {
  margin: 0;
  padding: 0;
  border: 0 !important;
  outline: none;
  list-style: none;
  background: transparent;
}
.dshM-check {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-height: 40px;
  padding: 8px 10px;
  border: 0;
  box-shadow: inset 0 1px 0 var(--dshM-line);
  cursor: pointer;
}
.dshM-models li:first-child .dshM-check { box-shadow: none; }
.dshM-check:hover { background: var(--dshM-panel); }
.dshM-check input {
  margin-top: 3px;
  width: 15px;
  height: 15px;
  flex: none;
  accent-color: var(--dshM-brand-ink);
}
.dshM-check input:focus-visible {
  outline: 2px solid var(--dshM-focus);
  outline-offset: 2px;
}
.dshM-modelId {
  display: block;
  margin-top: 2px;
  color: var(--dshM-dim);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
}
.dshM-manual { border-top: 1px solid var(--dshM-line); padding-top: 10px; }
.dshM-manual > summary { cursor: pointer; color: var(--dshM-muted); font-size: 12px; }
.dshM-form { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
.dshM-mask {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--dsw-alias-bg-mask-1, rgb(15 23 42 / 38%));
}
.dshM-confirm {
  width: min(400px, 100%);
  padding: 18px 18px 16px;
  border: 1px solid var(--dshM-line);
  border-radius: 24px;
  background: var(--dshM-surface);
  box-shadow: var(--dsw-shadow-lv3, 0 16px 40px rgb(15 23 42 / 16%));
}
.dshM-confirm p { margin: 8px 0 16px; color: var(--dshM-muted); font-size: 13px; line-height: 1.55; }
.dshM-sheet {
  display: flex;
  flex-direction: column;
  width: min(760px, 100%);
  max-height: min(78vh, 720px);
  overflow: hidden;
  border: 1px solid var(--dshM-line);
  border-radius: 24px;
  background: var(--dshM-surface);
  box-shadow: var(--dsw-shadow-lv3, 0 24px 60px rgb(15 23 42 / 16%));
}
.dshM-sheetHead {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 8px;
}
.dshM-close {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--dshM-muted);
  font: inherit;
  cursor: pointer;
  transition: background-color var(--dshM-motion) var(--dshM-ease), color var(--dshM-motion) var(--dshM-ease);
}
.dshM-close:hover { background: var(--dshM-hover); color: var(--dshM-text); }
.dshM-search {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  margin: 4px 18px 14px;
  padding: 0 11px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--dshM-panel);
  color: var(--dshM-muted);
}
.dshM-search:focus-within {
  border-color: color-mix(in srgb, var(--dshM-brand-ink) 40%, var(--dshM-line));
  box-shadow: 0 0 0 3px var(--dshM-brand-soft);
  background: var(--dshM-surface);
}
.dshM-search input {
  flex: 1;
  height: 36px;
  border: 0;
  background: none;
  color: var(--dshM-text);
  font: inherit;
  font-size: 13px;
  outline: none;
}
.dshM-search input::placeholder { color: var(--dshM-dim); }
.dshM-sheetBody {
  flex: 1;
  min-height: 0;
  padding: 0 18px 18px;
  overflow: auto;
}
.dshM-blockLabel {
  padding: 0 2px 8px;
  color: var(--dshM-muted);
  font-size: 12px;
  font-weight: 650;
}
.dshM-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.dshM-card {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  padding: 10px 12px;
  border: 1px solid var(--dshM-line);
  border-radius: 12px;
  background: var(--dshM-panel);
  color: inherit;
  text-align: left;
  font: inherit;
  cursor: pointer;
  transition: background-color var(--dshM-motion) var(--dshM-ease), border-color var(--dshM-motion) var(--dshM-ease);
}
.dshM-card:hover:not(:disabled) {
  border-color: var(--dshM-brand-ink);
  background: var(--dshM-brand-soft);
}
.dshM-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
}
.dshM-fieldLabel {
  color: var(--dshM-muted);
  font-size: 12px;
  font-weight: 650;
}
.dshM-card:disabled { opacity: 0.5; cursor: not-allowed; }
.dshM-cardIcon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: none;
  border-radius: 8px;
  background: var(--dshM-surface);
}
.dshM-card:hover:not(:disabled) .dshM-cardIcon { background: var(--dshM-surface); }
.dshM-cardCopy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.dshM-cardTitle {
  overflow: hidden;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dshM-cardSub {
  color: var(--dshM-dim);
  font-size: 12px;
  line-height: 1.3;
}
.dshM-pickerEmpty {
  padding: 36px 8px;
  color: var(--dshM-dim);
  font-size: 13px;
  text-align: center;
}
.dshM-pickerBlock + .dshM-pickerBlock { margin-top: 18px; }
.dshM-navNote {
  margin: 8px 6px 0;
  color: var(--dshM-dim);
  font-size: 12px;
  line-height: 1.45;
}
.dshMedia-frame {
  transition: border-color var(--ds-transition-duration-fast, 140ms) var(--ds-ease-in-out, ease), background-color var(--ds-transition-duration-fast, 140ms) var(--ds-ease-in-out, ease);
}
.dshMedia-frame:hover:not(:disabled) { border-color: var(--dsw-alias-state-business-primary, var(--dsw-alias-border-l4)); }
.dshMedia-frame:disabled { cursor: wait !important; }
.dshMedia-frame:focus-visible,
.dshMedia-error:focus-visible,
.dshMedia-close:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, currentColor);
  outline-offset: 2px;
}
@media (max-width: 720px) {
  .dshM-wrap { min-height: 0; }
  .dshM-shell { flex-direction: column; }
  .dshM-nav { width: auto; border-right: 0; border-bottom: 1px solid var(--dshM-line); }
  .dshM-navScroll { max-height: 220px; }
  .dshM-item, .dshM-add, .dshM-btn, .dshM-back, .dshM-close, .dshM-customLink, .dshM-listBtn, .dshM-card, .dshM-check, .dshM-manual > summary { min-height: 44px; }
  .dshM-input, .dshM-search input { min-height: 44px; font-size: 16px; }
  .dshM-main { padding: 18px 16px 24px; }
  .dshM-mask { align-items: flex-end; padding: 12px; }
  .dshM-sheet { max-height: min(88dvh, 760px); border-radius: 16px; }
  .dshM-confirm { margin-bottom: env(safe-area-inset-bottom); }
}
@media (max-width: 520px) {
  .dshM-grid { grid-template-columns: minmax(0, 1fr); }
  .dshM-row { flex-direction: column; }
  .dshM-row > .dshM-btn { width: 100%; }
  .dshM-navScroll { max-height: 176px; }
}
@media (pointer: coarse) {
  .dshM-item, .dshM-add, .dshM-btn, .dshM-back, .dshM-close, .dshM-customLink, .dshM-listBtn, .dshM-card, .dshM-check, .dshM-manual > summary, .dshMedia-frame, .dshMedia-error, .dshMedia-close { min-height: 44px; }
  .dshM-input, .dshM-search input { min-height: 44px; font-size: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .dshM-status.is-wait .dshM-dot { animation: none; }
  .dshM-item, .dshM-add, .dshM-back, .dshM-btn, .dshM-listBtn, .dshM-close, .dshM-card { transition: none; }
  .dshMedia-frame { transition: none; }
}
@keyframes dshM-pulse { 50% { opacity: 0.35; } }
`;
