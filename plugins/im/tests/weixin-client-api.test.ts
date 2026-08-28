// @ts-nocheck
import { onTestFinished, test, vi } from 'vitest';
import assert from 'node:assert/strict';

import {
  normalizeProvisioning,
  normalizeSnapshot,
  presentError,
  safeQrSource,
  safeVerificationUrl,
  unwrapRpcResult,
} from '../src/client/channels/weixin/api.ts';

test('client normalizes the exact redacted Host account view', () => {
  const snapshot = normalizeSnapshot({
    schemaVersion: 1,
    revision: 5,
    bots: [{
      botId: 'wx_safe',
      state: 'connected',
      connected: true,
      configured: true,
      bot: { name: '微信机器人', accountIdMasked: 'abc••••bot' },
      health: { status: 'healthy', summary: '正常', lastCheckedAt: 123 },
      stats: { messagesReceived: 3, messagesReplied: 2 },
      token: 'host-secret-that-must-be-dropped',
    }],
  });
  assert.equal(snapshot.totals.connected, 1);
  assert.doesNotMatch(JSON.stringify(snapshot), /host-secret|token/);
});

test('client accepts only image data URLs and Tencent Weixin HTTPS links', () => {
  assert.match(safeQrSource('data:image/png;base64,AAAA'), /^data:image/);
  assert.equal(safeQrSource('javascript:alert(1)'), undefined);
  assert.equal(safeVerificationUrl('https://liteapp.weixin.qq.com/q/test'), 'https://liteapp.weixin.qq.com/q/test');
  assert.equal(safeVerificationUrl('https://liteapp.wechat.com/q/test'), 'https://liteapp.wechat.com/q/test');
  assert.equal(safeVerificationUrl('https://attacker.test/q/test'), undefined);
  assert.equal(safeVerificationUrl('https://wechat.com.attacker.test/q/test'), undefined);
});

test('client preserves verification-required provisioning without accepting unknown states', () => {
  const value = normalizeProvisioning({
    attemptId: 'attempt',
    status: 'needs_verification',
    expiresAt: Date.now() + 1000,
    verificationRequired: true,
  });
  assert.equal(value.status, 'needs_verification');
  assert.equal(value.verificationRequired, true);
  assert.equal(normalizeProvisioning({ attemptId: 'attempt', status: 'mystery' }).status, 'failed');
});

test('RPC errors are surfaced with their safe code', () => {
  assert.throws(
    () => unwrapRpcResult({ ok: false, error: { code: 'safe-code', message: '安全消息' } }),
    (error) => error.code === 'safe-code' && error.message === '安全消息',
  );
});

test('RPC and presentation errors are sanitized before reaching the browser', () => {
  assert.throws(
    () => unwrapRpcResult({
      ok: false,
      error: {
        code: 'accessToken=should-not-escape',
        message: 'access_token=super-secret-value',
      },
    }),
    (error) => error.code === 'WEIXIN_RPC_ERROR'
      && error.message === '微信操作失败'
      && !error.message.includes('super-secret-value'),
  );

  assert.deepEqual(
    presentError({ code: 'UPSTREAM_FAILED', message: 'accessToken: visible-value' }),
    { code: 'UPSTREAM_FAILED', message: '微信操作失败，请稍后重试' },
  );
  assert.doesNotMatch(
    presentError({ code: 'UPSTREAM_FAILED', message: 'endpoint=http://10.0.0.1 failed' }).message,
    /10\.0\.0\.1/,
  );

  const snapshot = normalizeSnapshot({
    schemaVersion: 1,
    revision: 1,
    bots: [{
      botId: 'wx_leaky',
      state: 'error',
      connected: false,
      configured: true,
      bot: { name: '微信机器人', accountIdMasked: 'abc••••bot' },
      error: { code: 'runtime-error', message: 'secret_ref=raw-leaked-value expired' },
    }],
  });
  assert.doesNotMatch(JSON.stringify(snapshot), /raw-leaked-value/);
  assert.equal(snapshot.bots[0].error.message, '微信连接未就绪');
});
