// @ts-nocheck
import * as React from 'react';

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

const CSS = String.raw`
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
  width: 22px;
  min-width: 22px;
  height: 22px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 5px;
  background: transparent;
  cursor: pointer;
}
.dim-followButton:hover {
  filter: brightness(0.97);
}
.dim-followButton:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--dsw-alias-state-business-primary, #c45a32) 55%, white);
  outline-offset: 2px;
}
.dim-followBadge {
  width: 16px;
  min-width: 16px;
  height: 16px;
  margin-inline: 0 6px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  flex-shrink: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  pointer-events: auto;
  position: relative;
  z-index: 1;
}
.dim-followHoverInner {
  min-width: 0;
  display: inline-flex;
  align-items: flex-start;
  gap: 8px;
}
.dim-followHover {
  color: #adb2b8;
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
  border-radius: 4px;
  flex: none;
  color: #fff;
}
.dim-followHover .dim-logo svg {
  width: 12px;
  height: 12px;
}
.dim-followHover .dim-logoFeishu svg,
.dim-followHover .dim-logoWecom svg {
  width: 15px;
  height: 15px;
}
.dim-followHoverCopy {
  min-width: 0;
  display: grid;
  gap: 1px;
}
.dim-followHoverCopy strong {
  color: #fff;
  font-size: 12px;
  font-weight: 620;
  line-height: 18px;
}
.dim-followHoverCopy small {
  color: #adb2b8;
  font-size: 12px;
  line-height: 16px;
}
.dim-followHeader {
  width: 22px;
  min-width: 22px;
  height: 22px;
  margin-inline: 0;
  padding: 0;
  background: transparent;
}
.dim-followBadge:hover { filter: brightness(0.97); }
.dim-followBadge .dim-logo,
.dim-follow .dim-logo {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  box-shadow: none;
}
.dim-followHeader .dim-logo {
  width: 18px;
  height: 18px;
  border-radius: 5px;
}
.dim-follow .dim-logo svg,
.dim-followBadge .dim-logo svg {
  width: 12px;
  height: 12px;
}
.dim-follow .dim-logoFeishu svg,
.dim-follow .dim-logoWecom svg,
.dim-followBadge .dim-logoFeishu svg,
.dim-followBadge .dim-logoWecom svg {
  width: 15px;
  height: 15px;
}
.dim-followScrim {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(31 35 41 / 28%);
  pointer-events: auto;
}
.dim-followPanel {
  width: min(420px, 92vw);
  max-height: min(72vh, 560px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2, #dfe1e5);
  border-radius: 14px;
  background: var(--dsw-alias-bg-layer-1, #fff);
  box-shadow: 0 16px 40px rgb(31 35 41 / 18%);
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
  font-weight: 650;
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
  font-weight: 650;
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
  box-shadow: 0 1px 2px rgb(31 35 41 / 4%);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color .15s ease, background .15s ease, box-shadow .15s ease;
}
.dim-followChoice:hover {
  border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary, #c45a32) 28%, var(--dsw-alias-border-l2, #dfe1e5));
  background: var(--dsw-alias-interactive-bg-hover, #f7f8fa);
}
.dim-followChoice[aria-pressed="true"] {
  border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary, #c45a32) 50%, var(--dsw-alias-border-l2, #dfe1e5));
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #c45a32) 8%, white);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--dsw-alias-state-business-primary, #c45a32) 18%, transparent);
}
.dim-followChoice:disabled {
  opacity: .55;
  cursor: not-allowed;
}
.dim-followChoice .dim-logo {
  width: 32px;
  height: 32px;
  border-radius: 9px;
}
.dim-followChoice .dim-logo svg {
  width: 18px;
  height: 18px;
}
.dim-followChoice .dim-logoFeishu svg,
.dim-followChoice .dim-logoWecom svg {
  width: 24px;
  height: 24px;
}
.dim-followTick {
  width: 16px;
  height: 16px;
  color: var(--dsw-alias-state-business-primary, #c45a32);
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
  font-weight: 620;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dim-followChoice small {
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary, #8f959e);
  font: 11px ui-monospace, SFMono-Regular, Menlo, monospace;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dim-followEmpty, .dim-followError {
  margin: 0;
  padding: 4px 4px 8px;
  color: var(--dsw-alias-label-secondary, #646a73);
  font-size: 12px;
  line-height: 18px;
}
.dim-followError { color: #d83931; }
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
  font-weight: 560;
  cursor: pointer;
}
.dim-followClear {
  color: #d83931;
}
`;

