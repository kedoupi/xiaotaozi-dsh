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

test('QQ config represents an unpaired manual bot with no owner instead of wildcard access', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-im-qq-unpaired-config-'));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'config.json');
  const identity = deriveQqBotIdentity('102345679');
  const store = await new QqConfigStore(path).load();
  await store.save({
    ...identity,
    appId: '102345679',
    ownerUserOpenid: null,
    createdAt: '2026-08-15T00:00:00.000Z',
  });

  const document = await readFile(path, 'utf8');
  assert.match(document, /"ownerUserOpenid": null/);
  assert.doesNotMatch(document, /"ownerUserOpenid": "\*"/);
  assert.equal(store.get(identity.botId).ownerUserOpenid, null);
});

test('QQ QR wrapper disables console output and passes the QR source tag', () => {
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

test('QQ QR wrapper fails safely when the optional connector is unavailable', async () => {
  const failure = new Promise((resolve) => {
    const auth = new QqQrAuth({
      load: async () => { throw new Error('optional connector missing'); },
    });
    auth.start({ onSuccess() {}, onFailure: resolve });
  });
  const error = await failure;
  assert.equal(error.message, 'optional connector missing');
});
