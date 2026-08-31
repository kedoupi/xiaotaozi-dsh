// @ts-nocheck
export const WHATSAPP_STYLE_ID = 'dsh-im-whatsapp-settings';

const CSS = String.raw`
.dwa-page {
  --ddt-accent: var(--dsw-alias-button-info-fill, #a84c2c);
  --ddt-accent-deep: var(--dsw-alias-button-info-hover, #8f3f27);
  --ddt-brand-ink: var(--dsw-alias-state-business-primary, #a84c2c);
  --ddt-accent-wash: var(--dsw-alias-state-business-tertiary, color-mix(in srgb, var(--ddt-brand-ink) 9%, transparent));
  --ddt-focus: var(--dsw-alias-state-business-primary, #a84c2c);
  --dwa-warning: var(--dsw-alias-state-warn-primary, #a15c00);
  --dwa-error: var(--dsw-alias-state-error-primary, #d83931);
  --dwa-warning-ink: color-mix(in srgb, var(--dsw-alias-label-primary, #1f2329) 78%, var(--dwa-warning));
  --dwa-error-ink: color-mix(in srgb, var(--dsw-alias-label-primary, #1f2329) 78%, var(--dwa-error));
}
.dwa-avatar { color: #fff; background: #25d366; box-shadow: var(--dsw-alias-shadow-l1, 0 1px 4px rgb(31 35 41 / 12%)); }
.dwa-avatar svg { display: block; }
.dwa-access { display: grid; gap: 12px; padding: 12px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: var(--xtz-radius-m, 12px); background: var(--dsw-alias-bg-layer-2, #f7f8fa); }
.dwa-accessHeading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.dwa-accessHeading > strong { font-size: 13px; }
.dwa-accessStatus { min-width: 0; display: inline-flex; align-items: center; justify-content: flex-end; gap: 6px; }
.dwa-accessBadge { flex: none; padding: 3px 8px; border-radius: var(--xtz-radius-pill, 999px); color: var(--dsw-alias-label-secondary, #646a73); background: var(--dsw-alias-bg-module-platform, #f2f3f5); font-size: 11px; font-weight: 600; }
.dwa-accessBadge[data-mode="private-allowlist"] { color: var(--ddt-brand-ink); background: var(--dsw-alias-state-business-tertiary, #f8e6d9); }
.dwa-accessBadge[data-mode="open"] { color: var(--dwa-warning-ink); background: var(--dsw-alias-state-warn-secondary, #fff3d6); }
.dwa-accessHelp { position: relative; display: inline-flex; flex: none; }
.dwa-accessHelpButton { width: 32px; height: 32px; display: grid; place-items: center; padding: 0; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 50%; color: var(--dsw-alias-label-secondary, #646a73); background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 12px; line-height: 1; font-weight: 600; cursor: help; transition: border-color var(--xtz-dur-fast, 120ms) ease, color var(--xtz-dur-fast, 120ms) ease, background-color var(--xtz-dur-fast, 120ms) ease; }
.dwa-accessHelpButton:hover { border-color: var(--ddt-brand-ink); color: var(--ddt-brand-ink); background: var(--ddt-accent-wash); }
.dwa-accessHelpButton:focus-visible { outline: 2px solid var(--ddt-focus); outline-offset: 2px; }
.dwa-accessTooltip { position: absolute; top: calc(100% + 8px); right: 0; z-index: 30; width: 270px; max-width: min(290px, calc(100vw - 48px)); display: grid; gap: 8px; padding: 10px 11px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: var(--xtz-radius-s, 8px); color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-3, #fff); box-shadow: var(--dsw-alias-shadow-l2, 0 10px 28px rgb(31 35 41 / 16%)); opacity: 0; visibility: hidden; transform: translateY(-3px); pointer-events: none; transition: opacity var(--xtz-dur-fast, 120ms) ease, transform var(--xtz-dur-fast, 120ms) ease, visibility var(--xtz-dur-fast, 120ms) ease; }
.dwa-accessTooltipItem { display: grid; gap: 2px; }
.dwa-accessTooltipItem + .dwa-accessTooltipItem { padding-top: 8px; border-top: 1px solid var(--dsw-alias-border-l2, #eef0f3); }
.dwa-accessTooltipItem strong { font-size: 12px; line-height: 17px; }
.dwa-accessTooltipItem > span { color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; line-height: 16px; }
.dwa-accessHelp:hover .dwa-accessTooltip, .dwa-accessHelp:focus-within .dwa-accessTooltip { opacity: 1; visibility: visible; transform: translateY(0); }
.dwa-accessField { display: grid; gap: 5px; color: var(--dsw-alias-label-primary, #1f2329); font-size: 12px; font-weight: 600; }
.dwa-accessField select, .dwa-accessField textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l1, #c9cdd4); border-radius: var(--xtz-radius-s, 8px); color: inherit; background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-weight: 400; }
.dwa-accessField select { height: 36px; padding: 0 9px; }
.dwa-accessField textarea { min-height: 68px; padding: 8px 9px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.dwa-accessField textarea::placeholder { color: var(--dsw-alias-label-secondary, #646a73); opacity: 1; }
.dwa-accessField select:focus-visible, .dwa-accessField textarea:focus-visible { outline: 2px solid var(--ddt-focus); outline-offset: 2px; }
.dwa-accessField textarea:disabled { color: var(--dsw-alias-label-secondary, #646a73); background: var(--dsw-alias-bg-module-platform, #f2f3f5); cursor: not-allowed; resize: none; opacity: 1; }
.dwa-accessField small { color: var(--dsw-alias-label-secondary, #646a73); font-weight: 400; }
.dwa-accessWarning, .dwa-accessError { margin: 0; font-size: 12px; line-height: 1.5; }
.dwa-accessWarning { color: var(--dwa-warning-ink); }
.dwa-accessError { color: var(--dwa-error-ink); }
.dwa-accessActions { display: flex; justify-content: flex-end; }
@media (max-width: 768px), (pointer: coarse) { .dwa-accessHelpButton { width: 44px; height: 44px; } .dwa-accessField select { min-height: 44px; } }
@media (prefers-reduced-motion: reduce) { .dwa-page *, .dwa-page *::before, .dwa-page *::after { animation: none !important; transition: none !important; } }
`;

export function installWhatsappStyles() {
  if (typeof document === 'undefined') return () => {};
  const existing = document.querySelector(`style[data-plugin-css="${WHATSAPP_STYLE_ID}"]`);
  if (existing) return () => {};
  const style = document.createElement('style');
  style.dataset.plugin = 'dsh-im';
  style.dataset.pluginCss = WHATSAPP_STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => style.remove();
}