export function installFollowStyles() {
  if (typeof document === 'undefined') return () => {};
  if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`)) return () => {};
  const style = document.createElement('style');
  style.dataset.plugin = 'dsh-im';
  style.dataset.pluginCss = STYLE_ID;
  style.textContent = CSS;
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
    throw new Error(result.error?.message || localizeText('无法更新 IM 跟进，请稍后重试。'));
  }
  return result?.value ?? result;
}

function currentLabel(current) {
  return followHoverHintText(current);
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

  const load = React.useCallback(async () => {
    if (!sessionId || typeof rpcCall !== 'function') return;
    setBusy(true);
    setError('');
    try {
      const value = unwrap(await rpcCall('session.follow.list', { sessionId }));
      setChannels(Array.isArray(value?.channels) ? value.channels : []);
      setCurrent(value?.current && typeof value.current === 'object' ? value.current : null);
    } catch (cause) {
      setError(cause?.message || '无法读取 IM 跟进。');
    } finally {
      setBusy(false);
    }
  }, [rpcCall, sessionId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
      setError(cause?.message || '无法更新 IM 跟进，请稍后重试。');
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
      setError(cause?.message || '无法更新 IM 跟进，请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  const following = Boolean(current?.channel);

  return h('div', {
    className: 'dim-followScrim',
    onClick: () => onClose?.(),
  }, h('div', {
    className: 'dim-followPanel',
    role: 'dialog',
    'aria-label': '选择 IM 机器人',
    onClick: (event) => event.stopPropagation(),
  },
    h('header', null,
      h('h2', null, '选择 IM 机器人'),
      h('p', null, '只显示当前工作区里的机器人，勾选一个即可。'),
    ),
    h('div', { className: 'dim-followList' },
      error ? h('p', { className: 'dim-followError' }, error) : null,
      channels.length === 0 && !busy
        ? h('p', { className: 'dim-followEmpty' }, '当前工作区没有可跟进的 IM 机器人。先打开侧栏的 IM 机器人，把机器人的工作区切到这个目录。')
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
      }, '不跟进') : null,
      h('button', { type: 'button', onClick: () => onClose?.() }, '关闭'),
    ),
  ));
}

export function FollowOverlay({ rpcCall }) {
  const dialog = React.useSyncExternalStore(subscribeFollowDialog, getFollowDialog, getFollowDialog);
  if (!dialog.open || !dialog.sessionId) return null;
  return h('div', { style: { pointerEvents: 'auto' } },
    h(FollowDialog, {
      sessionId: dialog.sessionId,
      rpcCall,
      onClose: closeFollowDialog,
    }));
}

function resolveFollowSessionId(sessionId) {
  if (typeof sessionId === 'string' && sessionId) return sessionId;
  if (typeof document === 'undefined') return null;
  return selectedSessionId(document);
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

  if (!current?.channel || !resolvedId) return null;
  return h('div', { className: 'dim-follow' },
    h('button', {
      type: 'button',
      className: 'dim-followButton',
      title: currentLabel(current),
      'aria-label': currentLabel(current),
      'aria-haspopup': 'dialog',
      onClick: () => openFollowDialog(resolvedId),
    }, h(FollowChannelLogo, { channel: current.channel })));
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
