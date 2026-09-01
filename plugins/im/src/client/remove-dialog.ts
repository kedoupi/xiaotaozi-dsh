// @ts-nocheck
import * as React from 'react';

import { h } from './i18n.ts';

// Shared destructive bot-removal dialog. Channels render it as a
// channel-scoped overlay sibling to the bot card list, so the card stays
// mounted and visible behind it instead of being replaced inline.
export function RemoveBotDialog({
  botId,
  title,
  description,
  busy = false,
  cancelLabel = '保留机器人',
  confirmLabel = '确认移除接入',
  confirmingLabel = '正在移除…',
  onConfirm,
  onCancel,
}) {
  const rootRef = React.useRef(null);
  const cancelRef = React.useRef(null);
  const restoreFocusRef = React.useRef(null);
  const idPart = String(botId ?? 'bot').replace(/[^a-zA-Z0-9_-]/g, '-');
  const titleId = `dim-remove-title-${idPart}`;
  const descriptionId = `dim-remove-description-${idPart}`;

  React.useEffect(() => {
    restoreFocusRef.current = typeof document === 'undefined' ? null : document.activeElement;
    cancelRef.current?.focus();
    return () => {
      const trigger = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (!trigger || typeof trigger.focus !== 'function') return;
      if (typeof document !== 'undefined' && document.contains && !document.contains(trigger)) {
        return;
      }
      trigger.focus();
    };
  }, []);

  return h('div', { className: 'dim-removeOverlay' },
    h('div', {
      className: 'dim-confirm dim-removeDialog',
      role: 'alertdialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
      'aria-describedby': descriptionId,
      ref: rootRef,
      onKeyDown: (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          if (!busy) onCancel();
          return;
        }
        if (event.key !== 'Tab' || !rootRef.current) return;
        const items = [...rootRef.current.querySelectorAll('button:not([disabled])')];
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      },
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
