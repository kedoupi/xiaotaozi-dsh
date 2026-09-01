export const stickyPromptCss = `
[data-dsh-xtz-ui-sticky-host] { position: sticky; top: 0; z-index: 100; height: 0; min-height: 0; overflow: visible; display: block; flex: none; pointer-events: none; }
.dshXtzStickyBar { position: absolute; inset: 0 0 auto; z-index: 1; isolation: isolate; display: flex; justify-content: center; padding: 8px calc(var(--dsh-composer-side-clearance, 16px) + 16px); background: var(--dsw-alias-bg-base); box-shadow: 0 16px 16px -12px var(--dsw-alias-bg-base); opacity: 0; transition: opacity 160ms cubic-bezier(.22, 1, .36, 1); }
.dshXtzStickyBar[data-dsh-xtz-ui-sticky-visible] { opacity: 1; }
.dshXtzStickyBar[hidden] { display: none; }
.dshXtzStickyButton { display: block; box-sizing: border-box; width: 100%; max-width: var(--dsh-chat-content-width, 748px); min-height: 36px; padding: 6px 12px; border: 0; border-radius: 12px; background: var(--dsw-specific-bubble); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; line-height: 20px; text-align: left; pointer-events: auto; cursor: pointer; }
.dshXtzStickyButton:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #B94305); outline-offset: 2px; }
.dshXtzStickyText { display: -webkit-box; overflow: hidden; overflow-wrap: anywhere; white-space: normal; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
@media (max-width: 768px), (pointer: coarse) { .dshXtzStickyButton { min-height: 44px; } }
@media (prefers-reduced-motion: reduce) { .dshXtzStickyBar { box-shadow: none; opacity: 1; transition: none; } .dshXtzStickyButton { transition: none; } }
body:has(.dim-hubScrim) [data-dsh-xtz-ui-sticky-host],
body:has(.dshH-overlay) [data-dsh-xtz-ui-sticky-host],
body:has(.dshH-archMask) [data-dsh-xtz-ui-sticky-host] { visibility: hidden !important; pointer-events: none !important; }
`;
