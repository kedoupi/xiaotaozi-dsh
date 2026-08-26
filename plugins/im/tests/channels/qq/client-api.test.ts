// @ts-nocheck
import { onTestFinished, test, vi } from 'vitest';
import assert from 'node:assert/strict';

import {
  connectionTestFeedback,
  normalizeProvisioning,
  normalizeSnapshot,
  presentError,
  safeQrSource,
  unwrapRpcResult,
} from '../../../src/client/channels/qq/api.ts';

test('QQ client keeps only redacted bot and host-rendered QR state', () => {
  const qr = 'data:image/png;base64,YWJjZA==';
  assert.equal(safeQrSource(qr), qr);
  const provision = normalizeProvisioning({
    attemptId: 'attempt_1', status: 'pending', expiresAt: Date.now() + 1_000, qrCodeDataUrl: qr,
  });
  assert.equal(provision.qrCodeDataUrl, qr);
  const snapshot = normalizeSnapshot({
    bots: [{
      botId: 'qq_abc', connected: true, state: 'connected',
      bot: { name: 'QQ机器人', appIdMasked: '123••••456' },
      health: { summary: '运行正常' },
    }],
  });
  assert.equal(snapshot.totals.connected, 1);
  assert.equal(snapshot.bots[0].bot.appIdMasked, '123••••456');
});

test('QQ RPC and presentation errors are sanitized before reaching the browser', () => {
  assert.equal(unwrapRpcResult({ ok: true, value: { ready: true } }).ready, true);
  assert.throws(
    () => unwrapRpcResult({
      ok: false,
      error: {
        code: 'appSecret=should-not-escape',
        message: 'app_secret=super-secret-value',
      },
    }),
    (error) => error.code === 'QQ_RPC_ERROR'
      && error.message === 'QQ 操作失败'
      && !error.message.includes('super-secret-value'),
  );
  assert.throws(
    () => unwrapRpcResult({ ok: false, error: { code: 'safe-code', message: '安全消息' } }),
    (error) => error.code === 'safe-code' && error.message === '安全消息',
  );

  assert.deepEqual(
    presentError({ code: 'UPSTREAM_FAILED', message: 'accessToken: visible-value' }),
    { code: 'UPSTREAM_FAILED', message: 'QQ 操作失败，请稍后重试' },
  );
  assert.doesNotMatch(
    presentError({ code: 'UPSTREAM_FAILED', message: 'endpoint=http://10.0.0.1 failed' }).message,
    /10\.0\.0\.1/,
  );

  const snapshot = normalizeSnapshot({
    bots: [{
      botId: 'qq_leaky',
      connected: false,
      state: 'error',
      bot: { name: 'QQ机器人', appIdMasked: 'app••••1' },
      error: { code: 'runtime-error', message: 'access_token=raw-leaked-value expired' },
    }],
  });
  assert.doesNotMatch(JSON.stringify(snapshot), /raw-leaked-value/);
  assert.equal(snapshot.bots[0].error.message, 'QQ 连接尚未就绪');
});

test('QQ client normalizes and presents connection-test outcomes', () => {
  const sent = normalizeSnapshot({ bots: [], testMessage: { sent: true, code: 'ignored' } });
  assert.deepEqual(sent.testMessage, { sent: true });
  assert.equal(
    connectionTestFeedback(sent.testMessage),
    '测试消息已发送，请到对应机器人会话中确认。',
  );

  const unavailable = normalizeSnapshot({
    bots: [], testMessage: { sent: false, code: 'test-target-unavailable' },
  });
  assert.deepEqual(unavailable.testMessage, {
    sent: false, code: 'test-target-unavailable',
  });
  assert.equal(
    connectionTestFeedback(unavailable.testMessage),
    '连接检查完成。请先在会话里给这个机器人发一条消息，然后再点检查连接。',
  );

  const invalid = normalizeSnapshot({
    bots: [], testMessage: { sent: false, code: 'private-provider-error' },
  });
  assert.deepEqual(invalid.testMessage, { sent: false, code: 'test-message-failed' });
  assert.equal(
    connectionTestFeedback(invalid.testMessage),
    '连接检查完成。无法主动发送测试消息，请先在会话里发一条，然后再点检查连接。',
  );
  assert.equal(connectionTestFeedback(undefined), null);
});
