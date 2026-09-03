// @ts-nocheck
import * as React from 'react';
import { createPortal } from 'react-dom';

import {
  DingtalkLogoGlyph,
  DiscordLogoGlyph,
  FeishuLogoGlyph,
  OfficeLogoGlyph,
  QqLogoGlyph,
  SlackLogoGlyph,
  TelegramLogoGlyph,
  WecomLogoGlyph,
  WeixinLogoGlyph,
  WhatsappLogoGlyph,
} from './channel-logos.ts';
import { focusableControls } from './remove-dialog.ts';
import { DINGTALK_RPC_CHANNEL } from './channels/dingtalk/api.ts';
import { DingtalkSettingsTab } from './channels/dingtalk/index.ts';
import { DISCORD_RPC_CHANNEL } from './channels/discord/api.ts';
import { DiscordSettingsTab } from './channels/discord/index.ts';
import { installDiscordStyles } from './channels/discord/styles.ts';
import { FeishuSettingsTab } from './channels/feishu/index.ts';
import { FEISHU_RPC_CHANNEL } from './channels/feishu/api.ts';
import { installFeishuStyles } from './channels/feishu/styles.ts';
import { QQ_RPC_CHANNEL } from './channels/qq/api.ts';
import { QqSettingsTab } from './channels/qq/index.ts';
import { installQqStyles } from './channels/qq/styles.ts';
import { OFFICE_RPC_CHANNEL } from './channels/office/api.ts';
import { OfficeSettingsTab } from './channels/office/index.ts';
import { installOfficeStyles } from './channels/office/styles.ts';
import { SLACK_RPC_CHANNEL } from './channels/slack/api.ts';
import { SlackSettingsTab } from './channels/slack/index.ts';
import { installSlackStyles } from './channels/slack/styles.ts';
import { TELEGRAM_RPC_CHANNEL } from './channels/telegram/api.ts';
import { TelegramSettingsTab } from './channels/telegram/index.ts';
import { installTelegramStyles } from './channels/telegram/styles.ts';
import { WECOM_RPC_CHANNEL } from './channels/wecom/api.ts';
import { WecomSettingsTab } from './channels/wecom/index.ts';
import { installWecomStyles } from './channels/wecom/styles.ts';
import { WeixinSettingsTab } from './channels/weixin/index.ts';
import { WEIXIN_RPC_CHANNEL } from './channels/weixin/api.ts';
import { installWeixinStyles } from './channels/weixin/styles.ts';
import { WHATSAPP_RPC_CHANNEL } from './channels/whatsapp/api.ts';
import { WhatsappSettingsTab } from './channels/whatsapp/index.ts';
import { installWhatsappStyles } from './channels/whatsapp/styles.ts';
import { en, h, IM_LOCALE_NAMESPACE, setImTranslator, zh } from './i18n.ts';
import { IM_PORTRAIT } from './portrait.ts';
import { installFollowStyles, registerSessionFollow } from './session-follow.ts';
import { installInboundFileDumpRestyle } from './inbound-files-display.ts';
import { installImStyles } from './styles.ts';
import { WorkspaceProjectsContext } from './workspace-editor.ts';
import { IM_ENTRY_ATTR, mountImEntry } from './sidebar-entry.ts';
import {
  createLoopbackAwareRpcCalls,
  replacePageLocation,
} from './loopback-recovery.ts';
import manifest from '../../package.json' with { type: 'json' };

export const name = 'im';
export const inject = ['slots', 'connection', 'locale', 'workspaces'];
export const IM_HUB_SLOT = 'shell.overlay';
export const IM_HUB_ID = 'im-hub';
export const IM_PLUGIN_VERSION = manifest.version;

let hubOpen = false;
const hubListeners = new Set();

export function getImHubOpen() {
  return hubOpen;
}

export function subscribeImHub(listener) {
  hubListeners.add(listener);
  return () => hubListeners.delete(listener);
}

