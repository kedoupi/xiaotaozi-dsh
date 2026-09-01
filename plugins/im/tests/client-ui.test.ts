// @ts-nocheck
import { onTestFinished, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TestRenderer from 'react-test-renderer';

import {
  apply as applyClient,
  closeImHub,
  channelIndexForKey,
  IM_HUB_ID,
  IM_HUB_SLOT,
  IMSettingsTab,
  inject as clientInject,
  openImHub,
} from '../src/client/index.ts';
import { CredentialBindingPanel } from '../src/client/credential-binding.ts';
import { RemoveBotDialog } from '../src/client/remove-dialog.ts';
import { AgentPresetEditor } from '../src/client/agent-preset.ts';
import { FollowDialog } from '../src/client/session-follow.ts';
import { DINGTALK_ENDPOINTS } from '../src/client/channels/dingtalk/api.ts';
import {
  AccountCard as DingtalkAccountCard,
  DingtalkSettingsTab,
} from '../src/client/channels/dingtalk/index.ts';
import {
  BotCard as FeishuBotCard,
  FeishuSettingsTab,
} from '../src/client/channels/feishu/index.ts';
import {
  AccountCard as WeixinAccountCard,
  WeixinSettingsTab,
} from '../src/client/channels/weixin/index.ts';
import {
  AccountCard as WecomAccountCard,
  WecomSettingsTab,
} from '../src/client/channels/wecom/index.ts';
import {
  AccountCard as QqAccountCard,
  QqSettingsTab,
} from '../src/client/channels/qq/index.ts';
import {
  SlackAccountCard,
  SlackSettingsTab,
} from '../src/client/channels/slack/index.ts';
import {
  TelegramAccountCard,
  TelegramSettingsTab,
} from '../src/client/channels/telegram/index.ts';
import {
  DiscordAccountCard,
  DiscordSettingsTab,
} from '../src/client/channels/discord/index.ts';
import {
  EmptyView as WhatsappEmptyView,
  WhatsappAccountCard,
  WhatsappSettingsTab,
} from '../src/client/channels/whatsapp/index.ts';
import {
  en,
  IM_LOCALE_NAMESPACE,
  localizeText,
  setImTranslator,
} from '../src/client/i18n.ts';

const STYLES_URL = new URL('../src/client/styles.ts', import.meta.url);
const FEISHU_STYLES_URL = new URL(
  '../src/client/channels/feishu/styles.ts',
  import.meta.url,
);
const WEIXIN_STYLES_URL = new URL(
  '../src/client/channels/weixin/styles.ts',
  import.meta.url,
);
const DINGTALK_STYLES_URL = new URL(
  '../src/client/channels/dingtalk/styles.ts',
  import.meta.url,
);
const WECOM_STYLES_URL = new URL(
  '../src/client/channels/wecom/styles.ts',
  import.meta.url,
);
const FEISHU_SOURCE_URL = new URL(
  '../src/client/channels/feishu/index.ts',
  import.meta.url,
);
const WEIXIN_SOURCE_URL = new URL(
  '../src/client/channels/weixin/index.ts',
  import.meta.url,
);
const CLIENT_BUNDLE_URL = new URL('../lib/client.js', import.meta.url);
const CLIENT_SOURCE_DIRECTORY_URL = new URL('../src/client/', import.meta.url);
const SESSION_FOLLOW_SOURCE_URL = new URL('../src/client/session-follow.ts', import.meta.url);
const DINGTALK_CLIENT_SOURCE_URL = new URL(
  '../src/client/channels/dingtalk/index.ts',
  import.meta.url,
);
const WECOM_SOURCE_URL = new URL(
  '../src/client/channels/wecom/index.ts',
  import.meta.url,
);
const QQ_SOURCE_URL = new URL(
  '../src/client/channels/qq/index.ts',
  import.meta.url,
);
const WHATSAPP_STYLES_URL = new URL(
  '../src/client/channels/whatsapp/styles.ts',
  import.meta.url,
);
const WHATSAPP_SOURCE_URL = new URL(
  '../src/client/channels/whatsapp/index.ts',
  import.meta.url,
);
const SLACK_SOURCE_URL = new URL(
  '../src/client/channels/slack/index.ts',
  import.meta.url,
);
const TOKEN_CHANNEL_SOURCE_URL = new URL(
  '../src/client/channels/shared/token-channel.ts',
  import.meta.url,
);

test('IM channel tabs wrap across arrows and support Home and End', () => {
  assert.equal(channelIndexForKey('ArrowRight', 8, 9), 0);
  assert.equal(channelIndexForKey('ArrowLeft', 0, 9), 8);
  assert.equal(channelIndexForKey('ArrowDown', 2, 9), 3);
  assert.equal(channelIndexForKey('ArrowUp', 2, 9), 1);
  assert.equal(channelIndexForKey('Home', 5, 9), 0);
  assert.equal(channelIndexForKey('End', 2, 9), 8);
  assert.equal(channelIndexForKey('Enter', 2, 9), 2);
});

test('IM settings renders nine IM channels and hides AI Office by default', async () => {
  const styles = await readFile(STYLES_URL, 'utf8');
  const markup = renderToStaticMarkup(React.createElement(IMSettingsTab, {
    feishuRpcCall: async () => ({ ok: true, value: {} }),
    weixinRpcCall: async () => ({ ok: true, value: {} }),
    dingtalkRpcCall: async () => ({ ok: true, value: {} }),
    wecomRpcCall: async () => ({ ok: true, value: {} }),
    qqRpcCall: async () => ({ ok: true, value: {} }),
    slackRpcCall: async () => ({ ok: true, value: {} }),
    telegramRpcCall: async () => ({ ok: true, value: {} }),
    discordRpcCall: async () => ({ ok: true, value: {} }),
    whatsappRpcCall: async () => ({ ok: true, value: {} }),
    officeRpcCall: async () => ({ ok: true, value: {} }),
  }));

  assert.match(markup, /IM机器人设置/);
  assert.doesNotMatch(markup, /dim-brandName|DSH-IM|dim-brandLogo|<img/);
  assert.doesNotMatch(markup, /让 DeepSeek Harness 触手可及|dim-title|dim-hubSubtitle/);
  assert.match(markup, /role="tablist"/);
  assert.match(markup, /aria-orientation="horizontal"/);
  assert.match(markup, /role="tab"/);
  assert.match(styles, /\.dim-hubScrim \{[^}]*position: fixed;[^}]*z-index: 10040;[^}]*pointer-events: auto;/);
  assert.match(styles, /\.dim-hubPanel \{[^}]*display: flex;[^}]*flex-direction: column;[^}]*overflow: hidden;/);
  assert.match(styles, /\.dim-hubHead \{[^}]*display: flex;[^}]*padding: 14px 20px;/);
  assert.match(styles, /\.dim-rail \{[^}]*display: flex;[^}]*flex-wrap: wrap;/);
  assert.match(styles, /\.dim-channel \{[^}]*min-height: 36px;/);
  assert.match(styles, /\[data-dsh-sidebar-tools\] \{[^}]*display: flex;[^}]*flex-wrap: wrap;[^}]*gap: 8px;/);
  assert.match(styles, /\[data-dsh-sidebar-tools\] > button \{[^}]*flex: 1 1 calc\(50% - 4px\);/);
  assert.doesNotMatch(styles, /\.dsh-sidebar-tools\s*\{/);
  assert.doesNotMatch(markup, /\d+ 个渠道|dim-channelCount/);
  assert.match(markup, />微信</);
  assert.match(markup, />飞书</);
  assert.match(markup, />钉钉</);
  assert.match(markup, />企业微信</);
  assert.match(markup, />QQ</);
  assert.match(markup, />Slack</);
  assert.match(markup, />Telegram</);
  assert.match(markup, />Discord</);
  assert.match(markup, />WhatsApp</);
  assert.doesNotMatch(markup, />AI Office</);
  const withOffice = renderToStaticMarkup(React.createElement(IMSettingsTab, {
    feishuRpcCall: async () => ({ ok: true, value: {} }),
    weixinRpcCall: async () => ({ ok: true, value: {} }),
    dingtalkRpcCall: async () => ({ ok: true, value: {} }),
    wecomRpcCall: async () => ({ ok: true, value: {} }),
    qqRpcCall: async () => ({ ok: true, value: {} }),
    slackRpcCall: async () => ({ ok: true, value: {} }),
    telegramRpcCall: async () => ({ ok: true, value: {} }),
    discordRpcCall: async () => ({ ok: true, value: {} }),
    whatsappRpcCall: async () => ({ ok: true, value: {} }),
    officeRpcCall: async () => ({ ok: true, value: {} }),
    officeEnabled: true,
  }));
  assert.match(withOffice, />AI Office<\/strong><small class="dim-channelNote">（实验功能）<\/small>/);
  assert.match(markup, /dim-logoWeixin/);
  assert.match(markup, /dim-logoFeishu/);
  assert.match(markup, /dim-logoDingtalk/);
  assert.match(markup, /dim-logoWecom/);
  assert.match(markup, /dim-logoQq/);
  assert.match(markup, /dim-logoSlack/);
  assert.match(markup, /dim-logoTelegram/);
  assert.match(markup, /dim-logoDiscord/);
  assert.match(markup, /dim-logoWhatsapp/);
  assert.doesNotMatch(markup, /dim-logoOffice/);
  // 规范 §3.2：glyph 统一为容器 60%，不再按渠道单独放大
  assert.match(styles, /\.dim-logo svg \{ display: block; width: 13px; height: 13px; \}/);
  assert.match(styles, /\.dim-layout \{[^}]*align-items: stretch;/);
  assert.doesNotMatch(styles, /\.dim-rail \{[^}]*max-height:/);
  assert.doesNotMatch(styles, /\.dim-rail \{[^}]*overflow-y:\s*auto;/);
  assert.doesNotMatch(styles, /\.dim-divider \{[^}]*min-height:\s*520px;/);
  assert.equal((markup.match(/role="tab"/g) ?? []).length, 9);
  assert.equal((markup.match(/aria-selected="true"/g) ?? []).length, 1);
  assert.equal((markup.match(/tabindex="-1"/g) ?? []).length, 8);
  assert.match(markup, /role="tab"[^>]*aria-selected="true"[^>]*tabindex="0"/);
  assert.doesNotMatch(markup, /role="switch"|type="checkbox"/);
  assert.doesNotMatch(markup, /dim-chevron|扫码绑定<\/small>|扫码接入<\/small>/);
  assert.doesNotMatch(markup, />INSTANT MESSAGING<|>Channel<|>微信设置</);
});

