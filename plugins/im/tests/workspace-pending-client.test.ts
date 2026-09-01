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
  const project = {
    workspaceId: 'project-alpha',
    workspaceTitle: 'Alpha project',
    workspace: '/workspace/default',
  };
  const pending = workspacePending === undefined ? {} : { workspacePending };
  const tokenApi = createTokenChannelApi('Discord', ' Gateway 长连接');
  return [
    normalizeDingtalk({ bots: [{ ...rows.dingtalk, ...project, ...pending }] }).bots[0],
    normalizeQq({ bots: [{ ...rows.qq, ...project, ...pending }] }).bots[0],
    normalizeWhatsapp({ bots: [{ ...rows.whatsapp, ...project, ...pending }] }).bots[0],
    tokenApi.normalizeSnapshot({ bots: [{ ...rows.token, ...project, ...pending }] }).bots[0],
    normalizeWeixin({ bots: [{ ...rows.weixin, ...project, ...pending }] }).bots[0],
    normalizeWecom({ bots: [{ ...rows.wecom, ...project, ...pending }] }).bots[0],
    normalizeFeishu({ schemaVersion: 2, bots: [{ ...rows.feishu, ...project, ...pending }] }).bots[0],
  ];
}

test('workspace-capable client normalizers preserve Host project identity and pending state', () => {
  const bots = normalizedBots(true);
  assert.deepEqual(bots.map((bot) => bot.workspaceId), Array(7).fill('project-alpha'));
  assert.deepEqual(bots.map((bot) => bot.workspaceTitle), Array(7).fill('Alpha project'));
  assert.deepEqual(bots.map((bot) => bot.workspace), Array(7).fill('/workspace/default'));
  assert.deepEqual(bots.map((bot) => bot.workspacePending), Array(7).fill(true));
});

test('missing project fields normalize to null while missing workspacePending normalizes to false', () => {
  const bots = normalizedBots(undefined).map((bot) => ({
    ...bot,
    workspaceId: undefined,
    workspaceTitle: undefined,
  }));
  const empty = normalizedBots(undefined);
  assert.deepEqual(empty.map((bot) => bot.workspacePending), Array(7).fill(false));

  const tokenApi = createTokenChannelApi('Discord', ' Gateway 长连接');
  const values = [
    normalizeDingtalk({ bots: [rows.dingtalk] }).bots[0],
    normalizeQq({ bots: [rows.qq] }).bots[0],
    normalizeWhatsapp({ bots: [rows.whatsapp] }).bots[0],
    tokenApi.normalizeSnapshot({ bots: [rows.token] }).bots[0],
    normalizeWeixin({ bots: [rows.weixin] }).bots[0],
    normalizeWecom({ bots: [rows.wecom] }).bots[0],
    normalizeFeishu({ schemaVersion: 2, bots: [rows.feishu] }).bots[0],
  ];
  assert.deepEqual(values.map((bot) => bot.workspaceId), Array(7).fill(null));
  assert.deepEqual(values.map((bot) => bot.workspaceTitle), Array(7).fill(null));
});