export function openImHub() {
  hubOpen = true;
  if (typeof document !== 'undefined') {
    document.querySelector(`[${IM_ENTRY_ATTR}]`)?.setAttribute('aria-expanded', 'true');
  }
  for (const listener of hubListeners) listener();
}

export function closeImHub() {
  hubOpen = false;
  if (typeof document !== 'undefined') {
    document.querySelector(`[${IM_ENTRY_ATTR}]`)?.setAttribute('aria-expanded', 'false');
  }
  for (const listener of hubListeners) listener();
}

function CloseGlyph() {
  return h('svg', {
    width: 16,
    height: 16,
    viewBox: '0 0 16 16',
    fill: 'none',
    'aria-hidden': 'true',
  },
    h('path', {
      d: 'M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6',
      stroke: 'currentColor',
      strokeWidth: '1.4',
      strokeLinecap: 'round',
    }));
}

function HubMark() {
  return h('img', {
    className: 'dim-hubMark',
    src: IM_PORTRAIT,
    alt: '',
    width: 34,
    height: 34,
  });
}


const CHANNELS = Object.freeze([
  { id: 'weixin', label: '微信' },
  { id: 'feishu', label: '飞书' },
  { id: 'dingtalk', label: '钉钉' },
  { id: 'wecom', label: '企业微信' },
  { id: 'qq', label: 'QQ' },
  { id: 'slack', label: 'Slack' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'discord', label: 'Discord' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'office', label: 'AI Office', note: '（实验功能）' },
]);

export function channelIndexForKey(key, currentIndex, length) {
  if (!Number.isInteger(currentIndex) || length <= 0) return currentIndex;
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (currentIndex + 1) % length;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (currentIndex - 1 + length) % length;
  return currentIndex;
}

function WeixinLogo() {
  return h('span', { className: 'dim-logo dim-logoWeixin', 'aria-hidden': 'true' },
    h(WeixinLogoGlyph));
}

function FeishuLogo() {
  return h('span', { className: 'dim-logo dim-logoFeishu', 'aria-hidden': 'true' },
    h(FeishuLogoGlyph));
}

function DingtalkLogo() {
  return h('span', { className: 'dim-logo dim-logoDingtalk', 'aria-hidden': 'true' },
    h(DingtalkLogoGlyph));
}

function QqLogo() {
  return h('span', { className: 'dim-logo dim-logoQq', 'aria-hidden': 'true' }, h(QqLogoGlyph));
}

function WecomLogo() {
  return h('span', { className: 'dim-logo dim-logoWecom', 'aria-hidden': 'true' }, h(WecomLogoGlyph));
}

function TelegramLogo() {
  return h('span', { className: 'dim-logo dim-logoTelegram', 'aria-hidden': 'true' },
    h(TelegramLogoGlyph));
}

function SlackLogo() {
  return h('span', { className: 'dim-logo dim-logoSlack', 'aria-hidden': 'true' },
    h(SlackLogoGlyph));
}

function DiscordLogo() {
  return h('span', { className: 'dim-logo dim-logoDiscord', 'aria-hidden': 'true' },
    h(DiscordLogoGlyph));
}

function WhatsappLogo() {
  return h('span', { className: 'dim-logo dim-logoWhatsapp', 'aria-hidden': 'true' },
    h(WhatsappLogoGlyph));
}

function OfficeLogo() {
  return h('span', { className: 'dim-logo dim-logoOffice', 'aria-hidden': 'true' },
    h(OfficeLogoGlyph));
}

function ChannelLogo({ channel }) {
  if (channel === 'weixin') return h(WeixinLogo);
  if (channel === 'feishu') return h(FeishuLogo);
  if (channel === 'dingtalk') return h(DingtalkLogo);
  if (channel === 'wecom') return h(WecomLogo);
  if (channel === 'qq') return h(QqLogo);
  if (channel === 'slack') return h(SlackLogo);
  if (channel === 'telegram') return h(TelegramLogo);
  if (channel === 'discord') return h(DiscordLogo);
  if (channel === 'whatsapp') return h(WhatsappLogo);
  return h(OfficeLogo);
}

