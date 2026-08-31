// @ts-nocheck
import * as React from 'react';
import { createPortal } from 'react-dom';

import { FollowChannelLogo } from './channel-logos.ts';
import { h, localizeText } from './i18n.ts';
import {
  followHoverHintText,
  installSessionFollowBadges,
  selectedSessionId,
} from './session-follow-badges.ts';
import {
  getFollowIndexGeneration,
  installSessionMenuFollow,
  notifyFollowIndex,
  subscribeFollowIndex,
} from './session-follow-menu.ts';

export const IM_FOLLOW_RPC_CHANNEL = '/im';
export const IM_FOLLOW_SLOT = 'conversation.session.header.actions';
export const IM_FOLLOW_ID = 'im-follow';
const STYLE_ID = 'dsh-im-session-follow';

export const SESSION_FOLLOW_CSS = String.raw`
.dim-follow {
  position: relative;
  display: inline-flex;
}
[data-slot="conversation.session.header.actions"] {
  flex-shrink: 0;
  overflow: visible;
}
[data-slot="conversation.session.header.actions"] > .dim-follow,
[data-slot="conversation.session.header.actions"] > .dim-followBadge,
[data-slot="conversation.session.header.actions"] > [data-im-follow-header] {
  order: 999;
}
.dim-followButton {
  width: 32px;
  min-width: 32px;
  height: 32px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  transition: background-color var(--xtz-dur-fast, 120ms) ease, color var(--xtz-dur-fast, 120ms) ease;
}
.dim-followButton[data-state="idle"] {
  color: var(--dsw-alias-label-tertiary, #8f959e);
}
.dim-followButton[data-state="idle"]:hover {
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dim-followButton:hover, .dim-followBadge:hover {
  background: var(--dsw-alias-interactive-bg-hover, #f2f3f5);
}
.dim-followButton:active, .dim-followBadge:active {
  background: var(--dsw-alias-interactive-bg-pressed, #e5e6eb);
}
.dim-followButton:focus-visible, .dim-followBadge:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #a84c2c);
  outline-offset: 2px;
}
.dim-followBadge {
  width: 32px;
  min-width: 32px;
  height: 32px;
  margin-inline: 0 6px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  flex-shrink: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  pointer-events: auto;
  position: relative;
  z-index: 1;
  transition: background-color var(--xtz-dur-fast, 120ms) ease, color var(--xtz-dur-fast, 120ms) ease;
}
/* Official session rows are 32px with one 16px status slot. Keep one leading
   mark: the channel badge replaces the dots and carries running as an outline. */
[data-im-follow-badge] {
  width: 16px;
  min-width: 16px;
  height: 16px;
  min-height: 16px;
  max-height: 16px;
  margin-inline: 0 4px;
  align-self: center;
}
[data-im-follow-badge]::after {
  content: "";
  position: absolute;
  inset: -8px;
}
:is([role="treeitem"], [role="listitem"], li) > [class*="slot"]:has(> [data-im-follow-badge]) {
  position: relative;
  overflow: visible;
}
:is([role="treeitem"], [role="listitem"], li) > [class*="slot"] > [data-im-follow-badge] {
  margin: 0;
}
:is([role="treeitem"], [role="listitem"], li) > [class*="slot"]:has(> [data-im-follow-badge]) > :not([data-im-follow-badge]) {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  clip-path: inset(50%);
  pointer-events: none;
}
:is([role="treeitem"], [role="listitem"], li) > [class*="slot"]:has([class*="matrix"]) > [data-im-follow-badge] .dim-logo,
:is([role="treeitem"], [role="listitem"], li) > [class*="slot"]:has([data-state="ongoing"]) > [data-im-follow-badge] .dim-logo {
  outline: 1.5px solid var(--dsw-static-deepseek-450, #e57a45);
  outline-offset: 1px;
}
.dim-followHoverInner {
  min-width: 0;
  display: inline-flex;
  align-items: flex-start;
  gap: 8px;
}
.dim-followHover {
  color: var(--dsw-alias-label-secondary, #646a73);
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  line-height: 20px;
  display: flex;
}
.dim-followHover .dim-logo {
  width: 16px;
  height: 16px;
  margin-top: 1px;
  border-radius: var(--xtz-radius-s, 8px);
  flex: none;
  color: #fff;
}
/* 16px container × 60% = 10px glyph (spec §3.2) */
.dim-followHover .dim-logo svg {
  width: 10px;
  height: 10px;
}
.dim-followHoverCopy {
  min-width: 0;
  display: grid;
  gap: 1px;
}
.dim-followHoverCopy strong {
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
}
.dim-followHoverCopy small {
  color: var(--dsw-alias-label-secondary, #646a73);
  font-size: 12px;
  line-height: 16px;
}
.dim-followHeader {
  width: 32px;
  min-width: 32px;
  height: 32px;
  margin-inline: 0;
  padding: 0;
  background: transparent;
}
.dim-followBadge .dim-logo,
.dim-follow .dim-logo {
  width: 16px;
  height: 16px;
  border-radius: var(--xtz-radius-s, 8px);
  box-shadow: none;
}
.dim-followHeader .dim-logo {
  width: 18px;
  height: 18px;
  border-radius: var(--xtz-radius-s, 8px);
}
/* 16px badge × 60% = 10px；18px header × 60% = 11px */
.dim-follow .dim-logo svg,
.dim-followBadge .dim-logo svg {
  width: 10px;
  height: 10px;
}
.dim-followHeader .dim-logo svg {
  width: 11px;
  height: 11px;
}
.dim-followScrim {
  --dim-follow-brand-ink: var(--dsw-alias-state-business-primary, #a84c2c);
  --dim-follow-brand-soft: var(--dsw-alias-state-business-tertiary, color-mix(in srgb, var(--dim-follow-brand-ink) 10%, transparent));
  --dim-follow-focus: var(--dsw-alias-state-business-primary, #a84c2c);
  --dim-follow-error-ink: color-mix(in srgb, var(--dsw-alias-label-primary, #1f2329) 78%, var(--dsw-alias-state-error-primary, #d54941));
  position: fixed;
  inset: 0;
  z-index: 10041;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(31 35 41 / 28%);
  pointer-events: auto;
}
.dim-followPanel {
  width: min(420px, 92vw);
  max-height: min(72dvh, 560px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2, #dfe1e5);
  border-radius: 16px;
  background: var(--dsw-alias-bg-layer-1, #fff);
  box-shadow: var(--dsw-shadow-lv3, 0 16px 40px rgb(31 35 41 / 18%));
}
.dim-followPanel header {
  display: grid;
  gap: 4px;
  padding: 16px 16px 12px;
}
.dim-followPanel h2 {
  margin: 0;
  font-size: 15px;
  line-height: 22px;
  font-weight: 600;
}
.dim-followPanel header p {
  margin: 0;
  color: var(--dsw-alias-label-secondary, #646a73);
  font-size: 12px;
  line-height: 18px;
}
.dim-followList {
  overflow: auto;
  display: grid;
  gap: 14px;
  padding: 0 12px 12px;
}
.dim-followGroup {
  display: grid;
  gap: 6px;
}
.dim-followGroupHead {
  padding: 2px 4px 0;
  color: var(--dsw-alias-label-secondary, #646a73);
  font-size: 12px;
  line-height: 18px;
  font-weight: 600;
}
.dim-followChoice {
  width: 100%;
  min-height: 48px;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border: 1px solid var(--dsw-alias-border-l2, #eef0f3);
  border-radius: 12px;
  color: inherit;
  background: var(--dsw-alias-bg-layer-1, #fff);
  box-shadow: var(--dsw-shadow-lv1, 0 1px 4px rgb(31 35 41 / 8%));
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color var(--xtz-dur-fast, 120ms) ease, background-color var(--xtz-dur-fast, 120ms) ease, box-shadow var(--xtz-dur-fast, 120ms) ease;
}
.dim-followChoice:hover {
  border-color: color-mix(in srgb, var(--dim-follow-brand-ink) 28%, var(--dsw-alias-border-l2, #dfe1e5));
  background: var(--dsw-alias-interactive-bg-hover, #f7f8fa);
}
.dim-followChoice[aria-pressed="true"] {
  border-color: var(--dim-follow-brand-ink);
  background: var(--dim-follow-brand-soft);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--dim-follow-brand-ink) 18%, transparent);
}
.dim-followChoice:focus-visible, .dim-followPanel footer button:focus-visible {
  outline: 2px solid var(--dim-follow-focus);
  outline-offset: 2px;
}
.dim-followChoice:disabled {
  opacity: .55;
  cursor: not-allowed;
}
.dim-followChoice .dim-logo {
  width: 32px;
  height: 32px;
  border-radius: var(--xtz-radius-s, 8px);
}
/* 32px container × 60% ≈ 19px glyph (spec §3.2) */
.dim-followChoice .dim-logo svg {
  width: 19px;
  height: 19px;
}
.dim-followTick {
  width: 16px;
  height: 16px;
  color: var(--dim-follow-brand-ink);
  opacity: 0;
}
.dim-followChoice[aria-pressed="true"] .dim-followTick {
  opacity: 1;
}
.dim-followChoiceCopy {
  min-width: 0;
  display: grid;
  gap: 1px;
}
.dim-followChoice strong {
  overflow: hidden;
  font-size: 13px;
  line-height: 18px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dim-followChoice small {
  overflow: hidden;
  color: var(--dsw-alias-label-secondary, #646a73);
  font: 11px ui-monospace, SFMono-Regular, Menlo, monospace;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dim-followEmpty, .dim-followError, .dim-followStatus {
  margin: 0;
  padding: 4px 4px 8px;
  color: var(--dsw-alias-label-secondary, #646a73);
  font-size: 12px;
  line-height: 18px;
}
.dim-followError { color: var(--dim-follow-error-ink); }
.dim-followStatus[aria-live][data-empty="true"] {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.dim-followPanel footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px 16px;
  border-top: 1px solid var(--dsw-alias-border-l1, #eef0f3);
}
.dim-followPanel footer button {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l2, #dfe1e5);
  border-radius: 8px;
  color: var(--dsw-alias-label-primary, #1f2329);
  background: var(--dsw-alias-bg-layer-1, #fff);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color var(--xtz-dur-fast, 120ms) ease, background-color var(--xtz-dur-fast, 120ms) ease, color var(--xtz-dur-fast, 120ms) ease;
}
.dim-followPanel footer button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, #f2f3f5);
}
.dim-followPanel footer button:active:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-pressed, #e5e6eb);
}
.dim-followPanel footer button:disabled {
  opacity: .55;
  cursor: not-allowed;
}
.dim-followClear {
  color: var(--dim-follow-error-ink);
}
@media (max-width: 768px), (pointer: coarse) {
  .dim-followButton, .dim-followHeader,
  .dim-followPanel footer button { min-width: 44px; min-height: 44px; }
  [data-im-follow-badge]::after { inset: -14px; }
  .dim-followScrim { padding: 12px; }
  .dim-followPanel { width: min(420px, 100%); max-height: min(84dvh, 560px); }
}
@media (prefers-reduced-motion: reduce) {
  .dim-followScrim *, .dim-followScrim *::before, .dim-followScrim *::after,
  .dim-followButton, .dim-followBadge { animation: none !important; transition: none !important; }
}
`;

