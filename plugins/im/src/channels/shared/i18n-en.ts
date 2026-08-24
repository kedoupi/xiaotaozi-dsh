// @ts-nocheck
// English translations for host-side user-facing text.
// Keys are the exact Chinese literals passed to t() in src/channels/**.
// Chinese output is the identity default and needs no entries here.
// Entries are maintained per area in ./i18n-en/*.mjs and merged here.

import sharedA from './i18n-en/shared-a.ts';
import sharedB from './i18n-en/shared-b.ts';
import sharedC from './i18n-en/shared-c.ts';
import feishu from './i18n-en/feishu.ts';
import dingtalk from './i18n-en/dingtalk.ts';
import wecom from './i18n-en/wecom.ts';
import qq from './i18n-en/qq.ts';
import weixin from './i18n-en/weixin.ts';
import slack from './i18n-en/slack.ts';
import telegram from './i18n-en/telegram.ts';
import discord from './i18n-en/discord.ts';
import whatsapp from './i18n-en/whatsapp.ts';
import office from './i18n-en/office.ts';

export const EN = Object.freeze(Object.assign(
  {},
  sharedA,
  sharedB,
  sharedC,
  feishu,
  dingtalk,
  wecom,
  qq,
  weixin,
  slack,
  telegram,
  discord,
  whatsapp,
  office,
));
