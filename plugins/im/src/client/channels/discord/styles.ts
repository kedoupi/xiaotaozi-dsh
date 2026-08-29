// @ts-nocheck
export const DISCORD_STYLE_ID = 'dsh-im-discord-settings';

const CSS = String.raw`
.ddc-page {
  --ddt-accent: var(--dsw-alias-button-info-fill, #a84c2c);
  --ddt-accent-deep: var(--dsw-alias-button-info-hover, #8f3f27);
  --ddt-brand-ink: var(--dsw-alias-state-business-primary, #a84c2c);
  --ddt-accent-wash: var(--dsw-alias-state-business-tertiary, color-mix(in srgb, var(--ddt-brand-ink) 9%, transparent));
  --ddt-focus: var(--dsw-alias-state-business-primary, #a84c2c);
}
.ddc-avatar { color: #fff; background: #5865f2; box-shadow: var(--dsw-alias-shadow-l1, 0 1px 4px rgb(31 35 41 / 12%)); }
.ddc-avatar svg { display: block; }
`;

export function installDiscordStyles() {
  if (typeof document === 'undefined') return () => {};
  const existing = document.querySelector(`style[data-plugin-css="${DISCORD_STYLE_ID}"]`);
  if (existing) return () => {};
  const style = document.createElement('style');
  style.dataset.plugin = 'dsh-im';
  style.dataset.pluginCss = DISCORD_STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => style.remove();
}
