export const marketCss = `
[data-dsh-sidebar-tools] {
  display: flex; flex-wrap: wrap; align-items: stretch;
  gap: 8px; margin: 0 2px 8px; min-width: 0;
}
[data-dsh-sidebar-tools] > button {
  flex: 1 1 calc(50% - 4px); min-width: 0; min-height: 38px;
  margin: 0 !important; padding-inline: 8px !important; justify-content: center; cursor: pointer;
}
[data-dsh-sidebar-tools] > button span {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dsh-market-entry img { display: block; flex: none; border-radius: 4px; }

.dsh-market-overlay {
  position: fixed; inset: 0; z-index: 10040; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center; padding: 24px;
  background: rgb(15 23 42 / 55%);
  overscroll-behavior: contain;
}
.dsh-market-dialog {
  --mk-primary: var(--dsw-alias-button-info-fill, #B94305);
  --mk-primary-hover: var(--dsw-alias-button-info-hover, #9F3703);
  --mk-primary-pressed: var(--dsw-static-deepseek-800, #7C2C00);
  --mk-focus: var(--dsw-alias-state-business-primary, #B94305);
  --mk-primary-soft: var(--dsw-alias-state-business-tertiary, #FFF0E6);
  --mk-brand-on-soft: var(--dsw-alias-state-business-primary, #B94305);
  --mk-on-primary: var(--dsw-alias-label-oninverse, #fff);
  --mk-border: var(--dsw-alias-border-l2, rgb(31 35 41 / 12%));
  --mk-border-strong: var(--dsw-alias-border-l1, rgb(31 35 41 / 20%));
  --mk-surface: var(--dsw-alias-bg-layer-1, #fff);
  --mk-surface-2: var(--dsw-alias-bg-module-platform, #f5f6f7);
  --mk-text: var(--dsw-alias-label-primary, #1f2329);
  --mk-text-2: var(--dsw-alias-label-secondary, #646a73);
  --mk-text-3: var(--dsw-alias-label-secondary, #646a73);
  --mk-ok: var(--dsw-alias-state-success-primary, #78A317);
  --mk-ok-ink: var(--dsw-xtz-status-success-ink, #4F7410);
  --mk-danger: var(--dsw-alias-state-error-primary, #bd2c2c);
  --mk-danger-ink: var(--dsw-xtz-status-error-ink, #b42318);
  --mk-danger-fill: color-mix(in srgb, var(--mk-danger) 72%, black);
  --mk-danger-fill-hover: color-mix(in srgb, var(--mk-danger) 64%, black);
  --mk-danger-fill-pressed: color-mix(in srgb, var(--mk-danger) 56%, black);
  --mk-radius-sm: 8px;
  --mk-radius-md: 12px;
  --mk-radius-dialog: 24px;
  --mk-motion-fast: 120ms;
  --mk-motion: 160ms;
  display: flex; flex-direction: column; box-sizing: border-box; min-width: 0;
  width: min(920px, 100%); height: min(700px, 100%);
  border: 1px solid var(--mk-border); border-radius: var(--mk-radius-dialog); overflow: hidden;
  background: var(--mk-surface); color: var(--mk-text);
  box-shadow: var(--dsw-shadow-lv3, 0 24px 64px rgb(15 23 42 / 30%));
}
body[data-ds-dark-theme] .dsh-market-dialog {
  --mk-primary-soft: var(--dsw-alias-state-business-tertiary, #3D2B1F);
  --mk-focus: var(--dsw-alias-state-business-primary, #FFC09A);
  --mk-brand-on-soft: var(--dsw-alias-state-business-primary, #FFDCC4);
  --mk-ok-ink: var(--dsw-xtz-status-success-ink, #bbf7d0);
  --mk-danger-ink: var(--dsw-xtz-status-error-ink, #ffe0dc);
}
.dsh-market-dialog:focus-visible { outline: 2px solid var(--mk-focus); outline-offset: 2px; }
.dsh-market-dialog :is(button, input, [tabindex]):focus-visible {
  outline: 2px solid var(--mk-focus); outline-offset: 2px;
}
.dsh-market-dialog button { font: inherit; -webkit-tap-highlight-color: transparent; }

.dsh-market-dialog-head {
  display: flex; align-items: center; gap: 12px;
  min-height: 64px; padding: 10px 16px; border-bottom: 1px solid var(--mk-border);
}
.dsh-market-dialog-mark {
  display: flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; border-radius: var(--mk-radius-sm); flex: none;
  overflow: hidden;
}
.dsh-market-dialog-mark img { display: block; }
.dsh-market-dialog-titles { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dsh-market-dialog-title { font-size: 18px; font-weight: 650; line-height: 1.35; }
.dsh-market-dialog-subtitle { font-size: 12px; color: var(--mk-text-3); line-height: 1.45; }
.dsh-market-dialog-close {
  margin-left: auto; display: flex; align-items: center; justify-content: center;
  width: 38px; height: 38px; min-height: 38px; border-radius: var(--mk-radius-sm);
  border: 1px solid transparent; background: transparent; color: var(--mk-text-2); cursor: pointer;
  transition: background var(--mk-motion-fast) ease, color var(--mk-motion-fast) ease, border-color var(--mk-motion-fast) ease;
}
.dsh-market-dialog-body {
  flex: 1; min-height: 0; overflow-y: auto; padding: 16px 18px 20px;
  overscroll-behavior: contain;
}

.dsh-market-panel { display: flex; flex-direction: column; gap: 16px; min-width: 0; min-height: 100%; }
.dsh-market-toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.dsh-market-tabs {
  display: inline-flex; gap: 2px; padding: 3px;
  border: 1px solid var(--mk-border); border-radius: var(--mk-radius-md); background: var(--mk-surface-2);
}
.dsh-market-tab {
  min-width: 72px; min-height: 36px; padding: 7px 14px;
  font-size: 13px; font-weight: 500; line-height: 1;
  border: none; border-radius: var(--mk-radius-sm); background: transparent;
  color: var(--mk-text-2); cursor: pointer;
  transition: background var(--mk-motion-fast) ease, color var(--mk-motion-fast) ease, box-shadow var(--mk-motion-fast) ease;
}
.dsh-market-tab[data-active="true"] {
  background: var(--mk-surface); color: var(--mk-text); box-shadow: var(--dsw-shadow-lv1, 0 1px 3px rgb(20 10 5 / 12%));
}
.dsh-market-discovery { display: flex; flex-direction: column; gap: 12px; }
.dsh-market-search-field { display: flex; flex-direction: column; gap: 8px; }
.dsh-market-search-field > label { font-size: 12px; font-weight: 500; color: var(--mk-text-2); }
.dsh-market-search-wrap {
  position: relative; min-width: 180px; display: flex; align-items: center;
}
.dsh-market-search-wrap > svg { position: absolute; left: 12px; color: var(--mk-text-3); pointer-events: none; }
.dsh-market-search {
  width: 100%; min-height: 42px; padding: 9px 12px 9px 36px;
  font: inherit; font-size: 13px; line-height: 1.4;
  border: 1px solid var(--mk-border); border-radius: var(--mk-radius-sm);
  background: var(--mk-surface); color: var(--mk-text);
  transition: border-color var(--mk-motion-fast) ease, box-shadow var(--mk-motion-fast) ease;
}
.dsh-market-search::placeholder { color: var(--mk-text-3); }
.dsh-market-search:focus { border-color: var(--mk-focus); box-shadow: 0 0 0 3px color-mix(in srgb, var(--mk-focus) 15%, transparent); }

.dsh-market-tabpanel { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.dsh-market-tags { display: flex; flex-wrap: wrap; gap: 8px; }
.dsh-market-tag {
  min-height: 36px; padding: 7px 12px; font-size: 12px; line-height: 1;
  border-radius: 999px; border: 1px solid var(--mk-border);
  background: transparent; color: var(--mk-text-2); cursor: pointer;
  transition: background var(--mk-motion-fast) ease, color var(--mk-motion-fast) ease, border-color var(--mk-motion-fast) ease;
}
.dsh-market-tag[data-active="true"] {
  background: var(--mk-primary-soft); border-color: var(--mk-brand-on-soft);
  color: var(--mk-brand-on-soft); font-weight: 600;
}

.dsh-market-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(248px, 1fr)); gap: 12px; }
.dsh-market-card {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; min-width: 0;
  border: 1px solid var(--mk-border); border-radius: var(--mk-radius-md);
  background: var(--mk-surface); overflow: hidden;
  transition: border-color var(--mk-motion) ease, box-shadow var(--mk-motion) ease;
}
.dsh-market-card:focus-within { border-color: var(--mk-focus); }
.dsh-market-card-open {
  display: flex; grid-column: 1 / -1; flex-direction: column; gap: 12px;
  min-width: 0; padding: 14px 14px 10px; text-align: left;
  border: none; border-radius: 0; background: transparent; color: inherit; cursor: pointer;
}
.dsh-market-card-open:focus-visible { outline-offset: -3px !important; }
.dsh-market-card-top { display: flex; align-items: center; gap: 12px; min-width: 0; }
.dsh-market-icon-tile {
  display: flex; align-items: center; justify-content: center; flex: none;
  width: 40px; height: 40px; border-radius: var(--mk-radius-sm);
  background: var(--mk-primary-soft); color: var(--mk-brand-on-soft);
}
.dsh-market-card-name {
  min-width: 0; font-size: 14px; font-weight: 650; color: var(--mk-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dsh-market-card-summary {
  font-size: 12px; line-height: 1.55; color: var(--mk-text-2);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; min-height: 3.1em;
}
.dsh-market-card-chips {
  display: flex; flex-wrap: wrap; align-items: center; align-self: end; gap: 5px;
  min-width: 0; padding: 0 8px 14px 14px;
}
.dsh-market-chip {
  display: inline-flex; align-items: center; gap: 4px;
  min-height: 24px; padding: 3px 8px; border-radius: 999px;
  border: 1px solid var(--mk-border); color: var(--mk-text-2);
  font-size: 11px; line-height: 1; white-space: nowrap;
}
.dsh-market-chip[data-kind="installed"] {
  color: var(--mk-ok-ink); border-color: color-mix(in srgb, var(--mk-ok) 45%, transparent);
  background: color-mix(in srgb, var(--mk-ok) 10%, transparent);
}
.dsh-market-chip[data-kind="queued"] {
  color: var(--mk-brand-on-soft); border-color: var(--mk-brand-on-soft);
  background: var(--mk-primary-soft);
}
.dsh-market-chip[data-kind="failed"] {
  color: var(--mk-danger-ink); border-color: color-mix(in srgb, var(--mk-danger) 45%, transparent);
  background: color-mix(in srgb, var(--mk-danger) 8%, transparent);
}
.dsh-market-get,
.dsh-market-install,
.dsh-market-add-submit,
.dsh-market-confirm-remove {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  min-height: 38px; padding: 8px 14px;
  border: 1px solid var(--mk-primary); border-radius: 999px;
  background: var(--mk-primary); color: var(--mk-on-primary);
  font-size: 12px; font-weight: 650; line-height: 1; cursor: pointer;
  transition: background var(--mk-motion-fast) ease, border-color var(--mk-motion-fast) ease, opacity var(--mk-motion-fast) ease;
}
.dsh-market-get { align-self: end; margin: 0 14px 14px 0; }
.dsh-market-get:disabled,
.dsh-market-install:disabled,
.dsh-market-add-submit:disabled { opacity: .48; cursor: not-allowed; }

.dsh-market-detail { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.dsh-market-back,
.dsh-market-secondary {
  align-self: flex-start; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  min-height: 38px; padding: 8px 12px; border: 1px solid var(--mk-border);
  border-radius: var(--mk-radius-sm); background: var(--mk-surface); color: var(--mk-text-2);
  font-size: 13px; cursor: pointer;
  transition: color var(--mk-motion-fast) ease, border-color var(--mk-motion-fast) ease, background var(--mk-motion-fast) ease;
}
.dsh-market-detail-head { display: flex; align-items: center; gap: 14px; }
.dsh-market-detail-head .dsh-market-icon-tile { width: 56px; height: 56px; border-radius: var(--mk-radius-md); }
.dsh-market-detail-titles { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.dsh-market-detail-name { margin: 0; font-size: 19px; font-weight: 650; line-height: 1.25; text-wrap: balance; }
.dsh-market-detail-badges { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dsh-market-detail-summary { max-width: 70ch; font-size: 13px; line-height: 1.7; color: var(--mk-text-2); margin: 0; }
.dsh-market-meta {
  display: flex; gap: 24px; flex-wrap: wrap; padding: 0 0 12px;
  border-bottom: 1px solid var(--mk-border);
  background: transparent; color: var(--mk-text-3); font-size: 12px;
}
.dsh-market-meta b { color: var(--mk-text-2); font-weight: 500; }
.dsh-market-install-info {
  display: flex; flex-direction: column; gap: 8px; padding: 0 0 12px;
  border-bottom: 1px solid var(--mk-border);
  background: transparent; color: var(--mk-text-3); font-size: 12px; line-height: 1.6;
}
.dsh-market-install-info span { display: flex; flex-wrap: wrap; gap: 6px; }
.dsh-market-install-info b { color: var(--mk-text-2); font-weight: 500; }
.dsh-market-install-info code { color: var(--mk-text-2); overflow-wrap: anywhere; }
.dsh-market-risk {
  max-width: 75ch; padding: 12px 0;
  background: transparent; color: var(--mk-text-2);
}
.dsh-market-risk h3 { margin: 0 0 6px; font-size: 13px; line-height: 1.4; }
.dsh-market-risk p { margin: 4px 0 0; font-size: 12px; line-height: 1.6; }
.dsh-market-install { align-self: flex-start; padding-inline: 20px; font-size: 13px; }
.dsh-market-install[data-variant="danger"] { background: var(--mk-danger-fill); border-color: var(--mk-danger-fill); }
.dsh-market-confirm-overlay {
  position: fixed; inset: 0; z-index: 10041; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center; padding: 16px;
  background: rgb(15 23 42 / 66%);
}
.dsh-market-confirm {
  box-sizing: border-box; width: min(420px, 100%); padding: 22px;
  border: 1px solid var(--mk-border); border-radius: 16px;
  background: var(--mk-surface); color: var(--mk-text);
  box-shadow: var(--dsw-shadow-lv3, 0 24px 64px rgb(15 23 42 / 30%));
}
.dsh-market-confirm h3 { margin: 0; font-size: 17px; line-height: 1.4; }
.dsh-market-confirm p { margin: 10px 0 0; color: var(--mk-text-2); font-size: 13px; line-height: 1.6; }
.dsh-market-confirm-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
.dsh-market-confirm-remove { background: var(--mk-danger-fill); border-color: var(--mk-danger-fill); }
.dsh-market-note { max-width: 75ch; font-size: 12px; line-height: 1.6; color: var(--mk-text-3); margin: 0; }
.dsh-market-note code { overflow-wrap: anywhere; }
.dsh-market-error { font-size: 13px; line-height: 1.5; color: var(--mk-danger-ink); margin: 0; overflow-wrap: anywhere; }

.dsh-market-feedback,
.dsh-market-empty {
  display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
  min-height: 180px; padding: 32px 16px; text-align: center;
  color: var(--mk-text-3); font-size: 13px;
}
.dsh-market-feedback-error svg { color: var(--mk-danger-ink); }
.dsh-market-feedback-error .dsh-market-error { max-width: 60ch; }
.dsh-market-empty .dsh-market-secondary { align-self: center; }
.dsh-market-announcer {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}

.dsh-market-sources { display: flex; flex-direction: column; gap: 12px; }
.dsh-market-source-row {
  display: flex; align-items: center; gap: 12px; min-width: 0; padding: 12px 14px;
  border: 1px solid var(--mk-border); border-radius: var(--mk-radius-md); background: var(--mk-surface);
  transition: border-color var(--mk-motion-fast) ease;
}
.dsh-market-source-row .dsh-market-icon-tile { width: 36px; height: 36px; }
.dsh-market-source-texts { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; }
.dsh-market-source-label {
  display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
  font-size: 13px; font-weight: 650; color: var(--mk-text); overflow-wrap: anywhere;
}
.dsh-market-source-url {
  font-size: 11px; color: var(--mk-text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dsh-market-source-remove {
  display: flex; align-items: center; justify-content: center; flex: none;
  width: 38px; height: 38px; min-height: 38px; border-radius: var(--mk-radius-sm);
  border: 1px solid transparent; background: transparent; color: var(--mk-text-2); cursor: pointer;
  transition: background var(--mk-motion-fast) ease, color var(--mk-motion-fast) ease, border-color var(--mk-motion-fast) ease;
}
.dsh-market-source-remove:disabled { opacity: .48; cursor: not-allowed; }
.dsh-market-add {
  display: grid; grid-template-columns: minmax(120px, .65fr) minmax(220px, 1.35fr) auto;
  gap: 12px; align-items: end; padding-top: 8px;
}
.dsh-market-field { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.dsh-market-field label { font-size: 12px; font-weight: 500; color: var(--mk-text-2); }
.dsh-market-field input {
  width: 100%; min-width: 0; min-height: 40px; padding: 9px 11px;
  border: 1px solid var(--mk-border); border-radius: var(--mk-radius-sm);
  background: var(--mk-surface); color: var(--mk-text); font: inherit; font-size: 13px;
  transition: border-color var(--mk-motion-fast) ease, box-shadow var(--mk-motion-fast) ease;
}
.dsh-market-field input:focus { border-color: var(--mk-focus); box-shadow: 0 0 0 3px color-mix(in srgb, var(--mk-focus) 15%, transparent); }
.dsh-market-source-form-error { grid-column: 1 / -1; }

@media (hover: hover) {
  .dsh-market-dialog-close:hover,
  .dsh-market-back:hover,
  .dsh-market-secondary:hover { background: var(--mk-surface-2); color: var(--mk-text); border-color: var(--mk-border-strong); }
  .dsh-market-tab:hover:not([data-active="true"]) { background: var(--mk-surface-2); color: var(--mk-text); border-color: var(--mk-border-strong); }
  .dsh-market-tag:hover:not([data-active="true"]) { border-color: var(--mk-focus); color: var(--mk-focus); }
  .dsh-market-card:hover { border-color: color-mix(in srgb, var(--mk-focus) 60%, var(--mk-border)); box-shadow: var(--dsw-shadow-lv1, 0 5px 18px rgb(20 10 5 / 9%)); }
  .dsh-market-get:hover:not(:disabled),
  .dsh-market-install:hover:not(:disabled),
  .dsh-market-add-submit:hover:not(:disabled) { background: var(--mk-primary-hover); border-color: var(--mk-primary-hover); }
  .dsh-market-install[data-variant="danger"]:hover:not(:disabled),
  .dsh-market-confirm-remove:hover {
    background: var(--mk-danger-fill-hover);
    border-color: var(--mk-danger-fill-hover);
  }
  .dsh-market-source-remove:hover:not(:disabled) { background: color-mix(in srgb, var(--mk-danger) 10%, transparent); color: var(--mk-danger-ink); border-color: color-mix(in srgb, var(--mk-danger) 30%, transparent); }
}

.dsh-market-get:active:not(:disabled),
.dsh-market-install:active:not(:disabled),
.dsh-market-add-submit:active:not(:disabled) { background: var(--mk-primary-pressed); border-color: var(--mk-primary-pressed); }
.dsh-market-install[data-variant="danger"]:active:not(:disabled),
.dsh-market-confirm-remove:active {
  background: var(--mk-danger-fill-pressed);
  border-color: var(--mk-danger-fill-pressed);
}
.dsh-market-dialog-close:active,
.dsh-market-back:active,
.dsh-market-secondary:active { background: var(--mk-surface-2); }
.dsh-market-tab:active:not([data-active="true"]),
.dsh-market-tag:active:not([data-active="true"]) { background: var(--mk-surface-2); }

@media (max-width: 640px) {
  .dsh-market-overlay {
    padding: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right))
      max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left));
    align-items: stretch;
  }
  .dsh-market-dialog { width: 100%; height: 100%; min-width: 0; border-radius: var(--mk-radius-md); }
  .dsh-market-confirm-overlay {
    padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right))
      max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
  }
  .dsh-market-confirm { padding: 18px; }
  .dsh-market-confirm-actions { flex-direction: column-reverse; }
  .dsh-market-confirm-actions > button { width: 100%; }
  .dsh-market-dialog-head { min-height: 60px; padding: 8px 12px; }
  .dsh-market-dialog-subtitle { font-size: 11px; }
  .dsh-market-dialog-body { padding: 12px; }
  .dsh-market-toolbar { align-items: stretch; }
  .dsh-market-tabs { width: 100%; }
  .dsh-market-tab { flex: 1; }
  .dsh-market-search-wrap { min-width: 0; }
  .dsh-market-search,
  .dsh-market-field input { min-height: 44px; font-size: 16px; }
  .dsh-market-grid { grid-template-columns: 1fr; }
  .dsh-market-add { grid-template-columns: 1fr; }
  .dsh-market-add-submit { width: 100%; }
  .dsh-market-detail-head { align-items: flex-start; }
  .dsh-market-meta { flex-direction: column; gap: 8px; }
  .dsh-market-source-row { align-items: flex-start; }
}

@media (max-width: 768px), (pointer: coarse) {
  [data-dsh-sidebar-tools] > button,
  .dsh-market-dialog-close,
  .dsh-market-tab,
  .dsh-market-tag,
  .dsh-market-get,
  .dsh-market-back,
  .dsh-market-secondary,
  .dsh-market-install,
  .dsh-market-confirm-remove,
  .dsh-market-source-remove,
  .dsh-market-add-submit { min-height: 44px; }
  .dsh-market-dialog-close,
  .dsh-market-source-remove { width: 44px; height: 44px; }
  .dsh-market-search,
  .dsh-market-field input { min-height: 44px; font-size: 16px; }
}

@media (prefers-reduced-motion: reduce) {
  .dsh-market-dialog *, .dsh-market-overlay {
    scroll-behavior: auto !important; transition: none !important;
  }
}
`;
