export const archiveCss = `
.dshH-arch { max-width: 760px; padding: 8px 4px 32px; color: var(--dsw-alias-label-primary, #111827); }
.dshH-archTitle { margin: 0 0 4px; font-size: 18px; font-weight: 600; }
.dshH-archLede { margin: 0 0 16px; color: var(--dsw-alias-label-secondary, #475569); font-size: 13px; line-height: 1.5; }
.dshH-archBanner { margin: 0 0 12px; font-size: 13px; }
.dshH-archBanner.is-err { color: var(--dsw-xtz-status-error-ink, #b42318); }
.dshH-archBanner.is-ok { color: var(--dsw-xtz-status-success-ink, #13713b); }
.dshH-archSearch { position: relative; margin-bottom: 8px; }
.dshH-archSearch input {
  width: 100%; height: 36px; padding: 0 40px 0 12px; box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.1));
  border-radius: 8px; background: var(--dsw-alias-bg-module-platform, #f5f6f7);
  color: inherit; font-size: 13px;
}
.dshH-archSearch button {
  position: absolute; right: 2px; top: 2px; width: 32px; height: 32px; display: grid; place-items: center;
  border: none; border-radius: 6px; background: transparent; cursor: pointer; color: var(--dsw-alias-label-secondary, #475569);
}
.dshH-archFilters { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.dshH-archFilters select, .dshH-archFilters button {
  min-height: 36px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.1));
  background: var(--dsw-alias-bg-module-platform, #f5f6f7); color: inherit; font-size: 13px; padding: 0 12px;
}
.dshH-archDanger {
  border-color: color-mix(in srgb, #dc2626 35%, transparent) !important;
  color: var(--dsw-xtz-status-error-ink, #b42318) !important; background: transparent !important; cursor: pointer;
}
.dshH-archDanger:disabled, .dshH-archActions button:disabled { opacity: 0.45; cursor: default; }
.dshH-archEmpty, .dshH-archLoading { padding: 24px 0; color: var(--dsw-alias-label-secondary, #475569); font-size: 13px; }
.dshH-archGroup { margin-bottom: 16px; }
.dshH-archGroupHead { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
.dshH-archGroupTitle { margin: 0; font-size: 13px; font-weight: 600; }
.dshH-archGroupMeta { font-size: 12px; color: var(--dsw-alias-label-secondary, #475569); display: flex; align-items: center; gap: 8px; }
.dshH-archItem {
  display: flex; gap: 12px; justify-content: space-between; align-items: flex-start;
  padding: 10px 0; border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.08));
}
.dshH-archItemTitle { font-size: 14px; font-weight: 500; }
.dshH-archItemMeta { margin-top: 2px; font-size: 12px; color: var(--dsw-alias-label-secondary, #475569); display: flex; gap: 10px; flex-wrap: wrap; }
.dshH-archActions { display: flex; gap: 6px; flex-shrink: 0; flex-wrap: wrap; }
.dshH-archActions button {
  min-height: 32px; padding: 0 10px; border-radius: 8px; font-size: 12px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.12));
  background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.04)); color: inherit;
}
.dshH-archActions button:not(:disabled):hover, .dshH-archFilters select:hover, .dshH-archSearch button:hover,
.dshH-archModalClose:hover, .dshH-archModalFoot button:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.07));
}
.dshH-archActions button.is-danger { color: var(--dsw-xtz-status-error-ink, #b42318); }
.dshH-archMask {
  position: fixed; inset: 0; z-index: 10050; background: color-mix(in srgb, var(--dsw-alias-label-primary, #111827) 36%, transparent);
  display: grid; place-items: center; padding: 24px;
}
.dshH-archModal {
  display: flex; flex-direction: column; width: min(560px, 100%); max-height: min(80vh, 720px); overflow: hidden;
  box-sizing: border-box; border-radius: 16px; padding: 16px;
  background: var(--dsw-alias-bg-layer-1, #fff);
  border: 1px solid var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.1));
  box-shadow: var(--dsw-shadow-lv3, 0 16px 40px rgba(15, 23, 42, 0.16));
}
.dshH-archModalHead { display: flex; flex: none; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.dshH-archModal h3 { margin: 2px 0 0; font-size: 16px; line-height: 1.4; }
.dshH-archModalClose { width: 32px; height: 32px; flex: 0 0 auto; display: grid; place-items: center; border: 0; border-radius: 8px; background: transparent; color: inherit; cursor: pointer; }
.dshH-archMsg { margin: 0 0 10px; padding: 10px 12px; border-radius: 10px; font-size: 13px; line-height: 1.45; white-space: pre-wrap; }
.dshH-archItemTitle, .dshH-archMsg, .dshH-archModal h3 { overflow-wrap: anywhere; }
.dshH-archMsg.is-user { background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #a84c2c) 10%, var(--dsw-alias-bg-module-platform, #f5f6f7)); }
.dshH-archMsg.is-assistant { background: var(--dsw-alias-bg-module-platform, #f5f6f7); }
.dshH-archMsgRole { font-size: 11px; color: var(--dsw-alias-label-secondary, #475569); margin-bottom: 4px; }
.dshH-archModalBody { min-height: 0; overflow: auto; overscroll-behavior: contain; }
.dshH-archModalFoot { display: flex; flex: none; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.dshH-archModalFoot button { min-height: 36px; padding: 0 14px; border: 1px solid var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.1)); border-radius: 8px; background: transparent; color: inherit; cursor: pointer; }
.dshH-arch :where(button, input, select):focus-visible, .dshH-archModal:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #a84c2c); outline-offset: 2px;
}
@media (max-width: 768px) {
  .dshH-arch { padding-inline: 0; }
  .dshH-archFilters > * { flex: 1 1 140px; }
  .dshH-archItem { flex-direction: column; }
  .dshH-archActions { width: 100%; }
  .dshH-archActions button { flex: 1 1 auto; min-height: 44px; }
  .dshH-archMask { padding: 12px; align-items: end; }
  .dshH-archModal { width: 100%; max-height: min(88vh, 720px); border-radius: 16px 16px 0 0; padding-bottom: calc(16px + env(safe-area-inset-bottom)); }
  .dshH-archModalClose, .dshH-archModalFoot button, .dshH-archFilters select, .dshH-archFilters button { min-height: 44px; }
  .dshH-archSearch input { min-height: 44px; }
  .dshH-archSearch button { top: 0; width: 44px; height: 44px; min-height: 44px; }
}
@media (pointer: coarse) {
  .dshH-archSearch input, .dshH-archSearch button, .dshH-archFilters select, .dshH-archFilters button,
  .dshH-archActions button, .dshH-archModalClose, .dshH-archModalFoot button { min-height: 44px; }
  .dshH-archSearch button { width: 40px; top: 2px; }
}
@media (prefers-reduced-motion: reduce) {
  .dshH-arch *, .dshH-archMask * { scroll-behavior: auto !important; transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}
`;
