// @ts-nocheck
export const IM_STYLE_ID = 'dsh-im-settings';

const CSS = String.raw`
.dim-page {
  --dim-action: var(--dsw-alias-button-info-fill, #a84c2c);
  --dim-action-hover: var(--dsw-alias-button-info-hover, #8f3f27);
  --dim-action-pressed: var(--dsw-static-deepseek-800, #5a3228);
  --dim-brand-ink: var(--dsw-alias-state-business-primary, #a84c2c);
  --dim-focus: var(--dsw-alias-state-business-primary, #a84c2c);
  --dim-error-ink: color-mix(in srgb, var(--dsw-alias-label-primary, #1f2329) 78%, var(--dsw-alias-state-error-primary, #d54941));
  --dim-danger-fill: color-mix(in srgb, var(--dsw-alias-state-error-primary, #ec1313) 72%, black);
  --dim-danger-fill-hover: color-mix(in srgb, var(--dsw-alias-state-error-primary, #ec1313) 62%, black);
  --dim-danger-fill-pressed: color-mix(in srgb, var(--dsw-alias-state-error-primary, #ec1313) 52%, black);
  width: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  flex: 1;
  color: var(--dsw-alias-label-primary, #1f2329);
  box-sizing: border-box;
}
.dim-srOnly { position: absolute !important; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.dim-page *, .dim-page *::before, .dim-page *::after { box-sizing: border-box; }
.dim-brandVersion { color: var(--dsw-alias-label-secondary, #646a73); font: 500 11px/16px ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0; }
.dim-loopbackRecovery { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 0 0 14px; padding: 14px 16px; border: 1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary, #d97706) 30%, var(--dsw-alias-border-l2, #dfe1e5)); border-radius: 12px; color: var(--dsw-alias-label-primary, #1f2329); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #d97706) 8%, var(--dsw-alias-bg-layer-1, #fff)); }
.dim-loopbackRecoveryCopy { min-width: 0; }
.dim-loopbackRecoveryCopy strong { display: block; font-size: 14px; line-height: 20px; font-weight: 650; }
.dim-loopbackRecoveryCopy p { margin: 3px 0 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: 18px; }
.dim-loopbackRecoveryCopy code { display: block; overflow: hidden; margin-top: 5px; color: var(--dsw-alias-label-secondary, #646a73); font: 11px/16px ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }
.dim-loopbackRecoveryAction { flex: none; min-height: 36px; display: inline-flex; align-items: center; justify-content: center; padding: 0 12px; border: 1px solid var(--dim-action); border-radius: 8px; color: #fff; background: var(--dim-action); font: inherit; font-size: 13px; font-weight: 600; white-space: nowrap; cursor: pointer; touch-action: manipulation; transition: background-color 160ms ease, border-color 160ms ease; }
.dim-loopbackRecoveryAction:hover:not(:disabled) { border-color: var(--dim-action-hover); background: var(--dim-action-hover); }
.dim-loopbackRecoveryAction:active:not(:disabled) { border-color: var(--dim-action-pressed); background: var(--dim-action-pressed); }
.dim-loopbackRecoveryAction:focus-visible { outline: 2px solid var(--dim-focus); outline-offset: 2px; }
/* Mounted on document.body. Must beat sidebar panel-host (25) and DSH overlay stack (100+). */
.dim-hubScrim { --dim-action: var(--dsw-alias-button-info-fill, #a84c2c); --dim-action-hover: var(--dsw-alias-button-info-hover, #8f3f27); --dim-action-pressed: var(--dsw-static-deepseek-800, #5a3228); --dim-brand-ink: var(--dsw-alias-state-business-primary, #a84c2c); --dim-focus: var(--dsw-alias-state-business-primary, #a84c2c); position: fixed; inset: 0; z-index: 10040; display: grid; place-items: center; padding: 24px; background: rgb(15 10 8 / 45%); pointer-events: auto; }
.dim-hubPanel { width: min(1040px, calc(100vw - 48px)); height: min(760px, calc(100dvh - 48px)); display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 16px; outline: none; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); box-shadow: var(--dsw-shadow-lv3, 0 24px 64px rgb(20 10 5 / 28%)); }
.dim-hubPanel:focus-visible { outline: 2px solid var(--dim-focus); outline-offset: 2px; }
.dim-hubHead { display: flex; align-items: center; gap: 12px; flex: none; padding: 14px 20px; border-bottom: 1px solid var(--dsw-alias-border-l2, #dfe1e5); }
.dim-hubMark { width: 34px; height: 34px; display: grid; place-items: center; flex: none; border-radius: 8px; color: var(--dim-brand-ink); background: var(--dsw-alias-state-business-tertiary, color-mix(in srgb, var(--dim-brand-ink) 14%, transparent)); }
.dim-hubTitles { min-width: 0; flex: 1; display: flex; align-items: baseline; gap: 8px; }
.dim-hubTitle { margin: 0; font-size: 18px; line-height: 24px; font-weight: 650; }
.dim-hubGithub { flex: none; display: inline-flex; align-items: center; min-height: 32px; padding: 0 8px; border-radius: 8px; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; font-weight: 600; text-decoration: none; cursor: pointer; touch-action: manipulation; transition: background-color 160ms ease, color 160ms ease; }
.dim-hubGithub:hover { color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-interactive-bg-hover, #f7f8fa); }
.dim-hubGithub:focus-visible, .dim-hubClose:focus-visible, .dim-channel:focus-visible { outline: 2px solid var(--dim-focus); outline-offset: 2px; }
.dim-hubClose { width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; flex: none; padding: 0; border: 0; border-radius: 8px; color: var(--dsw-alias-label-tertiary, #8f959e); background: transparent; cursor: pointer; }
.dim-hubClose:hover { color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-interactive-bg-hover, #f7f8fa); }
.dim-hubPanel .dim-page { max-width: none; padding: 0; }
[data-dsh-sidebar-tools] { display: flex; flex-wrap: wrap; align-items: stretch; gap: 8px; margin: 0 2px 8px; min-width: 0; }
[data-dsh-sidebar-tools] > button { flex: 1 1 calc(50% - 4px); min-width: 0; min-height: 38px; margin: 0 !important; padding-inline: 8px !important; justify-content: center; cursor: pointer; }
[data-dsh-sidebar-tools] > button span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dim-hubEntry svg { color: var(--dim-brand-ink, var(--dsw-alias-state-business-primary, #a84c2c)); flex: none; }
.dim-layout { display: flex; flex-direction: column; min-height: 0; flex: 1; gap: 0; align-items: stretch; }
.dim-rail { display: flex; flex-wrap: wrap; align-content: start; gap: 6px; padding: 12px 16px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1, #eef0f3); background: var(--dsw-alias-bg-module-platform, #f7f8fa); }
.dim-channel { width: auto; min-height: 36px; display: grid; grid-template-columns: 22px max-content; align-items: center; gap: 8px; padding: 6px 10px; border: 1px solid transparent; border-radius: 8px; color: var(--dsw-alias-label-secondary, #646a73); background: var(--dsw-alias-bg-layer-1, #fff); box-shadow: none; font: inherit; text-align: left; cursor: pointer; touch-action: manipulation; transition: border-color 160ms ease, background-color 160ms ease, color 160ms ease; }
.dim-channel:hover { color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); border-color: var(--dsw-alias-border-l2, #eef0f3); }
.dim-channel[aria-selected="true"] { border-color: color-mix(in srgb, var(--dim-brand-ink) 40%, var(--dsw-alias-border-l2, #dfe1e5)); color: var(--dim-brand-ink); background: var(--dsw-alias-state-business-tertiary, color-mix(in srgb, var(--dim-brand-ink) 12%, transparent)); box-shadow: inset 0 -2px 0 var(--dim-brand-ink); }
.dim-logo { width: 22px; height: 22px; display: grid; place-items: center; border-radius: 8px; box-shadow: none; }
.dim-logo svg { display: block; width: 14px; height: 14px; }
.dim-logoWeixin { color: white; background: #07c160; }
.dim-logoWeixin svg { width: 13px; height: 13px; }
.dim-logoFeishu { background: white; border: 1px solid var(--dsw-alias-border-l2, #e5e6eb); }
.dim-logoFeishu svg { width: 16px; height: 16px; }
.dim-logoDingtalk { color: white; background: #1677ff; }
.dim-logoDingtalk svg { width: 15px; height: 15px; }
.dim-logoQq { color: white; background: #1677ff; }
.dim-logoQq svg { width: 14px; height: 14px; }
.dim-logoWecom { background: white; border: 1px solid var(--dsw-alias-border-l2, #e5e6eb); }
.dim-logoWecom svg { width: 15px; height: 15px; }
.dim-logoTelegram { color: white; background: #229ed9; }
.dim-logoTelegram svg { width: 14px; height: 14px; }
.dim-logoOffice { color: white; background: linear-gradient(145deg, #12213f, #3964fe); }
.dim-logoOffice svg { width: 15px; height: 15px; }
.dim-logoDiscord { color: white; background: #5865f2; }
.dim-logoDiscord svg { width: 14px; height: 14px; }
.dim-logoSlack { color: white; background: #4a154b; }
.dim-logoSlack svg { width: 14px; height: 14px; }
.dim-logoWhatsapp { color: white; background: #25d366; }
.dim-logoWhatsapp svg { width: 14px; height: 14px; }
.dim-channelCopy { min-width: 0; display: grid; }
.dim-channelCopy strong { overflow: hidden; color: inherit; font-size: 13px; line-height: 18px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.dim-channelNote { overflow: hidden; color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; line-height: 14px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.dim-divider { display: none; }
.dim-panel { min-width: 0; min-height: 0; flex: 1; overflow: auto; padding: 16px 20px 24px; container-type: inline-size; }
.dim-panel .bxf-page, .dim-panel .dxw-page, .dim-panel .ddt-page, .dim-panel .dqq-page, .dim-panel .dwecom-page, .dim-panel .dsl-page, .dim-panel .dwa-page { width: 100%; max-width: none; padding: 0 0 24px; }
.dim-panel .bxf-heading, .dim-panel .dxw-heading, .dim-panel .ddt-heading { justify-content: flex-end; }
.dim-panel .bxf-headingTools, .dim-panel .dxw-tools, .dim-panel .ddt-tools { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) max-content; align-items: center; justify-content: stretch; gap: 8px; }
.dim-panel .dim-bindActions { min-width: 0; display: flex; align-items: center; flex-wrap: nowrap; gap: 8px; }
.dim-panel .dim-bindActions > button { min-width: 0; }
.dim-panel .bxf-headingTools .dim-scanButton, .dim-panel .dxw-tools .dim-scanButton, .dim-panel .ddt-tools .dim-scanButton { flex: none; min-height: 36px; display: inline-flex; align-items: center; justify-content: center; justify-self: start; gap: 6px; padding: 0 10px; border: 1px solid var(--dim-action); border-radius: 8px; color: #fff; background: var(--dim-action); box-shadow: none; font: inherit; font-size: 13px; font-weight: 600; white-space: nowrap; }
.dim-panel .bxf-headingTools .dim-scanButton:hover:not(:disabled), .dim-panel .dxw-tools .dim-scanButton:hover:not(:disabled), .dim-panel .ddt-tools .dim-scanButton:hover:not(:disabled) { border-color: var(--dim-action-hover); background: var(--dim-action-hover); }
.dim-panel .bxf-headingTools .dim-scanButton:active:not(:disabled), .dim-panel .dxw-tools .dim-scanButton:active:not(:disabled), .dim-panel .ddt-tools .dim-scanButton:active:not(:disabled) { border-color: var(--dim-action-pressed); background: var(--dim-action-pressed); transform: none; }
.dim-panel .dim-credentialButton { flex: none; min-height: 36px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); box-shadow: none; font: inherit; font-size: 13px; font-weight: 600; line-height: normal; white-space: nowrap; }
.dim-panel .dim-actionIcon { width: 15px; height: 15px; flex: 0 0 15px; }
.dim-panel .dim-credentialButton:hover:not(:disabled) { border-color: var(--dsw-alias-border-l3, #bbbfc4); background: var(--dsw-alias-interactive-bg-hover, #f7f8fa); }
.dim-panel .dim-credentialButton[aria-pressed="true"] { border-color: color-mix(in srgb, var(--dim-brand-ink) 40%, var(--dsw-alias-border-l2, #dfe1e5)); color: var(--dim-brand-ink); background: var(--dsw-alias-state-business-tertiary, color-mix(in srgb, var(--dim-brand-ink) 10%, transparent)); }
.dim-panel .bxf-headingTools .dim-onlineBadge, .dim-panel .dxw-tools .dim-onlineBadge, .dim-panel .ddt-tools .dim-onlineBadge { min-height: 30px; display: inline-flex; align-items: center; justify-self: end; gap: 0; padding: 0 11px; border: 0; border-radius: 999px; color: var(--dsw-alias-label-secondary, #646a73); background: var(--dsw-alias-bg-module-platform, #f2f3f5); font: inherit; font-size: 12px; font-weight: 400; line-height: normal; white-space: nowrap; }
.dim-panel .dim-channelPage { width: 100%; max-width: none; display: flex; flex-direction: column; gap: 12px; padding: 0 0 24px; color: var(--dsw-alias-label-primary, #1f2329); box-sizing: border-box; }
.dim-panel .dim-surfaceCard { position: relative; overflow: hidden; border: 1px solid var(--dsw-alias-border-l2, #e5e6eb); border-radius: 12px; background: var(--dsw-alias-bg-layer-1, #fff); box-shadow: var(--dsw-shadow-lv1, 0 1px 2px rgb(31 35 41 / 3%)); }
.dim-panel .dim-surfaceCard::before { display: none; }
.dim-panel .dim-surfaceBody { padding: 24px; }
.dim-panel .dim-credentialPanel { display: grid; gap: 18px; padding: 20px; }
.dim-panel .dim-credentialTitle { margin: 0; color: var(--dsw-alias-label-primary, #1f2329); font-size: 17px; line-height: 1.35; font-weight: 650; }
.dim-panel .dim-credentialHint { margin: 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: 1.55; }
.dim-panel .dim-credentialForm { min-width: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 12px; }
.dim-panel .dim-credentialFormSingle { grid-template-columns: minmax(0, 1fr); }
.dim-panel .dim-credentialField { min-width: 0; display: grid; gap: 8px; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: normal; font-weight: 600; }
.dim-panel .dim-credentialField input { width: 100%; min-width: 0; height: 38px; padding: 0 11px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; outline: none; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; transition: border-color 160ms ease, box-shadow 160ms ease; }
.dim-panel .dim-credentialField input:focus-visible { border-color: var(--dim-focus); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dim-focus) 24%, transparent); }
.dim-panel .dim-credentialField input[aria-invalid="true"] { border-color: var(--dsw-alias-state-error-primary, #d54941); }
.dim-panel .dim-credentialField input::placeholder { color: var(--dsw-alias-label-secondary, #646a73); font-family: inherit; }
.dim-panel .dim-credentialError, .dim-panel .dim-credentialActions { grid-column: 1 / -1; }
.dim-panel .dim-credentialError { margin: 0; color: var(--dim-error-ink); font-size: 12px; line-height: 1.5; }
.dim-panel .dim-credentialActions { margin-top: 0; }
.dim-panel .dim-listSection { display: flex; flex-direction: column; gap: 0; }
.dim-panel .dim-listHeading { min-height: 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 0 0 6px; padding: 0; }
.dim-panel .dim-listHeading h3 { margin: 0; color: var(--dsw-alias-label-primary, #1f2329); font-size: 14px; line-height: normal; font-weight: 650; }
.dim-panel .dim-listTitle { min-width: 0; display: inline-flex; align-items: center; gap: 6px; }
.dim-panel .dim-channelHelp { position: relative; display: inline-flex; flex: none; }
.dim-panel .dim-channelHelpButton { width: 32px; height: 32px; display: grid; place-items: center; padding: 0; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 50%; color: var(--dsw-alias-label-secondary, #646a73); background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 12px; line-height: 1; font-weight: 700; cursor: help; transition: border-color 160ms ease, color 160ms ease, background-color 160ms ease; }
.dim-panel .dim-channelHelpButton:hover { border-color: var(--dim-brand-ink); color: var(--dim-brand-ink); background: var(--dsw-alias-state-business-tertiary, color-mix(in srgb, var(--dim-brand-ink) 8%, transparent)); }
.dim-panel .dim-channelHelpButton:focus-visible { outline: 2px solid var(--dim-focus); outline-offset: 2px; }
.dim-panel .dim-channelTooltip { position: absolute; top: calc(100% + 7px); left: 0; z-index: 30; width: max-content; max-width: min(280px, calc(100vw - 48px)); display: flex; align-items: baseline; gap: 5px; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-secondary, #646a73); background: var(--dsw-alias-bg-layer-3, #fff); box-shadow: var(--dsw-shadow-lv2, 0 10px 28px rgb(31 35 41 / 16%)); font-size: 11px; line-height: 16px; font-weight: 400; white-space: normal; opacity: 0; visibility: hidden; transform: translateY(-3px); pointer-events: none; transition: opacity 160ms ease, transform 160ms ease, visibility 160ms ease; }
.dim-panel .dim-channelTooltip strong { color: var(--dsw-alias-label-primary, #1f2329); font-weight: 600; white-space: nowrap; }
.dim-panel .dim-channelHelp:hover .dim-channelTooltip, .dim-panel .dim-channelHelp:focus-within .dim-channelTooltip { opacity: 1; visibility: visible; transform: translateY(0); }
.dim-panel .dim-botList { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 380px)); align-items: start; gap: 8px; margin: 0; padding: 0; list-style: none; }
.dim-panel .dim-loadingView { padding: 38px; color: var(--dsw-alias-label-secondary, #646a73); text-align: center; }
.dim-panel .dim-loadingView h3 { margin: 0 0 7px; color: var(--dsw-alias-label-primary, #1f2329); font-size: 17px; line-height: normal; font-weight: 650; }
.dim-panel .dim-loadingView p { margin: 0; line-height: 1.6; }
.dim-panel .dim-spinner { width: 24px; height: 24px; margin: 0 auto 13px; border: 3px solid var(--dsw-alias-border-l2, #e6e8eb); border-top-color: var(--dim-brand-ink); border-radius: 50%; animation: dim-spin 800ms linear infinite; }
@keyframes dim-spin { to { transform: rotate(360deg); } }
.dim-panel .dim-emptyView { min-height: 230px; display: grid; grid-template-columns: minmax(0, 1fr) 180px; align-items: center; gap: 30px; }
.dim-panel .dim-emptyCopy { min-width: 0; }
.dim-panel .dim-emptyCopy h3 { margin: 8px 0; color: var(--dsw-alias-label-primary, #1f2329); font-size: 18px; line-height: 1.35; font-weight: 650; }
.dim-panel .dim-emptyCopy > p { max-width: 560px; margin: 0; color: var(--dsw-alias-label-secondary, #646a73); line-height: 1.65; }
.dim-panel .dim-usageGuide { overflow: hidden; border: 1px solid var(--dsw-alias-border-l2, #e5e6eb); border-radius: 12px; background: var(--dsw-alias-bg-layer-1, #fff); }
.dim-panel .dim-usageGuide > summary { list-style: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 40px; padding: 8px 14px; color: var(--dsw-alias-label-secondary, #646a73); font-size: 13px; font-weight: 600; cursor: pointer; }
.dim-panel .dim-usageGuide > summary::-webkit-details-marker { display: none; }
.dim-panel .dim-usageGuide > summary::after { content: ""; width: 7px; height: 7px; flex: none; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(45deg); transition: transform 160ms ease; }
.dim-panel .dim-usageGuide[open] > summary { color: var(--dsw-alias-label-primary, #1f2329); border-bottom: 1px solid var(--dsw-alias-border-l1, #eef0f3); }
.dim-panel .dim-usageGuide[open] > summary::after { transform: rotate(225deg); }
.dim-panel .dim-usageBody { display: grid; gap: 8px; padding: 12px 14px 14px; }
.dim-panel .dim-usageBody h4 { margin: 6px 0 0; color: var(--dsw-alias-label-primary, #1f2329); font-size: 13px; line-height: 18px; font-weight: 650; }
.dim-panel .dim-usageBody p { margin: 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 13px; line-height: 1.65; }
.dim-panel .dim-usageCommands { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 2px 16px; margin: 0; padding: 0; list-style: none; }
.dim-panel .dim-usageCommands li { color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: 1.55; }
.dim-panel .dim-usageCommands code { margin-right: 6px; color: var(--dsw-alias-label-primary, #1f2329); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; font-weight: 650; }
.dim-panel .dim-emptyBrand { width: 110px; height: 110px; display: grid; place-items: center; justify-self: center; border-radius: 16px; box-shadow: var(--dsw-shadow-lv2, 0 12px 28px rgb(31 35 41 / 14%)); }
.dim-panel .dim-stateLabel { display: inline-flex; align-items: center; gap: 8px; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: normal; font-weight: 600; }
.dim-panel .dim-stateDot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--dsw-alias-label-tertiary, #8f959e); box-shadow: none; }
.dim-panel .dim-stateDot[data-tone="success"] { background: var(--dsw-alias-state-success-primary, #20a162); }
.dim-panel .dim-stateDot[data-tone="warning"] { background: var(--dsw-alias-state-warn-primary, #d97706); }
.dim-panel .dim-stateDot[data-tone="error"] { background: var(--dsw-alias-state-error-primary, #d54941); }
.dim-panel .dim-viewActions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
.dim-panel :is(.bxf-button, .dxw-button, .ddt-button) { min-height: 36px; padding: 0 13px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); box-shadow: none; font: inherit; font-size: 13px; font-weight: 600; line-height: normal; white-space: nowrap; touch-action: manipulation; transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease; }
.dim-panel :is(.bxf-button, .dxw-button, .ddt-button):hover:not(:disabled) { border-color: var(--dsw-alias-border-l3, #bbbfc4); background: var(--dsw-alias-interactive-bg-hover, #f7f8fa); }
.dim-panel :is(.bxf-button, .dxw-button, .ddt-button):active:not(:disabled) { transform: none; background: var(--dsw-alias-bg-module-platform, #f2f3f5); }
.dim-panel :is(.bxf-button, .dxw-button, .ddt-button):focus-visible { outline: 2px solid var(--dim-focus); outline-offset: 2px; }
.dim-panel :is(.bxf-button, .dxw-button, .ddt-button):disabled { cursor: not-allowed; opacity: .5; }
.dim-panel :is(.bxf-button, .dxw-button, .ddt-button)[data-kind="primary"] { border-color: var(--dim-action); color: #fff; background: var(--dim-action); box-shadow: none; }
.dim-panel :is(.bxf-button, .dxw-button, .ddt-button)[data-kind="primary"]:hover:not(:disabled) { border-color: var(--dim-action-hover); background: var(--dim-action-hover); }
.dim-panel :is(.bxf-button, .dxw-button, .ddt-button)[data-kind="primary"]:active:not(:disabled) { border-color: var(--dim-action-pressed); background: var(--dim-action-pressed); }
.dim-panel :is(.bxf-button, .dxw-button, .ddt-button)[data-kind="danger"] { color: var(--dim-error-ink); }
.dim-panel .dim-qrLayout { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 34px; align-items: start; }
.dim-panel .dim-qrColumn { width: 100%; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 12px; }
.dim-panel .dim-qrFrame { position: relative; width: min(270px, 100%); height: auto; aspect-ratio: 1; display: grid; place-items: center; overflow: hidden; padding: 10px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 12px; background: #fff; }
.dim-panel .dim-qrFrame::before { content: ""; position: absolute; inset: 7px; z-index: 0; border: 1px solid color-mix(in srgb, var(--dim-brand-ink) 16%, var(--dsw-alias-border-l2, #dfe1e5)); border-radius: 8px; pointer-events: none; }
.dim-panel .dim-qrFrame::after { display: none; }
.dim-panel .dim-qrFrame img { position: relative; z-index: 1; width: 100%; height: 100%; display: block; object-fit: contain; }
.dim-panel .dim-qrFallback { position: relative; z-index: 1; display: grid; place-items: center; gap: 8px; color: var(--dsw-alias-label-secondary, #646a73); font-size: 13px; line-height: 1.5; text-align: center; }
.dim-panel .dim-qrExpired { position: absolute; inset: 0; z-index: 2; display: grid; place-items: center; padding: 20px; color: var(--dsw-static-neutral-bluish-1000, #0f1115); background: rgb(255 255 255 / 92%); font-size: 15px; line-height: 1.6; font-weight: 650; text-align: center; white-space: pre-line; backdrop-filter: blur(3px); }
.dim-panel .dim-countdown { width: min(270px, 100%); margin: 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: normal; }
.dim-panel .dim-countdownTop { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
.dim-panel .dim-countdownTop strong { color: var(--dsw-alias-label-primary, #1f2329); font-weight: 650; }
.dim-panel .dim-progress { height: 4px; overflow: hidden; margin: 0; border-radius: 999px; background: var(--dsw-alias-bg-module-platform, #eef0f3); }
.dim-panel .dim-progress span { display: block; width: var(--bxf-progress, var(--dxw-progress, var(--ddt-progress, 0%))); height: 100%; border-radius: inherit; background: var(--dim-brand-ink); transition: width 160ms linear; }
.dim-panel .dim-qrCopy { min-width: 0; overflow-wrap: anywhere; }
.dim-panel .dim-qrCopy h3 { margin: 9px 0 8px; color: var(--dsw-alias-label-primary, #1f2329); font-size: 18px; line-height: 1.35; font-weight: 650; }
.dim-panel .dim-qrCopy > p { margin: 0; color: var(--dsw-alias-label-secondary, #646a73); line-height: 1.65; }
.dim-panel .dim-steps { margin: 18px 0 16px; padding: 0; list-style: none; counter-reset: dim-step; }
.dim-panel .dim-steps li { position: relative; min-height: 28px; display: flex; align-items: center; padding: 5px 0 5px 36px; color: var(--dsw-alias-label-secondary, #646a73); line-height: 1.5; counter-increment: dim-step; }
.dim-panel .dim-steps li::before { content: counter(dim-step); position: absolute; left: 0; top: 4px; width: 25px; height: 25px; display: grid; place-items: center; border-radius: 8px; color: var(--dim-brand-ink); background: var(--dsw-alias-state-business-tertiary, color-mix(in srgb, var(--dim-brand-ink) 16%, transparent)); font-size: 12px; font-weight: 650; }
.dim-panel .dim-specialView { padding: 32px; text-align: center; }
.dim-panel .dim-statusNotice { display: flex; align-items: flex-start; gap: 10px; padding: 13px 15px; border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary, #d54941) 22%, var(--dsw-alias-border-l2, #dfe1e5)); border-radius: 8px; color: var(--dim-error-ink); background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d54941) 8%, var(--dsw-alias-bg-layer-1, #fff)); font-size: 13px; line-height: 1.5; }
.dim-panel .dim-inlineError { display: flex; align-items: flex-start; flex-direction: column; gap: 10px; padding: 22px; color: var(--dim-error-ink); background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d54941) 8%, var(--dsw-alias-bg-layer-1, #fff)); }
.dim-panel .dim-inlineError > div { min-width: 0; }
.dim-panel .dim-inlineError h3 { margin: 0; color: inherit; font-size: 17px; line-height: 1.35; font-weight: 650; }
.dim-panel .dim-inlineError p { margin: 7px 0 0; color: inherit; line-height: 1.6; }
.dim-panel .dim-botCard:has(> .dim-confirm) { box-shadow: 0 1px 2px rgb(31 35 41 / 3%), 0 0 0 1px color-mix(in srgb, var(--dsw-alias-state-error-primary, #d54941) 28%, transparent); }
.dim-panel .dim-botCard:has(> .dim-confirm) .dim-botCardBody { display: none; }
.dim-panel .dim-botList:has(.dim-confirm) > li:not(:has(.dim-confirm)) { opacity: .48; pointer-events: none; }
.dim-panel .dim-confirm { display: flex; flex-direction: column; justify-content: center; min-height: 196px; padding: 20px 20px 18px; border-top: 0; background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d54941) 6%, var(--dsw-alias-bg-layer-1, #fff)); }
.dim-panel .dim-confirm strong, .dim-panel .dim-confirm h4 { margin: 0; color: var(--dsw-alias-label-primary, #1f2329); font-size: 15px; line-height: 1.4; font-weight: 650; }
.dim-panel .dim-confirm p { margin: 8px 0 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 13px; line-height: 1.6; }
.dim-panel .dim-confirm .dim-viewActions { margin-top: 16px; }
.dim-panel .dim-confirm .dim-viewActions [data-kind="danger"] { border-color: var(--dim-danger-fill); color: #fff; background: var(--dim-danger-fill); }
.dim-panel .dim-confirm .dim-viewActions [data-kind="danger"]:hover:not(:disabled) { border-color: var(--dim-danger-fill-hover); background: var(--dim-danger-fill-hover); }
.dim-panel .dim-confirm .dim-viewActions [data-kind="danger"]:active:not(:disabled) { border-color: var(--dim-danger-fill-pressed); background: var(--dim-danger-fill-pressed); }
.dim-panel .dim-confirm .dim-viewActions [data-kind="danger"]:focus-visible { outline: 2px solid var(--dsw-alias-state-error-primary, #ec1313); outline-offset: 2px; }
.dim-panel .dim-cardFooter { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding-top: 6px; border-top: 1px solid var(--dsw-alias-border-l1, #eef0f3); }
.dim-panel .dim-workspace { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) max-content; align-items: center; column-gap: 10px; row-gap: 4px; margin-top: 6px; padding: 6px 10px; border: 1px solid var(--dsw-alias-border-l1, #eef0f3); border-radius: 8px; background: var(--dsw-alias-bg-module-platform, #f7f8fa); }
.dim-panel .dim-workspaceHeader { display: contents; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: normal; }
.dim-panel .dim-workspaceHeader > span { grid-column: 1; grid-row: 1; white-space: nowrap; }
.dim-panel .dim-workspaceEdit { grid-column: 2; grid-row: 1; min-height: 32px; padding: 0 4px; border: 0; border-radius: 8px; color: var(--dim-brand-ink); background: transparent; font: inherit; font-weight: 600; white-space: nowrap; cursor: pointer; }
.dim-panel .dim-workspaceEdit:hover:not(:disabled) { background: var(--dsw-alias-state-business-tertiary, color-mix(in srgb, var(--dim-brand-ink) 8%, transparent)); }
.dim-panel .dim-workspaceEdit:focus-visible { outline: 2px solid var(--dim-focus); outline-offset: 2px; }
.dim-panel .dim-workspaceEdit:disabled { cursor: not-allowed; opacity: .55; }
.dim-panel .dim-workspacePath { min-width: 0; max-width: 100%; grid-column: 1 / -1; grid-row: 2; display: block; overflow-x: auto; overflow-y: hidden; color: var(--dsw-alias-label-primary, #1f2329); font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; }
.dim-panel .dim-preset { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) max-content; align-items: center; column-gap: 10px; row-gap: 4px; margin-top: 6px; padding: 6px 10px; border: 1px solid var(--dsw-alias-border-l1, #eef0f3); border-radius: 8px; background: var(--dsw-alias-bg-module-platform, #f7f8fa); }
.dim-panel .dim-presetHeader { position: relative; min-width: 0; grid-column: 1 / -1; grid-row: 1; display: flex; align-items: center; justify-content: space-between; gap: 10px; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: normal; }
.dim-panel .dim-presetTitle { min-width: 0; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.dim-panel .dim-presetHelp { display: inline-flex; align-items: center; flex: none; }
.dim-panel .dim-presetHelpButton { width: 32px; height: 32px; display: grid; place-items: center; padding: 0; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 50%; color: var(--dsw-alias-label-secondary, #646a73); background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 12px; line-height: 1; font-weight: 700; cursor: help; }
.dim-panel .dim-presetHelpButton:hover { border-color: var(--dim-brand-ink); color: var(--dim-brand-ink); background: var(--dsw-alias-state-business-tertiary, color-mix(in srgb, var(--dim-brand-ink) 8%, transparent)); }
.dim-panel .dim-presetHelpButton:focus-visible { outline: 2px solid var(--dim-focus); outline-offset: 2px; }
.dim-panel .dim-presetTooltip { position: absolute; top: calc(100% + 7px); left: 0; z-index: 30; width: min(320px, 100%); padding: 9px 10px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-3, #fff); box-shadow: var(--dsw-shadow-lv2, 0 10px 28px rgb(31 35 41 / 16%)); font-size: 11px; line-height: 16px; font-weight: 400; overflow-wrap: anywhere; white-space: normal; opacity: 0; visibility: hidden; pointer-events: none; }
.dim-panel .dim-presetHelp:hover .dim-presetTooltip, .dim-panel .dim-presetHelp:focus-within .dim-presetTooltip { opacity: 1; visibility: visible; }
.dim-panel .dim-presetStatus { color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; white-space: nowrap; }
.dim-panel .dim-presetSelect { min-width: 0; max-width: 100%; grid-column: 1 / -1; grid-row: 2; height: 36px; padding: 0 8px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 12px; }
.dim-panel .dim-presetSelect:focus-visible, .dim-panel .dim-instructionInput:focus-visible, .dim-panel .dim-instructionSave:focus-visible { outline: 2px solid var(--dim-focus); outline-offset: 2px; }
.dim-panel .dim-presetError { grid-column: 1 / -1; grid-row: 3; margin: 0; color: var(--dim-error-ink); font-size: 12px; line-height: 1.4; }
.dim-panel .dim-instruction { margin-top: 6px; padding: 6px 10px; border: 1px solid var(--dsw-alias-border-l1, #eef0f3); border-radius: 8px; background: var(--dsw-alias-bg-module-platform, #f7f8fa); }
.dim-panel .dim-instructionSummary { min-height: 32px; display: flex; align-items: center; justify-content: space-between; gap: 10px; cursor: pointer; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: normal; list-style: none; }
.dim-panel .dim-instructionSummary::-webkit-details-marker { display: none; }
.dim-panel .dim-instructionTitle { min-width: 0; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.dim-panel .dim-instructionBody { display: grid; gap: 8px; margin-top: 8px; }
.dim-panel .dim-instructionInput { width: 100%; min-height: 72px; padding: 8px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 12px; line-height: 1.45; resize: vertical; }
.dim-panel .dim-instructionActions { display: flex; justify-content: flex-end; }
.dim-panel .dim-instructionSave { min-height: 32px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 12px; cursor: pointer; }
.dim-panel .dim-instructionSave:disabled { opacity: 0.5; cursor: default; }
.dim-directoryPickerBackdrop { --dim-action: var(--dsw-alias-button-info-fill, #a84c2c); --dim-action-hover: var(--dsw-alias-button-info-hover, #8f3f27); --dim-action-pressed: var(--dsw-static-deepseek-800, #5a3228); --dim-brand-ink: var(--dsw-alias-state-business-primary, #a84c2c); --dim-focus: var(--dsw-alias-state-business-primary, #a84c2c); --dim-brand-soft: var(--dsw-alias-state-business-tertiary, color-mix(in srgb, var(--dim-brand-ink) 9%, transparent)); --dim-error-ink: color-mix(in srgb, var(--dsw-alias-label-primary, #1f2329) 78%, var(--dsw-alias-state-error-primary, #d54941)); position: fixed; inset: 0; z-index: 10050; display: grid; place-items: center; padding: 24px; background: rgb(15 17 21 / 42%); }
.dim-directoryPickerBackdrop, .dim-directoryPickerBackdrop *, .dim-directoryPickerBackdrop *::before, .dim-directoryPickerBackdrop *::after { box-sizing: border-box; }
.dim-directoryPicker { width: min(720px, 100%); height: min(620px, calc(100dvh - 48px)); min-height: 420px; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; overflow: hidden; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 16px; outline: none; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); box-shadow: var(--dsw-shadow-lv3, 0 24px 72px rgb(15 17 21 / 24%)); }
.dim-directoryPickerHeader { min-width: 0; padding: 22px 24px 17px; border-bottom: 1px solid var(--dsw-alias-border-l1, #eef0f3); }
.dim-directoryPickerHeader h3 { margin: 0 0 14px; color: var(--dsw-alias-label-primary, #1f2329); font-size: 20px; line-height: 1.35; font-weight: 650; }
.dim-directoryPickerHeader > p { margin: 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 13px; }
.dim-directoryCrumbs { min-width: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 4px; color: var(--dsw-alias-label-secondary, #646a73); }
.dim-directoryCrumbs button { min-height: 32px; max-width: 210px; overflow: hidden; padding: 3px 5px; border: 0; border-radius: 8px; color: var(--dsw-alias-label-secondary, #646a73); background: transparent; font: inherit; font-size: 12px; line-height: 18px; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.dim-directoryCrumbs button:hover:not(:disabled) { color: var(--dim-brand-ink); background: var(--dim-brand-soft); }
.dim-directoryCrumbs button[aria-current="page"] { color: var(--dsw-alias-label-primary, #1f2329); font-weight: 650; }
.dim-directoryCrumbs button:focus-visible, .dim-directoryPathInput:focus-visible, .dim-directoryPathControl button:focus-visible, .dim-directoryList button:focus-visible, .dim-directoryPickerActions button:focus-visible { outline: 2px solid var(--dim-focus); outline-offset: 2px; }
.dim-directoryPathForm { display: grid; gap: 7px; margin-top: 14px; }
.dim-directoryPathMeta { min-width: 0; display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.dim-directoryPathMeta label { flex: none; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; font-weight: 650; }
.dim-directoryPathMeta span { min-width: 0; overflow: hidden; color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.dim-directoryPathControl { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) max-content; gap: 8px; }
.dim-directoryPathInput { min-width: 0; height: 38px; padding: 0 11px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); font: 12px ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace; line-height: 38px; }
.dim-directoryPathInput::placeholder { color: var(--dsw-alias-label-secondary, #646a73); }
.dim-directoryPathInput:hover:not(:disabled) { border-color: var(--dsw-alias-border-l3, #bbbfc4); }
.dim-directoryPathInput:focus { border-color: var(--dim-focus); }
.dim-directoryPathInput[aria-invalid="true"] { border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d54941) 62%, var(--dsw-alias-border-l2, #dfe1e5)); }
.dim-directoryPathControl button { min-height: 38px; padding: 0 14px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.dim-directoryPathControl button:hover:not(:disabled) { border-color: var(--dsw-alias-border-l3, #bbbfc4); background: var(--dsw-alias-interactive-bg-hover, #f7f8fa); }
.dim-directoryPathInput:disabled, .dim-directoryPathControl button:disabled { cursor: not-allowed; opacity: .55; }
.dim-directoryCrumbSeparator { width: 12px; height: 12px; display: inline-grid; place-items: center; flex: none; }
.dim-directoryCrumbSeparator svg { width: 12px; height: 12px; display: block; }
.dim-directoryPickerBody { min-height: 0; overflow-y: auto; padding: 14px 16px; scrollbar-width: thin; scrollbar-color: var(--dsw-alias-border-l2, #dfe1e5) transparent; }
.dim-directoryList { display: grid; gap: 3px; margin: 0; padding: 0; list-style: none; }
.dim-directoryList button { width: 100%; min-height: 46px; display: grid; grid-template-columns: 24px minmax(0, 1fr) 18px; align-items: center; gap: 10px; padding: 7px 11px; border: 0; border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: transparent; font: inherit; text-align: left; cursor: pointer; }
.dim-directoryList button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, #f7f8fa); }
.dim-directoryList button:disabled, .dim-directoryCrumbs button:disabled { cursor: wait; opacity: .55; }
.dim-directoryFolder { width: 24px; height: 24px; display: grid; place-items: center; color: var(--dsw-alias-label-secondary, #646a73); }
.dim-directoryFolder svg { width: 22px; height: 22px; }
.dim-directoryName { min-width: 0; overflow: hidden; font-size: 14px; line-height: 20px; text-overflow: ellipsis; white-space: nowrap; }
.dim-directoryChevron { width: 18px; height: 18px; display: grid; place-items: center; color: var(--dsw-alias-label-tertiary, #8f959e); }
.dim-directoryChevron svg { width: 17px; height: 17px; }
.dim-directoryPickerState { min-height: 210px; display: grid; place-content: center; justify-items: center; gap: 10px; color: var(--dsw-alias-label-secondary, #646a73); text-align: center; }
.dim-directoryPickerState p { margin: 0; font-size: 13px; line-height: 1.6; }
.dim-directoryPickerSpinner { width: 24px; height: 24px; border: 3px solid var(--dsw-alias-border-l2, #e6e8eb); border-top-color: var(--dim-brand-ink); border-radius: 50%; animation: dim-spin 800ms linear infinite; }
.dim-directoryPickerError { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 8px 0 0; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary, #d54941) 22%, var(--dsw-alias-border-l2, #dfe1e5)); border-radius: 8px; color: var(--dim-error-ink); background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d54941) 7%, var(--dsw-alias-bg-layer-1, #fff)); font-size: 12px; line-height: 1.5; }
.dim-directoryPickerError button { min-height: 32px; flex: none; padding: 4px 8px; border: 0; border-radius: 8px; color: inherit; background: transparent; font: inherit; font-weight: 650; cursor: pointer; }
.dim-directoryPickerTruncated { margin: 10px 4px 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: 1.5; }
.dim-directoryPickerFooter { display: grid; grid-template-columns: max-content minmax(0, 1fr) max-content; align-items: center; gap: 14px; padding: 16px 20px; border-top: 1px solid var(--dsw-alias-border-l1, #eef0f3); background: var(--dsw-alias-bg-layer-1, #fff); }
.dim-directoryHidden { min-height: 32px; display: inline-flex; align-items: center; gap: 7px; padding: 2px 0; border: 0; color: var(--dsw-alias-label-secondary, #646a73); background: transparent; font: inherit; font-size: 12px; white-space: nowrap; cursor: pointer; }
.dim-directoryHidden:focus-visible { outline: 2px solid var(--dim-focus); outline-offset: 2px; }
.dim-directoryHidden:disabled { cursor: not-allowed; opacity: .52; }
.dim-directoryHiddenBox { position: relative; width: 15px; height: 15px; flex: 0 0 15px; border: 1px solid var(--dsw-alias-border-l2, #c9cdd4); border-radius: 4px; background: var(--dsw-alias-bg-layer-1, #fff); }
.dim-directoryHidden[aria-pressed="true"] .dim-directoryHiddenBox { border-color: var(--dim-action); background: var(--dim-action); }
.dim-directoryHidden[aria-pressed="true"] .dim-directoryHiddenBox::after { content: ""; position: absolute; left: 4px; top: 1px; width: 4px; height: 8px; border: solid white; border-width: 0 2px 2px 0; transform: rotate(45deg); }
.dim-directoryPickerNotice { min-width: 0; margin: 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; line-height: 1.45; text-align: right; }
.dim-directoryPickerActions { display: flex; gap: 8px; }
.dim-directoryPickerActions button { min-height: 36px; padding: 0 14px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 13px; font-weight: 600; white-space: nowrap; cursor: pointer; transition: background-color 160ms ease, border-color 160ms ease; }
.dim-directoryPickerActions .dim-directoryPickerPrimary { border-color: var(--dim-action); color: #fff; background: var(--dim-action); }
.dim-directoryPickerActions button:hover:not(:disabled) { border-color: var(--dsw-alias-border-l3, #bbbfc4); background: var(--dsw-alias-interactive-bg-hover, #f7f8fa); }
.dim-directoryPickerActions .dim-directoryPickerPrimary:hover:not(:disabled) { border-color: var(--dim-action-hover); background: var(--dim-action-hover); }
.dim-directoryPickerActions .dim-directoryPickerPrimary:active:not(:disabled) { border-color: var(--dim-action-pressed); background: var(--dim-action-pressed); }
.dim-directoryPickerActions button:disabled { cursor: not-allowed; opacity: .52; }
.dim-panel .dim-cardSummary { flex: 1 1 100%; min-width: min(100%, 12rem); color: var(--dsw-alias-label-secondary, #646a73); font: inherit; font-size: 12px; font-weight: 400; line-height: 1.5; overflow-wrap: anywhere; }
.dim-panel .dim-cardFooterLayout { min-width: 0; width: 100%; display: flex; flex-direction: column; align-items: stretch; gap: 9px; }
.dim-panel .dim-cardFooterLayout > .dim-cardActions { align-self: stretch; width: 100%; justify-content: flex-end; margin: 0; }
.dim-panel .dim-cardFeedback { width: 100%; padding: 8px 10px; border-radius: 8px; color: var(--dsw-alias-label-secondary, #646a73); background: var(--dsw-alias-bg-module-platform, #f7f8fa); font: inherit; font-size: 12px; font-weight: 400; line-height: 18px; overflow-wrap: anywhere; white-space: normal; }
.dim-panel .dim-cardActions { flex: none; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 0 0 0 auto; }
.dim-panel .dim-cardActions .dim-cardAction { flex: none; min-height: 32px; padding: 0 11px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 13px; font-weight: 600; line-height: normal; white-space: nowrap; }
.dim-panel .dim-cardActions .dim-cardAction:hover:not(:disabled) { border-color: var(--dsw-alias-border-l3, #bbbfc4); background: var(--dsw-alias-interactive-bg-hover, #f7f8fa); }
.dim-panel .dim-cardActions .dim-cardAction:focus-visible { outline: 2px solid var(--dim-focus); outline-offset: 2px; }
.dim-panel .dim-cardActions .dim-cardAction[data-kind="danger"] { color: var(--dim-error-ink); }
.dim-panel .dim-botCard { position: relative; overflow: hidden; width: 100%; border: 1px solid var(--dsw-alias-border-l2, #e5e6eb); border-radius: 12px; background: var(--dsw-alias-bg-layer-1, #fff); box-shadow: var(--dsw-shadow-lv1, 0 1px 2px rgb(31 35 41 / 3%)); }
.dim-panel .dim-botCard::before { display: none; }
.dim-panel .dim-botCardBody { position: relative; padding: 12px; }
.dim-panel .dim-botCardTop { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.dim-panel .dim-botIdentity { min-width: 0; display: flex; align-items: center; gap: 10px; }
.dim-panel .dim-botAvatar { flex: none; width: 38px; height: 38px; display: grid; place-items: center; overflow: hidden; border-radius: 12px; box-shadow: none; }
.dim-panel .dim-botAvatar .dim-logo { width: 38px; height: 38px; border-radius: 12px; }
.dim-panel .dim-botAvatar svg { width: 22px; height: 22px; }
.dim-panel .dim-botName { min-width: 0; }
.dim-panel .dim-botName h3,
.dim-panel .dim-botNameInput { overflow: hidden; margin: 0; color: var(--dsw-alias-label-primary, #1f2329); font-size: 15px; font-weight: 650; line-height: normal; text-overflow: ellipsis; white-space: nowrap; }
.dim-panel .dim-botNameInput { box-sizing: border-box; width: 100%; min-width: 8em; padding: 0; border: 0; border-radius: 0; background: transparent; font: inherit; }
.dim-panel .dim-botNameInput::placeholder { color: var(--dsw-alias-label-secondary, #646a73); font-weight: 500; }
.dim-panel .dim-botNameInput:focus-visible { outline: 2px solid var(--dim-focus); outline-offset: 2px; box-shadow: none; }
.dim-panel .dim-botName p { overflow: hidden; margin: 4px 0 0; color: var(--dsw-alias-label-secondary, #646a73); font: 12px ui-monospace, SFMono-Regular, monospace; line-height: normal; text-overflow: ellipsis; white-space: nowrap; }
.dim-panel .dim-botHealthGroup { min-width: 0; max-width: 100%; flex: none; display: grid; justify-items: end; gap: 5px; }
.dim-panel .dim-botCard .dim-botHealth { flex: none; min-height: 0; display: inline-flex; align-items: center; gap: 7px; padding: 0; border: 0; border-radius: 0; color: var(--dsw-alias-label-secondary, #646a73); background: transparent; font: inherit; font-size: 12px; font-weight: 400; line-height: normal; white-space: nowrap; }
.dim-panel .dim-lastChecked { display: inline-flex; align-items: baseline; gap: 4px; color: var(--dsw-alias-label-secondary, #646a73); font: inherit; font-size: 11px; font-weight: 400; line-height: normal; white-space: nowrap; }
.dim-panel .dim-botCard .dim-healthDot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: #aeb3bb; box-shadow: none; }
.dim-panel .dim-botCard .dim-healthDot[data-tone="success"] { background: var(--dsw-alias-state-success-primary, #20a162); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-success-primary, #20a162) 14%, transparent); }
.dim-panel .dim-botCard .dim-healthDot[data-tone="warning"] { background: var(--dsw-alias-state-warn-primary, #d97706); }
.dim-panel .dim-botCard .dim-healthDot[data-tone="error"] { background: var(--dsw-alias-state-error-primary, #d54941); }
.dim-panel .dim-botMetrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 6px 0; }
.dim-panel .dim-botMetric { min-width: 0; padding: 6px 8px; border: 0; border-radius: 8px; background: var(--dsw-alias-interactive-bg-hover, #f7f8fa); }
.dim-panel .dim-botMetric dt { margin: 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; font-weight: 400; line-height: normal; }
.dim-panel .dim-botMetric dd { overflow: hidden; margin: 3px 0 0; color: var(--dsw-alias-label-primary, #1f2329); font-size: 12px; font-weight: 400; line-height: normal; text-overflow: ellipsis; white-space: nowrap; }
.dim-panel .dim-botCard .dim-cardFooter { margin-top: 0; }
.dim-panel .ddt-headingCopy { display: none; }
.dim-panel .ddt-qrFrame, .dim-panel .ddt-countdown { width: min(270px, 100%); }
@container (max-width: 680px) {
  .dim-panel .bxf-headingTools, .dim-panel .dxw-tools, .dim-panel .ddt-tools { gap: 6px; }
  .dim-panel .dim-bindActions { gap: 6px; }
  .dim-panel .bxf-headingTools .dim-scanButton, .dim-panel .dxw-tools .dim-scanButton, .dim-panel .ddt-tools .dim-scanButton, .dim-panel .dim-credentialButton { gap: 5px; padding-inline: 8px; font-size: 12px; }
  .dim-panel .dim-actionIcon { width: 13px; height: 13px; flex-basis: 13px; }
  .dim-panel .bxf-headingTools .dim-onlineBadge, .dim-panel .dxw-tools .dim-onlineBadge, .dim-panel .ddt-tools .dim-onlineBadge { padding-inline: 8px; font-size: 11px; }
  .dim-panel .dim-credentialForm { grid-template-columns: minmax(0, 1fr); }
  .dim-panel .dim-credentialError, .dim-panel .dim-credentialActions { grid-column: auto; }
  .dim-panel .dim-emptyView { min-height: 0; grid-template-columns: minmax(0, 1fr); }
  .dim-panel .dim-emptyBrand { display: none; }
  .dim-panel .dim-qrLayout { grid-template-columns: minmax(0, 1fr); justify-items: center; gap: 24px; }
  .dim-panel .dim-qrColumn { width: 100%; min-width: 0; }
  .dim-panel .dim-qrCopy { width: 100%; min-width: 0; overflow-wrap: anywhere; }
  .dim-panel .ddt-qrLayout { grid-template-columns: minmax(0, 1fr); justify-items: center; gap: 24px; }
  .dim-panel .ddt-qrColumn { width: 100%; min-width: 0; }
  .dim-panel .ddt-qrCopy { width: 100%; min-width: 0; overflow-wrap: anywhere; }
}
@media (max-width: 840px) {
  .dim-hubHead { align-items: flex-start; }
}
@media (max-width: 768px) {
  [data-dsh-sidebar-tools] > button,
  .dim-hubGithub,
  .dim-hubClose,
  .dim-channel,
  .dim-loopbackRecoveryAction,
  .dim-panel :is(.bxf-button, .dxw-button, .ddt-button),
  .dim-panel .dim-credentialButton,
  .dim-panel .dim-channelHelpButton,
  .dim-panel .dim-presetHelpButton,
  .dim-panel .dim-workspaceEdit,
  .dim-panel .dim-cardActions .dim-cardAction,
  .dim-panel .dim-instructionSave,
  .dim-panel .dim-presetSelect,
  .dim-panel .dxw-input,
  .dim-panel .bxf-responseModeSelect,
  .dim-panel .dim-usageGuide > summary,
  .dim-panel .dim-instructionSummary,
  .dim-panel .dim-credentialField input,
  .dim-directoryCrumbs button,
  .dim-directoryPathInput,
  .dim-directoryPathControl button,
  .dim-directoryList button,
  .dim-directoryHidden,
  .dim-directoryPickerActions button,
  .dim-directoryPickerError button { min-height: 44px; }
  .dim-panel .dim-channelHelpButton, .dim-panel .dim-presetHelpButton { width: 44px; height: 44px; }
  .dim-loopbackRecovery { align-items: stretch; flex-direction: column; }
}
@media (max-width: 720px) {
  .dim-panel .dim-botCardTop { align-items: flex-start; }
}
@media (max-width: 560px) {
  .dim-hubHead { padding: 12px 14px; }
  .dim-hubGithub { display: none; }
  .dim-rail { padding: 10px 12px; }
  .dim-panel { padding: 12px 14px 20px; }
  .dim-directoryPickerBackdrop { padding: 10px; }
  .dim-directoryPicker { height: calc(100dvh - 20px); min-height: 0; border-radius: 16px; }
  .dim-hubScrim { padding: 10px; }
  .dim-hubPanel { height: calc(100dvh - 20px); min-height: 0; width: calc(100vw - 20px); border-radius: 16px; }
  .dim-directoryPickerHeader { padding: 18px 17px 14px; }
  .dim-directoryPickerHeader h3 { font-size: 18px; }
  .dim-directoryPathMeta span { display: none; }
  .dim-directoryPickerBody { padding: 10px; }
  .dim-directoryPickerFooter { grid-template-columns: minmax(0, 1fr) max-content; gap: 10px; padding: 13px 14px; }
  .dim-directoryPickerNotice { grid-column: 1 / -1; grid-row: 1; text-align: left; }
}
@media (pointer: coarse) {
  [data-dsh-sidebar-tools] > button,
  .dim-hubGithub,
  .dim-hubClose,
  .dim-channel,
  .dim-loopbackRecoveryAction,
  .dim-panel :is(.bxf-button, .dxw-button, .ddt-button),
  .dim-panel .dim-credentialButton,
  .dim-panel .dim-channelHelpButton,
  .dim-panel .dim-presetHelpButton,
  .dim-panel .dim-workspaceEdit,
  .dim-panel .dim-cardActions .dim-cardAction,
  .dim-panel .dim-instructionSave,
  .dim-panel .dim-presetSelect,
  .dim-panel .dxw-input,
  .dim-panel .bxf-responseModeSelect,
  .dim-panel .dim-usageGuide > summary,
  .dim-panel .dim-instructionSummary,
  .dim-panel .dim-credentialField input,
  .dim-directoryCrumbs button,
  .dim-directoryPathInput,
  .dim-directoryPathControl button,
  .dim-directoryList button,
  .dim-directoryHidden,
  .dim-directoryPickerActions button,
  .dim-directoryPickerError button { min-height: 44px; }
  .dim-panel .dim-channelHelpButton, .dim-panel .dim-presetHelpButton { width: 44px; height: 44px; }
}
@media (prefers-reduced-motion: reduce) {
  .dim-page *, .dim-page *::before, .dim-page *::after,
  .dim-directoryPickerBackdrop *, .dim-directoryPickerBackdrop *::before, .dim-directoryPickerBackdrop *::after {
    animation: none !important;
    scroll-behavior: auto !important;
    transition: none !important;
  }
}
`;

export function installImStyles() {
  if (typeof document === 'undefined') return () => {};
  const existing = document.querySelector(`style[data-plugin-css="${IM_STYLE_ID}"]`);
  if (existing) return () => {};
  const style = document.createElement('style');
  style.dataset.plugin = 'dsh-im';
  style.dataset.pluginCss = IM_STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => style.remove();
}
