// @ts-nocheck
export const WECOM_STYLE_ID = 'dsh-im-wecom-settings';

const CSS = String.raw`
.dwecom-page {
  --ddt-accent: var(--dsw-alias-button-info-fill, #B94305);
  --ddt-accent-deep: var(--dsw-alias-button-info-hover, #9F3703);
  --ddt-brand-ink: var(--dsw-alias-state-business-primary, #B94305);
  --ddt-accent-wash: var(--dsw-alias-state-business-tertiary, color-mix(in srgb, var(--ddt-brand-ink) 9%, transparent));
  --ddt-focus: var(--dsw-alias-state-business-primary, #B94305);
  --dwecom-success-ink: color-mix(in srgb, var(--dsw-alias-label-primary, #1f2329) 55%, var(--dsw-alias-state-success-primary, #20a162));
  --dwecom-warning-ink: color-mix(in srgb, var(--dsw-alias-label-primary, #1f2329) 45%, var(--dsw-alias-state-warn-primary, #d97706));
  --dwecom-error-ink: color-mix(in srgb, var(--dsw-alias-label-primary, #1f2329) 78%, var(--dsw-alias-state-error-primary, #d54941));
}
.dwecom-avatar, .dwecom-brand { color: #3370ff; background: #fff; border: 1px solid var(--dsw-alias-border-l2, #e5e6eb); box-shadow: var(--dsw-alias-shadow-l1, 0 1px 4px rgb(31 35 41 / 12%)); }
.dwecom-avatar svg, .dwecom-brand svg { display: block; }
.dwecom-officeRow { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--dsw-alias-border-l2, #e5e6eb); display: flex; flex-direction: column; gap: 8px; }
.dwecom-officeTitle { font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-primary, #1f2329); }
.dwecom-officeBody { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dwecom-officeState { font-size: 12px; color: var(--dsw-alias-label-secondary, #646a73); }
.dwecom-officeState[data-tone="success"] { color: var(--dwecom-success-ink); }
.dwecom-officeState[data-tone="warning"] { color: var(--dwecom-warning-ink); }
.dwecom-officeHint { font-size: 12px; color: var(--dsw-alias-label-secondary, #646a73); }
.dwecom-officeCommand { padding: 2px 6px; border-radius: 6px; background: var(--dsw-alias-bg-module-platform, #f2f3f5); color: var(--dsw-alias-label-secondary, #646a73); font: 11px/16px ui-monospace, SFMono-Regular, Menlo, monospace; }
.dwecom-officeError { font-size: 12px; color: var(--dwecom-error-ink); }
.dwecom-officeDetails { flex: 1 1 100%; order: 3; }
.dwecom-officeDetails summary { display: inline-flex; align-items: center; min-height: 32px; font-size: 12px; color: var(--dsw-alias-label-secondary, #646a73); cursor: pointer; }
.dwecom-officeDetails summary:focus-visible { outline: 2px solid var(--ddt-focus); outline-offset: 2px; }
.dwecom-officeToggle { display: flex; align-items: center; gap: 8px; min-height: 32px; font-size: 13px; color: var(--dsw-alias-label-primary, #1f2329); cursor: pointer; }
.dwecom-officeToggle input:focus-visible { outline: 2px solid var(--ddt-focus); outline-offset: 2px; }
.dwecom-officeMeta { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 2px 10px; margin: 4px 0 0; font-size: 12px; }
.dwecom-officeMeta dt { color: var(--dsw-alias-label-secondary, #646a73); }
.dwecom-officeMeta dd { margin: 0; color: var(--dsw-alias-label-secondary, #646a73); overflow-wrap: anywhere; }
@media (max-width: 768px), (pointer: coarse) {
  .dwecom-officeRow .ddt-button, .dwecom-officeDetails summary, .dwecom-officeToggle { min-height: 44px; }
}
@media (prefers-reduced-motion: reduce) {
  .dwecom-officeRow *, .dwecom-officeRow *::before, .dwecom-officeRow *::after { animation: none !important; transition: none !important; }
}
`;

export function installWecomStyles() {
  if (typeof document === 'undefined') return () => {};
  const existing = document.querySelector(`style[data-plugin-css="${WECOM_STYLE_ID}"]`);
  if (existing) return () => {};
  const style = document.createElement('style');
  style.dataset.plugin = 'dsh-im';
  style.dataset.pluginCss = WECOM_STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => style.remove();
}