export function installFollowStyles() {
  if (typeof document === 'undefined') return () => {};
  if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`)) return () => {};
  const style = document.createElement('style');
  style.dataset.plugin = 'dsh-im';
  style.dataset.pluginCss = STYLE_ID;
  style.textContent = SESSION_FOLLOW_CSS;
  document.head.appendChild(style);
  return () => style.remove();
}

let followDialog = { open: false, sessionId: null };
const followDialogListeners = new Set();

export function getFollowDialog() {
  return followDialog;
}

export function subscribeFollowDialog(listener) {
  followDialogListeners.add(listener);
  return () => followDialogListeners.delete(listener);
}

export function openFollowDialog(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) return;
  followDialog = { open: true, sessionId };
  for (const listener of followDialogListeners) listener();
}

export function closeFollowDialog() {
  followDialog = { open: false, sessionId: followDialog.sessionId };
  for (const listener of followDialogListeners) listener();
}

function unwrap(result) {
  if (result?.ok === false) {
    throw new Error(result.error?.message || localizeText('无法更新 IM 会话连接，请稍后重试。'));
  }
  return result?.value ?? result;
}

function currentLabel(current) {
  return followHoverHintText(current);
}

function focusableFollowControls(root) {
  if (!root?.querySelectorAll) return [];
  const activeElement = root.ownerDocument?.activeElement;
  return [...root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((node) => node.offsetParent !== null || node === activeElement);
}

const FOLLOW_CHANNEL_LABELS = Object.freeze({
  weixin: '微信',
  feishu: '飞书',
  dingtalk: '钉钉',
  wecom: '企业微信',
  qq: 'QQ',
  slack: 'Slack',
  telegram: 'Telegram',
  discord: 'Discord',
  whatsapp: 'WhatsApp',
});
const FOLLOW_CHANNEL_ORDER = Object.freeze(Object.keys(FOLLOW_CHANNEL_LABELS));

export function groupFollowBots(items) {
  const ready = (Array.isArray(items) ? items : []).filter((item) => item?.ready !== false);
  const groups = [];
  const seen = new Set();
  for (const channel of FOLLOW_CHANNEL_ORDER) {
    const bots = ready.filter((item) => item.channel === channel);
    if (bots.length === 0) continue;
    seen.add(channel);
    groups.push({
      channel,
      label: FOLLOW_CHANNEL_LABELS[channel] ?? channel,
      bots,
    });
  }
  for (const item of ready) {
    if (seen.has(item.channel)) continue;
    const bots = ready.filter((row) => row.channel === item.channel);
    seen.add(item.channel);
    groups.push({
      channel: item.channel,
      label: FOLLOW_CHANNEL_LABELS[item.channel] ?? item.channel,
      bots,
    });
  }
  return groups;
}

function botRowName(item) {
  if (typeof item?.name === 'string' && item.name) return item.name;
  return item?.label || '';
}

function FollowTick() {
  return h('svg', {
    className: 'dim-followTick',
    viewBox: '0 0 16 16',
    focusable: 'false',
    'aria-hidden': 'true',
  }, h('path', {
    d: 'M3.4 8.2 6.5 11.2 12.6 4.6',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }));
}

export { FollowChannelLogo };

export function FollowDialog({ sessionId, rpcCall, onClose }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [channels, setChannels] = React.useState([]);
  const [current, setCurrent] = React.useState(null);
  const panelRef = React.useRef(null);
  const previousFocusRef = React.useRef(null);
  const onCloseRef = React.useRef(onClose);
  const titleId = React.useId();
  const descriptionId = React.useId();

  onCloseRef.current = onClose;

  const load = React.useCallback(async () => {
    if (!sessionId || typeof rpcCall !== 'function') return;
    setBusy(true);
    setError('');
    try {
      const value = unwrap(await rpcCall('session.follow.list', { sessionId }));
      setChannels(Array.isArray(value?.channels) ? value.channels : []);
      setCurrent(value?.current && typeof value.current === 'object' ? value.current : null);
    } catch (cause) {
      setError(cause?.message || '无法读取 IM 会话连接。');
    } finally {
      setBusy(false);
    }
  }, [rpcCall, sessionId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const doc = typeof document === 'undefined' ? null : document;
    if (!doc) return undefined;
    previousFocusRef.current = doc.activeElement;
    const previousOverflow = doc.body?.style?.overflow ?? '';
    if (doc.body?.style) doc.body.style.overflow = 'hidden';
    panelRef.current?.focus?.();
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const items = focusableFollowControls(panelRef.current);
      if (items.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (doc.activeElement === first || doc.activeElement === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && doc.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    doc.addEventListener('keydown', onKey);
    return () => {
      doc.removeEventListener('keydown', onKey);
      if (doc.body?.style) doc.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, []);

  const choose = async (item) => {
    if (item.selected) {
      onClose?.();
      return;
    }
    if (item.ready === false) return;
    setBusy(true);
    setError('');
    try {
      const value = unwrap(await rpcCall('session.follow.set', {
        sessionId,
        channel: item.channel,
        botId: item.botId,
      }));
      setChannels(Array.isArray(value?.channels) ? value.channels : channels.map((row) => ({
        ...row,
        selected: row.channel === item.channel && row.botId === item.botId,
      })));
      setCurrent(value?.current ?? {
        channel: item.channel,
        botId: item.botId,
        label: item.label,
        selected: true,
      });
      notifyFollowIndex();
      onClose?.();
    } catch (cause) {
      setError(cause?.message || '无法更新 IM 会话连接，请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setError('');
    try {
      const value = unwrap(await rpcCall('session.follow.clear', { sessionId }));
      setChannels(Array.isArray(value?.channels) ? value.channels : channels.map((row) => ({
        ...row,
        selected: false,
      })));
      setCurrent(null);
      notifyFollowIndex();
      onClose?.();
    } catch (cause) {
      setError(cause?.message || '无法更新 IM 会话连接，请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  const following = Boolean(current?.channel);

  return h('div', {
    className: 'dim-followScrim',
    onMouseDown: (event) => {
      if (event.target === event.currentTarget) onClose?.();
    },
  }, h('div', {
    ref: panelRef,
    className: 'dim-followPanel',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': titleId,
    'aria-describedby': descriptionId,
    'aria-busy': busy ? 'true' : undefined,
    tabIndex: -1,
  },
    h('header', null,
      h('h2', { id: titleId }, '选择 IM 机器人'),
      h('p', { id: descriptionId }, '只显示当前工作区里的机器人，勾选一个即可。'),
    ),
    h('div', { className: 'dim-followList', 'aria-busy': busy ? 'true' : undefined },
      h('p', {
        className: 'dim-followStatus',
        role: 'status',
        'aria-live': 'polite',
        'aria-atomic': 'true',
        'data-empty': String(!busy),
      }, busy ? '正在更新 IM 会话连接…' : ''),
      error ? h('p', { className: 'dim-followError', role: 'alert' }, error) : null,
      channels.length === 0 && !busy
        ? h('p', { className: 'dim-followEmpty' }, '当前工作区没有可以继续此会话的 IM 机器人。先打开侧栏的 IM 机器人，把机器人的工作区切到这个目录。')
        : groupFollowBots(channels).map((group) => h('section', {
          key: group.channel,
          className: 'dim-followGroup',
        },
          h('div', { className: 'dim-followGroupHead' }, group.label),
          group.bots.map((item) => h('button', {
            key: `${item.channel}:${item.botId}`,
            type: 'button',
            className: 'dim-followChoice',
            'aria-pressed': item.selected === true,
            disabled: busy,
            onClick: () => choose(item),
          },
            h(FollowChannelLogo, { channel: item.channel }),
            h('span', { className: 'dim-followChoiceCopy' },
              h('strong', null, botRowName(item)),
              item.detail ? h('small', null, item.detail) : null,
            ),
            h(FollowTick),
          )),
        )),
    ),
    h('footer', null,
      following ? h('button', {
        type: 'button',
        className: 'dim-followClear',
        disabled: busy,
        onClick: () => clear(),
      }, '断开 IM 会话') : null,
      h('button', { type: 'button', onClick: () => onClose?.() }, '关闭'),
    ),
  ));
}

export function FollowOverlay({ rpcCall }) {
  const dialog = React.useSyncExternalStore(subscribeFollowDialog, getFollowDialog, getFollowDialog);
  if (!dialog.open || !dialog.sessionId) return null;
  const overlay = h('div', { style: { pointerEvents: 'auto' } },
    h(FollowDialog, {
      sessionId: dialog.sessionId,
      rpcCall,
      onClose: closeFollowDialog,
    }));
  return typeof document === 'undefined' ? overlay : createPortal(overlay, document.body);
}

function resolveFollowSessionId(sessionId) {
  if (typeof sessionId === 'string' && sessionId) return sessionId;
  if (typeof document === 'undefined') return null;
  return selectedSessionId(document);
}

function FollowIdleGlyph() {
  return h('svg', {
    width: 16,
    height: 16,
    viewBox: '0 0 16 16',
    fill: 'none',
    'aria-hidden': 'true',
  }, h('path', {
    d: 'M6.9 9.1 9.1 6.9M7.7 4.8l1.6-1.6a2.4 2.4 0 0 1 3.4 3.4l-1.6 1.6M8.3 11.2l-1.6 1.6a2.4 2.4 0 0 1-3.4-3.4l1.6-1.6',
    stroke: 'currentColor',
    strokeWidth: '1.3',
    strokeLinecap: 'round',
  }));
}

export function SessionFollowAction({ sessionId, rpcCall }) {
  const [current, setCurrent] = React.useState(null);
  const dialog = React.useSyncExternalStore(subscribeFollowDialog, getFollowDialog, getFollowDialog);
  const indexTick = React.useSyncExternalStore(
    subscribeFollowIndex,
    getFollowIndexGeneration,
    getFollowIndexGeneration,
  );
  const resolvedId = resolveFollowSessionId(sessionId);

  React.useEffect(() => {
    let cancelled = false;
    if (!resolvedId || typeof rpcCall !== 'function') {
      setCurrent(null);
      return undefined;
    }
    void rpcCall('session.follow.list', { sessionId: resolvedId }).then((result) => {
      if (cancelled) return;
      try {
        const value = unwrap(result);
        setCurrent(value?.current && typeof value.current === 'object' ? value.current : null);
      } catch {
        setCurrent(null);
      }
    }, () => {
      if (!cancelled) setCurrent(null);
    });
    return () => {
      cancelled = true;
    };
  }, [rpcCall, resolvedId, dialog.open, indexTick]);

  if (!resolvedId) return null;
  const following = Boolean(current?.channel);
  const label = following ? currentLabel(current) : localizeText('在 IM 中继续此会话');
  return h('div', { className: 'dim-follow' },
    h('button', {
      type: 'button',
      className: 'dim-followButton',
      'data-state': following ? 'following' : 'idle',
      title: label,
      'aria-label': label,
      'aria-haspopup': 'dialog',
      onClick: () => openFollowDialog(resolvedId),
    }, following ? h(FollowChannelLogo, { channel: current.channel }) : h(FollowIdleGlyph)));
}

export function registerSessionFollow(ctx) {
  const rpcCall = (endpoint, payload, signal) =>
    ctx.connection.rpc.call(IM_FOLLOW_RPC_CHANNEL, endpoint, payload, signal);
  ctx.slots.inject(IM_FOLLOW_SLOT, () => ctx.slots.register({
    name: IM_FOLLOW_SLOT,
    id: IM_FOLLOW_ID,
    order: 80,
    locale: 'dsh-im',
    inject: () => ({ rpcCall }),
  }, SessionFollowAction));
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'im-follow-dialog',
    order: 60,
    inject: () => ({ rpcCall }),
  }, FollowOverlay));
  ctx.effect(
    () => installSessionMenuFollow((sessionId) => openFollowDialog(sessionId)),
    'im-follow: session row menu item',
  );
  ctx.effect(
    () => installSessionFollowBadges({
      rpcCall,
      onOpen: (sessionId) => openFollowDialog(sessionId),
    }),
    'im-follow: session row and header badges',
  );
}
