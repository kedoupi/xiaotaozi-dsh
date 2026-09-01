// @ts-nocheck
import * as React from 'react';

import { h } from './i18n.ts';

// Same focusable-control recipe as the IM hub overlay (index.ts).
export function focusableControls(root) {
  if (!root?.querySelectorAll) return [];
  return [...root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((node) => node.offsetParent !== null || node === document.activeElement);
}

// Shared destructive bot-removal dialog. Channels render it as a
// channel-scoped overlay sibling to the bot card list, so the card stays
// mounted and visible behind it instead of being replaced inline. Focus is
// contained at document level (capture) so Escape/Tab can never leak to the
// host IM hub, and focus returns to the exact remove button that opened it.
export function RemoveBotDialog({
  botId,
  title,
  description,
  busy = false,
  cancelLabel = '保留机器人',
  confirmLabel = '确认移除接入',
  confirmingLabel = '正在移除…',
  trigger = null,
  onConfirm,
  onCancel,
}) {
  const panelRef = React.useRef(null);
  const cancelRef = React.useRef(null);
  const busyRef = React.useRef(busy);
  busyRef.current = busy;
  const onCancelRef = React.useRef(onCancel);
  onCancelRef.current = onCancel;
  const idPart = String(botId ?? 'bot').replace(/[^a-zA-Z0-9_-]/g, '-');
  const titleId = `dim-remove-title-${idPart}`;
  const descriptionId = `dim-remove-description-${idPart}`;

  React.useEffect(() => {
    if (typeof document === 'undefined' || !document.addEventListener) return undefined;
    cancelRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!busyRef.current) onCancelRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const items = focusableControls(panelRef.current);
      if (items.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const keepFocusInside = (event) => {
      const panel = panelRef.current;
      if (!panel || (panel.contains && panel.contains(event.target))) return;
      event.preventDefault?.();
      event.stopPropagation?.();
      (cancelRef.current ?? panel).focus?.();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', keepFocusInside, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', keepFocusInside, true);
      if (trigger && typeof trigger.focus === 'function'
        && typeof document.contains === 'function' && document.contains(trigger)) {
        trigger.focus();
      }
    };
    // The opener node and cancel callback are captured at mount; later identity
    // changes are irrelevant to a one-shot modal.
  }, []);

  return h('div', { className: 'dim-removeOverlay' },
    h('div', {
      className: 'dim-confirm dim-removeDialog',
      role: 'alertdialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
      'aria-describedby': descriptionId,
      tabIndex: -1,
      ref: panelRef,
    },
      h('strong', { id: titleId }, title),
      h('p', { id: descriptionId }, description),
      h('div', { className: 'dim-viewActions dim-removeActions' },
        h('button', {
          type: 'button',
          className: 'ddt-button dim-removeCancel',
          ref: cancelRef,
          onClick: onCancel,
          disabled: Boolean(busy),
        }, cancelLabel),
        h('button', {
          type: 'button',
          className: 'ddt-button dim-removeConfirm',
          'data-kind': 'danger',
          onClick: onConfirm,
          disabled: Boolean(busy),
        }, busy ? confirmingLabel : confirmLabel))));
}
