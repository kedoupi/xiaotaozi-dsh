// @ts-nocheck
export const TELEGRAM_STYLE_ID = 'dsh-im-telegram-settings';

const CSS = String.raw`
.dtg-page {
  --ddt-accent: var(--dsw-alias-button-info-fill, #B94305);
  --ddt-accent-deep: var(--dsw-alias-button-info-hover, #9F3703);
  --ddt-brand-ink: var(--dsw-alias-state-business-primary, #B94305);
  --ddt-accent-wash: var(--dsw-alias-state-business-tertiary, color-mix(in srgb, var(--ddt-brand-ink) 9%, transparent));
  --ddt-focus: var(--dsw-alias-state-business-primary, #B94305);
  --dtg-warning: var(--dsw-alias-state-warn-primary, #a15c00);
  --dtg-error: var(--dsw-alias-state-error-primary, #d83931);
  --dtg-warning-ink: color-mix(in srgb, var(--dsw-alias-label-primary, #1f2329) 78%, var(--dtg-warning));
  --dtg-error-ink: color-mix(in srgb, var(--dsw-alias-label-primary, #1f2329) 78%, var(--dtg-error));
}
.dtg-avatar { color: #fff; background: #229ed9; box-shadow: var(--dsw-alias-shadow-l1, 0 1px 4px rgb(31 35 41 / 12%)); }
.dtg-avatar svg { display: block; }
.dtg-access { min-width: 0; width: 100%; max-width: 100%; display: grid; gap: 12px; padding: 12px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: var(--xtz-radius-m, 12px); background: var(--dsw-alias-bg-layer-2, #f7f8fa); }
.dtg-accessHeading { position: relative; min-width: 0; max-width: 100%; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 12px; }
.dtg-accessHeading > strong { min-width: 0; font-size: 13px; overflow-wrap: anywhere; }
.dtg-accessStatus { min-width: 0; max-width: 100%; flex: 0 1 auto; display: inline-flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 6px; }
.dtg-accessBadge { min-width: 0; max-width: 100%; flex: 0 1 auto; padding: 3px 8px; border-radius: var(--xtz-radius-pill, 999px); color: var(--dsw-alias-label-secondary, #646a73); background: var(--dsw-alias-bg-module-platform, #f2f3f5); font-size: 11px; font-weight: 600; overflow-wrap: anywhere; text-align: center; }
.dtg-accessBadge[data-mode="private-allowlist"] { color: var(--dtg-warning-ink); background: var(--dsw-alias-state-warn-secondary, #fff3d6); }
.dtg-accessHelp { position: relative; display: inline-flex; flex: none; }
.dtg-accessHelpButton { width: 32px; height: 32px; display: grid; place-items: center; padding: 0; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 50%; color: var(--dsw-alias-label-secondary, #646a73); background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 12px; line-height: 1; font-weight: 600; cursor: help; transition: border-color var(--xtz-dur-fast, 120ms) ease, color var(--xtz-dur-fast, 120ms) ease, background-color var(--xtz-dur-fast, 120ms) ease; }
.dtg-accessHelpButton:hover { border-color: var(--ddt-brand-ink); color: var(--ddt-brand-ink); background: var(--ddt-accent-wash); }
.dtg-accessHelpButton:focus-visible { outline: 2px solid var(--ddt-focus); outline-offset: 2px; }
.dtg-accessTooltip { position: absolute; top: calc(100% + 8px); right: 0; z-index: 30; width: 260px; max-width: min(280px, calc(100vw - 48px)); display: grid; gap: 8px; padding: 10px 11px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: var(--xtz-radius-s, 8px); color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-3, #fff); box-shadow: var(--dsw-alias-shadow-l2, 0 10px 28px rgb(31 35 41 / 16%)); opacity: 0; visibility: hidden; transform: translateY(-3px); pointer-events: none; transition: opacity var(--xtz-dur-fast, 120ms) ease, transform var(--xtz-dur-fast, 120ms) ease, visibility var(--xtz-dur-fast, 120ms) ease; }
.dtg-accessTooltipItem { display: grid; gap: 2px; }
.dtg-accessTooltipItem + .dtg-accessTooltipItem { padding-top: 8px; border-top: 1px solid var(--dsw-alias-border-l2, #eef0f3); }
.dtg-accessTooltipItem strong { color: var(--dsw-alias-label-primary, #1f2329); font-size: 12px; line-height: 17px; font-weight: 700; }
.dtg-accessTooltipItem > span { color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; line-height: 16px; font-weight: 400; }
.dtg-accessHelp:hover .dtg-accessTooltip, .dtg-accessHelp:focus-within .dtg-accessTooltip { opacity: 1; visibility: visible; transform: translateY(0); }
.dtg-accessField { display: grid; gap: 5px; color: var(--dsw-alias-label-primary, #1f2329); font-size: 12px; font-weight: 600; }
.dtg-accessField select, .dtg-accessField textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l1, #c9cdd4); border-radius: var(--xtz-radius-s, 8px); color: inherit; background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-weight: 400; }
.dtg-accessField select { height: 36px; padding: 0 9px; }
.dtg-accessField textarea { min-height: 68px; padding: 8px 9px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.dtg-accessField textarea::placeholder { color: var(--dsw-alias-label-secondary, #646a73); opacity: 1; }
.dtg-accessField select:focus-visible, .dtg-accessField textarea:focus-visible { outline: 2px solid var(--ddt-focus); outline-offset: 2px; }
.dtg-accessField textarea:disabled { color: var(--dsw-alias-label-secondary, #646a73); background: var(--dsw-alias-bg-module-platform, #f2f3f5); cursor: not-allowed; resize: none; opacity: 1; }
.dtg-accessField small { color: var(--dsw-alias-label-secondary, #646a73); font-weight: 400; }
.dtg-accessWarning, .dtg-accessError { margin: 0; font-size: 12px; line-height: 1.5; }
.dtg-accessWarning { color: var(--dtg-warning-ink); }
.dtg-accessError { color: var(--dtg-error-ink); }
.dtg-accessActions { display: flex; justify-content: flex-end; }
@media (max-width: 768px), (pointer: coarse) { .dtg-accessHelpButton { width: 44px; height: 44px; } .dtg-accessField select { min-height: 44px; } }
@media (prefers-reduced-motion: reduce) { .dtg-page *, .dtg-page *::before, .dtg-page *::after { animation: none !important; transition: none !important; } }
`;

export function installTelegramStyles() {
  if (typeof document === 'undefined') return () => {};
  const existing = document.querySelector(`style[data-plugin-css="${TELEGRAM_STYLE_ID}"]`);
  if (existing) return () => {};
  const style = document.createElement('style');
  style.dataset.plugin = 'dsh-im';
  style.dataset.pluginCss = TELEGRAM_STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => style.remove();
}
