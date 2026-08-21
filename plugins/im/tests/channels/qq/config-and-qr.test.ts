// @ts-nocheck
import { onTestFinished, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { deriveQqBotIdentity, QqConfigStore } from '../../../src/channels/qq/config-store.ts';
import { QqQrAuth } from '../../../src/channels/qq/qr-auth.ts';

test('QQ config stores only non-secret bot identity with mode 0600', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-im-qq-config-'));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'config.json');
  const identity = deriveQqBotIdentity('102345678');
  const store = await new QqConfigStore(path).load();
  await store.save({
    ...identity,
    appId: '102345678',
    ownerUserOpenid: 'owner-openid',
    createdAt: '2026-08-15T00:00:00.000Z',
  });
  const document = await readFile(path, 'utf8');
  assert.match(document, /102345678/);
  assert.match(document, /owner-openid/);
  assert.doesNotMatch(document, /appSecret|private-secret/);
  assert.deepEqual(store.get(identity.botId), {
    ...identity,
    appId: '102345678',
    ownerUserOpenid: 'owner-openid',
    createdAt: '2026-08-15T00:00:00.000Z',
    connectedAt: null,
  });
});

test('QQ QR wrapper disables console output and identifies DeepSeek Harness', () => {
  let observed;
  const auth = new QqQrAuth({
    start(callbacks, options) {
      observed = { callbacks, options };
      return () => {};
    },
  });
  const callbacks = { onSuccess() {}, onFailure() {} };
  const signal = new AbortController().signal;
  const dispose = auth.start(callbacks, { signal });
  assert.equal(typeof dispose, 'function');
  assert.equal(observed.callbacks, callbacks);
  assert.deepEqual(observed.options, {
    displayQrCodeToConsole: false,
    source: 'deepseek-harness',
    signal,
  });
});
