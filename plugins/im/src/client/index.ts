// @ts-nocheck
import * as React from 'react';
import type {} from './plugin-center-contract.ts';

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
import { installInboundFileDumpRestyle } from './inbound-files-display.ts';
import { installImStyles } from './styles.ts';
import { WorkspaceProjectsContext } from './workspace-editor.ts';
import {
  createLoopbackAwareRpcCalls,
  replacePageLocation,
} from './loopback-recovery.ts';

export const name = 'im';
export const inject = ['slots', 'connection', 'locale', 'workspaces'];

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

export const FEATURED_CHANNEL_IDS = Object.freeze(['weixin', 'feishu', 'wecom']);

export function partitionImChannels(channels) {
  const featured = FEATURED_CHANNEL_IDS
    .map((id) => channels.find((channel) => channel.id === id))
    .filter(Boolean);
  const other = channels.filter((channel) => !FEATURED_CHANNEL_IDS.includes(channel.id));
  return { featured, other };
}

export function railChannelsForState(channels, otherOpen, selectedId) {
  const { featured, other } = partitionImChannels(channels);
  if (otherOpen || other.some((channel) => channel.id === selectedId)) {
    return featured.concat(other);
  }
  return featured;
}

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

function ChannelTab({ channel, channelIndex, activeId, railChannels, setSelected }) {
  return h('button', {
    type: 'button',
    role: 'tab',
    id: `dim-tab-${channel.id}`,
    className: 'dim-channel',
    'aria-selected': channel.id === activeId,
    'aria-controls': `dim-panel-${channel.id}`,
    tabIndex: channel.id === activeId ? 0 : -1,
    onClick: () => setSelected(channel.id),
    onKeyDown: (event) => {
      const nextIndex = channelIndexForKey(event.key, channelIndex, railChannels.length);
      if (nextIndex === channelIndex) return;
      event.preventDefault();
      const nextChannel = railChannels[nextIndex];
      if (!nextChannel) return;
      setSelected(nextChannel.id);
      const ownerDocument = event.currentTarget.ownerDocument;
      requestAnimationFrame(() => ownerDocument.getElementById(`dim-tab-${nextChannel.id}`)?.focus());
    },
  },
  h(ChannelLogo, { channel: channel.id }),
  h('span', { className: 'dim-channelCopy' },
    h('strong', null, channel.label),
    channel.note ? h('small', { className: 'dim-channelNote' }, channel.note) : null,
  ));
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
  const [otherOpen, setOtherOpen] = React.useState(false);
  const [loopbackRecovery, setLoopbackRecovery] = React.useState(null);
  const { featured, other } = partitionImChannels(visibleChannels);
  const showOther = otherOpen || other.some((channel) => channel.id === selected);
  const railChannels = showOther ? featured.concat(other) : featured;
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
        featured.map((channel, channelIndex) => h(ChannelTab, {
          key: channel.id,
          channel,
          channelIndex,
          activeId: active.id,
          railChannels,
          setSelected,
        })),
        other.length > 0
          ? h('details', {
              className: 'dim-otherChannels',
              open: showOther,
              onToggle: (event) => {
                const open = event.currentTarget.open;
                setOtherOpen(open);
                if (!open && other.some((channel) => channel.id === selected)) {
                  setSelected(featured[0]?.id ?? 'weixin');
                }
              },
            },
            h('summary', null, '其他渠道'),
            showOther
              ? h('div', { className: 'dim-otherChannelList' },
                  other.map((channel, offset) => h(ChannelTab, {
                    key: channel.id,
                    channel,
                    channelIndex: featured.length + offset,
                    activeId: active.id,
                    railChannels,
                    setSelected,
                  })))
              : null)
          : null),
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
  const detailProps = () => ({
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
  ctx.slots.inject('xiaotaozi.plugin-center.detail', () => ctx.slots.register({
    name: 'xiaotaozi.plugin-center.detail',
    key: 'im',
    locale: IM_LOCALE_NAMESPACE,
    inject: detailProps,
  }, IMSettingsTab));
  ctx.effect(
    () => {
      if (typeof document === 'undefined') return () => {};
      return installInboundFileDumpRestyle(document, { t });
    },
    'im-chat: restyle inbound file dumps',
  );
}