export function LoopbackRecoveryNotice({ recovery, onNavigate = replacePageLocation }) {
  return h('div', {
    className: 'dim-loopbackRecovery',
    role: 'alert',
  },
  h('div', { className: 'dim-loopbackRecoveryCopy' },
    h('strong', null, '请改用 localhost 重新打开'),
    h('p', null, '页面会在当前端口重新打开，机器人配置不会改变。'),
    h('code', null, recovery.origin)),
  h('button', {
    type: 'button',
    className: 'dim-loopbackRecoveryAction',
    onClick: () => onNavigate(recovery.url),
  }, '使用 localhost 重新打开'));
}

export function IMSettingsTab({
  dingtalkRpcCall,
  discordRpcCall,
  feishuRpcCall,
  qqRpcCall,
  slackRpcCall,
  telegramRpcCall,
  wecomRpcCall,
  weixinRpcCall,
  whatsappRpcCall,
  officeRpcCall,
  officeEnabled = false,
  workspaceProjects,
  browserLocation = globalThis.location,
  navigateToRecoveryUrl = replacePageLocation,
}) {
  const visibleChannels = officeEnabled
    ? CHANNELS
    : CHANNELS.filter((channel) => channel.id !== 'office');
  const [selected, setSelected] = React.useState('weixin');
  const [loopbackRecovery, setLoopbackRecovery] = React.useState(null);
  const active = visibleChannels.find((channel) => channel.id === selected) ?? visibleChannels[0];
  const reportLoopbackRecovery = React.useCallback((recovery) => {
    setLoopbackRecovery((current) => current?.url === recovery.url ? current : recovery);
  }, []);
  const rpcCalls = React.useMemo(() => createLoopbackAwareRpcCalls({
    dingtalkRpcCall,
    discordRpcCall,
    feishuRpcCall,
    qqRpcCall,
    slackRpcCall,
    telegramRpcCall,
    wecomRpcCall,
    weixinRpcCall,
    whatsappRpcCall,
    officeRpcCall,
  }, {
    location: browserLocation,
    onRecovery: reportLoopbackRecovery,
  }), [
    browserLocation,
    dingtalkRpcCall,
    discordRpcCall,
    feishuRpcCall,
    officeRpcCall,
    qqRpcCall,
    reportLoopbackRecovery,
    slackRpcCall,
    telegramRpcCall,
    wecomRpcCall,
    weixinRpcCall,
    whatsappRpcCall,
  ]);
  return h(WorkspaceProjectsContext.Provider, { value: workspaceProjects },
    h('section', { className: 'dim-page', 'aria-label': 'IM机器人设置' },
    h('div', { className: 'dim-layout' },
      h('nav', {
        className: 'dim-rail',
        role: 'tablist',
        'aria-label': 'IM 渠道',
        'aria-orientation': 'horizontal',
      },
        visibleChannels.map((channel, channelIndex) => h('button', {
          key: channel.id,
          type: 'button',
          role: 'tab',
          id: `dim-tab-${channel.id}`,
          className: 'dim-channel',
          'aria-selected': channel.id === active.id,
          'aria-controls': `dim-panel-${channel.id}`,
          tabIndex: channel.id === active.id ? 0 : -1,
          onClick: () => setSelected(channel.id),
          onKeyDown: (event) => {
            const nextIndex = channelIndexForKey(event.key, channelIndex, visibleChannels.length);
            if (nextIndex === channelIndex) return;
            event.preventDefault();
            const nextChannel = visibleChannels[nextIndex];
            setSelected(nextChannel.id);
            const ownerDocument = event.currentTarget.ownerDocument;
            requestAnimationFrame(() => ownerDocument.getElementById(`dim-tab-${nextChannel.id}`)?.focus());
          },
        },
        h(ChannelLogo, { channel: channel.id }),
        h('span', { className: 'dim-channelCopy' },
          h('strong', null, channel.label),
          channel.note ? h('small', { className: 'dim-channelNote' }, channel.note) : null,
        )))),
      h('div', { className: 'dim-divider', 'aria-hidden': 'true' }),
      h('main', {
        className: 'dim-panel',
        role: 'tabpanel',
        id: `dim-panel-${active.id}`,
        'aria-labelledby': `dim-tab-${active.id}`,
        tabIndex: 0,
      },
      loopbackRecovery
        ? h(LoopbackRecoveryNotice, {
            recovery: loopbackRecovery,
            onNavigate: navigateToRecoveryUrl,
          })
        : null,
      active.id === 'weixin'
        ? h(WeixinSettingsTab, { rpcCall: rpcCalls.weixinRpcCall })
        : active.id === 'feishu'
          ? h(FeishuSettingsTab, { rpcCall: rpcCalls.feishuRpcCall })
          : active.id === 'dingtalk'
            ? h(DingtalkSettingsTab, { rpcCall: rpcCalls.dingtalkRpcCall })
            : active.id === 'wecom'
              ? h(WecomSettingsTab, { rpcCall: rpcCalls.wecomRpcCall })
              : active.id === 'qq'
                ? h(QqSettingsTab, { rpcCall: rpcCalls.qqRpcCall })
                : active.id === 'slack'
                  ? h(SlackSettingsTab, { rpcCall: rpcCalls.slackRpcCall })
                : active.id === 'telegram'
                  ? h(TelegramSettingsTab, { rpcCall: rpcCalls.telegramRpcCall })
                  : active.id === 'discord'
                    ? h(DiscordSettingsTab, { rpcCall: rpcCalls.discordRpcCall })
                    : active.id === 'whatsapp'
                      ? h(WhatsappSettingsTab, { rpcCall: rpcCalls.whatsappRpcCall })
                      : h(OfficeSettingsTab, { rpcCall: rpcCalls.officeRpcCall })),
    ),
  ));
}

