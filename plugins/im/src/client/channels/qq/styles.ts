// @ts-nocheck
export const QQ_STYLE_ID = 'dsh-im-qq-settings';

const CSS = String.raw`
.dqq-page {
  --ddt-accent: var(--dsw-alias-button-info-fill, #a84c2c);
  --ddt-accent-deep: var(--dsw-alias-button-info-hover, #8f3f27);
  --ddt-brand-ink: var(--dsw-alias-state-business-primary, #a84c2c);
  --ddt-accent-wash: var(--dsw-alias-state-business-tertiary, color-mix(in srgb, var(--ddt-brand-ink) 9%, transparent));
  --ddt-focus: var(--dsw-alias-state-business-primary, #a84c2c);
}
.dqq-avatar, .dqq-brand { color: #fff; background: #1677ff; box-shadow: var(--dsw-alias-shadow-l1, 0 1px 4px rgb(31 35 41 / 12%)); }
.dqq-avatar svg, .dqq-brand svg { display: block; }
`;

export function installQqStyles() {
  if (typeof document === 'undefined') return () => {};
  const existing = document.querySelector(`style[data-plugin-css="${QQ_STYLE_ID}"]`);
  if (existing) return () => {};
  const style = document.createElement('style');
  style.dataset.plugin = 'dsh-im';
  style.dataset.pluginCss = QQ_STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => style.remove();
}
