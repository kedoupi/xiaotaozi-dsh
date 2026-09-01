export const gitGraphCss = `
/* Branch selector chip for blank sessions. Tokens by default; the stock-light
   fallback defines a small literal palette because the unskinned shell tokens
   are too low-contrast. */

.dshH-gg-anchor {
  position: relative;
}

/* Positioning wrapper for the chip and popover. */
.dshH-gg-chipWrap {
  position: relative;
  display: inline-flex;
}

/* Hero phase: leave the dock row and join the official hero chip row. The
   inline left/top offsets are measured against the composer stack; the row
   gap and the seat metrics mirror the official WorkspaceChip /
   AgentPresetSeat recipe. */
.dshH-gg-anchorHero {
  position: fixed;
  z-index: 10;
  padding-left: 0;
}
.dshH-gg-anchorHero:not(.is-placed) { visibility: hidden; }

.dshH-gg-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: var(--dsw-alias-button-tool-bar-fill);
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease,
    gap 120ms ease, padding 120ms ease;
}

.dshH-gg-chip:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dshH-gg-chip:active {
  background: var(--dsw-alias-interactive-bg-active);
}

.dshH-gg-chip:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #B94305);
  outline-offset: 2px;
}

.dshH-gg-chip:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.dshH-gg-chip:disabled:hover {
  background: var(--dsw-alias-button-tool-bar-fill);
}

.dshH-gg-chipOpen {
  border-color: var(--dsw-alias-state-business-primary, #B94305);
  color: var(--dsw-alias-label-primary);
}

.dshH-gg-chipLabel {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dshH-gg-chipChevron {
  color: var(--dsw-alias-label-secondary);
}

/* Hero seat: the official hero-row chips are transparent 28px pills with
   label-primary text and interactive-bg hover/open states (the same recipe
   as WorkspaceChip and AgentPresetSeat in the official UI packages). */
.dshH-gg-chipHero {
  height: auto;
  min-height: 28px;
  max-width: min(100%, 240px);
  padding: 0 8px;
  border: none;
  border-radius: 16px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  gap: 4px;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  overflow: hidden;
}

.dshH-gg-chipHero:hover,
.dshH-gg-chipHero:active,
.dshH-gg-chipHero.dshH-gg-chipOpen {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dshH-gg-chipHero .dshH-gg-chipLabel {
  max-width: 180px;
}

.dshH-gg-chipHero .dshH-gg-chipChevron {
  color: var(--dsw-alias-label-secondary);
}

.dshH-gg-backdrop {
  position: fixed;
  inset: 0;
  z-index: 30;
}

.dshH-gg-dialogMask {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(15, 17, 21, 0.18);
}
body[data-ds-dark-theme] .dshH-gg-dialogMask {
  background: rgba(0, 0, 0, 0.46);
}

.dshH-gg-popover {
  position: absolute;
  /* The selector row sits above the input card: the popover opens UPWARD,
     capped at the same 360px as the workspace picker menu beside it. */
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  width: 280px;
  max-height: 360px;
  border: 1px solid var(--dsw-alias-border-inverted);
  border-radius: 12px;
  /* Menu surface: specific-menu keeps the panel one step above the app
     background in both themes and follows third-party skins. */
  background: var(--dsw-specific-menu);
  box-shadow: var(--dsw-shadow-lv3);
  padding: 4px;
  overflow: hidden;
}

/* In the hero row the menu opens downward (top: calc(100% + 4px)), matching
   the official workspace picker anchored under the same chip row. */
.dshH-gg-popoverHero {
  bottom: auto;
  top: calc(100% + 4px);
}

.dshH-gg-searchBox {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px;
  padding: 6px 10px;
  /* Background-based distinction (no border): on light the muted grey
     separates the field from the white panel; dark overrides below. */
  /* 2px transparent slot: focus paints the brand color without shift. */
  border: 2px solid transparent;
  border-radius: 8px;
  /* Classic input-field grey on light (interactive-bg-hover-solid is the
     standard #f1f3f5 input tone), overridden below in dark. */
  background: var(--dsw-alias-interactive-bg-hover-solid);
  color: var(--dsw-alias-label-primary);
  transition: border-color 120ms ease, box-shadow 120ms ease;
}

.dshH-gg-searchBox:focus-within {
  /* Focused state = brand-colored 2px border (theme token, visible in
     both themes), no extra ring. */
  border-color: var(--dsw-alias-state-business-primary, #B94305);
  box-shadow: none;
}
body[data-ds-dark-theme] .dshH-gg-searchBox {
  background: var(--dsw-alias-bg-base);
}

.dshH-gg-searchInput {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: none;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  transition: box-shadow 120ms ease;
}

.dshH-gg-searchInput::placeholder {
  color: var(--dsw-alias-label-secondary);
}

.dshH-gg-list {
  flex: 1;
  min-height: 64px;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 2px 6px 6px;
  scrollbar-width: thin;
  scrollbar-color: var(--dsw-alias-scrollbar-bg-l2) transparent;
}
.dshH-gg-list::-webkit-scrollbar {
  width: 6px;
}
.dshH-gg-list::-webkit-scrollbar-thumb {
  background: var(--dsw-alias-scrollbar-bg-l2);
  border-radius: 3px;
}
.dshH-gg-list::-webkit-scrollbar-track {
  background: transparent;
}

.dshH-gg-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border: none;
  /* UA buttons paint a surface color (buttonface); pin transparent so
     only hover/active tints show.  Full-width so long names ellipsize
     in place and the trailing check stays visible. */
  background: transparent;
  min-width: 0;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  position: relative;
  transition: background-color 120ms ease;
}

.dshH-gg-item:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dshH-gg-item:active {
  background: var(--dsw-alias-interactive-bg-active);
}

.dshH-gg-item:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #B94305);
  outline-offset: -2px;
}

.dshH-gg-item:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.dshH-gg-item:disabled:hover {
  background: none;
}



.dshH-gg-itemText {
  flex: 1;
  min-width: 0;
}

.dshH-gg-itemName {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
}

.dshH-gg-item:focus-visible .dshH-gg-itemName {
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
  overflow-wrap: anywhere;
}

.dshH-gg-itemPath {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  margin-top: 1px;
}

.dshH-gg-check {
  color: var(--dsw-alias-state-business-primary, #B94305);
  flex: none;
  display: inline-flex;
}

.dshH-gg-empty {
  padding: 14px 10px;
  text-align: center;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}

.dshH-gg-switching {
  margin: 0 8px 4px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.dshH-gg-dirty {
  margin: 0 10px 4px;
  color: var(--dsw-xtz-status-warning-ink, #7a4a00);
  font-size: 11px;
}

.dshH-gg-notice {
  margin: 0 8px 8px;
  padding: 6px 10px;
  border-radius: 8px;
  /* Never pair a solid state-secondary fill with state-primary text: dark
     themes alias both onto the same static color (the official dark theme
     maps both error tokens to red-400), which renders the message invisible.
     Tint the banner from the primary token instead (the aionui-panel scm
     banner idiom). */
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent);
  color: var(--dsw-xtz-status-error-ink, #b42318);
  font-size: 12px;
}

.dshH-gg-noticeOk {
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent);
  color: var(--dsw-xtz-status-success-ink, #4F7410);
}

.dshH-gg-footer {
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  padding: 6px;
}

.dshH-gg-footerItem {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: none;
  border-radius: 8px;
  background: none;
  cursor: pointer;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  text-align: left;
  transition: background-color 120ms ease;
}

.dshH-gg-footerItem:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dshH-gg-footerItem:active {
  background: var(--dsw-alias-interactive-bg-active);
}

.dshH-gg-footerItem:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #B94305);
  outline-offset: -2px;
}

.dshH-gg-footerItem:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.dshH-gg-footerItem:disabled:hover {
  background: none;
}

.dshH-gg-footerItemDisabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.dshH-gg-footerItemDisabled:hover {
  background: none;
}

.dshH-gg-footerHint {
  margin-left: auto;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}

.dshH-gg-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 90;
  display: flex;
  flex-direction: column;
  width: min(780px, calc(100vw - 48px));
  max-height: min(76vh, 720px);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 16px;
  background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-base, #fff));
  box-shadow: var(--dsw-shadow-lv3, 0 16px 40px rgba(15, 17, 21, 0.12));
  padding: 14px 14px 10px;
  /* Muted categorical lanes (not brand-primary: that token is near-black
     or peach and turns the trunk into a marker stroke). Mid-chroma so the
     same set holds contrast on light overlay and dark theme. */
  --dshH-gg-lane-0: #5B8EC9;
  --dshH-gg-lane-1: #5AA37A;
  --dshH-gg-lane-2: #A8863D;
  --dshH-gg-lane-3: #8B7CC8;
  --dshH-gg-lane-4: #4C8D98;
  --dshH-gg-lane-5: #C47A8A;
  --dshH-gg-lane-6: #B66F3D;
  --dshH-gg-lane-7: #7A8896;
  --dshH-gg-node-fill: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-base, #fff));
}
body[data-ds-dark-theme] .dshH-gg-dialog {
  --dshH-gg-lane-0: #7EABD9;
  --dshH-gg-lane-1: #7DC49A;
  --dshH-gg-lane-2: #D4B56C;
  --dshH-gg-lane-3: #A396D6;
  --dshH-gg-lane-4: #74C2CC;
  --dshH-gg-lane-5: #D494A2;
  --dshH-gg-lane-6: #D4A26C;
  --dshH-gg-lane-7: #94A0AC;
}

.dshH-gg-dialogHeader {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 0 4px;
}

.dshH-gg-dialogHeading {
  min-width: 0;
}

.dshH-gg-dialogClose {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin: -4px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  line-height: 0;
  overflow: hidden;
  white-space: nowrap;
  transition: background-color 160ms ease, color 160ms ease;
}

.dshH-gg-dialogClose:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.dshH-gg-dialogClose:active {
  background: var(--dsw-alias-interactive-bg-active);
}

.dshH-gg-dialogClose:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #B94305);
  outline-offset: 2px;
}

.dshH-gg-dialogTitle {
  margin: 0 0 2px;
  color: var(--dsw-alias-label-primary);
  font-size: 15px;
  font-weight: 600;
}

.dshH-gg-dialogDescription {
  margin: 0 0 12px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.dshH-gg-dialogField {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dshH-gg-dialogLabel {
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}

.dshH-gg-dialogInput {
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  outline: none;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}

.dshH-gg-dialogInput:focus {
  border-color: var(--dsw-alias-state-business-primary, #B94305);
}

.dshH-gg-dialogInput:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #B94305);
  outline-offset: 2px;
}

.dshH-gg-dialogError {
  margin-top: 8px;
  color: var(--dsw-xtz-status-error-ink, #b42318);
  font-size: 12px;
}

.dshH-gg-dialogActions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}

.dshH-gg-dialogButton {
  padding: 6px 14px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-button-tool-bar-fill);
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  font-size: 13px;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}

.dshH-gg-dialogButton:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dshH-gg-dialogButton:active {
  background: var(--dsw-alias-interactive-bg-active);
}

.dshH-gg-dialogButton:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #B94305);
  outline-offset: 2px;
}

.dshH-gg-dialogButton:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.dshH-gg-dialogButton:disabled:hover {
  background: var(--dsw-alias-button-tool-bar-fill);
}

.dshH-gg-dialogButtonPrimary {
  border-color: var(--dsw-alias-button-info-fill, #B94305);
  background: var(--dsw-alias-button-info-fill, #B94305);
  color: var(--dsw-alias-button-contrast-fill, #fff);
  transition: background-color 120ms ease, border-color 120ms ease, filter 120ms ease;
}

.dshH-gg-dialogButtonPrimary:hover {
  background: var(--dsw-alias-button-info-hover, #9F3703);
}

.dshH-gg-dialogButtonPrimary:active {
  background: var(--dsw-static-deepseek-800, #7C2C00);
}

.dshH-gg-dialogButtonPrimary:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #B94305);
  outline-offset: 2px;
}

.dshH-gg-dialogButtonPrimary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.dshH-gg-dialogButtonPrimary:disabled:hover {
  background: var(--dsw-alias-button-info-fill, #B94305);
}

.dshH-gg-graphBody {
  flex: 1;
  min-height: 240px;
  overflow: auto;
  margin-top: 8px;
  border: none;
  border-radius: 10px;
  padding: 0;
}

.dshH-gg-graphSvg {
  flex: none;
  display: block;
  overflow: hidden;
}

.dshH-gg-graphRows {
  min-width: 0;
}

.dshH-gg-graphSubtitle {
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  margin-top: 2px;
}

.dshH-gg-graphRow {
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  height: 40px;
  min-height: 40px;
  padding: 0 8px 0 2px;
  border-radius: 8px;
  font-size: 12px;
  transition: background-color 160ms ease;
}

.dshH-gg-graphRow:hover {
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 4.5%, transparent);
}

.dshH-gg-graphRow.is-head {
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent);
}

.dshH-gg-graphRow.is-head:hover {
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent);
}

.dshH-gg-graphLanes {
  display: flex;
  flex: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.4;
  color: var(--dsw-alias-label-secondary);
}

.dshH-gg-graphLaneCell {
  display: inline-block;
  width: 15px;
  text-align: center;
  flex: none;
}

.dshH-gg-graphLaneNode {
  color: var(--dsw-alias-state-business-primary, #B94305);
  font-weight: 700;
}

.dshH-gg-graphLaneMerge {
  color: var(--dsw-alias-state-business-primary, #B94305);
  font-weight: 700;
}

.dshH-gg-graphLanePass {
  color: var(--dsw-alias-label-secondary);
}

.dshH-gg-graphOid {
  flex: none;
  min-width: 58px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-secondary);
}

.dshH-gg-graphMain {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.dshH-gg-graphSubject {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  font-weight: 400;
  line-height: 1.35;
}

.dshH-gg-graphMeta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 6px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}

.dshH-gg-graphMetaSep {
  flex: none;
  color: var(--dsw-alias-label-secondary);
}

.dshH-gg-graphRef {
  flex: none;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 1px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 16px;
}

.dshH-gg-graphRefCurrent {
  background: var(--dsw-alias-state-business-tertiary, color-mix(in srgb, var(--dsw-alias-state-business-primary) 16%, transparent));
  color: var(--dsw-alias-state-business-primary);
}

/* Stock light fallback: BranchChip marks the unskinned light page at
   runtime. */
[data-gitgraph-chip-anchor][data-gitgraph-stock-light] {
  --gitgraph-stock-ink-rgb: 15, 17, 21;
  --gitgraph-stock-ink: #0f1115;
  --gitgraph-stock-on-success: #ffffff;
  --gitgraph-stock-success-fill: #137333;
  --gitgraph-stock-success-border: #0f5f2b;
  --dsw-alias-button-tool-bar-fill: rgba(var(--gitgraph-stock-ink-rgb), 0.04);
  --dsw-alias-button-tool-bar-hover: rgba(var(--gitgraph-stock-ink-rgb), 0.08);
  --dsw-alias-border-l2: rgba(var(--gitgraph-stock-ink-rgb), 0.16);
  --dsw-alias-interactive-bg-hover: rgba(var(--gitgraph-stock-ink-rgb), 0.06);
  --dsw-alias-interactive-bg-active: rgba(var(--gitgraph-stock-ink-rgb), 0.1);
  --dsw-alias-label-primary: var(--gitgraph-stock-ink);
  --dsw-alias-label-secondary: var(--gitgraph-stock-ink);
  --dsw-alias-button-contrast-fill: var(--gitgraph-stock-on-success);
}

[data-gitgraph-chip-anchor][data-gitgraph-stock-light] .dshH-gg-noticeOk {
  background: var(--gitgraph-stock-success-fill);
  color: var(--gitgraph-stock-on-success);
  box-shadow: inset 0 0 0 1px var(--gitgraph-stock-success-border);
}

.dshH-gg-graphEmpty {
  padding: 24px 10px;
  text-align: center;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}

.dshH-gg-graphMore {
  display: block;
  width: 100%;
  margin-top: 8px;
  padding: 6px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: none;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  font-size: 12px;
  transition: background-color 120ms ease;
}

.dshH-gg-graphMore:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dshH-gg-graphMore:active {
  background: var(--dsw-alias-interactive-bg-active);
}

.dshH-gg-graphMore:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #B94305);
  outline-offset: 2px;
}

.dshH-gg-dialog:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #B94305);
  outline-offset: 2px;
}

.dshH-gg-graphMore:disabled {
  opacity: 0.5;
  cursor: default;
}

@media (prefers-reduced-motion: reduce) {
  .dshH-gg-chip,
  .dshH-gg-searchBox,
  .dshH-gg-searchInput,
  .dshH-gg-item,
  .dshH-gg-footerItem,
  .dshH-gg-dialogClose,
  .dshH-gg-dialogInput,
  .dshH-gg-dialogButton,
  .dshH-gg-dialogButtonPrimary,
  .dshH-gg-graphRow,
  .dshH-gg-graphMore {
    transition: none;
  }
}

@media (max-width: 768px) {
  .dshH-gg-chipHero { min-height: 44px; }
  .dshH-gg-backdrop { background: var(--dsw-alias-bg-mask-1, rgba(15, 17, 21, 0.28)); }
  .dshH-gg-popover,
  .dshH-gg-popoverHero {
    position: fixed;
    inset: auto 12px calc(12px + env(safe-area-inset-bottom));
    width: auto;
    max-height: min(72vh, 520px);
    border-radius: 16px;
    box-shadow: var(--dsw-shadow-lv3, 0 16px 40px rgba(15, 17, 21, 0.16));
  }
  .dshH-gg-dialog {
    inset: auto 0 0;
    transform: none;
    box-sizing: border-box;
    width: 100%;
    max-height: 88vh;
    max-height: 88dvh;
    padding: 16px max(14px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left));
    border-radius: 16px 16px 0 0;
  }
  .dshH-gg-dialogClose,
  .dshH-gg-item,
  .dshH-gg-footerItem,
  .dshH-gg-graphMore { min-height: 44px; }
  .dshH-gg-searchBox { min-height: 44px; box-sizing: border-box; }
  .dshH-gg-searchInput { font-size: 16px; }
  .dshH-gg-graphRow { height: auto; min-height: 44px; padding-block: 4px; }
}

@media (pointer: coarse) {
  .dshH-gg-chip,
  .dshH-gg-item,
  .dshH-gg-footerItem,
  .dshH-gg-dialogClose,
  .dshH-gg-graphMore { min-height: 44px; }
}

`;