export function ImHubOverlay(props) {
  const open = React.useSyncExternalStore(subscribeImHub, getImHubOpen, getImHubOpen);
  const panelRef = React.useRef(null);
  const previousFocus = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    if (typeof document === 'undefined') return undefined;
    previousFocus.current = document.activeElement;
    const node = panelRef.current;
    node?.focus?.();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeImHub();
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
      const nestedDialog = event.target?.closest?.('[role="dialog"][aria-modal="true"]');
      if (nestedDialog && nestedDialog !== panelRef.current) return;
      if (panelRef.current && !panelRef.current.contains(event.target)) panelRef.current.focus();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', keepFocusInside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', keepFocusInside);
      document.body.style.overflow = previousOverflow;
      const previous = previousFocus.current;
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, [open]);
  if (!open) return null;
  const overlay = h('div', {
    className: 'dim-hubScrim',
    role: 'presentation',
    onMouseDown: (event) => {
      if (event.target === event.currentTarget) closeImHub();
    },
  },
    h('div', {
      className: 'dim-hubPanel',
      id: IM_HUB_ID,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'dim-hub-title',
      tabIndex: -1,
      ref: panelRef,
    },
      h('header', { className: 'dim-hubHead' },
        h(HubMark),
        h('div', { className: 'dim-hubTitles' },
          h('h1', { id: 'dim-hub-title', className: 'dim-hubTitle' }, 'IM机器人'),
          h('span', { className: 'dim-brandVersion' }, `v${IM_PLUGIN_VERSION}`)),
        h('a', {
          className: 'dim-hubGithub',
          href: 'https://github.com/kedoupi/xiaotaozi-dsh',
          target: '_blank',
          rel: 'noopener noreferrer',
          'aria-label': 'dsh-im GitHub',
          title: '帮助与反馈 · 前往 GitHub',
        }, 'GitHub', h('span', { 'aria-hidden': 'true' }, ' ↗')),
        h('button', {
          type: 'button',
          className: 'dim-hubClose',
          'aria-label': '关闭',
          onClick: closeImHub,
        }, h(CloseGlyph))),
      h(IMSettingsTab, props)));
  return typeof document === 'undefined' ? overlay : createPortal(overlay, document.body);
}

