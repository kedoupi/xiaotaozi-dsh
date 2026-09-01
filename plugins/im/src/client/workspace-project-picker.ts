// @ts-nocheck
import * as React from 'react';
import { createPortal } from 'react-dom';

import { h } from './i18n.ts';

const EMPTY_SNAPSHOT = Object.freeze({
  items: [], state: 'loading', phase: 'pending', error: null, baselinesReady: false,
});

function focusablePickerControls(root) {
  if (!root?.querySelectorAll) return [];
  return [...root.querySelectorAll('button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((node) => node.offsetParent !== null || node === document.activeElement);
}

function parentDirectory(path) {
  if (typeof path !== 'string') return '';
  const normalized = path.replaceAll('\\', '/').replace(/\/+$/, '');
  const separator = normalized.lastIndexOf('/');
  return separator > 0 ? normalized.slice(0, separator) : normalized.slice(0, separator + 1);
}

function projectErrorMessage(error) {
  return error?.message ?? (typeof error === 'string' ? error : '无法加载项目，请重试。');
}

export function WorkspaceProjectPicker({
  open,
  projects,
  workspaceId,
  busy = false,
  saveError = null,
  onPicked,
  onCancel,
}) {
  const source = projects?.list;
  const subscribe = React.useCallback(
    (listener) => source?.subscribe?.(listener) ?? (() => {}),
    [source],
  );
  const getSnapshot = React.useCallback(
    () => source?.getSnapshot?.() ?? EMPTY_SNAPSHOT,
    [source],
  );
  const projectSnapshot = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const dialogRef = React.useRef(null);
  const previousFocusRef = React.useRef(null);
  const titleId = React.useId();
  const noticeId = React.useId();
  const errorId = React.useId();

  React.useEffect(() => {
    if (!open) return undefined;
    const doc = typeof document === 'undefined' ? null : document;
    previousFocusRef.current = doc?.activeElement ?? null;
    const previousOverflow = doc?.body?.style?.overflow ?? '';
    if (doc?.body?.style) doc.body.style.overflow = 'hidden';
    dialogRef.current?.focus?.();
    return () => {
      if (doc?.body?.style) doc.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  const items = Array.isArray(projectSnapshot?.items) ? projectSnapshot.items : [];
  const loading = projectSnapshot?.state === 'loading'
    || projectSnapshot?.phase === 'pending'
    || projectSnapshot?.baselinesReady !== true;
  const listError = loading ? null : projectSnapshot?.error;
  const presentedError = saveError ?? listError;
  const titleCounts = new Map();
  for (const item of items) titleCounts.set(item.title, (titleCounts.get(item.title) ?? 0) + 1);

  const handleKeyDown = (event) => {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault();
      onCancel?.();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const controls = focusablePickerControls(dialogRef.current);
    if (controls.length === 0) {
      event.preventDefault();
      dialogRef.current.focus();
      return;
    }
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const content = h('div', {
    className: 'dim-directoryPickerBackdrop',
    onMouseDown: (event) => {
      if (event.target === event.currentTarget && !busy) onCancel?.();
    },
  },
  h('section', {
    ref: dialogRef,
    className: 'dim-directoryPicker',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': titleId,
    'aria-describedby': noticeId,
    tabIndex: -1,
    onKeyDown: handleKeyDown,
  },
  h('header', { className: 'dim-directoryPickerHeader' },
    h('h3', { id: titleId }, '选择项目'),
    h('p', null, '选择这个机器人要使用的 Web 项目。')),
  h('div', {
    className: 'dim-directoryPickerBody',
    'aria-busy': loading || busy,
    'aria-live': 'polite',
  },
    loading
      ? h('div', { className: 'dim-directoryPickerState' },
          h('span', { className: 'dim-directoryPickerSpinner', 'aria-hidden': 'true' }),
          h('p', null, '正在加载项目…'))
      : listError
        ? null
        : items.length === 0
          ? h('div', { className: 'dim-directoryPickerState' },
              h('strong', null, '还没有项目'),
              h('p', null, '请先在左侧项目区创建项目，然后返回这里选择。'))
          : h('ol', { className: 'dim-directoryList' }, items.map((item, index) => h('li', {
              key: item.workspaceId,
            }, React.createElement('button', {
              type: 'button',
              'data-workspace-id': item.workspaceId,
              'aria-current': item.workspaceId === workspaceId ? 'true' : undefined,
              disabled: busy,
              style: { minHeight: 44 },
              onClick: () => void onPicked?.(item.workspaceId),
            },
            React.createElement('span', { className: 'dim-projectNumber', 'aria-hidden': 'true' }, `${index + 1}`),
            React.createElement('span', { className: 'dim-directoryName' }, item.title),
            titleCounts.get(item.title) > 1
              ? React.createElement('span', { className: 'dim-projectParent' }, parentDirectory(item.path))
              : null)))),
    presentedError ? h('div', {
      id: errorId,
      className: 'dim-directoryPickerError',
      role: 'alert',
    }, h('span', null, projectErrorMessage(presentedError))) : null,
    busy ? h('p', { className: 'dim-directoryPickerBusy', role: 'status' }, '切换中…') : null),
  h('footer', { className: 'dim-directoryPickerFooter' },
    h('p', { id: noticeId, className: 'dim-directoryPickerNotice' }, '切换后会清除这个机器人的旧会话映射。'),
    h('div', { className: 'dim-directoryPickerActions' },
      h('button', { type: 'button', onClick: onCancel, disabled: busy }, '取消')))));

  return typeof document === 'undefined' ? content : createPortal(content, document.body);
}
