export const archiveCss = `
.dshH-arch { max-width: 720px; padding: 8px 4px 24px; color: var(--dsw-alias-label-primary, #111827); }
.dshH-archTitle { margin: 0 0 4px; font-size: 18px; font-weight: 600; }
.dshH-archLede { margin: 0 0 16px; color: var(--dsw-alias-label-secondary, #475569); font-size: 13px; line-height: 1.5; }
.dshH-archBanner { margin: 0 0 12px; font-size: 13px; }
.dshH-archBanner.is-err { color: var(--dsw-alias-state-error-primary, #dc2626); }
.dshH-archBanner.is-ok { color: var(--dsw-alias-state-success-primary, #15803d); }
.dshH-archSearch { position: relative; margin-bottom: 10px; }
.dshH-archSearch input {
  width: 100%; height: 36px; padding: 0 34px; box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.1));
  border-radius: 18px; background: var(--dsw-alias-bg-module-platform, #f5f6f7);
  color: inherit; font-size: 13px;
}
.dshH-archSearch button {
  position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
  border: none; background: transparent; cursor: pointer; color: var(--dsw-alias-label-tertiary, #86909c);
}
.dshH-archFilters { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.dshH-archFilters select, .dshH-archFilters button {
  height: 34px; border-radius: 18px; border: 1px solid var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.1));
  background: var(--dsw-alias-bg-module-platform, #f5f6f7); color: inherit; font-size: 13px; padding: 0 12px;
}
.dshH-archDanger {
  border-color: color-mix(in srgb, #dc2626 35%, transparent) !important;
  color: var(--dsw-alias-state-error-primary, #dc2626) !important; background: transparent !important; cursor: pointer;
}
.dshH-archDanger:disabled { opacity: 0.45; cursor: default; }
.dshH-archEmpty, .dshH-archLoading { padding: 24px 0; color: var(--dsw-alias-label-tertiary, #86909c); font-size: 13px; }
.dshH-archGroup { margin-bottom: 16px; }
.dshH-archGroupHead { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
.dshH-archGroupTitle { font-size: 13px; font-weight: 600; }
.dshH-archGroupMeta { font-size: 12px; color: var(--dsw-alias-label-tertiary, #86909c); display: flex; align-items: center; gap: 8px; }
.dshH-archItem {
  display: flex; gap: 12px; justify-content: space-between; align-items: flex-start;
  padding: 10px 0; border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.08));
}
.dshH-archItemTitle { font-size: 14px; font-weight: 500; }
.dshH-archItemMeta { margin-top: 2px; font-size: 12px; color: var(--dsw-alias-label-tertiary, #86909c); display: flex; gap: 10px; flex-wrap: wrap; }
.dshH-archActions { display: flex; gap: 6px; flex-shrink: 0; flex-wrap: wrap; }
.dshH-archActions button {
  height: 28px; padding: 0 10px; border-radius: 14px; font-size: 12px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.12));
  background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.04)); color: inherit;
}
.dshH-archActions button.is-danger { color: var(--dsw-alias-state-error-primary, #dc2626); }
.dshH-archMask {
  position: fixed; inset: 0; z-index: 10050; background: rgba(15, 23, 42, 0.36);
  display: grid; place-items: center; padding: 24px;
}
.dshH-archModal {
  width: min(560px, 100%); max-height: min(80vh, 720px); overflow: auto;
  border-radius: 16px; padding: 16px 16px 12px;
  background: var(--dsw-alias-bg-layer-1, #fff);
  border: 1px solid color-mix(in srgb, #e08a62 18%, var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.1)));
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.16);
}
.dshH-archModal h3 { margin: 0 20px 12px 0; font-size: 16px; }
.dshH-archMsg { margin: 0 0 10px; padding: 10px 12px; border-radius: 10px; font-size: 13px; line-height: 1.45; white-space: pre-wrap; }
.dshH-archMsg.is-user { background: color-mix(in srgb, #e08a62 12%, var(--dsw-alias-bg-module-platform, #f5f6f7)); }
.dshH-archMsg.is-assistant { background: var(--dsw-alias-bg-module-platform, #f5f6f7); }
.dshH-archMsgRole { font-size: 11px; color: var(--dsw-alias-label-tertiary, #86909c); margin-bottom: 4px; }
.dshH-archModalFoot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
`;
