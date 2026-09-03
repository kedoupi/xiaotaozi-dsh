// @ts-nocheck
import { IM_PORTRAIT } from './portrait.ts';

/**
 * Official sidebar has no list slot between New Session and Workspaces.
 * Same approach as dsh-market: clone the New Session pill. Both plugins
 * share one tools row (`data-dsh-sidebar-tools`): market left, IM right.
 */

export const NEW_SESSION_LABELS = ['新会话', '新建会话', 'New Session', 'New session'];
export const IM_ENTRY_ATTR = 'data-im-hub-entry';
export const MARKET_ENTRY_ATTR = 'data-dsh-market-entry';
export const TOOLS_ROW_ATTR = 'data-dsh-sidebar-tools';
export const TOOLS_ROW_CLASS = 'dsh-sidebar-tools';
export const IM_HUB_ID = 'im-hub';

export const IM_ENTRY_ICON = `<img src="${IM_PORTRAIT}" alt="" width="15" height="15" />`;

export function isNewSessionLabel(text) {
  const compact = String(text || '').replace(/\s+/g, '').trim();
  return compact !== '' && NEW_SESSION_LABELS.some((label) => compact === label.replace(/\s+/g, ''));
}

export function findNewSessionButton(doc) {
  const buttons = [...doc.querySelectorAll('button')].filter((button) => (
    typeof button.closest !== 'function' || !button.closest(`[${TOOLS_ROW_ATTR}]`)
  ));
  const byText = buttons.filter((button) => isNewSessionLabel(button.textContent ?? ''));
  if (byText.length > 0) return byText.at(-1);
  const byAria = buttons.filter((button) => isNewSessionLabel(button.getAttribute('aria-label') ?? ''));
  return byAria.at(-1) ?? null;
}

export function ensureToolsRow(doc, sessionButton) {
  let row = doc.querySelector(`[${TOOLS_ROW_ATTR}]`);
  if (!row) {
    row = doc.createElement('div');
    row.setAttribute(TOOLS_ROW_ATTR, '');
    row.className = TOOLS_ROW_CLASS;
  }
  if (row.previousElementSibling !== sessionButton) sessionButton.after(row);
  return row;
}

export function pruneToolsRow(row) {
  if (row && row.childElementCount === 0) row.remove();
}

export function placeInToolsRow(row, button, slot) {
  if (slot === 'start') {
    if (row.firstElementChild !== button) row.insertBefore(button, row.firstElementChild);
    return;
  }
  if (row.lastElementChild !== button) row.append(button);
}

function fillEntry(button, label, sample) {
  button.innerHTML = IM_ENTRY_ICON;
  const text = button.ownerDocument.createElement('span');
  const sampleLabel = sample?.querySelector?.('span');
  if (sampleLabel?.className) text.className = sampleLabel.className;
  text.textContent = label;
  button.append(text);
}

export function ensureImEntry(doc, label, onOpen) {
  const session = findNewSessionButton(doc);
  const existing = doc.querySelector(`[${IM_ENTRY_ATTR}]`);
  if (!session) {
    existing?.remove();
    pruneToolsRow(doc.querySelector(`[${TOOLS_ROW_ATTR}]`));
    return;
  }
  const row = ensureToolsRow(doc, session);
  let button = existing;
  if (!button) {
    button = doc.createElement('button');
    button.type = 'button';
    button.setAttribute(IM_ENTRY_ATTR, '');
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-controls', IM_HUB_ID);
    button.setAttribute('aria-expanded', 'false');
    fillEntry(button, label, session);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onOpen?.();
    });
  }
  button.className = `${session.className} dim-hubEntry`;
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-controls', IM_HUB_ID);
  if (!button.hasAttribute('aria-expanded')) button.setAttribute('aria-expanded', 'false');
  const span = button.querySelector('span');
  if (span && span.textContent !== label) span.textContent = label;
  else if (!span) fillEntry(button, label, session);
  placeInToolsRow(row, button, 'end');
}

export function coalesce(run, schedule = queueMicrotask) {
  let scheduled = false;
  return () => {
    if (scheduled) return;
    scheduled = true;
    schedule(() => {
      scheduled = false;
      run();
    });
  };
}

export function mountImEntry(doc, label, onOpen) {
  if (!doc?.body || typeof MutationObserver === 'undefined') return () => {};
  const readLabel = typeof label === 'function' ? label : () => label;
  const ensure = () => ensureImEntry(doc, readLabel(), onOpen);
  ensure();
  let disposed = false;
  const scheduleEnsure = coalesce(() => {
    if (!disposed) ensure();
  });
  const observer = new MutationObserver(scheduleEnsure);
  observer.observe(doc.body, { childList: true, subtree: true });
  return () => {
    disposed = true;
    observer.disconnect();
    const button = doc.querySelector(`[${IM_ENTRY_ATTR}]`);
    const row = button?.parentElement?.hasAttribute?.(TOOLS_ROW_ATTR)
      ? button.parentElement
      : doc.querySelector(`[${TOOLS_ROW_ATTR}]`);
    button?.remove();
    pruneToolsRow(row);
  };
}