function officeChannelEnabled(config = {}) {
  if (config.officeEnabled === true) return true;
  return config.office != null && config.office.enabled === true;
}

export function apply(ctx, config = {}) {
  ctx.effect(
    () => ctx.locale.register(IM_LOCALE_NAMESPACE, { zh, en }),
    'im-settings: bilingual dictionaries',
  );
  const t = ctx.locale.bind(IM_LOCALE_NAMESPACE);
  setImTranslator(t);

  ctx.effect(() => {
    const disposers = [
      installFeishuStyles(),
      installWeixinStyles(),
      installWecomStyles(),
      installQqStyles(),
      installSlackStyles(),
      installTelegramStyles(),
      installDiscordStyles(),
      installWhatsappStyles(),
      installOfficeStyles(),
      installImStyles(),
      installFollowStyles(),
    ];
    return () => {
      for (const dispose of disposers.reverse()) dispose();
    };
  }, 'im-settings: install combined channel styles');

  const feishuRpcCall = (endpoint, payload, signal) =>
    ctx.connection.rpc.call(FEISHU_RPC_CHANNEL, endpoint, payload, signal);
  const weixinRpcCall = (endpoint, payload, signal) =>
    ctx.connection.rpc.call(WEIXIN_RPC_CHANNEL, endpoint, payload, signal);
  const dingtalkRpcCall = (endpoint, payload, signal) =>
    ctx.connection.rpc.call(DINGTALK_RPC_CHANNEL, endpoint, payload, signal);
  const qqRpcCall = (endpoint, payload, signal) =>
    ctx.connection.rpc.call(QQ_RPC_CHANNEL, endpoint, payload, signal);
  const wecomRpcCall = (endpoint, payload, signal) =>
    ctx.connection.rpc.call(WECOM_RPC_CHANNEL, endpoint, payload, signal);
  const telegramRpcCall = (endpoint, payload, signal) =>
    ctx.connection.rpc.call(TELEGRAM_RPC_CHANNEL, endpoint, payload, signal);
  const discordRpcCall = (endpoint, payload, signal) =>
    ctx.connection.rpc.call(DISCORD_RPC_CHANNEL, endpoint, payload, signal);
  const whatsappRpcCall = (endpoint, payload, signal) =>
    ctx.connection.rpc.call(WHATSAPP_RPC_CHANNEL, endpoint, payload, signal);
  const slackRpcCall = (endpoint, payload, signal) =>
    ctx.connection.rpc.call(SLACK_RPC_CHANNEL, endpoint, payload, signal);
  const officeRpcCall = (endpoint, payload, signal) =>
    ctx.connection.rpc.call(OFFICE_RPC_CHANNEL, endpoint, payload, signal);

  registerSessionFollow(ctx);
  const hubProps = () => ({
    dingtalkRpcCall,
    discordRpcCall,
    feishuRpcCall,
    qqRpcCall,
    slackRpcCall,
    telegramRpcCall,
    wecomRpcCall,
    weixinRpcCall,
    whatsappRpcCall,
    officeRpcCall,
    officeEnabled: officeChannelEnabled(config),
    workspaceProjects: ctx.workspaces,
  });
  ctx.slots.inject(IM_HUB_SLOT, () => ctx.slots.register({
    name: IM_HUB_SLOT,
    id: IM_HUB_ID,
    order: 55,
    locale: IM_LOCALE_NAMESPACE,
    inject: hubProps,
  }, ImHubOverlay));
  ctx.effect(
    () => {
      if (typeof document === 'undefined') return () => {};
      return mountImEntry(document, () => t('IM机器人'), openImHub);
    },
    'im-hub: sidebar entry',
  );
  ctx.effect(
    () => {
      if (typeof document === 'undefined') return () => {};
      return installInboundFileDumpRestyle(document, { t });
    },
    'im-chat: restyle inbound file dumps',
  );
}
