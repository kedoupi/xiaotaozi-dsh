export const marketCss = `
.dsh-sidebar-tools { display: flex; flex-wrap: wrap; align-items: stretch; gap: 8px; margin: 0 2px 8px; min-width: 0; }
.dsh-sidebar-tools > button { flex: 1 1 calc(50% - 4px); min-width: 0; margin: 0 !important; padding-inline: 8px !important; justify-content: center; }
.dsh-sidebar-tools > button span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-market-entry svg { color: var(--dsw-alias-state-business-primary, #c45a32); flex: none; }

.dsh-market-overlay {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  background: rgba(15, 10, 8, 0.45);
  backdrop-filter: blur(2px);
}
.dsh-market-dialog {
  --mk-accent: var(--dsw-alias-state-business-primary, #c45a32);
  --mk-accent-soft: var(--dsw-alias-state-business-tertiary, #f8e6d9);
  --mk-accent-hover: var(--dsw-alias-button-info-hover, #e08a62);
  --mk-border: var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08));
  --mk-surface: var(--dsw-alias-bg-layer-1, #fff);
  --mk-surface-2: var(--dsw-alias-bg-module-platform, #f7f5f3);
  --mk-text: var(--dsw-alias-label-primary, #1f1713);
  --mk-text-2: var(--dsw-alias-label-secondary, #5a4d45);
  --mk-text-3: var(--dsw-alias-label-tertiary, #8a7c73);
  --mk-ok: var(--dsw-alias-state-success-primary, #2e9e5b);
  --mk-danger: var(--dsw-alias-state-error-primary, #d64545);
  display: flex; flex-direction: column;
  width: min(920px, calc(100vw - 48px));
  height: min(700px, calc(100vh - 48px));
  border-radius: 16px; overflow: hidden;
  background: var(--mk-surface);
  color: var(--mk-text);
  box-shadow: 0 24px 64px rgba(20, 10, 5, 0.28);
}
.dsh-market-dialog *:focus-visible {
  outline: 2px solid var(--mk-accent); outline-offset: 2px; border-radius: 6px;
}

.dsh-market-dialog-head {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 20px; border-bottom: 1px solid var(--mk-border);
}
.dsh-market-dialog-mark {
  display: flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; border-radius: 10px; flex: none;
  background: var(--mk-accent-soft); color: var(--mk-accent);
}
.dsh-market-dialog-titles { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.dsh-market-dialog-title { font-size: 15px; font-weight: 600; line-height: 1.3; }
.dsh-market-dialog-subtitle { font-size: 12px; color: var(--mk-text-3); line-height: 1.4; }
.dsh-market-dialog-close {
  margin-left: auto; display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 8px; border: none; background: none;
  color: var(--mk-text-3); cursor: pointer; transition: background 160ms ease, color 160ms ease;
}
.dsh-market-dialog-close:hover { background: var(--mk-surface-2); color: var(--mk-text); }
.dsh-market-dialog-body { flex: 1; overflow-y: auto; padding: 16px 20px 24px; }

.dsh-market-panel { display: flex; flex-direction: column; gap: 14px; }
.dsh-market-toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.dsh-market-tabs {
  display: inline-flex; gap: 2px; padding: 3px;
  border-radius: 10px; background: var(--mk-surface-2);
}
.dsh-market-tab {
  padding: 6px 16px; font-size: 13px; font-weight: 500; border-radius: 8px;
  border: none; background: none; color: var(--mk-text-2); cursor: pointer;
  transition: background 160ms ease, color 160ms ease, box-shadow 160ms ease;
}
.dsh-market-tab:hover { color: var(--mk-text); }
.dsh-market-tab[data-active="true"] {
  background: var(--mk-surface); color: var(--mk-text);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
.dsh-market-search-wrap {
  position: relative; flex: 1 1 220px; min-width: 180px; display: flex; align-items: center;
}
.dsh-market-search-wrap > svg {
  position: absolute; left: 10px; color: var(--mk-text-3); pointer-events: none;
}
.dsh-market-search {
  width: 100%; padding: 8px 12px 8px 32px; font-size: 13px;
  border: 1px solid var(--mk-border); border-radius: 10px;
  background: var(--mk-surface-2); color: var(--mk-text);
  transition: border-color 160ms ease, background 160ms ease;
}
.dsh-market-search::placeholder { color: var(--mk-text-3); }
.dsh-market-search:focus { outline: none; border-color: var(--mk-accent); background: var(--mk-surface); }

.dsh-market-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.dsh-market-tag {
  padding: 4px 12px; font-size: 12px; border-radius: 999px;
  border: 1px solid var(--mk-border); background: none;
  color: var(--mk-text-2); cursor: pointer;
  transition: background 160ms ease, color 160ms ease, border-color 160ms ease;
}
.dsh-market-tag:hover { border-color: var(--mk-accent); color: var(--mk-accent); }
.dsh-market-tag[data-active="true"] {
  background: var(--mk-accent-soft); border-color: var(--mk-accent); color: var(--mk-accent);
  font-weight: 500;
}

.dsh-market-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
.dsh-market-card {
  display: flex; flex-direction: column; gap: 10px; padding: 14px; text-align: left;
  border: 1px solid var(--mk-border); border-radius: 12px;
  background: var(--mk-surface); cursor: pointer;
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}
.dsh-market-card:hover {
  border-color: var(--mk-accent);
  box-shadow: 0 4px 16px rgba(20, 10, 5, 0.08);
  transform: translateY(-1px);
}
.dsh-market-card-top { display: flex; align-items: center; gap: 10px; }
.dsh-market-icon-tile {
  display: flex; align-items: center; justify-content: center; flex: none;
  width: 40px; height: 40px; border-radius: 10px;
  background: var(--mk-accent-soft); color: var(--mk-accent);
}
.dsh-market-icon-tile[data-kind="workflow"] {
  background: color-mix(in srgb, var(--mk-ok) 14%, transparent); color: var(--mk-ok);
}
.dsh-market-card-id { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.dsh-market-card-name {
  font-size: 14px; font-weight: 600; color: var(--mk-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dsh-market-card-version { font-size: 11px; color: var(--mk-text-3); }
.dsh-market-card-summary {
  font-size: 12px; line-height: 1.5; color: var(--mk-text-2); margin: 0;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  min-height: 2.6em;
}
.dsh-market-card-foot { display: flex; align-items: center; gap: 6px; }

.dsh-market-chip {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; padding: 2px 8px; border-radius: 999px;
  border: 1px solid var(--mk-border); color: var(--mk-text-3); white-space: nowrap;
}
.dsh-market-chip[data-kind="installed"] {
  color: var(--mk-ok); border-color: color-mix(in srgb, var(--mk-ok) 40%, transparent);
  background: color-mix(in srgb, var(--mk-ok) 8%, transparent);
}
.dsh-market-chip[data-kind="queued"] {
  color: var(--mk-accent); border-color: color-mix(in srgb, var(--mk-accent) 40%, transparent);
  background: var(--mk-accent-soft);
}

.dsh-market-get {
  margin-left: auto; display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 14px; font-size: 12px; font-weight: 600; border-radius: 999px;
  border: none; cursor: pointer;
  background: var(--mk-accent-soft); color: var(--mk-accent);
  transition: background 160ms ease, color 160ms ease;
}
.dsh-market-get:hover { background: var(--mk-accent); color: #fff; }
.dsh-market-get:disabled { opacity: 0.7; cursor: default; }
.dsh-market-get:disabled:hover { background: var(--mk-accent-soft); color: var(--mk-accent); }

.dsh-market-detail { display: flex; flex-direction: column; gap: 16px; }
.dsh-market-back {
  align-self: flex-start; display: inline-flex; align-items: center; gap: 6px;
  background: none; border: none; padding: 4px 0; font-size: 13px;
  color: var(--mk-text-2); cursor: pointer; transition: color 160ms ease;
}
.dsh-market-back:hover { color: var(--mk-accent); }
.dsh-market-detail-head { display: flex; align-items: center; gap: 14px; }
.dsh-market-detail-head .dsh-market-icon-tile { width: 56px; height: 56px; border-radius: 14px; }
.dsh-market-detail-titles { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.dsh-market-detail-name { font-size: 19px; font-weight: 650; line-height: 1.2; }
.dsh-market-detail-badges { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dsh-market-detail-summary { font-size: 13px; line-height: 1.7; color: var(--mk-text-2); margin: 0; }
.dsh-market-meta {
  display: flex; gap: 20px; flex-wrap: wrap; font-size: 12px; color: var(--mk-text-3);
  padding: 12px 14px; border: 1px solid var(--mk-border); border-radius: 10px;
  background: var(--mk-surface-2);
}
.dsh-market-meta b { color: var(--mk-text-2); font-weight: 500; }
.dsh-market-install {
  align-self: flex-start; display: inline-flex; align-items: center; gap: 7px;
  padding: 9px 24px; font-size: 13px; font-weight: 600; border-radius: 10px;
  border: none; cursor: pointer;
  background: var(--mk-accent); color: #fff;
  transition: background 160ms ease, transform 160ms ease;
}
.dsh-market-install:hover { background: var(--mk-accent-hover); }
.dsh-market-install:active { transform: scale(0.98); }
.dsh-market-install:disabled {
  background: var(--mk-accent-soft); color: var(--mk-accent); cursor: default; transform: none;
}
.dsh-market-install[data-variant="danger"] { background: var(--mk-danger); }

.dsh-market-note { font-size: 12px; line-height: 1.5; color: var(--mk-text-3); margin: 0; }
.dsh-market-error { font-size: 13px; color: var(--mk-danger); margin: 0; }
.dsh-market-empty {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  padding: 48px 0; color: var(--mk-text-3); font-size: 13px;
}

.dsh-market-sources { display: flex; flex-direction: column; gap: 10px; }
.dsh-market-source-row {
  display: flex; align-items: center; gap: 12px; padding: 12px 14px;
  border: 1px solid var(--mk-border); border-radius: 12px;
  background: var(--mk-surface); transition: border-color 160ms ease;
}
.dsh-market-source-row .dsh-market-icon-tile { width: 36px; height: 36px; }
.dsh-market-source-texts { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
.dsh-market-source-label {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; font-weight: 600; color: var(--mk-text);
}
.dsh-market-source-url {
  font-size: 11px; color: var(--mk-text-3);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dsh-market-source-remove {
  display: flex; align-items: center; justify-content: center; flex: none;
  width: 30px; height: 30px; border-radius: 8px; border: none; background: none;
  color: var(--mk-text-3); cursor: pointer;
  transition: background 160ms ease, color 160ms ease;
}
.dsh-market-source-remove:hover {
  background: color-mix(in srgb, var(--mk-danger) 10%, transparent); color: var(--mk-danger);
}
.dsh-market-add { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.dsh-market-add input {
  padding: 8px 12px; font-size: 13px; border: 1px solid var(--mk-border);
  border-radius: 10px; background: var(--mk-surface-2); color: var(--mk-text);
  transition: border-color 160ms ease, background 160ms ease;
}
.dsh-market-add input::placeholder { color: var(--mk-text-3); }
.dsh-market-add input:focus { outline: none; border-color: var(--mk-accent); background: var(--mk-surface); }
.dsh-market-add input[name="label"] { flex: 0 1 140px; }
.dsh-market-add input[name="indexUrl"] { flex: 1 1 260px; }
.dsh-market-add-submit {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 18px; font-size: 13px; font-weight: 600; border-radius: 10px;
  border: none; cursor: pointer;
  background: var(--mk-accent); color: #fff;
  transition: background 160ms ease;
}
.dsh-market-add-submit:hover { background: var(--mk-accent-hover); }

@media (prefers-reduced-motion: reduce) {
  .dsh-market-dialog *, .dsh-market-overlay { transition: none !important; }
  .dsh-market-card:hover { transform: none; }
}
`;
