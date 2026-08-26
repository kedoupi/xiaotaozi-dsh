// @ts-nocheck
import * as React from 'react';

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
import { installFollowStyles, registerSessionFollow } from './session-follow.ts';
import { installImStyles } from './styles.ts';
import { WorkspaceDirectoryPickerContext } from './workspace-editor.ts';
import { mountImEntry } from './sidebar-entry.ts';

export const name = 'im';
export const inject = ['slots', 'connection', 'locale', 'workspaces'];
export const IM_HUB_SLOT = 'shell.overlay';
export const IM_HUB_ID = 'im-hub';

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
  for (const listener of hubListeners) listener();
}

export function closeImHub() {
  hubOpen = false;
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
  return h('span', { className: 'dim-hubMark', 'aria-hidden': 'true' },
    h('svg', {
      width: 18,
      height: 18,
      viewBox: '0 0 16 16',
      fill: 'none',
    },
      h('path', {
        d: 'M3.2 4.2h9.6c.66 0 1.2.54 1.2 1.2v5.1c0 .66-.54 1.2-1.2 1.2H8.2L5.4 13.8V11.7H3.2c-.66 0-1.2-.54-1.2-1.2V5.4c0-.66.54-1.2 1.2-1.2Z',
        stroke: 'currentColor',
        strokeWidth: '1.3',
        strokeLinejoin: 'round',
      }),
      h('path', {
        d: 'M5.1 7.15h5.8M5.1 9.25h3.4',
        stroke: 'currentColor',
        strokeWidth: '1.3',
        strokeLinecap: 'round',
      })));
}

function focusableControls(root) {
  if (!root?.querySelectorAll) return [];
  return [...root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((node) => node.offsetParent !== null || node === document.activeElement);
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
  workspaceDirectoryPicker,
}) {
  const visibleChannels = officeEnabled
    ? CHANNELS
    : CHANNELS.filter((channel) => channel.id !== 'office');
  const [selected, setSelected] = React.useState('weixin');
  const active = visibleChannels.find((channel) => channel.id === selected) ?? visibleChannels[0];
  return h(WorkspaceDirectoryPickerContext.Provider, { value: workspaceDirectoryPicker },
    h('section', { className: 'dim-page', 'aria-label': 'IM机器人设置' },
    h('div', { className: 'dim-layout' },
      h('nav', { className: 'dim-rail', role: 'tablist', 'aria-label': 'IM 渠道' },
        visibleChannels.map((channel) => h('button', {
          key: channel.id,
          type: 'button',
          role: 'tab',
          id: `dim-tab-${channel.id}`,
          className: 'dim-channel',
          'aria-selected': channel.id === active.id,
          'aria-controls': `dim-panel-${channel.id}`,
          onClick: () => setSelected(channel.id),
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
      }, active.id === 'weixin'
        ? h(WeixinSettingsTab, { rpcCall: weixinRpcCall })
        : active.id === 'feishu'
          ? h(FeishuSettingsTab, { rpcCall: feishuRpcCall })
          : active.id === 'dingtalk'
            ? h(DingtalkSettingsTab, { rpcCall: dingtalkRpcCall })
            : active.id === 'wecom'
              ? h(WecomSettingsTab, { rpcCall: wecomRpcCall })
              : active.id === 'qq'
                ? h(QqSettingsTab, { rpcCall: qqRpcCall })
                : active.id === 'slack'
                  ? h(SlackSettingsTab, { rpcCall: slackRpcCall })
                : active.id === 'telegram'
                  ? h(TelegramSettingsTab, { rpcCall: telegramRpcCall })
                  : active.id === 'discord'
                    ? h(DiscordSettingsTab, { rpcCall: discordRpcCall })
                    : active.id === 'whatsapp'
                      ? h(WhatsappSettingsTab, { rpcCall: whatsappRpcCall })
                      : h(OfficeSettingsTab, { rpcCall: officeRpcCall })),
    ),
  ));
}

export function ImHubOverlay(props) {
  const open = React.useSyncExternalStore(subscribeImHub, getImHubOpen, getImHubOpen);
  const panelRef = React.useRef(null);
  const previousFocus = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    previousFocus.current = document.activeElement;
    const node = panelRef.current;
    node?.focus?.();
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeImHub();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const items = focusableControls(panelRef.current);
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
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const previous = previousFocus.current;
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, [open]);
  if (!open) return null;
  return h('div', {
    className: 'dim-hubScrim',
    role: 'presentation',
    onClick: (event) => {
      if (event.target === event.currentTarget) closeImHub();
    },
  },
    h('div', {
      className: 'dim-hubPanel',
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
          h('p', { className: 'dim-hubSubtitle' }, '让 DeepSeek Harness 触手可及')),
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
}

export function apply(ctx) {
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
  const workspaceDirectoryPicker = Object.freeze({
    listDirectory: (path, signal) => ctx.workspaces.listDirectory(path, signal),
    pickDirectory: () => ctx.workspaces.pickDirectory(),
  });

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
    officeEnabled: false,
    workspaceDirectoryPicker,
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
}
