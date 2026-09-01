export const archiveCss = `
.dshH-arch, .dshH-archDetail {
  max-width: 680px;
  padding: 8px 4px 32px;
  color: var(--dsw-alias-label-primary, #111827);
  font-family: var(--dsw-font-family);
}
.dshH-archBack {
  display: inline-flex; align-items: center; gap: 5px; min-height: 32px; margin: 0 0 12px; padding: 4px 8px;
  border: 0; border-radius: var(--xtz-radius-s, 8px); background: transparent;
  color: var(--dsw-alias-label-secondary, #475569); font: inherit; font-size: 13px; cursor: pointer;
}
.dshH-archBack:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, .06)); color: var(--dsw-alias-label-primary, #111827); }
.dshH-archHeading { margin-bottom: 16px; }
.dshH-archTitleRow { display: flex; align-items: center; gap: 8px; }
.dshH-archTitle { margin: 0; font-size: 18px; font-weight: 650; }
.dshH-archCount { padding: 1px 8px; border-radius: var(--xtz-radius-pill, 999px); background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, .06)); color: var(--dsw-alias-label-secondary, #475569); font-size: 11px; }
.dshH-archLede { margin: 5px 0 0; color: var(--dsw-alias-label-secondary, #475569); font-size: 13px; line-height: 1.5; }
.dshH-archBanner { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; font-size: 13px; }
.dshH-archBanner > span { flex: 1; }
.dshH-archBanner.is-err, .dshH-archDialogError { color: var(--dsw-xtz-status-error-ink, #b42318); }
.dshH-archBanner.is-ok { color: var(--dsw-xtz-status-success-ink, #4F7410); }
.dshH-archToolbar { display: grid; grid-template-columns: minmax(220px, 1fr) auto auto; gap: 8px; margin-bottom: 10px; }
.dshH-archSearch { position: relative; min-width: 0; }
.dshH-archSearch input, .dshH-archToolbar select, .dshH-archConfirmField input {
  box-sizing: border-box; width: 100%; min-height: 36px; padding: 6px 11px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(15, 23, 42, .12)); border-radius: var(--xtz-radius-s, 8px);
  background: var(--dsw-specific-input-major, var(--dsw-alias-bg-module-platform, #f5f6f7)); color: inherit; font: inherit; font-size: 13px;
}
.dshH-archSearch input { padding-right: 40px; }
.dshH-archSearch > button {
  position: absolute; top: 2px; right: 2px; display: grid; place-items: center; width: 32px; height: 32px;
  border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary, #475569); cursor: pointer;
}
.dshH-archToolbar select { width: auto; max-width: 180px; }
.dshH-archButton, .dshH-archRestore, .dshH-archPrimaryButton, .dshH-archDangerButton, .dshH-archDangerOutline {
  min-height: 36px; padding: 6px 13px; border-radius: var(--xtz-radius-s, 8px); font: inherit; font-size: 13px; white-space: nowrap; cursor: pointer;
}
.dshH-archButton, .dshH-archRestore {
  border: 1px solid var(--dsw-alias-border-l2, rgba(15, 23, 42, .12)); background: transparent; color: inherit;
}
.dshH-archRestore { border-color: transparent; color: var(--dsw-alias-state-business-primary, #B94305); font-weight: 600; }
.dshH-archPrimaryButton { border: 0; background: var(--dsw-alias-button-info-fill, #B94305); color: var(--dsw-alias-button-info-label, #fff); font-weight: 600; }
.dshH-archDangerButton { border: 0; background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 72%, black); color: #fff; font-weight: 600; }
.dshH-archDangerOutline { border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 38%, transparent); background: transparent; color: var(--dsw-xtz-status-error-ink, #b42318); }
.dshH-archButton:hover:not(:disabled), .dshH-archRestore:hover:not(:disabled), .dshH-archToolbar select:hover, .dshH-archSearch > button:hover, .dshH-archIconButton:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, .06)); }
.dshH-archPrimaryButton:hover:not(:disabled) { background: var(--dsw-alias-button-info-hover, #9F3703); }
.dshH-archDangerButton:hover:not(:disabled) { background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 64%, black); }
.dshH-archDangerOutline:hover:not(:disabled) { background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 8%, transparent); }
.dshH-arch :where(button, input, select):disabled, .dshH-archDetail :where(button, input):disabled, .dshH-archConfirm :where(button, input):disabled { opacity: .45; cursor: default; }
.dshH-archList { border-top: 1px solid var(--dsw-alias-border-l1, rgba(15, 23, 42, .07)); }
.dshH-archItem {
  display: flex; align-items: center; gap: 10px; min-width: 0; padding: 12px 4px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(15, 23, 42, .07));
}
.dshH-archItem.is-selected { background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #B94305) 6%, transparent); }
.dshH-archCheck { display: grid; place-items: center; width: 32px; min-height: 36px; flex: none; cursor: pointer; }
.dshH-archCheck input { width: 16px; height: 16px; margin: 0; accent-color: var(--dsw-alias-state-business-primary, #B94305); }
.dshH-srOnly { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.dshH-archItemCopy { flex: 1; min-width: 0; }
.dshH-archItemTitle {
  display: block; max-width: 100%; margin: 0; padding: 0; overflow: hidden; border: 0; background: transparent;
  color: var(--dsw-alias-label-primary, #111827); font: inherit; font-size: 14px; font-weight: 600; line-height: 1.4;
  text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer;
}
.dshH-archItemTitle:hover:not(:disabled) { color: var(--dsw-alias-state-business-primary, #B94305); }
.dshH-archItemMeta { display: flex; align-items: center; gap: 0; min-width: 0; margin-top: 3px; color: var(--dsw-alias-label-secondary, #475569); font-size: 12px; line-height: 1.4; flex-wrap: wrap; }
.dshH-archItemMeta span { display: inline-flex; align-items: center; min-width: 0; }
.dshH-archItemMeta span:not(:last-child)::after { content: "·"; margin: 0 6px; color: var(--dsw-alias-border-l4, rgba(15, 23, 42, .4)); }
.dshH-archActions { display: flex; align-items: center; gap: 2px; flex: none; }
.dshH-archIconButton {
  display: inline-grid; place-items: center; box-sizing: border-box; width: 32px; height: 32px; padding: 0;
  border: 0; border-radius: var(--xtz-radius-s, 8px); background: transparent; color: var(--dsw-alias-label-secondary, #475569); cursor: pointer; list-style: none;
}
.dshH-archIconButton::-webkit-details-marker { display: none; }
.dshH-archIconButton[aria-disabled="true"] { opacity: .45; cursor: default; }
.dshH-archMenu { position: relative; }
.dshH-archMenu[open] > summary { background: var(--dsw-alias-interactive-bg-active, rgba(15, 23, 42, .1)); color: var(--dsw-alias-label-primary, #111827); }
.dshH-archMenu > div {
  position: absolute; z-index: 20; top: calc(100% + 4px); right: 0; min-width: 132px; padding: 4px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(15, 23, 42, .12)); border-radius: var(--xtz-radius-s, 8px);
  background: var(--dsw-alias-bg-layer-1, #fff); box-shadow: var(--dsw-shadow-lv2, 0 8px 20px rgba(15, 23, 42, .12));
}
.dshH-archMenu.is-up > div { top: auto; bottom: calc(100% + 4px); }
.dshH-archMenu > div button { width: 100%; min-height: 34px; padding: 6px 10px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-xtz-status-error-ink, #b42318); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.dshH-archMenu > div button:hover:not(:disabled) { background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 8%, transparent); }
.dshH-archBulk {
  position: sticky; bottom: 0; z-index: 10; display: flex; align-items: center; gap: 8px; margin-top: 12px; padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(15, 23, 42, .12)); border-radius: var(--xtz-radius-m, 12px);
  background: var(--dsw-alias-bg-layer-1, #fff); box-shadow: var(--dsw-shadow-lv2, 0 8px 20px rgba(15, 23, 42, .12)); font-size: 12px;
}
.dshH-archBulk > span { margin-right: auto; font-weight: 600; }
.dshH-archLinkButton { min-height: 32px; padding: 4px; border: 0; background: transparent; color: var(--dsw-alias-state-business-primary, #B94305); font: inherit; font-size: 12px; cursor: pointer; }
.dshH-archCleanup {
  display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-top: 28px; padding-top: 16px;
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(15, 23, 42, .07));
}
.dshH-archCleanup h3 { margin: 0; font-size: 13px; font-weight: 650; }
.dshH-archCleanup p { margin: 4px 0 0; color: var(--dsw-alias-label-secondary, #475569); font-size: 12px; line-height: 1.5; }
.dshH-archEmpty, .dshH-archLoading { padding: 28px 0; color: var(--dsw-alias-label-secondary, #475569); font-size: 13px; }
.dshH-archEmpty p { margin: 0 0 12px; line-height: 1.55; }
.dshH-archEmptyState { display: grid; justify-items: center; padding: 40px 16px; text-align: center; }
.dshH-archEmptyState img { width: 64px; height: 64px; border-radius: var(--xtz-radius-l, 16px); box-shadow: 0 8px 24px color-mix(in srgb, var(--dsw-xtz-brand-display, #fc9052) 18%, transparent); }
.dshH-archEmptyState h3 { margin: 14px 0 0; font-size: 15px; }
.dshH-archEmptyState p { max-width: 320px; margin: 6px 0 14px; color: var(--dsw-alias-label-secondary, #475569); font-size: 13px; line-height: 1.6; }
.dshH-archDetail { display: flex; flex-direction: column; max-height: calc(100vh - 150px); }
.dshH-archDetailHead { padding-bottom: 12px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(15, 23, 42, .07)); }
.dshH-archDetailHead h2 { margin: 0; font-size: 18px; line-height: 1.4; overflow-wrap: anywhere; }
.dshH-archDetailError { margin: 12px 0 0; color: var(--dsw-xtz-status-error-ink, #b42318); font-size: 13px; }
.dshH-archDetailBody { flex: 1; min-height: 180px; overflow-y: auto; overscroll-behavior: contain; padding: 14px 2px; }
.dshH-archPreviewNote { margin: 0 0 12px; color: var(--dsw-alias-label-secondary, #475569); font-size: 12px; }
.dshH-archMsg { margin: 0 0 10px; padding: 10px 12px; border-radius: var(--xtz-radius-m, 12px); font-size: 13px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
.dshH-archMsg.is-user { background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #B94305) 9%, var(--dsw-alias-bg-module-platform, #f5f6f7)); }
.dshH-archMsg.is-assistant { background: var(--dsw-alias-bg-module-platform, #f5f6f7); }
.dshH-archMsgRole { margin-bottom: 4px; color: var(--dsw-alias-label-secondary, #475569); font-size: 11px; }
.dshH-archDetailFoot { display: flex; align-items: center; gap: 6px; padding-top: 12px; border-top: 1px solid var(--dsw-alias-border-l1, rgba(15, 23, 42, .07)); }
.dshH-archMask { position: fixed; inset: 0; z-index: 10050; display: grid; place-items: center; padding: 24px; background: var(--dsw-alias-bg-mask-1, rgba(15, 23, 42, .36)); }
.dshH-archConfirm { width: min(440px, 100%); box-sizing: border-box; padding: 16px; border: 1px solid var(--dsw-alias-border-l2, rgba(15, 23, 42, .12)); border-radius: var(--xtz-radius-l, 16px); background: var(--dsw-alias-bg-layer-1, #fff); box-shadow: var(--dsw-shadow-lv3, 0 16px 40px rgba(15, 23, 42, .16)); color: var(--dsw-alias-label-primary, #111827); }
.dshH-archModalHead { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.dshH-archModalHead h3 { margin: 4px 0 0; font-size: 16px; line-height: 1.4; overflow-wrap: anywhere; }
.dshH-archConfirmBody { margin-top: 12px; }
.dshH-archConfirmBody > p { margin: 0; color: var(--dsw-alias-label-secondary, #475569); font-size: 13px; line-height: 1.55; }
.dshH-archConfirmField { display: flex; flex-direction: column; gap: 6px; margin-top: 14px; color: var(--dsw-alias-label-secondary, #475569); font-size: 12px; }
.dshH-archDialogError { margin-top: 10px !important; }
.dshH-archModalFoot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.dshH-arch :where(button, input, select):focus-visible, .dshH-archDetail :where(button, input):focus-visible, .dshH-archConfirm :where(button, input):focus-visible, .dshH-archConfirm:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #B94305); outline-offset: 2px;
}
.dshH-arch :where(button, input, select), .dshH-archDetail :where(button, input), .dshH-archConfirm :where(button, input) {
  transition: background-color var(--xtz-dur-fast, 120ms) var(--xtz-ease-out, ease), color var(--xtz-dur-fast, 120ms) var(--xtz-ease-out, ease), border-color var(--xtz-dur-fast, 120ms) var(--xtz-ease-out, ease), transform var(--xtz-dur-fast, 120ms) var(--xtz-ease-out, ease);
}
@media (max-width: 768px) {
  .dshH-arch, .dshH-archDetail { max-width: none; padding-inline: 0; }
  .dshH-archToolbar { grid-template-columns: 1fr 1fr; }
  .dshH-archSearch { grid-column: 1 / -1; }
  .dshH-archToolbar select { width: 100%; max-width: none; }
  .dshH-archItem { align-items: flex-start; }
  .dshH-archActions { align-self: center; }
  .dshH-archRestore { padding-inline: 8px; }
  .dshH-archBulk { flex-wrap: wrap; }
  .dshH-archBulk > span { flex: 1 0 100%; }
  .dshH-archBulk > button { flex: 1 1 120px; }
  .dshH-archCleanup { align-items: stretch; flex-direction: column; }
  .dshH-archDangerOutline { width: 100%; }
  .dshH-archMask { align-items: end; padding: 12px 12px 0; }
  .dshH-archConfirm { width: 100%; padding-bottom: calc(16px + env(safe-area-inset-bottom)); border-radius: var(--xtz-radius-l, 16px) var(--xtz-radius-l, 16px) 0 0; }
  .dshH-archDetail { max-height: calc(100dvh - 96px); }
}
@media (max-width: 600px) {
  [role="dialog"]:has([data-dsh-plugin="xtz-ui-archive"]) > nav { display: none; }
}
@media (max-width: 480px) {
  .dshH-archItemMeta span:nth-of-type(n+3) { display: none; }
  .dshH-archItemTitle { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
}
@media (max-width: 768px), (pointer: coarse) {
  .dshH-arch :where(button, input, select), .dshH-archDetail :where(button, input), .dshH-archConfirm :where(button, input), .dshH-archIconButton, .dshH-archCheck { min-height: 44px; }
  .dshH-archSearch > button { top: 0; width: 44px; height: 44px; }
  .dshH-archSearch input, .dshH-archToolbar select, .dshH-archConfirmField input { font-size: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .dshH-arch *, .dshH-archDetail *, .dshH-archConfirm * { transition: none !important; animation: none !important; }
}
`;
