// @ts-nocheck
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { normalizeSnapshot as normalizeDingtalk } from '../src/client/channels/dingtalk/api.ts';
import { normalizeSnapshot as normalizeQq } from '../src/client/channels/qq/api.ts';
import { normalizeSnapshot as normalizeWhatsapp } from '../src/client/channels/whatsapp/api.ts';
import { createTokenChannelApi } from '../src/client/channels/shared/token-api.ts';
import { normalizeSnapshot as normalizeWeixin } from '../src/client/channels/weixin/api.ts';
import { normalizeSnapshot as normalizeWecom } from '../src/client/channels/wecom/api.ts';
import { normalizeBotsSnapshot as normalizeFeishu } from '../src/client/channels/feishu/api.ts';

const rows = {
  dingtalk: { botId: 'ding_test', connected: false, state: 'connecting', bot: { name: 'Ding' } },
  qq: { botId: 'qq_test', connected: false, state: 'connecting', bot: { name: 'QQ' } },
  whatsapp: { botId: 'wa_test', connected: false, state: 'connecting', bot: { name: 'WA' } },
  token: { botId: 'token_test', connected: false, state: 'connecting', bot: { name: 'Token' } },
  weixin: { botId: 'wx_test', connected: false, state: 'connecting', configured: true, bot: { name: 'WX' } },
  wecom: { botId: 'wecom_test', connected: false, state: 'connecting', bot: { name: 'WeCom' } },
  feishu: { botId: 'feishu_test', connected: false, state: 'connecting', configured: true, bot: { name: 'Feishu' } },
};

function normalizedBots(workspacePending) {
  const workspace = '/workspace/default';
  const pending = workspacePending === undefined ? {} : { workspacePending };
  const tokenApi = createTokenChannelApi('Discord', ' Gateway 长连接');
  return [
    normalizeDingtalk({ bots: [{ ...rows.dingtalk, workspace, ...pending }] }).bots[0],
    normalizeQq({ bots: [{ ...rows.qq, workspace, ...pending }] }).bots[0],
    normalizeWhatsapp({ bots: [{ ...rows.whatsapp, workspace, ...pending }] }).bots[0],
    tokenApi.normalizeSnapshot({ bots: [{ ...rows.token, workspace, ...pending }] }).bots[0],
    normalizeWeixin({ bots: [{ ...rows.weixin, workspace, ...pending }] }).bots[0],
    normalizeWecom({ bots: [{ ...rows.wecom, workspace, ...pending }] }).bots[0],
    normalizeFeishu({ schemaVersion: 2, bots: [{ ...rows.feishu, workspace, ...pending }] }).bots[0],
  ];
}

test('workspace-capable client normalizers preserve Host pending state', () => {
  assert.deepEqual(normalizedBots(true).map((bot) => bot.workspacePending), Array(7).fill(true));
});

test('missing workspacePending normalizes to false', () => {
  assert.deepEqual(normalizedBots(undefined).map((bot) => bot.workspacePending), Array(7).fill(false));
});
