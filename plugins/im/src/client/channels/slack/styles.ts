// @ts-nocheck
export const SLACK_STYLE_ID = 'dsh-im-slack-settings';

const CSS = String.raw`
.dsl-page {
  --ddt-accent: var(--dsw-alias-button-info-fill, #a84c2c);
  --ddt-accent-deep: var(--dsw-alias-button-info-hover, #8f3f27);
  --ddt-brand-ink: var(--dsw-alias-state-business-primary, #a84c2c);
  --ddt-accent-wash: var(--dsw-alias-state-business-tertiary, color-mix(in srgb, var(--ddt-brand-ink) 9%, transparent));
  --ddt-focus: var(--dsw-alias-state-business-primary, #a84c2c);
  --dsl-success: var(--dsw-alias-state-success-primary, #20a162);
  --dsl-success-ink: color-mix(in srgb, var(--dsw-alias-label-primary, #1f2329) 78%, var(--dsl-success));
}
.dsl-avatar { color: #fff; background: #4a154b; box-shadow: var(--dsw-alias-shadow-l1, 0 1px 4px rgb(31 35 41 / 12%)); }
.dsl-avatar svg { display: block; }
.dsl-setup { display: grid; gap: 18px; }
.dsl-guide { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 16px; padding: 16px; border: 1px solid var(--dsw-alias-border-l2, #e5e6eb); border-radius: 12px; background: var(--dsw-alias-bg-layer-2, #f7f8fa); }
.dsl-guideCopy { min-width: 0; }
.dsl-guideCopy strong { display: block; margin-bottom: 5px; color: var(--dsw-alias-label-primary, #1f2329); font-size: 13px; }
.dsl-guideCopy p { margin: 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: 1.6; }
.dsl-guideActions { display: flex; align-items: center; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.dsl-guideActions .ddt-button { white-space: nowrap; }
.dsl-copyState { color: var(--dsl-success-ink); }
.dsl-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.dsl-tokenHint { grid-column: 1 / -1; margin: -4px 0 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; line-height: 1.55; }
@container (max-width: 680px) {
  .dsl-guide { grid-template-columns: minmax(0, 1fr); }
  .dsl-guideActions { justify-content: flex-start; }
  .dsl-fields { grid-template-columns: minmax(0, 1fr); }
}
`;

export function installSlackStyles() {
  if (typeof document === 'undefined') return () => {};
  const existing = document.querySelector(`style[data-plugin-css="${SLACK_STYLE_ID}"]`);
  if (existing) return () => {};
  const style = document.createElement('style');
  style.dataset.plugin = 'dsh-im';
  style.dataset.pluginCss = SLACK_STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => style.remove();
}
