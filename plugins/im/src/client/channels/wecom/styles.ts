// @ts-nocheck
export const WECOM_STYLE_ID = 'dsh-im-wecom-settings';

const CSS = String.raw`
.dwecom-page {
  --ddt-accent: var(--dsw-alias-button-info-fill, #a84c2c);
  --ddt-accent-deep: var(--dsw-alias-button-info-hover, #8f3f27);
  --ddt-brand-ink: var(--dsw-alias-state-business-primary, #a84c2c);
  --ddt-accent-wash: var(--dsw-alias-state-business-tertiary, color-mix(in srgb, var(--ddt-brand-ink) 9%, transparent));
  --ddt-focus: var(--dsw-alias-state-business-primary, #a84c2c);
}
.dwecom-avatar, .dwecom-brand { color: #3370ff; background: #fff; border: 1px solid var(--dsw-alias-border-l2, #e5e6eb); box-shadow: var(--dsw-alias-shadow-l1, 0 1px 4px rgb(31 35 41 / 12%)); }
.dwecom-avatar svg, .dwecom-brand svg { display: block; }
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
