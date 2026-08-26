export const boardCss = `
/**
 * Task-board styles. Scoped by the plugin's own data attributes so nothing
 * leaks into the rest of the GUI; colors ride the dsh --dsw-* tokens so the
 * board follows the active theme (light/dark and skins).
 */

/* --- center-column takeover (global rules, attribute-scoped) ----------------- */

[data-pane='conversation'],
[class*='centerCol'] {
  position: relative;
}

/* The board container rides inside the conversation grid item as an extra
   trailing child; hidden unless the board is active. */
[data-dsh-hello-board-view] {
  position: absolute;
  inset: 0;
  display: none;
  z-index: 60;
  container-name: task-board-view;
  container-type: inline-size;
  /* Opaque backdrop: the conversation subtree stays mounted under the view.
     Even if the hide rule below were defeated by a stronger host inline
     style, this background keeps sticky code-block banners (host z-index 6)
     from showing through the active board (issue #100). */
  background: var(--dsw-alias-bg-base);
}

/* The center column is single-occupant; the :not() guards keep the two
   sibling panels from fighting over visibility if both
   activation attributes ever coexist. */
html[data-dsh-hello-board-active] [data-dsh-hello-board-view] {
  display: block;
}

/* While the board is active, the conversation content underneath is hidden
   (it stays mounted and stateful). The !important is required: the dsh shell
   (0.1.0-rc.6) wraps the conversation view in a node with an inline
   \`display: contents\`, and inline styles beat a plain stylesheet rule. Without
   it the composer (input card) stays visible at the bottom and paints over the
   board modals' footer, hiding the run/delete buttons (issue #76).
   The rule targets both the pane attribute and the center-column class so the
   chat subtree (including the code-block copy banner, issue #100) stays hidden
   whichever host container carries it. */
html[data-dsh-hello-board-active] [data-pane='conversation'] > :not([data-dsh-hello-board-view]),
html[data-dsh-hello-board-active] [class*='centerCol'] > :not([data-dsh-hello-board-view]) {
  display: none !important;
}

/* --- sidebar entry row ------------------------------------------------------- */

.dshH-tb-entry {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 36px;
  padding: 0 10px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}

.dshH-tb-entry:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.dshH-tb-entry[data-active] {
  background: var(--dsw-alias-interactive-bg-active);
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}

.dshH-tb-entryIcon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex: none;
}

.dshH-tb-entryIcon svg {
  display: block;
  width: 18px;
  height: 18px;
}

.dshH-tb-entryLabel {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Collapsed rail: icon-only, centered, matching the shell's 56px rail. */
[data-dsh-frame][data-sidebar-collapsed] .dshH-tb-entry {
  justify-content: center;
  padding: 0;
  width: 36px;
  height: 36px;
  margin: 0 auto 12px;
  border-radius: 50%;
}

[data-dsh-frame][data-sidebar-collapsed] .dshH-tb-entryLabel {
  display: none;
}

/* --- board frame -------------------------------------------------------------- */

.dshH-tb-board {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  height: 100%;
  min-width: 0;
  min-height: 0;
  padding: 14px 16px 16px;
  gap: 12px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
}

.dshH-tb-boardHeader {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}

.dshH-tb-boardTitle {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
}

.dshH-tb-backButton {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.dshH-tb-search {
  flex: 0 1 260px;
  min-width: 120px;
  padding: 6px 10px;
  font-size: 13px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-specific-input-major);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  outline: none;
}

.dshH-tb-search::placeholder {
  color: var(--dsw-alias-label-tertiary);
}

/* --- columns ------------------------------------------------------------------ */

.dshH-tb-columns {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(220px, 1fr);
  gap: 12px;
  flex: 1;
  min-height: 0;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-inline: contain;
  padding-bottom: 6px;
  scrollbar-color: var(--dsw-alias-border-l3) var(--dsw-alias-interactive-bg-hover);
  scrollbar-width: thin;
}

.dshH-tb-columns::-webkit-scrollbar {
  height: 10px;
}

.dshH-tb-columns::-webkit-scrollbar-track {
  background: var(--dsw-alias-interactive-bg-hover);
  border-radius: 999px;
}

.dshH-tb-columns::-webkit-scrollbar-thumb {
  background: var(--dsw-alias-border-l3);
  background-clip: content-box;
  border: 2px solid transparent;
  border-radius: 999px;
}

.dshH-tb-columns::-webkit-scrollbar-thumb:hover {
  background: var(--dsw-alias-border-l4);
  background-clip: content-box;
}

.dshH-tb-column {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  overflow: hidden;
}

.dshH-tb-columnHeader {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  flex: none;
}

.dshH-tb-columnTitle {
  margin: 0;
  flex: 1;
  font-size: 13px;
  font-weight: 700;
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dshH-tb-columnCount {
  flex: none;
  min-width: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
  background: var(--dsw-alias-interactive-bg-hover);
  border-radius: 999px;
  padding: 1px 8px;
}

.dshH-tb-statusDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}

.dshH-tb-statusDot[data-status='backlog'] { background: var(--dsw-alias-label-tertiary); }
.dshH-tb-statusDot[data-status='todo'] { background: var(--dsw-alias-state-business-primary); }
.dshH-tb-statusDot[data-status='running'] { background: var(--dsw-alias-state-warn-primary); }
.dshH-tb-statusDot[data-status='done'] { background: var(--dsw-alias-state-success-primary); }
.dshH-tb-statusDot[data-status='failed'] { background: var(--dsw-alias-state-error-primary); }

.dshH-tb-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 2px 8px 10px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.dshH-tb-columnEmpty {
  padding: 24px 8px;
  text-align: center;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}

/* --- cards -------------------------------------------------------------------- */

.dshH-tb-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  text-align: left;
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  cursor: pointer;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  transition: box-shadow 120ms ease, border-color 120ms ease, transform 120ms ease;
}

.dshH-tb-card:hover {
  box-shadow: var(--dsw-shadow-lv2);
  border-color: var(--dsw-alias-border-l3);
  transform: translateY(-1px);
}

.dshH-tb-card[data-status='running'] {
  border-color: var(--dsw-alias-state-warn-primary);
}

.dshH-tb-cardTitle {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.dshH-tb-cardExcerpt {
  font-size: 12px;
  line-height: 1.4;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.dshH-tb-cardMeta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}

.dshH-tb-cardTime {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dshH-tb-cardSchedule {
  flex: none;
  min-width: 0;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  padding: 2px 6px;
  border-radius: 999px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-interactive-bg-hover);
}

.dshH-tb-cardRun {
  flex: none;
}

.dshH-tb-cardRun[data-result='failed'] {
  color: var(--dsw-alias-state-error-primary);
}

.dshH-tb-cardRun[data-result='succeeded'] {
  color: var(--dsw-alias-state-success-primary);
}

.dshH-tb-cardSession {
  flex: none;
  color: var(--dsw-alias-state-business-primary);
}

.dshH-tb-cardRunningLabel {
  font-size: 11px;
  color: var(--dsw-alias-state-warn-primary);
}

.dshH-tb-cardSpinner {
  width: 10px;
  height: 10px;
  flex: none;
  border: 2px solid var(--dsw-alias-state-warn-primary);
  border-top-color: transparent;
  border-radius: 50%;
  animation: dshTbSpin 800ms linear infinite;
}

@keyframes dshTbSpin {
  to { transform: rotate(360deg); }
}

/* --- buttons ------------------------------------------------------------------ */

.dshH-tb-primaryButton {
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary-foreground);
  background: var(--dsw-alias-button-info-fill);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
}

.dshH-tb-primaryButton:hover:not(:disabled) {
  background: var(--dsw-alias-button-info-hover);
}

.dshH-tb-primaryButton:disabled {
  opacity: 0.5;
  cursor: default;
}

.dshH-tb-ghostButton {
  padding: 5px 12px;
  font-size: 12px;
  color: var(--dsw-alias-label-primary);
  background: transparent;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
}

.dshH-tb-ghostButton:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dshH-tb-ghostButton:disabled {
  opacity: 0.45;
  cursor: default;
}

.dshH-tb-dangerButton {
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: var(--dsw-alias-state-error-primary);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
}

.dshH-tb-dangerButton:hover:not(:disabled) {
  filter: brightness(1.08);
}

.dshH-tb-dangerButton:active:not(:disabled) {
  filter: brightness(0.94);
}

.dshH-tb-dangerButton:disabled {
  opacity: 0.5;
  cursor: default;
}

.dshH-tb-iconButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  font-size: 13px;
}

.dshH-tb-iconButton:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.dshH-tb-linkButton {
  padding: 0;
  font-size: 12px;
  color: var(--dsw-alias-state-business-primary);
  background: none;
  border: none;
  cursor: pointer;
  white-space: nowrap;
}

.dshH-tb-linkButton:hover {
  text-decoration: underline;
}

/* --- modals ------------------------------------------------------------------- */

.dshH-tb-modalBackdrop {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dsw-alias-bg-mask-1);
}

.dshH-tb-modal {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(520px, calc(100vw - 48px));
  max-height: calc(100vh - 96px);
  overflow-y: auto;
  padding: 18px;
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 14px;
  box-shadow: var(--dsw-shadow-lv3);
  color: var(--dsw-alias-label-primary);
}

.dshH-tb-modalTitle {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.dshH-tb-confirmMessage {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--dsw-alias-label-secondary);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.dshH-tb-modalFooter {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}

.dshH-tb-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.dshH-tb-fieldLabel {
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary);
}

.dshH-tb-input {
  padding: 7px 10px;
  font-size: 13px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-specific-input-major);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  outline: none;
  resize: vertical;
  font-family: inherit;
}

.dshH-tb-input:focus {
  border-color: var(--dsw-alias-state-business-primary);
}

.dshH-tb-select {
  padding: 7px 10px;
  font-size: 13px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-specific-input-major);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  outline: none;
  font-family: inherit;
  max-width: 100%;
}

.dshH-tb-input::placeholder {
  color: var(--dsw-alias-label-tertiary);
}

.dshH-tb-formError {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-state-error-primary);
}

/* --- detail ------------------------------------------------------------------- */

.dshH-tb-detail {
  display: flex;
  flex-direction: column;
  width: min(640px, calc(100vw - 48px));
  max-height: calc(100vh - 80px);
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 14px;
  box-shadow: var(--dsw-shadow-lv3);
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
}

.dshH-tb-detailHeader {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--dsw-alias-separator-primary);
  flex: none;
}

.dshH-tb-detailTitle {
  margin: 0;
  flex: 1;
  font-size: 15px;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.dshH-tb-statusBadge {
  flex: none;
  padding: 2px 10px;
  font-size: 12px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
}

.dshH-tb-statusBadge[data-status='running'] {
  color: var(--dsw-alias-state-warn-primary);
  border-color: var(--dsw-alias-state-warn-primary);
}

.dshH-tb-statusBadge[data-status='done'] {
  color: var(--dsw-alias-state-success-primary);
  border-color: var(--dsw-alias-state-success-primary);
}

.dshH-tb-statusBadge[data-status='failed'] {
  color: var(--dsw-alias-state-error-primary);
  border-color: var(--dsw-alias-state-error-primary);
}

.dshH-tb-detailBody {
  padding: 14px 18px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
}

.dshH-tb-detailSection {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dshH-tb-detailSection h4 {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--dsw-alias-label-tertiary);
  text-transform: none;
}

.dshH-tb-detailText {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--dsw-alias-label-primary);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* --- scheduled runs ---------------------------------------------------------- */

.dshH-tb-scheduleToggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  user-select: none;
}

.dshH-tb-scheduleToggle input {
  accent-color: var(--dsw-alias-state-business-primary);
}

.dshH-tb-scheduleRow {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dshH-tb-scheduleInput {
  flex: 1;
  min-width: 0;
  font-family: var(--dsw-font-markdown-code-block-small);
  font-size: 12.5px;
}

.dshH-tb-scheduleInputInvalid {
  border-color: var(--dsw-alias-state-error-primary);
}

.dshH-tb-scheduleInputInvalid:focus {
  border-color: var(--dsw-alias-state-error-primary);
}

.dshH-tb-schedulePreset {
  flex: none;
  padding: 7px 8px;
  font-size: 12.5px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-specific-input-major);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  outline: none;
}

.dshH-tb-scheduleMeta {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  overflow-wrap: anywhere;
}

.dshH-tb-promptBlock {
  margin: 0;
  padding: 10px 12px;
  font-size: 12.5px;
  line-height: 1.5;
  font-family: var(--dsw-font-markdown-code-block-small);
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-markdown-code-block);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 240px;
  overflow-y: auto;
}

.dshH-tb-executionList {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dshH-tb-executionRow {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  flex-wrap: wrap;
}

.dshH-tb-executionBadge {
  flex: none;
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 999px;
  color: var(--dsw-alias-state-warn-primary);
  background: var(--dsw-alias-state-warn-secondary);
}

.dshH-tb-executionBadge[data-result='succeeded'] {
  color: var(--dsw-alias-state-success-primary);
  background: transparent;
}

.dshH-tb-executionBadge[data-result='failed'] {
  color: var(--dsw-alias-state-error-primary);
  background: transparent;
}

.dshH-tb-executionBadge[data-result='cancelled'] {
  color: var(--dsw-alias-label-tertiary);
  background: transparent;
}

.dshH-tb-executionTimes {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}

.dshH-tb-executionError {
  width: 100%;
  font-size: 12px;
  color: var(--dsw-alias-state-error-primary);
  overflow-wrap: anywhere;
}

.dshH-tb-moveRow {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.dshH-tb-detailFooter {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-top: 1px solid var(--dsw-alias-separator-primary);
  flex: none;
}

.dshH-tb-detailMeta {
  margin-left: auto;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}

/* --- constrained board containers ------------------------------------------ */

@container task-board-view (max-width: 768px) {
  .dshH-tb-board {
    gap: 10px;
    padding: 10px;
  }

  .dshH-tb-boardHeader {
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .dshH-tb-backButton {
    flex: 0 0 auto;
    order: 1;
  }

  .dshH-tb-boardTitle {
    flex: 1 1 auto;
    order: 2;
  }

  .dshH-tb-boardHeader > .dshH-tb-detailMeta {
    flex: 1 0 100%;
    margin-left: 0;
    order: 3;
  }

  .dshH-tb-search {
    flex: 1 0 100%;
    min-width: 0;
    order: 4;
  }

  .dshH-tb-boardHeader > button:not(.dshH-tb-backButton) {
    flex: 1 1 0;
    min-width: 0;
    order: 5;
  }

  .dshH-tb-columns {
    grid-auto-columns: 86cqw;
    gap: 10px;
    padding-inline: 2px 14cqw;
    scroll-padding-inline: 2px;
    scroll-snap-type: inline mandatory;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }

  .dshH-tb-columns::-webkit-scrollbar {
    display: none;
  }

  .dshH-tb-column {
    scroll-snap-align: start;
    scroll-snap-stop: always;
  }
}

@container task-board-view (max-width: 720px) {
  .dshH-tb-boardHeader > .dshH-tb-detailMeta {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

@container task-board-view (max-width: 600px) {
  .dshH-tb-board {
    padding-inline: 8px;
  }
}

/* Viewport-specific mobile treatment: overlays occupy the dynamic viewport,
   preserve notches/home indicators, and keep their action rows reachable. */
@media (max-width: 768px) {
  [data-dsh-hello-board-view] {
    height: 100vh;
    height: 100dvh;
  }

  .dshH-tb-entry,
  .dshH-tb-card,
  .dshH-tb-primaryButton,
  .dshH-tb-ghostButton,
  .dshH-tb-dangerButton,
  .dshH-tb-iconButton,
  .dshH-tb-linkButton,
  .dshH-tb-search,
  .dshH-tb-input,
  .dshH-tb-select,
  .dshH-tb-schedulePreset,
  .dshH-tb-scheduleToggle {
    min-height: 44px;
  }

  .dshH-tb-search,
  .dshH-tb-input,
  .dshH-tb-select,
  .dshH-tb-schedulePreset {
    box-sizing: border-box;
    font-size: 16px;
  }

  .dshH-tb-modalBackdrop {
    align-items: stretch;
    justify-content: stretch;
    width: 100vw;
    height: 100vh;
    height: 100dvh;
  }

  .dshH-tb-modal,
  .dshH-tb-detail {
    box-sizing: border-box;
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    max-height: none;
    border: 0;
    border-radius: 0;
  }

  .dshH-tb-modal {
    padding-top: max(16px, env(safe-area-inset-top));
    padding-right: max(16px, env(safe-area-inset-right));
    padding-bottom: max(16px, env(safe-area-inset-bottom));
    padding-left: max(16px, env(safe-area-inset-left));
  }

  .dshH-tb-modalFooter {
    position: sticky;
    bottom: 0;
    z-index: 1;
    flex-wrap: wrap;
    padding-top: 8px;
    background: var(--dsw-alias-bg-base);
  }

  .dshH-tb-modalFooter > button {
    flex: 1 1 120px;
  }

  .dshH-tb-detailHeader {
    flex-wrap: wrap;
    padding-top: max(12px, env(safe-area-inset-top));
    padding-right: max(14px, env(safe-area-inset-right));
    padding-left: max(14px, env(safe-area-inset-left));
  }

  .dshH-tb-detailTitle {
    min-width: 0;
  }

  .dshH-tb-detailBody {
    overscroll-behavior-y: contain;
    padding-right: max(14px, env(safe-area-inset-right));
    padding-left: max(14px, env(safe-area-inset-left));
  }

  .dshH-tb-detailFooter {
    flex-wrap: wrap;
    padding-right: max(14px, env(safe-area-inset-right));
    padding-bottom: max(12px, env(safe-area-inset-bottom));
    padding-left: max(14px, env(safe-area-inset-left));
  }

  .dshH-tb-detailFooter > button {
    flex: 1 1 96px;
  }

  .dshH-tb-detailFooter > .dshH-tb-detailMeta {
    flex: 1 0 100%;
    margin-left: 0;
    text-align: end;
  }

  .dshH-tb-scheduleRow {
    align-items: stretch;
    flex-direction: column;
  }

  .dshH-tb-schedulePreset {
    width: 100%;
  }
}

/* -----------------------------------------------------------------------------
 * Polish pass: complete interaction states (hover / active / focus-visible /
 * disabled), unified 120ms motion, and reduced-motion fallback.
 * Colors use the --dsw-alias-* design tokens, which adapt to light/dark/skins
 * automatically, so every rule below is dark-safe by construction.
 * --------------------------------------------------------------------------- */

/* --- one themed focus-visible ring (approx 2px, 2px offset) --- */
.dshH-tb-entry:focus-visible,
.dshH-tb-card:focus-visible,
.dshH-tb-primaryButton:focus-visible,
.dshH-tb-ghostButton:focus-visible,
.dshH-tb-dangerButton:focus-visible,
.dshH-tb-iconButton:focus-visible,
.dshH-tb-linkButton:focus-visible,
.dshH-tb-search:focus-visible,
.dshH-tb-input:focus-visible,
.dshH-tb-select:focus-visible,
.dshH-tb-schedulePreset:focus-visible,
.dshH-tb-scheduleToggle input:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 2px;
}

/* --- unified 120ms motion across the board's interactive controls --- */
.dshH-tb-entry,
.dshH-tb-primaryButton,
.dshH-tb-ghostButton,
.dshH-tb-dangerButton,
.dshH-tb-iconButton,
.dshH-tb-linkButton,
.dshH-tb-search,
.dshH-tb-input,
.dshH-tb-select,
.dshH-tb-schedulePreset,
.dshH-tb-scheduleToggle input {
  transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease, outline-color 120ms ease, box-shadow 120ms ease, transform 120ms ease;
}

/* --- press (active) feedback --- */
.dshH-tb-card:active {
  box-shadow: var(--dsw-shadow-lv1);
  transform: translateY(0);
}

.dshH-tb-entry:active,
.dshH-tb-primaryButton:active:not(:disabled),
.dshH-tb-ghostButton:active:not(:disabled),
.dshH-tb-dangerButton:active:not(:disabled),
.dshH-tb-iconButton:active:not(:disabled),
.dshH-tb-linkButton:active:not(:disabled) {
  transform: translateY(1px);
}

/* --- entry row (sidebar) states --- */
.dshH-tb-entry[data-active]:hover {
  background: var(--dsw-specific-sidebar-nav-item-active);
}

/* --- guarded hover for the remaining icon/link buttons (defensive: never
       disabled today, but a disabled element must not react to hover) --- */
.dshH-tb-iconButton:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.dshH-tb-linkButton:hover:not(:disabled) {
  text-decoration: underline;
}

.dshH-tb-iconButton:disabled,
.dshH-tb-linkButton:disabled {
  opacity: 0.45;
  cursor: default;
}

/* --- search box focus (border tint + themed ring above) --- */
.dshH-tb-search:focus,
.dshH-tb-select:focus,
.dshH-tb-schedulePreset:focus {
  border-color: var(--dsw-alias-state-business-primary);
}

/* --- schedule toggle checkbox focus already covered by the shared ring;
       keep the accent-color and size stable --- */
.dshH-tb-scheduleToggle input {
  margin: 0;
}

/* --- reduced motion: strip transitions, stop the decorative spinner --- */
@media (prefers-reduced-motion: reduce) {
  .dshH-tb-entry,
  .dshH-tb-card,
  .dshH-tb-primaryButton,
  .dshH-tb-ghostButton,
  .dshH-tb-dangerButton,
  .dshH-tb-iconButton,
  .dshH-tb-linkButton,
  .dshH-tb-search,
  .dshH-tb-input,
  .dshH-tb-select,
  .dshH-tb-schedulePreset,
  .dshH-tb-scheduleToggle input {
    transition: none;
  }

  .dshH-tb-cardSpinner {
    animation: none;
  }
}

`;
