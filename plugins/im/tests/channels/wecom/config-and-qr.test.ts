// @ts-nocheck
import { onTestFinished, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  deriveWecomBotIdentity,
  WecomConfigStore,
} from '../../../src/channels/wecom/config-store.ts';
import { WecomQrAuth } from '../../../src/channels/wecom/qr-auth.ts';
import { WecomStateStore } from '../../../src/channels/wecom/state-store.ts';
import { connectionTestTarget } from '../../../src/channels/shared/connection-test.ts';

test('Enterprise WeChat config stores only non-secret bot identity with mode 0600', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-im-wecom-config-'));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'config.json');
  const identity = deriveWecomBotIdentity('bot-enterprise-1');
  const store = await new WecomConfigStore(path).load();
  await store.save({
    ...identity,
    remoteBotId: 'bot-enterprise-1',
    createdAt: '2026-08-15T00:00:00.000Z',
  });
  const document = await readFile(path, 'utf8');
  assert.match(document, /bot-enterprise-1/);
  assert.doesNotMatch(document, /private-secret|"secret"/);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.equal(store.get(identity.botId).remoteBotId, 'bot-enterprise-1');
});

test('Enterprise WeChat QR auth uses fixed official endpoints and returns credentials only after success', async () => {
  const requests = [];
  const replies = [
    { data: { scode: 'opaque-scode', auth_url: 'https://work.weixin.qq.com/ai/qc/auth?ticket=opaque' } },
    { data: { status: 'init' } },
    { data: { status: 'success', bot_info: { botid: 'bot-enterprise-1', secret: 'private-secret', name: '企微客服' } } },
  ];
  const auth = new WecomQrAuth({
    clock: () => 1_000,
    fetch: async (url, options) => {
      requests.push({ url: String(url), options });
      return { ok: true, status: 200, json: async () => replies.shift() };
    },
  });
  const started = await auth.start();
  assert.equal(started.verificationUrl, 'https://work.weixin.qq.com/ai/qc/auth?ticket=opaque');
  assert.equal(started.expiresAt, 301_000);
  assert.equal(await auth.poll({ scode: started.scode }).then((value) => value.status), 'waiting');
  const completed = await auth.poll({ scode: started.scode });
  assert.deepEqual(completed, {
    status: 'success',
    remoteBotId: 'bot-enterprise-1',
    secret: 'private-secret',
    name: '企微客服',
  });
  assert.match(requests[0].url, /^https:\/\/work\.weixin\.qq\.com\/ai\/qc\/generate\?/);
  assert.match(requests[0].url, /source=deepseek-harness/);
  assert.match(requests[1].url, /^https:\/\/work\.weixin\.qq\.com\/ai\/qc\/query_result\?/);
  assert.equal(requests.every(({ options }) => options.redirect === 'error'), true);
});

test('Enterprise WeChat QR auth rejects an authorization URL outside the official host', async () => {
  const auth = new WecomQrAuth({
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { scode: 'opaque', auth_url: 'https://example.com/steal' } }),
    }),
  });
  await assert.rejects(() => auth.start(), /invalid data/);
});

test('Enterprise WeChat state store snapshots session bindings for IM follow', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-im-wecom-follow-'));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'state.json');
  const state = await new WecomStateStore(path).load();
  await state.setSession('__follow__', 'session-wecom');
  assert.equal(state.snapshot().sessions.__follow__, 'session-wecom');
  const restored = await new WecomStateStore(path).load();
  assert.equal(restored.snapshot().sessions.__follow__, 'session-wecom');
});

test('Enterprise WeChat state store keeps the last private chat for connection tests', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-im-wecom-state-'));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'state.json');
  const state = await new WecomStateStore(path).load();
  await state.setConnectionTestTarget({ chatId: 'member-private' });
  assert.deepEqual(state.getConnectionTestTarget(), { chatId: 'member-private' });

  const restored = await new WecomStateStore(path).load();
  assert.deepEqual(connectionTestTarget(restored), { chatId: 'member-private' });
});