test('channel and bot surfaces pin the approved Xiaotaozi action roles', async () => {
  const paths = (await readdir(CLIENT_SOURCE_DIRECTORY_URL, { recursive: true }))
    .filter((path) => path.endsWith('.ts'));
  const sources = await Promise.all(paths.map((path) =>
    readFile(new URL(path, CLIENT_SOURCE_DIRECTORY_URL), 'utf8')));
  const combined = sources.join('\n');

  // Legacy red-brown brand literals are banned everywhere in the IM client;
  // official channel logos and danger fills keep their own colors.
  assert.doesNotMatch(combined, /#a84c2c|#8f3f27|#b5522a|#5a3228|#f8e6d9|#d06840/i);

  const styles = await readFile(STYLES_URL, 'utf8');
  assert.match(styles, /--dim-action: var\(--dsw-alias-button-info-fill, #B94305\)/);
  assert.match(styles, /--dim-action-hover: var\(--dsw-alias-button-info-hover, #9F3703\)/);
  assert.match(styles, /--dim-action-pressed: var\(--dsw-static-deepseek-800, #7C2C00\)/);
  assert.match(styles, /--dim-brand-ink: var\(--dsw-alias-state-business-primary, #B94305\)/);
  assert.match(styles, /--dim-focus: var\(--dsw-alias-state-business-primary, #B94305\)/);

  const followSource = await readFile(SESSION_FOLLOW_SOURCE_URL, 'utf8');
  assert.match(followSource, /--dim-follow-brand-ink: var\(--dsw-alias-state-business-primary, #B94305\)/);

  const channelStylePaths = paths.filter((path) =>
    path.startsWith('channels/') && path.endsWith('/styles.ts'));
  assert.ok(channelStylePaths.length >= 10);
  for (const path of channelStylePaths) {
    const text = sources[paths.indexOf(path)];
    assert.match(text, /var\(--dsw-alias-button-info-fill, #B94305\)/, `${path} action fill fallback`);
    assert.match(text, /var\(--dsw-alias-button-info-hover, #9F3703\)/, `${path} action hover fallback`);
  }

  // Leaf green stays reserved for success; it is never a brand or action color.
  assert.doesNotMatch(combined, /--dim-(?:action|brand|focus)[^;]*#78a317/i);

  const whatsappStyles = await readFile(WHATSAPP_STYLES_URL, 'utf8');
  assert.match(whatsappStyles, /var\(--dsw-alias-state-business-tertiary, #FFF0E6\)/);
});

test('each channel keeps one connection action area with a single primary action', async () => {
  const rpcCall = async () => ({ ok: true, value: {} });
  const qrChannels = [
    ['weixin', WeixinSettingsTab, WEIXIN_SOURCE_URL],
    ['feishu', FeishuSettingsTab, FEISHU_SOURCE_URL],
    ['dingtalk', DingtalkSettingsTab, DINGTALK_CLIENT_SOURCE_URL],
    ['wecom', WecomSettingsTab, WECOM_SOURCE_URL],
    ['qq', QqSettingsTab, QQ_SOURCE_URL],
    ['whatsapp', WhatsappSettingsTab, WHATSAPP_SOURCE_URL],
  ];
  for (const [channel, Component, sourceUrl] of qrChannels) {
    const markup = renderToStaticMarkup(React.createElement(Component, { rpcCall }));
    assert.equal(
      (markup.match(/data-kind="primary"/g) ?? []).length,
      1,
      `${channel} heading action area owns exactly one primary connect action`,
    );
    assert.match(markup, /dim-scanButton/);

    const source = await readFile(sourceUrl, 'utf8');
    const start = source.indexOf('function EmptyView');
    assert.ok(start >= 0, `${channel} keeps an empty view`);
    const rest = source.slice(start);
    const end = rest.slice(1).search(/\n(?:export )?function /);
    const emptyView = end === -1 ? rest : rest.slice(0, end + 1);
    // The empty view repeats purpose and state copy, not the heading's primary.
    assert.match(emptyView, /dim-stateLabel/);
    assert.match(emptyView, /h\(('|")h3\1/);
    assert.match(emptyView, /dim-viewActions/);
    assert.doesNotMatch(
      emptyView,
      /kind: 'primary'|kind: "primary"/,
      `${channel} empty view must not duplicate the heading's primary action`,
    );
  }

  const whatsappEmpty = renderToStaticMarkup(React.createElement(WhatsappEmptyView, {}));
  assert.match(whatsappEmpty, /dim-stateLabel/);
  assert.match(whatsappEmpty, /生成二维码/);
  assert.doesNotMatch(whatsappEmpty, /data-kind="primary"/);

  // Token channels: the heading credential action owns connection; the empty
  // view keeps purpose/state copy without a second connect button.
  const tokenSource = await readFile(TOKEN_CHANNEL_SOURCE_URL, 'utf8');
  const emptyStart = tokenSource.indexOf('model.bots.length === 0');
  assert.ok(emptyStart >= 0);
  const emptyBlock = tokenSource.slice(emptyStart, tokenSource.indexOf('botList', emptyStart));
  assert.match(emptyBlock, /dim-stateLabel/);
  assert.match(emptyBlock, /emptyTitle/);
  assert.doesNotMatch(emptyBlock, /dim-viewActions|kind: 'primary'/);
  assert.doesNotMatch(tokenSource, /emptyActionLabel/);
  const slackSource = await readFile(SLACK_SOURCE_URL, 'utf8');
  assert.doesNotMatch(slackSource, /emptyActionLabel/);

  for (const [channel, Component] of [
    ['slack', SlackSettingsTab],
    ['telegram', TelegramSettingsTab],
    ['discord', DiscordSettingsTab],
  ]) {
    const markup = renderToStaticMarkup(React.createElement(Component, { rpcCall }));
    assert.match(markup, /dim-credentialButton/, `${channel} heading owns the credential connect action`);
    assert.doesNotMatch(markup, /data-kind="primary"/);
  }
});

test('IM hub keeps the channel, action, and entity hierarchy', async () => {
  const rpcCall = async () => ({ ok: true, value: {} });
  const markup = renderToStaticMarkup(React.createElement(IMSettingsTab, {
    feishuRpcCall: rpcCall,
    weixinRpcCall: rpcCall,
    dingtalkRpcCall: rpcCall,
    wecomRpcCall: rpcCall,
    qqRpcCall: rpcCall,
    slackRpcCall: rpcCall,
    telegramRpcCall: rpcCall,
    discordRpcCall: rpcCall,
    whatsappRpcCall: rpcCall,
    officeRpcCall: rpcCall,
  }));

  // Level 1: channel tablist with exactly one selected tab owning focus.
  assert.match(markup, /role="tablist"/);
  assert.equal((markup.match(/role="tab"/g) ?? []).length, 9);
  assert.equal((markup.match(/aria-selected="true"/g) ?? []).length, 1);
  assert.match(markup, /role="tab"[^>]*aria-selected="true"[^>]*tabindex="0"/);
  assert.match(markup, /role="tabpanel"[^>]*aria-labelledby="dim-tab-weixin"/);

  // Level 2 before level 3: the connection action area precedes the entity list,
  // and purpose/state copy heads the list before any repeated card.
  const channelSources = await Promise.all([
    WEIXIN_SOURCE_URL,
    FEISHU_SOURCE_URL,
    DINGTALK_CLIENT_SOURCE_URL,
    WECOM_SOURCE_URL,
    QQ_SOURCE_URL,
    WHATSAPP_SOURCE_URL,
    TOKEN_CHANNEL_SOURCE_URL,
  ].map((url) => readFile(url, 'utf8')));
  for (const source of channelSources) {
    const sectionStart = source.indexOf('dim-listSection');
    assert.ok(sectionStart >= 0);
    const section = source.slice(sectionStart, sectionStart + 800);
    const headingIndex = section.indexOf('ChannelListHeading');
    const listIndex = section.indexOf('dim-botList');
    assert.ok(headingIndex >= 0 && listIndex >= 0 && headingIndex < listIndex);
  }

  // Level 3: bot cards lead with identity and health before workspace/actions.
  const card = renderToStaticMarkup(React.createElement(FeishuBotCard, {
    connection: {
      botId: 'bot-hierarchy',
      state: 'connected',
      connected: true,
      bot: { name: '层级机器人', appIdMasked: 'cli_aa••••00', domain: 'feishu' },
      health: { summary: '长连接运行正常', lastCheckedAt: '2026-08-15T07:30:49.000Z' },
    },
    onReconnect() {},
    onRequestRemove() {},
    onConfirmRemove() {},
    onCancelRemove() {},
  }));
  const topIndex = card.indexOf('dim-botCardTop');
  assert.ok(topIndex >= 0);
  assert.ok(card.indexOf('dim-botIdentity') > topIndex);
  assert.ok(card.indexOf('dim-botHealth') > card.indexOf('dim-botIdentity'));
  assert.ok(card.indexOf('dim-cardFooter') > card.indexOf('dim-botHealth'));
});

test('all channel styles use the current Harness theme tokens', async () => {
  const styles = (await Promise.all([
    readFile(STYLES_URL, 'utf8'),
    readFile(FEISHU_STYLES_URL, 'utf8'),
    readFile(WEIXIN_STYLES_URL, 'utf8'),
    readFile(DINGTALK_STYLES_URL, 'utf8'),
    readFile(WECOM_STYLES_URL, 'utf8'),
  ])).join('\n');

  assert.doesNotMatch(
    styles,
    /--dsw-alias-(?:bg-body|line-border|line-divider|fill-secondary|fill-tertiary|state-warning-primary)/,
  );
  assert.match(styles, /--dsw-alias-bg-layer-1/);
  assert.match(styles, /--dsw-alias-bg-module-platform/);
  assert.match(styles, /--dsw-alias-interactive-bg-hover/);
  assert.match(styles, /--dsw-alias-border-l1/);
  assert.match(styles, /--dsw-alias-border-l2/);
  assert.match(styles, /--dim-action: var\(--dsw-alias-button-info-fill, #B94305\)/);
  assert.match(styles, /--dim-action-hover: var\(--dsw-alias-button-info-hover, #9F3703\)/);
  assert.match(styles, /--dim-action-pressed: var\(--dsw-static-deepseek-800, #7C2C00\)/);
  assert.match(styles, /--dim-focus: var\(--dsw-alias-state-business-primary, #B94305\)/);
  assert.match(
    styles,
    /\.dim-channel\[aria-selected="true"\][^}]*var\(--dsw-alias-state-business-tertiary/,
  );
  assert.match(
    styles,
    /\.dim-panel \.dim-qrExpired[^}]*--dsw-static-neutral-bluish-1000/,
  );
  assert.match(styles, /--dim-danger-fill: color-mix\(in srgb, var\(--dsw-alias-state-error-primary, #ec1313\) 72%, black\)/);
  assert.doesNotMatch(styles, /color: #fff; background: var\(--dsw-alias-state-error-primary/);
});

test('small metadata and status copy use contrast-safe semantic ink', async () => {
  const paths = (await readdir(CLIENT_SOURCE_DIRECTORY_URL, { recursive: true }))
    .filter((path) => path.endsWith('styles.ts') || path === 'session-follow.ts');
  const sources = await Promise.all(paths.map((path) =>
    readFile(new URL(path, CLIENT_SOURCE_DIRECTORY_URL), 'utf8')));
  const css = sources.join('\n');
  const readableTertiaryRules = [];
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = match[2];
    if (/color:\s*var\(--dsw-alias-label-tertiary/.test(body)
      && /font(?:-size)?\s*:[^;]*(?:10|11|12|13)px/.test(body)) {
      readableTertiaryRules.push(match[1].trim());
    }
  }

  assert.deepEqual(readableTertiaryRules, []);
  assert.doesNotMatch(css, /(?:^|[;{])\s*color:\s*var\(--dsw-alias-state-(?:success|warn|warning|error)-primary/m);
  assert.match(css, /--dim-error-ink: color-mix\(in srgb, var\(--dsw-alias-label-primary/);
  assert.match(css, /--bxf-success-ink: color-mix\(in srgb, var\(--dsw-alias-label-primary/);
  assert.match(css, /--ddt-error-ink: color-mix\(in srgb, var\(--dsw-alias-label-primary/);
  assert.match(css, /--dtg-warning-ink: color-mix\(in srgb, var\(--dsw-alias-label-primary/);
  assert.match(css, /::placeholder[^}]*label-secondary/);
});

test('session follow dialog follows modal, status, motion, and touch accessibility rules', async () => {
  const source = await readFile(SESSION_FOLLOW_SOURCE_URL, 'utf8');
  const markup = renderToStaticMarkup(React.createElement(FollowDialog, {
    sessionId: 'session-ui',
    rpcCall: async () => ({ ok: true, value: { channels: [], current: null } }),
    onClose() {},
  }));

  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-modal="true"/);
  assert.match(markup, /aria-labelledby="[^"]+"/);
  assert.match(markup, /aria-describedby="[^"]+"/);
  assert.match(markup, /tabindex="-1"/);
  assert.match(markup, /role="status"[^>]*aria-live="polite"/);
  assert.match(source, /focusableFollowControls/);
  assert.match(source, /doc\.body\.style\.overflow = 'hidden'/);
  assert.match(source, /previousFocusRef\.current\?\.focus\?\.\(\)/);
  assert.match(source, /--dim-follow-brand-ink: var\(--dsw-alias-state-business-primary, #B94305\)/);
  assert.match(source, /--dim-follow-focus: var\(--dsw-alias-state-business-primary, #B94305\)/);
  assert.match(source, /@media \(max-width: 768px\), \(pointer: coarse\)/);
  assert.match(source, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(source, /filter: brightness/);
  assert.match(source, /\[data-im-follow-badge\] \{[^}]*width: 16px;[^}]*height: 16px;/);
  assert.match(source, /\[data-im-follow-badge\]::after \{[^}]*inset: -8px;/);
  assert.match(source, /\[class\*="slot"\]:has\(> \[data-im-follow-badge\]\)/);
  assert.match(source, /\[class\*="matrix"\]/);
  assert.match(source, /\[data-im-follow-badge\]::after \{ inset: -14px; \}/);
  assert.doesNotMatch(source, /pointer: coarse\) \{[^]*\.dim-followBadge[^]*min-height: 44px/);
});

test('shared QR cards stay square and stack within the narrow combined-channel panel', async () => {
  const styles = await readFile(STYLES_URL, 'utf8');
  assert.match(styles, /\.dim-panel \{ min-width: 0; min-height: 0; flex: 1; overflow: auto; padding: 16px 20px 24px; container-type: inline-size; \}/);
  assert.match(styles, /\.dim-panel \.dim-qrFrame \{[^}]*width: min\(270px, 100%\);[^}]*height: auto;[^}]*aspect-ratio: 1;/);
  assert.match(
    styles,
    /@container \(max-width: 680px\)[\s\S]*\.dim-panel \.ddt-qrLayout \{ grid-template-columns: minmax\(0, 1fr\); justify-items: center;/,
  );
  assert.match(styles, /\.dim-panel \.ddt-qrFrame, \.dim-panel \.ddt-countdown \{ width: min\(270px, 100%\); \}/);
  assert.match(styles, /\.dim-panel \.ddt-qrColumn \{ width: 100%; min-width: 0; \}/);
  assert.match(styles, /\.dim-panel \.ddt-qrCopy \{ width: 100%; min-width: 0; overflow-wrap: anywhere; \}/);
});

test('Feishu bot cards place the application identifier under the bot name', async () => {
  const markup = renderToStaticMarkup(React.createElement(FeishuBotCard, {
    connection: {
      botId: 'bot-feishu-card',
      state: 'connected',
      connected: true,
      bot: {
        name: '今天是牢梁',
        appIdMasked: 'cli_aaf4••••1234',
        domain: 'feishu',
        avatarUrl: 'https://example.com/custom-bot-avatar.png',
      },
      health: {
        summary: '长连接运行正常',
        lastCheckedAt: '2026-08-15T07:30:49.000Z',
      },
    },
    onReconnect() {},
    onRequestRemove() {},
    onConfirmRemove() {},
    onCancelRemove() {},
  }));

  assert.match(markup, /class="dim-botNameInput"[^>]*value="今天是牢梁"/);
  assert.match(markup, /<p[^>]*>cli_aaf4••••1234<\/p>/);
  assert.match(markup, /data-im-channel-logo="feishu"/);
  assert.match(markup, /class="bxf-card bxf-botCard dim-botCard"/);
  assert.match(markup, /class="bxf-healthPill dim-botHealth"/);
  assert.match(markup, /<button[^>]*aria-label="检查连接今天是牢梁"[^>]*><span>检查连接<\/span><\/button>/);
  assert.match(markup, /class="bxf-connectedFooter dim-cardFooter"/);
  assert.doesNotMatch(markup, /dim-cardSummary|长连接运行正常/);
  assert.equal((markup.match(/dim-cardAction(?: |")/g) ?? []).length, 3);
  assert.doesNotMatch(markup, /连接状态：|bxf-divider/);
  assert.doesNotMatch(markup, /custom-bot-avatar/);
  assert.match(markup, /class="dim-botHealthGroup"[^]*class="dim-lastChecked"><span>最近检查<\/span>/);
  assert.doesNotMatch(markup, /消息通道|dim-botMetric/);
  assert.match(markup, /class="dim-cardFooterLayout"/);
  assert.doesNotMatch(markup, />应用标识<|>飞书机器人</);
});

test('Feishu bot cards never inline a removal confirmation', () => {
  const markup = renderToStaticMarkup(React.createElement(FeishuBotCard, {
    connection: {
      botId: 'bot-feishu-remove',
      state: 'connected',
      connected: true,
      bot: {
        name: 'DHS',
        appIdMasked: 'cli_aa03••••5cb3',
        domain: 'feishu',
      },
      health: {
        summary: '长连接运行正常',
        lastCheckedAt: '2026-08-15T07:30:49.000Z',
      },
    },
    onReconnect() {},
    onRequestRemove() {},
  }));

  assert.match(markup, /class="bxf-cardBody dim-botCardBody"/);
  assert.doesNotMatch(markup, /role="alertdialog"|dim-confirm|dim-removeOverlay/);
});

test('the shared removal dialog is a labelled modal alertdialog with danger confirm and neutral cancel', () => {
  const markup = renderToStaticMarkup(React.createElement(RemoveBotDialog, {
    botId: 'bot-1',
    title: '从小桃子移除“Demo”？',
    description: '这会停止消息连接。',
    onConfirm() {},
    onCancel() {},
  }));

  assert.match(markup, /class="dim-removeOverlay"/);
  assert.match(markup, /role="alertdialog"/);
  assert.match(markup, /aria-modal="true"/);
  assert.match(markup, /aria-labelledby="dim-remove-title-bot-1"/);
  assert.match(markup, /aria-describedby="dim-remove-description-bot-1"/);
  assert.match(markup, /id="dim-remove-title-bot-1">从小桃子移除“Demo”？/);
  assert.match(markup, /id="dim-remove-description-bot-1">这会停止消息连接。/);
  const cancel = markup.match(/<button[^>]*>保留机器人<\/button>/);
  const confirm = markup.match(/<button[^>]*>确认移除接入<\/button>/);
  assert.ok(cancel, 'cancel keeps the neutral label');
  assert.ok(confirm, 'confirm keeps the removal label');
  assert.doesNotMatch(cancel[0], /data-kind="danger"/, 'cancel stays neutral');
  assert.match(confirm[0], /data-kind="danger"/, 'confirm carries danger semantics');
});

test('the removal dialog traps focus through document-level handlers and restores the clicked trigger', async () => {
  const previousDocument = globalThis.document;
  onTestFinished(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  const focusLog = [];
  const body = { label: 'body' };
  const makeFocusable = (label) => ({
    label,
    disabled: false,
    offsetParent: {},
    focus() {
      focusLog.push(label);
      globalThis.document.activeElement = this;
    },
  });
  const trigger = makeFocusable('trigger');
  const cancelNode = makeFocusable('cancel');
  const confirmNode = makeFocusable('confirm');
  const panelNode = {
    label: 'panel',
    focus() {
      focusLog.push('panel');
      globalThis.document.activeElement = this;
    },
    contains: (node) => node === cancelNode || node === confirmNode || node === panelNode,
    querySelectorAll: () => [cancelNode, confirmNode].filter((node) => !node.disabled),
  };
  const listeners = new Map();
  const register = (type, fn, capture) => listeners.set(type, { fn, capture });
  globalThis.document = {
    activeElement: body,
    contains: (node) => node === trigger,
    addEventListener: register,
    removeEventListener: (type, fn) => {
      if (listeners.get(type)?.fn === fn) listeners.delete(type);
    },
  };

  const onCancel = vi.fn();
  let renderer;
  await actState(async () => {
    renderer = createStateRenderer(React.createElement(RemoveBotDialog, {
      botId: 'bot-focus',
      title: '移除？',
      description: '说明',
      trigger,
      onCancel,
      onConfirm() {},
    }), {
      createNodeMock: (element) => {
        if (element.props?.role === 'alertdialog') return panelNode;
        if (element.type === 'button') {
          return element.props['data-kind'] === 'danger' ? confirmNode : cancelNode;
        }
        return {};
      },
    });
  });

  // Cancel receives initial focus even though the opener was never focused
  // (Safari-style click without focus: activeElement stayed on <body>).
  assert.deepEqual(focusLog, ['cancel']);

  // Handlers live on document, in capture phase, not on the panel element.
  const dialog = renderer.root.findByProps({ role: 'alertdialog' });
  assert.equal(dialog.props.onKeyDown, undefined, 'no React panel-local keydown');
  assert.equal(dialog.props.tabIndex, -1, 'panel is focusable for the empty-list fallback');
  assert.equal(listeners.get('keydown')?.capture, true, 'keydown registered in capture phase');
  assert.equal(listeners.get('focusin')?.capture, true, 'focusin registered in capture phase');
  const keydown = (init) => {
    const calls = { prevented: 0, stopped: 0 };
    listeners.get('keydown').fn({
      preventDefault: () => { calls.prevented += 1; },
      stopPropagation: () => { calls.stopped += 1; },
      ...init,
    });
    return calls;
  };

  // Escape from body focus is consumed at document level and cancels.
  globalThis.document.activeElement = body;
  assert.deepEqual(keydown({ key: 'Escape' }), { prevented: 1, stopped: 1 });
  assert.equal(onCancel.mock.calls.length, 1);

  // Tab wraps from the last button to the first; Shift+Tab wraps the other way.
  globalThis.document.activeElement = confirmNode;
  assert.equal(keydown({ key: 'Tab' }).prevented, 1);
  assert.equal(focusLog.at(-1), 'cancel');
  globalThis.document.activeElement = cancelNode;
  assert.equal(keydown({ key: 'Tab', shiftKey: true }).prevented, 1);
  assert.equal(focusLog.at(-1), 'confirm');

  // A mid-trap Tab is left to the browser.
  globalThis.document.activeElement = cancelNode;
  assert.equal(keydown({ key: 'Tab' }).prevented, 0);

  // Focus landing on <body>/outside the panel is pulled back to cancel.
  focusLog.length = 0;
  listeners.get('focusin').fn({ target: body, preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(focusLog, ['cancel']);

  // While removal runs, buttons are disabled: Escape stays consumed without
  // cancelling, and Tab is trapped on the panel itself.
  await actState(async () => {
    renderer.update(React.createElement(RemoveBotDialog, {
      botId: 'bot-focus',
      title: '移除？',
      description: '说明',
      busy: true,
      trigger,
      onCancel,
      onConfirm() {},
    }));
  });
  cancelNode.disabled = true;
  confirmNode.disabled = true;
  assert.deepEqual(keydown({ key: 'Escape' }), { prevented: 1, stopped: 1 });
  assert.equal(onCancel.mock.calls.length, 1);
  focusLog.length = 0;
  assert.equal(keydown({ key: 'Tab' }).prevented, 1);
  assert.deepEqual(focusLog, ['panel'], 'empty focusable list focuses the panel');

  // Closing restores focus to the exact clicked trigger, not a stale snapshot.
  await actState(async () => { renderer.unmount(); });
  assert.equal(focusLog.at(-1), 'trigger');
  assert.equal(listeners.size, 0, 'document handlers are removed on close');
});

test('the removal dialog skips focus restore when the trigger left the document', async () => {
  const previousDocument = globalThis.document;
  onTestFinished(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  const focusLog = [];
  const trigger = { focus: () => focusLog.push('trigger') };
  globalThis.document = {
    activeElement: null,
    contains: () => false,
    addEventListener() {},
    removeEventListener() {},
  };
  let renderer;
  await actState(async () => {
    renderer = createStateRenderer(React.createElement(RemoveBotDialog, {
      botId: 'bot-gone',
      title: '移除？',
      description: '说明',
      trigger,
      onCancel() {},
      onConfirm() {},
    }));
  });
  await actState(async () => { renderer.unmount(); });
  assert.deepEqual(focusLog, [], 'a removed trigger never receives focus');
});

test('Feishu keeps its heading controls on one row without a plus icon', async () => {
  const styles = await readFile(FEISHU_STYLES_URL, 'utf8');
  const markup = renderToStaticMarkup(React.createElement(FeishuSettingsTab, {
    rpcCall: async () => ({ ok: true, value: {} }),
  }));

  assert.match(markup, /aria-label="扫码接入飞书机器人"/);
  assert.match(markup, /class="dim-actionIcon"[^]*<span>扫码接入机器人<\/span>/);
  assert.doesNotMatch(markup, />添加机器人</);
  assert.match(styles, /\.bxf-headingTools \{[^}]*justify-content: space-between;[^}]*flex-wrap: nowrap;/);
  assert.match(styles, /@container \(max-width: 620px\)[^]*\.bxf-headingTools \{ gap: 6px; \}/);
  assert.doesNotMatch(styles, /\.bxf-headingTools \.bxf-button \{ margin-left: auto; \}/);
});

test('credential binding is a distinct secondary action beside QR binding in four channels', async () => {
  const settings = [
    ['飞书', FeishuSettingsTab],
    ['QQ', QqSettingsTab],
    ['钉钉', DingtalkSettingsTab],
    ['企业微信', WecomSettingsTab],
  ];
  for (const [channel, Component] of settings) {
    const markup = renderToStaticMarkup(React.createElement(Component, {
      rpcCall: async () => ({ ok: true, value: {} }),
    }));
    const scanIndex = markup.indexOf('dim-scanButton');
    const credentialIndex = markup.indexOf('dim-credentialButton');
    assert.ok(scanIndex >= 0, `${channel} should render a QR button`);
    assert.ok(credentialIndex > scanIndex, `${channel} should place credential binding after QR binding`);
    assert.match(markup, /data-kind="credential"/);
    const credentialMarkup = markup.slice(credentialIndex, markup.indexOf('</button>', credentialIndex));
    assert.match(credentialMarkup, /dim-actionIcon/);
    assert.match(credentialMarkup, /手动接入/);
  }

  const styles = await readFile(STYLES_URL, 'utf8');
  assert.match(styles, /\.dim-panel \.dim-bindActions \{[^}]*flex-wrap: nowrap;/);
  assert.match(styles, /\.dim-panel \.dim-credentialButton \{[^}]*border: 1px solid var\(--dsw-alias-border-l2, #dfe1e5\);[^}]*background: var\(--dsw-alias-bg-layer-1, #fff\)/);
  assert.match(styles, /\.dim-panel \.dim-actionIcon \{[^}]*flex: 0 0 15px;/);
  assert.doesNotMatch(styles, /\.dim-panel \.dim-credentialPanel \{[^}]*border-left:/);
});

test('credential form stays compact while using a protected password input', () => {
  const markup = renderToStaticMarkup(React.createElement(CredentialBindingPanel, {
    channel: '企业微信',
    identityLabel: 'Bot ID',
    identityPlaceholder: '填写 Bot ID',
    secretLabel: 'Secret',
    secretPlaceholder: '填写 Secret',
    onSubmit() {},
    onCancel() {},
  }));
  assert.match(markup, />Bot ID</);
  assert.match(markup, /type="password"/);
  assert.match(markup, /autoComplete="new-password"/i);
  assert.match(markup, />手动接入企业微信机器人</);
  assert.doesNotMatch(markup, /已有机器人应用|Harness 会校验凭据|可见范围|受保护的凭据存储/);
  assert.doesNotMatch(markup, /value="[^"]+"/);
  assert.match(markup, /<label[^>]*for="[^"]+"[^>]*><span>Bot ID<\/span><input id="[^"]+"/);
});

test('scan actions align left while online totals align right in every channel', async () => {
  const [imStyles, feishuStyles, weixinStyles, dingtalkStyles, wecomStyles, feishuSource, weixinSource, dingtalkSource, wecomSource] = await Promise.all([
    readFile(STYLES_URL, 'utf8'),
    readFile(FEISHU_STYLES_URL, 'utf8'),
    readFile(WEIXIN_STYLES_URL, 'utf8'),
    readFile(DINGTALK_STYLES_URL, 'utf8'),
    readFile(WECOM_STYLES_URL, 'utf8'),
    readFile(FEISHU_SOURCE_URL, 'utf8'),
    readFile(WEIXIN_SOURCE_URL, 'utf8'),
    readFile(DINGTALK_CLIENT_SOURCE_URL, 'utf8'),
    readFile(WECOM_SOURCE_URL, 'utf8'),
  ]);

  assert.match(imStyles, /\.dim-panel \.bxf-headingTools, \.dim-panel \.dxw-tools, \.dim-panel \.ddt-tools \{[^}]*display: grid;[^}]*grid-template-columns: minmax\(0, 1fr\) max-content;[^}]*justify-content: stretch;/);
  assert.match(imStyles, /\.dim-panel \.dim-bindActions > button \{[^}]*min-width: 0;/);
  assert.match(imStyles, /\.dim-panel \.bxf-headingTools \.dim-scanButton,[^}]*justify-self: start;/);
  assert.match(imStyles, /\.dim-panel \.bxf-headingTools \.dim-onlineBadge,[^}]*justify-self: end;/);
  assert.match(feishuStyles, /\.bxf-headingTools \{[^}]*justify-content: space-between;/);
  assert.match(weixinStyles, /\.dxw-tools \{[^}]*justify-content: space-between;/);
  assert.match(dingtalkStyles, /\.ddt-tools \{[^}]*justify-content: space-between;/);
  assert.match(wecomStyles, /\.dwecom-page/);

  const headingSource = (source) => source.slice(
    source.indexOf('function Heading'),
    source.indexOf('function LoadingView'),
  );
  const feishuHeading = headingSource(feishuSource);
  const weixinHeading = headingSource(weixinSource);
  const dingtalkHeading = headingSource(dingtalkSource);
  const wecomHeading = headingSource(wecomSource);
  assert.ok(feishuHeading.indexOf('扫码接入机器人') < feishuHeading.indexOf('bxf-totalBadge'));
  assert.ok(weixinHeading.indexOf('扫码接入机器人') < weixinHeading.indexOf('dxw-badge'));
  assert.ok(dingtalkHeading.indexOf('扫码接入机器人') < dingtalkHeading.indexOf('ddt-badge'));
  assert.ok(wecomHeading.indexOf('扫码接入机器人') < wecomHeading.indexOf('ddt-badge'));

  for (const heading of [feishuHeading, weixinHeading, dingtalkHeading, wecomHeading]) {
    assert.match(heading, /dim-scanButton/);
    assert.match(heading, /dim-onlineBadge/);
  }
  assert.doesNotMatch(weixinHeading, /dxw-dot/);
  assert.doesNotMatch(dingtalkHeading, /ddt-dot/);
  assert.match(imStyles, /\.dim-panel \.bxf-headingTools \.dim-scanButton,[^}]*border: 1px solid var\(--dim-action\);[^}]*border-radius: 8px;[^}]*background: var\(--dim-action\);[^}]*box-shadow: none;/);
  assert.match(imStyles, /\.dim-panel \.bxf-headingTools \.dim-onlineBadge,[^}]*border-radius: 999px;[^}]*background: var\(--dsw-alias-bg-module-platform, #f2f3f5\);[^}]*font-size: 12px;/);
});

test('WeCom office card row keeps touch targets, focus and reduced motion', async () => {
  const [styles, source] = await Promise.all([
    readFile(WECOM_STYLES_URL, 'utf8'),
    readFile(WECOM_SOURCE_URL, 'utf8'),
  ]);
  assert.match(styles, /\.dwecom-officeRow \{/);
  assert.match(styles, /@media \(max-width: 768px\), \(pointer: coarse\) \{[^}]*min-height: 44px/);
  assert.match(styles, /summary:focus-visible/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{\s*\.dwecom-officeRow/);
  assert.match(source, /officeCall = callOffice/);
  assert.doesNotMatch(source, /secretRef|remoteBotId|selectedBotId/);
});

test('channel headings omit the redundant local credential badge', () => {
  const components = [FeishuSettingsTab, WeixinSettingsTab, DingtalkSettingsTab, WecomSettingsTab];

  for (const Component of components) {
    const markup = renderToStaticMarkup(React.createElement(Component, {
      rpcCall: async () => ({ ok: true, value: {} }),
    }));
    assert.doesNotMatch(markup, /凭据仅保存在本机/);
  }
});

test('bot list headings omit the total already shown by the online badge', async () => {
  const sources = await Promise.all([
    FEISHU_SOURCE_URL,
    WEIXIN_SOURCE_URL,
    DINGTALK_CLIENT_SOURCE_URL,
    WECOM_SOURCE_URL,
    QQ_SOURCE_URL,
  ].map((url) => readFile(url, 'utf8')));

  for (const source of sources) {
    assert.doesNotMatch(source, /length} 个/);
  }
});

test('all channel settings states use the DingTalk page treatment', async () => {
  const [styles, feishuSource, weixinSource, dingtalkSource, wecomSource] = await Promise.all([
    readFile(STYLES_URL, 'utf8'),
    readFile(FEISHU_SOURCE_URL, 'utf8'),
    readFile(WEIXIN_SOURCE_URL, 'utf8'),
    readFile(DINGTALK_CLIENT_SOURCE_URL, 'utf8'),
    readFile(WECOM_SOURCE_URL, 'utf8'),
  ]);

  for (const Component of [FeishuSettingsTab, WeixinSettingsTab, DingtalkSettingsTab, WecomSettingsTab]) {
    const markup = renderToStaticMarkup(React.createElement(Component, {
      rpcCall: async () => ({ ok: true, value: {} }),
    }));
    assert.match(markup, /dim-channelPage/);
    assert.match(markup, /dim-surfaceCard dim-loadingView/);
    assert.match(markup, /dim-spinner/);
  }

  for (const source of [feishuSource, weixinSource, dingtalkSource, wecomSource]) {
    for (const className of [
      'dim-channelPage',
      'dim-surfaceCard',
      'dim-loadingView',
      'dim-emptyView',
      'dim-qrLayout',
      'dim-inlineError',
      'dim-listHeading',
      'RemoveBotDialog',
    ]) {
      assert.match(source, new RegExp(className));
    }
  }

  assert.match(styles, /\.dim-panel \.dim-channelPage \{[^}]*flex-direction: column;[^}]*gap: 12px;/);
  assert.match(styles, /\.dim-panel \.dim-listHeading \{[^}]*margin: 0 0 6px;/);
  assert.match(styles, /\.dim-panel \.dim-botList \{[^}]*gap: 8px;/);
  assert.match(styles, /\.dim-panel \.dim-surfaceCard \{[^}]*border-radius: 12px;[^}]*box-shadow: var\(--dsw-shadow-lv1/);
  assert.match(styles, /\.dim-panel \.dim-loadingView \{[^}]*padding: 38px;[^}]*text-align: center;/);
  assert.match(styles, /\.dim-panel \.dim-emptyView \{[^}]*grid-template-columns: minmax\(0, 1fr\) 180px;[^}]*gap: 30px;/);
  assert.match(styles, /\.dim-panel \.dim-qrLayout \{[^}]*grid-template-columns: 300px minmax\(0, 1fr\);[^}]*gap: 34px;[^}]*align-items: start;/);
  assert.match(styles, /\.dim-panel :is\(\.bxf-button, \.dxw-button, \.ddt-button\) \{[^}]*min-height: 36px;[^}]*border-radius: 8px;[^}]*font-size: 13px;/);
  assert.match(styles, /\.dim-panel \.dim-inlineError \{[^}]*padding: 22px;[^}]*background:/);
  assert.doesNotMatch(styles, /dim-botCardBody \{ display: none/, 'removal never hides the card body inline');
  assert.match(styles, /\.dim-panel \.dim-removeOverlay \{[^}]*position: fixed;[^}]*inset: 0;/);
  assert.match(styles, /\.dim-panel \.dim-removeDialog \{[^}]*border-radius: 24px;[^}]*box-shadow: var\(--dsw-shadow-lv2/);
  assert.match(styles, /@media \(max-width: 560px\)[^]*\.dim-panel \.dim-removeOverlay \{[^}]*env\(safe-area-inset-bottom\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[^]*\.dim-removeOverlay/);
  assert.match(styles, /\.dim-panel \.dim-removeDialog \.dim-viewActions \[data-kind="danger"\] \{[^}]*background: var\(--dim-danger-fill\)/);
});

test('bot cards reuse the same channel brand logos as the channel rail', () => {
  const railMarkup = renderToStaticMarkup(React.createElement(IMSettingsTab, {
    feishuRpcCall: async () => ({ ok: true, value: {} }),
    weixinRpcCall: async () => ({ ok: true, value: {} }),
    dingtalkRpcCall: async () => ({ ok: true, value: {} }),
    wecomRpcCall: async () => ({ ok: true, value: {} }),
  }));
  const accountMarkup = renderToStaticMarkup(React.createElement(WeixinAccountCard, {
    account: {
      botId: 'bot-weixin-card',
      state: 'connected',
      connected: true,
      bot: { name: '微信机器人', accountIdMasked: 'wxid••••1234' },
      stats: { messagesReceived: 2, messagesReplied: 2 },
      health: { summary: '长轮询运行正常', lastCheckedAt: '2026-08-15T07:30:49.000Z' },
    },
    onReconnect() {},
    onRequestRemove() {},
    onConfirmRemove() {},
    onCancelRemove() {},
  }));

  assert.match(railMarkup, /data-im-channel-logo="weixin"/);
  assert.match(railMarkup, /data-im-channel-logo="feishu"/);
  assert.match(railMarkup, /data-im-channel-logo="wecom"/);
  assert.match(accountMarkup, /class="dxw-card dim-botCard"/);
  assert.match(accountMarkup, /class="dxw-avatar dim-botAvatar"[^]*data-im-channel-logo="weixin"/);
  assert.match(accountMarkup, /class="dxw-health dim-botHealth"/);
  assert.match(accountMarkup, /class="dxw-accountFooter dim-cardFooter"/);
  assert.doesNotMatch(accountMarkup, /dim-cardSummary|微信消息长轮询运行正常/);
  assert.equal((accountMarkup.match(/dim-cardAction(?: |")/g) ?? []).length, 2);
  assert.match(accountMarkup, /class="dim-botHealthGroup"[^]*class="dim-lastChecked"><span>最近检查<\/span>/);
  assert.doesNotMatch(accountMarkup, /消息通道|dim-botMetric/);
  assert.match(accountMarkup, /class="dim-cardFooterLayout"/);
  assert.doesNotMatch(accountMarkup, /收到 \/ 回复/);
});

test('Enterprise WeChat cards reuse the rail logo and compact action treatment', () => {
  const markup = renderToStaticMarkup(React.createElement(WecomAccountCard, {
    account: {
      botId: 'wecom-card', state: 'connected', connected: true,
      bot: { name: '企业微信机器人', appIdMasked: 'bot••••001' },
      health: { summary: '企业微信 WebSocket 长连接运行正常', lastCheckedAt: Date.now() },
    },
    onReconnect() {}, onRequestRemove() {}, onConfirmRemove() {}, onCancelRemove() {},
  }));
  assert.match(markup, /data-im-channel-logo="wecom"/);
  assert.equal((markup.match(/dim-cardAction(?: |")/g) ?? []).length, 2);
  assert.match(markup, /class="dim-botHealthGroup"[^]*class="dim-lastChecked"><span>最近检查<\/span>/);
  assert.doesNotMatch(markup, /消息通道|dim-botMetric/);
  assert.match(markup, /class="dim-cardFooterLayout"/);
  assert.match(markup, /class="dim-instruction"/);
  assert.doesNotMatch(markup, /class="dim-instruction"[^>]*\sopen/);
  assert.match(markup, /职责 \/ 范围/);
});

test('DingTalk bot cards omit the redundant received and replied metric', () => {
  const markup = renderToStaticMarkup(React.createElement(DingtalkAccountCard, {
    account: {
      botId: 'bot-dingtalk-card',
      state: 'connected',
      connected: true,
      bot: { name: '钉钉机器人', clientIdMasked: 'ding••••oioy' },
      stats: { messagesReceived: 2, messagesReplied: 2 },
      health: { summary: 'Stream 长连接运行正常', lastCheckedAt: '2026-08-15T07:30:49.000Z' },
    },
    onReconnect() {},
    onRequestRemove() {},
    onConfirmRemove() {},
    onCancelRemove() {},
  }));

  assert.match(markup, /class="ddt-card dim-botCard"/);
  assert.match(markup, /class="ddt-health dim-botHealth"/);
  assert.match(markup, /class="dim-botHealthGroup"[^]*class="dim-lastChecked"><span>最近检查<\/span>/);
  assert.doesNotMatch(markup, /消息通道|dim-botMetric/);
  assert.match(markup, /class="ddt-accountFooter dim-cardFooter"/);
  assert.match(markup, /class="dim-cardFooterLayout"/);
  assert.doesNotMatch(markup, /dim-cardSummary|Stream 长连接运行正常/);
  assert.equal((markup.match(/dim-cardAction(?: |")/g) ?? []).length, 2);
  assert.doesNotMatch(markup, /收到 \/ 回复/);
});

test('all channel card action buttons stay on one row', async () => {
  const [imStyles, feishuStyles, weixinStyles, dingtalkStyles] = await Promise.all([
    readFile(STYLES_URL, 'utf8'),
    readFile(FEISHU_STYLES_URL, 'utf8'),
    readFile(WEIXIN_STYLES_URL, 'utf8'),
    readFile(DINGTALK_STYLES_URL, 'utf8'),
  ]);

  assert.match(feishuStyles, /\.bxf-botActions \{[^}]*flex-wrap: nowrap;/);
  assert.match(weixinStyles, /\.dxw-accountFooter \.dxw-actions \{[^}]*flex-wrap: nowrap;/);
  assert.match(dingtalkStyles, /\.ddt-accountFooter \.ddt-actions \{[^}]*flex-wrap: nowrap;/);
  assert.match(imStyles, /\.dim-panel \.dim-cardFooter \{[^}]*flex-wrap: wrap;[^}]*gap: 12px;[^}]*padding-top: 6px;[^}]*border-top: 1px solid/);
  assert.match(imStyles, /\.dim-panel \.dim-cardActions \.dim-cardAction \{[^}]*min-height: 32px;[^}]*border-radius: 8px;[^}]*font-size: 13px;/);
  assert.match(imStyles, /\.dim-panel \.dim-cardActions \.dim-cardAction\[data-kind="danger"\] \{[^}]*var\(--dim-error-ink\)/);
  assert.match(feishuStyles, /\.bxf-connectedFooter \{[^}]*flex-wrap: wrap;/);
  assert.match(weixinStyles, /\.dxw-accountFooter \{[^}]*flex-wrap: wrap;/);
  assert.match(dingtalkStyles, /\.ddt-accountFooter \{[^}]*flex-wrap: wrap;/);
  assert.doesNotMatch(feishuStyles, /\.bxf-connectedFooter \{[^}]*flex-direction: column/);
  assert.doesNotMatch(weixinStyles, /\.dxw-accountFooter \{[^}]*flex-direction: column/);
  assert.doesNotMatch(dingtalkStyles, /\.ddt-accountFooter \{[^}]*flex-direction: column/);
});

test('card footer status text takes a full row so CJK copy cannot collapse beside actions', async () => {
  const [imStyles, feishuStyles] = await Promise.all([
    readFile(STYLES_URL, 'utf8'),
    readFile(FEISHU_STYLES_URL, 'utf8'),
  ]);

  assert.match(imStyles, /\.dim-panel \.dim-cardSummary \{[^}]*flex: 1 1 100%;[^}]*min-width: min\(100%, 12rem\)/);
  assert.match(imStyles, /\.dim-panel \.dim-cardFooterLayout \{[^}]*width: 100%;[^}]*flex-direction: column;[^}]*align-items: stretch;/);
  assert.match(imStyles, /\.dim-panel \.dim-cardFooterLayout > \.dim-cardActions \{[^}]*align-self: stretch;/);
  assert.match(feishuStyles, /\.bxf-healthSummary \{[^}]*flex: 1 1 100%;[^}]*min-width: min\(100%, 12rem\)/);
});

test('all channel bot cards use the DingTalk card treatment', async () => {
  const styles = await readFile(STYLES_URL, 'utf8');

  assert.match(styles, /\.dim-panel \.dim-botCard \{[^}]*border-radius: 12px;[^}]*background: var\(--dsw-alias-bg-layer-1, #fff\);[^}]*box-shadow: var\(--dsw-shadow-lv1/);
  assert.match(styles, /\.dim-panel \.dim-botCardBody \{[^}]*padding: 12px;/);
  assert.match(styles, /\.dim-panel \.dim-botCardTop \{[^}]*align-items: flex-start;[^}]*gap: 12px;/);
  assert.match(styles, /\.dim-panel \.dim-botAvatar \{[^}]*width: 38px;[^}]*height: 38px;[^}]*border-radius: var\(--xtz-radius-m, 12px\);/);
  assert.match(styles, /\.dim-panel \.dim-botNameInput \{[^}]*font-size: 15px;/);
  assert.match(styles, /\.dim-panel \.dim-botCard \.dim-botHealth \{[^}]*background: transparent;[^}]*font-size: 12px;[^}]*font-weight: 400;/);
  assert.match(styles, /\.dim-panel \.dim-botMetrics \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[^}]*gap: 8px;[^}]*margin: 6px 0;/);
  assert.match(styles, /\.dim-panel \.dim-botMetric \{[^}]*padding: 6px 8px;[^}]*border: 0;[^}]*border-radius: 8px;/);
  assert.match(styles, /\.dim-panel \.dim-botMetric dd \{[^}]*margin: 3px 0 0;[^}]*font-size: 12px;[^}]*font-weight: 400;/);
});

test('bot cards keep the full workspace path on its own single line', async () => {
  const styles = await readFile(STYLES_URL, 'utf8');

  assert.match(styles, /\.dim-panel \.dim-workspace \{[^}]*grid-template-columns: minmax\(0, 1fr\) max-content;[^}]*row-gap: 4px;[^}]*border-top: 1px solid var\(--dsw-alias-border-l1/);
  assert.match(styles, /\.dim-panel \.dim-workspaceHeader \{[^}]*display: contents;/);
  assert.match(styles, /\.dim-panel \.dim-workspacePath \{[^}]*grid-column: 1 \/ -1;[^}]*grid-row: 2;[^}]*overflow-x: auto;[^}]*white-space: nowrap;/);
  assert.doesNotMatch(styles, /\.dim-panel \.dim-workspacePath \{[^}]*text-overflow: ellipsis;/);
  assert.match(styles, /\.dim-panel \.dim-workspaceEdit \{[^}]*grid-column: 2;[^}]*grid-row: 1;[^}]*white-space: nowrap;/);
});

function compositionMatrixAccounts(overrides = {}) {
  return stateMatrixCards({
    botId: 'bot-compose',
    connected: true,
    state: 'connected',
    workspaceId: 'ws-compose',
    workspaceTitle: 'compose-target',
    bot: {
      name: '演示机器人', username: 'demo_bot', idMasked: 'bot••01',
      appIdMasked: 'app••01', clientIdMasked: 'client••01', accountIdMasked: 'account••01',
    },
    health: { summary: '连接运行正常', lastCheckedAt: Date.UTC(2026, 7, 25, 7, 30) },
    error: null,
    ...overrides,
  });
}

test('every bot card composes identity, health, workspace, disclosures, and footer in reading order', () => {
  const handlers = {
    onReconnect() {}, onRequestRemove() {}, onConfirmRemove() {}, onCancelRemove() {},
  };

  for (const [channel, Card, props] of compositionMatrixAccounts()) {
    const markup = renderToStaticMarkup(React.createElement(Card, { ...handlers, ...props }));

    // Identity and text health lead; the workspace follows; optional
    // capability editors fold into native disclosure; footer actions come last.
    const markers = [
      'dim-botIdentity',
      'dim-botHealth',
      'dim-workspace',
      'dim-preset',
      'dim-instruction',
      'dim-cardFooter',
    ];
    let cursor = -1;
    for (const marker of markers) {
      const index = markup.indexOf(marker);
      assert.ok(index > cursor, `${channel} places ${marker} in reading order`);
      cursor = index;
    }

    assert.match(
      markup,
      /<details class="dim-preset">/,
      `${channel} folds Agent Preset into a closed native disclosure`,
    );
    assert.match(
      markup,
      /<summary class="dim-presetSummary">/,
      `${channel} preset disclosure keeps a text summary`,
    );
    assert.match(
      markup,
      /<details class="dim-instruction">/,
      `${channel} folds instruction into a closed native disclosure`,
    );

    // The selected project stays readable outside any disclosure.
    assert.match(
      markup,
      /<span class="dim-workspacePath" title="compose-target">compose-target<\/span>/,
      `${channel} renders the selected project title`,
    );

    // Footer actions are sibling buttons, never nested interactive elements.
    const actionsStart = markup.indexOf('dim-cardActions');
    const actions = markup.slice(actionsStart, markup.indexOf('</div>', actionsStart));
    assert.ok(
      (actions.match(/<button/g) ?? []).length >= 2,
      `${channel} keeps footer actions as sibling buttons`,
    );
    assert.doesNotMatch(
      markup,
      /<button(?:(?!<\/button>)[\s\S])*<button/,
      `${channel} never nests a button inside a button`,
    );

    // Health is a dot plus a text state, never color-only.
    assert.match(
      markup,
      /class="[^"]*dim-healthDot" data-tone="success"><\/span><span>运行正常<\/span>/,
      `${channel} pairs the health dot with a text state`,
    );
  }
});

test('pending workspace confirmation stays visible outside any disclosure on every bot card', () => {
  const handlers = {
    onReconnect() {}, onRequestRemove() {}, onConfirmRemove() {}, onCancelRemove() {},
  };

  for (const [channel, Card, props] of compositionMatrixAccounts({
    workspaceId: undefined,
    workspaceTitle: undefined,
    workspacePending: true,
  })) {
    const markup = renderToStaticMarkup(React.createElement(Card, { ...handlers, ...props }));
    const workspaceIndex = markup.indexOf('dim-workspace');
    assert.ok(workspaceIndex >= 0, `${channel} keeps the workspace row rendered while confirmation is pending`);
    const firstDisclosure = markup.indexOf('<details');
    assert.ok(
      firstDisclosure === -1 || workspaceIndex < firstDisclosure,
      `${channel} never folds a pending workspace confirmation into a disclosure`,
    );
    assert.match(
      markup,
      /<span class="dim-workspacePath">未选择项目<\/span>/,
      `${channel} shows the unset project state in place`,
    );
  }
});

test('bot card sections are open rows with separators, not nested decorative cards', async () => {
  const styles = await readFile(STYLES_URL, 'utf8');

  for (const section of ['dim-workspace', 'dim-preset', 'dim-instruction']) {
    const rule = styles.match(new RegExp(`\\.dim-panel \\.${section} \\{([^}]*)\\}`));
    assert.ok(rule, `${section} keeps a shared section rule`);
    assert.doesNotMatch(
      rule[1],
      /border: 1px solid|border-radius|background:/,
      `${section} is an open row, not a nested card`,
    );
    assert.match(
      rule[1],
      /border-top: 1px solid var\(--dsw-alias-border-l1/,
      `${section} separates with a hairline`,
    );
  }

  // Compact desktop rows still lift to 44px on coarse pointers and narrow
  // viewports, including the preset disclosure summary.
  const touchBlocks = [...styles.matchAll(/@media \((max-width: 768px|pointer: coarse)\) \{([\s\S]*?)\n\}/g)];
  assert.equal(touchBlocks.length, 2, 'both the narrow-viewport and coarse-pointer blocks exist');
  for (const block of touchBlocks) {
    assert.match(block[2], /\.dim-panel \.dim-presetSummary,/, `${block[1]} lifts the preset summary to a 44px target`);
    assert.match(block[2], /\.dim-panel \.dim-instructionSummary,/, `${block[1]} keeps the instruction summary at 44px`);
    assert.match(block[2], /\.dim-panel \.dim-cardActions \.dim-cardAction,/, `${block[1]} keeps card actions at 44px`);
  }
});

test('preset disclosure opens with an alert when saving fails', async () => {
  let renderer;
  await actState(async () => {
    renderer = createStateRenderer(React.createElement(AgentPresetEditor, {
      agentPreset: '',
      onSave: async () => { throw new Error('Agent Preset 保存失败'); },
    }));
  });
  assert.equal(renderer.root.findByType('details').props.open, undefined);

  await actState(async () => {
    renderer.root.findByProps({ className: 'dim-presetSelect' }).props.onChange({ target: { value: 'coder' } });
    await flushStateMicrotasks();
  });

  assert.equal(renderer.root.findByType('details').props.open, true);
  const alerts = renderer.root.findAllByProps({ role: 'alert' });
  assert.ok(alerts.some((node) => stateTextOf(node).includes('Agent Preset 保存失败')));
  await actState(async () => { renderer.unmount(); });
});

test('preset disclosure opens with a polite status when the current preset is unavailable', () => {
  const markup = renderToStaticMarkup(React.createElement(AgentPresetEditor, {
    agentPreset: 'gone',
  }));
  assert.match(markup, /<details class="dim-preset" open="">/);
  assert.match(markup, /role="status"/);
  assert.match(markup, /当前 Agent Preset 已不可用/);
  assert.match(markup, /gone（已不可用）/);
});

test('the bundled DingTalk channel has no local sender approval workflow', async () => {
  const [source, bundle] = await Promise.all([
    readFile(DINGTALK_CLIENT_SOURCE_URL, 'utf8'),
    readFile(CLIENT_BUNDLE_URL, 'utf8'),
  ]);

  assert.equal('approveSender' in DINGTALK_ENDPOINTS, false);
  assert.equal('revokeSender' in DINGTALK_ENDPOINTS, false);
  assert.doesNotMatch(source, /SenderAccess|onApprove|onRevoke|approveSender|revokeSender/);
  assert.doesNotMatch(
    bundle,
    /bot\.sender\.approve|bot\.sender\.revoke|允许使用机器人的钉钉账号|批准使用/,
  );
});

test('every shipped Chinese client string has an English projection', async () => {
  const paths = (await readdir(CLIENT_SOURCE_DIRECTORY_URL, { recursive: true }))
    .filter((path) => path.endsWith('.ts') && path !== 'i18n.ts');
  const sources = await Promise.all(paths.map((path) =>
    readFile(new URL(path, CLIENT_SOURCE_DIRECTORY_URL), 'utf8')));
  const strings = new Set();
  for (const source of sources) {
    for (const match of source.matchAll(/(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g)) {
      if (/[\p{Script=Han}]/u.test(match[2])) strings.add(match[2]);
    }
  }

  setImTranslator((key) => en[key] ?? key);
  try {
    const untranslated = [...strings].filter((value) =>
      /[\p{Script=Han}]/u.test(localizeText(value)));
    assert.deepEqual(untranslated, []);
    assert.ok(strings.size > 350);
  } finally {
    setImTranslator(null);
  }
});

test('client registers a live bilingual locale seat and Host project source for the IM hub', async () => {
  const effects = [];
  const registrations = [];
  const dictionaries = [];
  const workspaceProjects = {
    list: {
      getSnapshot: () => ({ items: [], state: 'idle', phase: 'ready', baselinesReady: true }),
      subscribe: () => () => {},
    },
  };
  const rpcCall = async () => ({ ok: true, value: {} });
  const ctx = {
    effect(install, label) {
      effects.push({ install, label });
    },
    locale: {
      bind(namespace) {
        assert.equal(namespace, IM_LOCALE_NAMESPACE);
        return (key) => en[key] ?? key;
      },
      register(namespace, value) {
        dictionaries.push({ namespace, value });
        return () => {};
      },
    },
    connection: { rpc: { call: rpcCall } },
    workspaces: workspaceProjects,
    slots: {
      inject(name, install) {
        assert.ok(
          name === 'conversation.session.header.actions'
          || name === 'shell.overlay',
        );
        install();
      },
      register(options, component) {
        registrations.push({ options, component });
        return () => {};
      },
    },
  };

  try {
    applyClient(ctx);
    const dictionaryEffect = effects.find((entry) => entry.label === 'im-settings: bilingual dictionaries');
    assert.ok(dictionaryEffect);
    dictionaryEffect.install();

    assert.deepEqual(clientInject, ['slots', 'connection', 'locale', 'workspaces']);
    assert.equal(dictionaries[0].namespace, IM_LOCALE_NAMESPACE);
    assert.deepEqual(Object.keys(dictionaries[0].value.en).sort(), Object.keys(dictionaries[0].value.zh).sort());
    assert.equal(registrations.length, 3);
    assert.ok(effects.some((entry) => entry.label === 'im-hub: sidebar entry'));
    assert.ok(effects.some((entry) => entry.label === 'im-follow: session row and header badges'));
    const hubOverlay = registrations.find((entry) => entry.options.id === IM_HUB_ID);
    const followAction = registrations.find((entry) => entry.options.id === 'im-follow');
    const followOverlay = registrations.find((entry) => entry.options.id === 'im-follow-dialog');
    assert.ok(hubOverlay);
    assert.ok(followAction);
    assert.ok(followOverlay);
    assert.equal(hubOverlay.options.locale, IM_LOCALE_NAMESPACE);
    assert.equal(hubOverlay.options.id, IM_HUB_ID);
    assert.equal(hubOverlay.options.name, IM_HUB_SLOT);
    assert.equal(followAction.options.name, 'conversation.session.header.actions');
    assert.equal(
      registrations.find((entry) => entry.options.name === 'settings.section'),
      undefined,
    );

    const injected = hubOverlay.options.inject();
    assert.equal(injected.officeEnabled, false);
    assert.equal(injected.workspaceProjects, workspaceProjects);
    assert.equal('workspaceDirectoryPicker' in injected, false);

    const closed = renderToStaticMarkup(React.createElement(
      hubOverlay.component,
      injected,
    ));
    assert.equal(closed, '');

    openImHub();
    const markup = renderToStaticMarkup(React.createElement(
      hubOverlay.component,
      injected,
    ));
    assert.match(markup, /class="dim-hubScrim"/);
    assert.match(markup, /role="dialog"/);
    assert.match(markup, /class="dim-hubHead"/);
    assert.match(markup, /id="dim-hub-title"/);
    assert.match(markup, />IM bots</);
    assert.match(markup, /class="dim-brandVersion">v/);
    assert.match(markup, /class="dim-hubClose"/);
    assert.match(markup, /aria-label="Close"/);
    assert.doesNotMatch(markup, /DeepSeek Harness, always within reach|让 DeepSeek Harness 触手可及/);
    assert.match(markup, /href="https:\/\/github\.com\/kedoupi\/xiaotaozi-dsh"/);
    assert.match(markup, /aria-label="dsh-im GitHub"/);
    assert.match(markup, />WeChat<|>Feishu<|>DingTalk<|>WeCom</);
    assert.match(markup, />QQ<[^]*>Slack<[^]*>Telegram<[^]*>Discord<[^]*>WhatsApp</);
    assert.doesNotMatch(markup, />AI Office</);
    assert.doesNotMatch(markup, /[\p{Script=Han}]/u);
  } finally {
    closeImHub();
    setImTranslator(null);
  }
});

test('IM hub overlay follows host officeEnabled and office.enabled', () => {
  const registrations = [];
  const workspaceSnapshot = {
    items: [], state: 'idle', phase: 'ready', error: null, baselinesReady: true,
  };
  const ctx = {
    effect(install) {
      return typeof install === 'function' ? install() : undefined;
    },
    locale: {
      bind: () => (key) => key,
      register: () => () => {},
    },
    connection: { rpc: { call: async () => ({ ok: true, value: {} }) } },
    workspaces: {
      list: {
        getSnapshot: () => workspaceSnapshot,
        subscribe: () => () => {},
      },
    },
    slots: {
      inject(_name, install) { install(); },
      register(options) {
        registrations.push(options);
        return () => {};
      },
    },
  };
  const hubInject = () => {
    const matches = registrations.filter((entry) => entry.id === IM_HUB_ID);
    return matches.at(-1)?.inject();
  };

  applyClient(ctx);
  assert.equal(hubInject().officeEnabled, false);

  applyClient(ctx, { officeEnabled: true });
  assert.equal(hubInject().officeEnabled, true);

  applyClient(ctx, { office: { enabled: true } });
  assert.equal(hubInject().officeEnabled, true);
});

test('all nine channel settings and connected cards render English copy', () => {
  const rpcCall = async () => ({ ok: true, value: {} });
  const noop = () => {};
  const account = {
    botId: 'bot-english',
    state: 'connected',
    connected: true,
    bot: {
      name: 'Demo Bot',
      accountIdMasked: 'account••01',
      appIdMasked: 'app••01',
      clientIdMasked: 'client••01',
      idMasked: 'bot••01',
      username: 'demo_bot',
    },
    health: { summary: 'Connection is healthy', lastCheckedAt: '2026-08-16T08:00:00.000Z' },
  };

  setImTranslator((key) => en[key] ?? key);
  try {
    const pages = [
      WeixinSettingsTab,
      FeishuSettingsTab,
      DingtalkSettingsTab,
      WecomSettingsTab,
      QqSettingsTab,
      SlackSettingsTab,
      TelegramSettingsTab,
      DiscordSettingsTab,
      WhatsappSettingsTab,
    ];
    const pageMarkup = pages.map((Component) =>
      renderToStaticMarkup(React.createElement(Component, { rpcCall }))).join('\n');
    assert.match(pageMarkup, /Scan QR code/);
    assert.match(pageMarkup, /Manual setup/);
    assert.match(pageMarkup, /Loading WeChat connection status/);
    assert.match(pageMarkup, /Loading Feishu bots/);
    assert.match(pageMarkup, /Loading DingTalk connection status/);
    assert.match(pageMarkup, /Loading WeCom bot status/);
    assert.match(pageMarkup, /Loading QQ bot status/);
    assert.match(pageMarkup, /Loading Slack bot status/);
    assert.match(pageMarkup, /Loading Telegram bot status/);
    assert.match(pageMarkup, /Loading Discord bot status/);
    assert.match(pageMarkup, /Loading WhatsApp bot status/);
    assert.doesNotMatch(pageMarkup, /[\p{Script=Han}]/u);

    const sharedCardProps = {
      removing: true,
      onReconnect: noop,
      onRequestRemove: noop,
      onConfirmRemove: noop,
      onCancelRemove: noop,
    };
    const cards = [
      React.createElement(WeixinAccountCard, { ...sharedCardProps, account }),
      React.createElement(FeishuBotCard, { ...sharedCardProps, connection: account }),
      React.createElement(DingtalkAccountCard, { ...sharedCardProps, account }),
      React.createElement(WecomAccountCard, { ...sharedCardProps, account }),
      React.createElement(QqAccountCard, { ...sharedCardProps, account }),
      React.createElement(SlackAccountCard, { ...sharedCardProps, account }),
      React.createElement(TelegramAccountCard, { ...sharedCardProps, account }),
      React.createElement(DiscordAccountCard, { ...sharedCardProps, account }),
      React.createElement(WhatsappAccountCard, { ...sharedCardProps, account }),
    ];
    const cardMarkup = cards.map(renderToStaticMarkup).join('\n');
    assert.match(cardMarkup, /Connected/);
    assert.match(cardMarkup, /dim-botHealthGroup/);
    assert.match(cardMarkup, /Last checked/);
    assert.match(cardMarkup, /Check connection/);
    assert.match(cardMarkup, /Remove connection/);
    assert.match(cardMarkup, /Role \/ scope/);
    assert.doesNotMatch(cardMarkup, /[\p{Script=Han}]/u);
  } finally {
    setImTranslator(null);
  }
});

const { act: actState, create: createStateRenderer } = TestRenderer;

async function flushStateMicrotasks() {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

function stubStateWindow() {
  const previousWindow = globalThis.window;
  globalThis.window = {
    setInterval() { return 1; }, clearInterval() {},
    setTimeout() { return 1; }, clearTimeout() {},
    requestAnimationFrame(callback) { callback(); return 1; }, cancelAnimationFrame() {},
  };
  onTestFinished(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
}

function stateTextOf(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return node?.children?.map(stateTextOf).join('') ?? '';
}

function stateButtonNamed(root, name) {
  return root.findAllByType('button').find((button) => stateTextOf(button) === name);
}

function stateMatrixCards(sharedProps) {
  return [
    ['Feishu', FeishuBotCard, { connection: sharedProps }],
    ['DingTalk', DingtalkAccountCard, { account: sharedProps }],
    ['WeChat', WeixinAccountCard, { account: sharedProps }],
    ['WeCom', WecomAccountCard, { account: sharedProps }],
    ['QQ', QqAccountCard, { account: sharedProps }],
    ['Slack', SlackAccountCard, { account: sharedProps }],
    ['Telegram', TelegramAccountCard, { account: sharedProps }],
    ['Discord', DiscordAccountCard, { account: sharedProps }],
    ['WhatsApp', WhatsappAccountCard, { account: sharedProps }],
  ];
}

test('every channel card announces connection failure as an alert with a working retry', () => {
  const handlers = {
    onReconnect() {}, onRequestRemove() {}, onConfirmRemove() {}, onCancelRemove() {},
  };
  const baseBot = {
    botId: 'bot-state-matrix',
    bot: {
      name: '演示机器人', username: 'demo_bot', idMasked: 'bot••01',
      appIdMasked: 'app••01', clientIdMasked: 'client••01', accountIdMasked: 'account••01',
    },
    workspace: '/workspace/current',
    health: { summary: '连接尚未就绪', lastCheckedAt: Date.UTC(2026, 7, 25, 7, 30) },
  };

  for (const [channel, Card, props] of stateMatrixCards({
    ...baseBot,
    connected: false,
    state: 'error',
    error: { code: 'IM_AUTH_EXPIRED', message: '连接凭据已失效，请重新接入。' },
  })) {
    const markup = renderToStaticMarkup(React.createElement(Card, { ...handlers, ...props }));
    const alert = markup.match(/<div[^>]*role="alert"[^>]*>([^<]*)</);
    assert.ok(alert, `${channel} announces the connection failure as an alert`);
    assert.match(alert[1], /连接凭据已失效/, `${channel} keeps the specific failure copy`);
    const retry = markup.match(/<button[^>]*>(?:<span[^>]*>)?重试连接(?:<\/span>)?<\/button>/);
    assert.ok(retry, `${channel} keeps a direct retry action on the failed card`);
    assert.doesNotMatch(retry[0], /disabled/, `${channel} retry stays enabled after failure`);
  }

  for (const [channel, Card, props] of stateMatrixCards({
    ...baseBot, connected: false, state: 'connecting', error: null,
  })) {
    const markup = renderToStaticMarkup(React.createElement(Card, { ...handlers, ...props }));
    assert.doesNotMatch(
      markup, /role="alert"/,
      `${channel} connecting state is not an error and must not raise an alert`,
    );
    assert.match(markup, /dim-cardSummary/, `${channel} connecting state keeps status copy`);
  }
});

test('busy channel cards expose aria-busy and disable conflicting actions', () => {
  const handlers = {
    onReconnect() {}, onRequestRemove() {}, onConfirmRemove() {}, onCancelRemove() {},
  };
  const healthy = {
    botId: 'bot-state-matrix',
    connected: true,
    state: 'connected',
    bot: {
      name: '演示机器人', username: 'demo_bot', idMasked: 'bot••01',
      appIdMasked: 'app••01', clientIdMasked: 'client••01', accountIdMasked: 'account••01',
    },
    workspace: '/workspace/current',
    health: { summary: '连接运行正常', lastCheckedAt: Date.UTC(2026, 7, 25, 7, 30) },
    error: null,
  };

  for (const [channel, Card, props] of stateMatrixCards(healthy)) {
    const markup = renderToStaticMarkup(React.createElement(Card, {
      ...handlers, ...props, busy: 'reconnect',
    }));
    assert.match(markup, /<article[^>]*aria-busy="true"/, `${channel} card exposes aria-busy`);
    const checking = markup.match(/<button[^>]*>(?:<span[^>]*>)?检查中…(?:<\/span>)?<\/button>/);
    assert.ok(checking, `${channel} shows visible progress copy while busy`);
    assert.match(checking[0], /disabled/, `${channel} disables the running action`);
    const remove = markup.match(/<button[^>]*>(?:<span[^>]*>)?移除接入(?:<\/span>)?<\/button>/);
    assert.ok(remove, channel);
    assert.match(remove[0], /disabled/, `${channel} disables conflicting actions while busy`);
  }
});

test('Feishu removal opens a modal overlay dialog above the still-visible card', async () => {
  stubStateWindow();
  const focusLog = [];
  const triggerNode = { focus: () => focusLog.push('trigger') };
  const previousDocument = globalThis.document;
  globalThis.document = {
    activeElement: null,
    contains: () => true,
    querySelector: () => null,
    createElement: () => ({ dataset: {}, remove() {} }),
    head: { appendChild() {} },
    addEventListener() {},
    removeEventListener() {},
  };
  onTestFinished(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  const bots = [{
    botId: 'bot-feishu-remove-overlay',
    state: 'connected',
    connected: true,
    bot: { name: 'DHS', appIdMasked: 'cli_aa03••••5cb3', domain: 'feishu' },
    health: { summary: '长连接运行正常', lastCheckedAt: '2026-08-15T07:30:49.000Z' },
  }];
  const deletes = [];
  const rpcCall = async (endpoint, payload) => {
    if (endpoint === 'connection.status') return { ok: true, value: { bots } };
    if (endpoint === 'bot.delete') {
      deletes.push(payload);
      return { ok: true, value: { bots: [] } };
    }
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };

  let renderer;
  await actState(async () => {
    renderer = createStateRenderer(React.createElement(FeishuSettingsTab, { rpcCall }));
    await flushStateMicrotasks();
  });
  const card = () => renderer.root.findByProps({ 'data-bot-id': 'bot-feishu-remove-overlay' });
  const dialogs = () => renderer.root.findAllByProps({ role: 'alertdialog' });

  await actState(async () => {
    stateButtonNamed(card(), '移除接入').props.onClick({ currentTarget: triggerNode });
  });

  assert.equal(dialogs().length, 1, 'removal opens exactly one dialog');
  const dialog = dialogs()[0];
  assert.equal(dialog.props['aria-modal'], 'true');
  assert.ok(dialog.props['aria-labelledby']);
  assert.ok(dialog.props['aria-describedby']);
  assert.match(stateTextOf(renderer.root), /移除「DHS」？/);
  let node = dialog;
  let insideCard = false;
  while (node.parent) {
    if (node.parent.type === 'article') insideCard = true;
    node = node.parent;
  }
  assert.equal(insideCard, false, 'the dialog is not inlined into the card');
  assert.match(stateTextOf(card()), /cli_aa03••••5cb3/, 'the card stays visible behind the overlay');
  assert.equal(card().findAllByProps({ className: 'bxf-cardBody dim-botCardBody' }).length, 1);

  await actState(async () => {
    stateButtonNamed(renderer.root, '保留机器人').props.onClick();
  });
  assert.equal(dialogs().length, 0, 'cancel closes the dialog');
  assert.match(stateTextOf(card()), /cli_aa03••••5cb3/, 'cancel keeps the bot');
  assert.deepEqual(focusLog, ['trigger'], 'cancel restores focus to the clicked remove button');

  await actState(async () => {
    stateButtonNamed(card(), '移除接入').props.onClick({ currentTarget: triggerNode });
  });
  await actState(async () => {
    stateButtonNamed(renderer.root, '确认移除接入').props.onClick();
    await flushStateMicrotasks();
  });
  assert.deepEqual(deletes, [{ botId: 'bot-feishu-remove-overlay', confirm: true }]);
  assert.equal(dialogs().length, 0, 'confirm closes the dialog');
  await actState(async () => { renderer.unmount(); });
});

test('WeChat removal opens a modal overlay dialog above the still-visible card', async () => {
  stubStateWindow();
  const focusLog = [];
  const triggerNode = { focus: () => focusLog.push('trigger') };
  const previousDocument = globalThis.document;
  globalThis.document = {
    activeElement: null,
    contains: () => true,
    querySelector: () => null,
    createElement: () => ({ dataset: {}, remove() {} }),
    head: { appendChild() {} },
    addEventListener() {},
    removeEventListener() {},
  };
  onTestFinished(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  const bots = [{
    botId: 'bot-weixin-remove-overlay',
    state: 'connected',
    connected: true,
    bot: { name: '微信机器人', accountIdMasked: 'wxid••••1234' },
    health: { summary: '长轮询运行正常', lastCheckedAt: '2026-08-15T07:30:49.000Z' },
  }];
  const deletes = [];
  const rpcCall = async (endpoint, payload) => {
    if (endpoint === 'connection.status') return { ok: true, value: { bots } };
    if (endpoint === 'bot.delete') {
      deletes.push(payload);
      return { ok: true, value: { bots: [] } };
    }
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };

  let renderer;
  await actState(async () => {
    renderer = createStateRenderer(React.createElement(WeixinSettingsTab, { rpcCall }));
    await flushStateMicrotasks();
  });
  const card = () => renderer.root.findByProps({ 'data-bot-id': 'bot-weixin-remove-overlay' });
  const dialogs = () => renderer.root.findAllByProps({ role: 'alertdialog' });

  await actState(async () => {
    stateButtonNamed(card(), '移除接入').props.onClick({ currentTarget: triggerNode });
  });

  assert.equal(dialogs().length, 1, 'removal opens exactly one dialog');
  const dialog = dialogs()[0];
  assert.equal(dialog.props['aria-modal'], 'true');
  assert.ok(dialog.props['aria-labelledby']);
  assert.ok(dialog.props['aria-describedby']);
  let node = dialog;
  let insideCard = false;
  while (node.parent) {
    if (node.parent.type === 'article') insideCard = true;
    node = node.parent;
  }
  assert.equal(insideCard, false, 'the dialog is not inlined into the card');
  assert.match(stateTextOf(card()), /wxid••••1234/, 'the card stays visible behind the overlay');

  await actState(async () => {
    stateButtonNamed(renderer.root, '保留账号').props.onClick();
  });
  assert.equal(dialogs().length, 0, 'cancel closes the dialog');
  assert.match(stateTextOf(card()), /wxid••••1234/, 'cancel keeps the account');
  assert.deepEqual(focusLog, ['trigger'], 'cancel restores focus to the clicked remove button');

  await actState(async () => {
    stateButtonNamed(card(), '移除接入').props.onClick({ currentTarget: triggerNode });
  });
  await actState(async () => {
    stateButtonNamed(renderer.root, '确认移除').props.onClick();
    await flushStateMicrotasks();
  });
  assert.deepEqual(deletes, [{ botId: 'bot-weixin-remove-overlay', confirm: true }]);
  assert.equal(dialogs().length, 0, 'confirm closes the dialog');
  await actState(async () => { renderer.unmount(); });
});

test('channel pages announce a status load failure as an alert with a retry action', async () => {
  stubStateWindow();
  const channels = [
    ['WeChat', WeixinSettingsTab],
    ['QQ', QqSettingsTab],
    ['WeCom', WecomSettingsTab],
    ['WhatsApp', WhatsappSettingsTab],
    ['Slack', SlackSettingsTab],
    ['Feishu', FeishuSettingsTab],
  ];

  for (const [channel, Component] of channels) {
    const rpcCall = async () => { throw new Error('网络超时'); };
    let renderer;
    await actState(async () => {
      renderer = createStateRenderer(React.createElement(Component, { rpcCall }));
      await flushStateMicrotasks();
    });
    const alerts = renderer.root.findAllByProps({ role: 'alert' });
    assert.ok(
      alerts.some((node) => /无法读取/.test(stateTextOf(node))),
      `${channel} announces the load failure as an alert`,
    );
    const retry = renderer.root.findAllByType('button')
      .find((button) => stateTextOf(button) === '重新读取');
    assert.ok(retry, `${channel} offers a recovery action for the load failure`);
    assert.notEqual(retry.props.disabled, true, `${channel} recovery action stays enabled`);
    await actState(async () => { renderer.unmount(); });
  }
});

test('silent status refresh failures use alert semantics in every QR channel', async () => {
  const [weixinSource, feishuSource, dingtalkSource] = await Promise.all([
    WEIXIN_SOURCE_URL,
    FEISHU_SOURCE_URL,
    DINGTALK_CLIENT_SOURCE_URL,
  ].map((url) => readFile(url, 'utf8')));

  assert.match(weixinSource, /dxw-statusNotice dim-statusNotice', role: 'alert'/);
  assert.match(feishuSource, /bxf-statusNotice dim-statusNotice", role: "alert"/);
  assert.match(dingtalkSource, /ddt-statusNotice dim-statusNotice', role: 'alert'/);
});

const REMOVE_DIALOG_SOURCE_URL = new URL('../src/client/remove-dialog.ts', import.meta.url);

function cssMediaBlock(css, query) {
  const needle = `@media (${query}) {`;
  const start = css.indexOf(needle);
  assert.ok(start >= 0, `missing @media (${query})`);
  let depth = 0;
  let i = start + `@media (${query}) `.length;
  const from = i + 1;
  for (; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(from, i);
    }
  }
  assert.fail(`unclosed @media (${query})`);
}

test('remove-dialog.ts uses real types and no ts-nocheck directive', async () => {
  const source = await readFile(REMOVE_DIALOG_SOURCE_URL, 'utf8');
  assert.doesNotMatch(source, /^\s*\/\/?\s*@ts-nocheck\b/m);
  assert.match(source, /export type RemoveBotDialogProps = \{/);
  assert.match(source, /onConfirm: \(\) => void/);
  assert.match(source, /onCancel: \(\) => void/);
  assert.match(source, /export function focusableControls\(root: /);
  assert.match(source, /React\.useRef<HTMLDivElement/);
  assert.match(source, /React\.useRef<HTMLButtonElement/);
  assert.match(source, /\(event: KeyboardEvent\)/);
  assert.match(source, /\(event: FocusEvent\)/);
});

test('removal dialog title is 18px while body copy stays 13px', async () => {
  const styles = await readFile(STYLES_URL, 'utf8');
  assert.match(styles, /\.dim-panel \.dim-removeDialog strong \{[^}]*font-size: 18px/);
  assert.match(styles, /\.dim-panel \.dim-confirm p \{[^}]*font-size: 13px/);
  assert.doesNotMatch(
    styles,
    /\.dim-panel \.dim-removeDialog p \{[^}]*font-size: (?:1[0-24-9]|[2-9])\d*px/,
    'dialog body does not override the 13px confirm copy',
  );
});

test('narrow and coarse media blocks lift hub close, scan, display-name, and quiet QR cancel', async () => {
  const [styles, dingtalkStyles] = await Promise.all([
    readFile(STYLES_URL, 'utf8'),
    readFile(DINGTALK_STYLES_URL, 'utf8'),
  ]);

  assert.match(styles, /\.dim-panel \.dim-botNameInput \{[^}]*min-height: 32px/);
  assert.match(dingtalkStyles, /\.ddt-button\[data-kind="quiet"\] \{[^}]*min-height: 30px/);

  for (const query of ['max-width: 768px', 'pointer: coarse']) {
    const block = cssMediaBlock(styles, query);
    assert.match(
      block,
      /\.dim-hubClose \{[^}]*width: 44px;[^}]*min-width: 44px;[^}]*height: 44px/,
      `${query} sizes the hub close control to 44×44`,
    );
    assert.match(
      block,
      /\.dim-panel \.bxf-headingTools \.dim-scanButton, \.dim-panel \.dxw-tools \.dim-scanButton, \.dim-panel \.ddt-tools \.dim-scanButton \{[^}]*min-height: 44px/,
      `${query} lifts heading scan buttons above the 36px compact rule`,
    );
    assert.match(
      block,
      /\.dim-panel \.dim-botNameInput \{[^}]*min-height: 44px/,
      `${query} lifts the display-name field`,
    );
    assert.match(
      block,
      /\.dim-panel :is\(\.bxf-button, \.dxw-button, \.ddt-button\)\[data-kind="quiet"\] \{[^}]*min-height: 44px/,
      `${query} beats channel quiet 30px on QR cancel`,
    );
  }
});
