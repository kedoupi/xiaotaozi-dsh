// @ts-nocheck
import { test } from 'vitest';
import assert from 'node:assert/strict';

import { normalizeTelegramAllowedUsers } from '../../../src/host/channels/telegram/production.ts';

test('Telegram per-bot policy normalizes and validates private-message allowlists', () => {
  assert.deepEqual(normalizeTelegramAllowedUsers(undefined), []);
  assert.deepEqual(
    normalizeTelegramAllowedUsers([6087707998, '1202499116', '6087707998']),
    ['6087707998', '1202499116'],
  );
  assert.throws(
    () => normalizeTelegramAllowedUsers('6087707998'),
    /must be an array/,
  );
  assert.throws(
    () => normalizeTelegramAllowedUsers([0, '-100123', 'username']),
    /invalid Telegram User ID/,
  );
});

test('workspace RPC binds by project id and fails closed on paths and stale ids', async () => {
  const { createTokenBotRpcHandler } = await import('../../../src/host/channels/shared/rpc.ts');
  const calls = [];
  const base = {
    status: async () => ({ bots: [] }),
    bindCredentials: async () => ({ bots: [] }),
    reconnectBot: async () => ({ bots: [] }),
    deleteBot: async () => ({ bots: [] }),
  };
  const handler = createTokenBotRpcHandler({
    ...base,
    updateWorkspace: async (botId, workspaceId) => {
      calls.push({ botId, workspaceId });
      return { bots: [{ botId, connected: true }] };
    },
  }, { channel: 'Telegram' });

  const accepted = await handler('bot.workspace.set', {
    botId: 'tg_bot', workspaceId: 'project-alpha',
  });
  assert.equal(accepted.ok, true);
  assert.deepEqual(calls, [{ botId: 'tg_bot', workspaceId: 'project-alpha' }]);

  for (const payload of [
    { botId: 'tg_bot', workspace: '/tmp/project' },
    { botId: 'tg_bot', workspaceId: 'project-alpha', path: '/tmp/project' },
  ]) {
    const rejected = await handler('bot.workspace.set', payload);
    assert.equal(rejected.ok, false, JSON.stringify(payload));
    assert.equal(rejected.error.code, 'invalid-payload');
  }
  assert.equal(calls.length, 1);

  const staleHandler = createTokenBotRpcHandler({
    ...base,
    updateWorkspace: async () => {
      const error = new Error('这个项目已不存在。请刷新后重新选择 Web 中已有项目。');
      error.code = 'workspace-project-not-found';
      throw error;
    },
  }, { channel: 'Telegram' });
  const stale = await staleHandler('bot.workspace.set', {
    botId: 'tg_bot', workspaceId: 'project-deleted',
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, 'workspace-project-not-found');
});
