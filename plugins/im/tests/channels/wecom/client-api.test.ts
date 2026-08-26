// @ts-nocheck
import { onTestFinished, test, vi } from 'vitest';
import assert from 'node:assert/strict';

import {
  normalizeSnapshot,
  presentError,
  unwrapRpcResult,
} from '../../../src/client/channels/wecom/api.ts';

test('Enterprise WeChat RPC errors are sanitized before reaching the browser', () => {
  assert.equal(unwrapRpcResult({ ok: true, value: { ready: true } }).ready, true);
  assert.throws(
    () => unwrapRpcResult({
      ok: false,
      error: {
        code: 'clientSecret=should-not-escape',
        message: 'client_secret=super-secret-value',
      },
    }),
    (error) => error.code === 'WECOM_RPC_ERROR'
      && error.message === '企业微信操作失败'
      && !error.message.includes('super-secret-value'),
  );
  assert.throws(
    () => unwrapRpcResult({ ok: false, error: { code: 'safe-code', message: '安全消息' } }),
    (error) => error.code === 'safe-code' && error.message === '安全消息',
  );
});

test('Enterprise WeChat presentation and snapshot errors stay redacted', () => {
  assert.deepEqual(
    presentError({ code: 'UPSTREAM_FAILED', message: 'accessToken: visible-value' }),
    { code: 'UPSTREAM_FAILED', message: '企业微信操作失败，请稍后重试' },
  );
  assert.doesNotMatch(
    presentError({ code: 'UPSTREAM_FAILED', message: 'endpoint=http://10.0.0.1 failed' }).message,
    /10\.0\.0\.1/,
  );

  const snapshot = normalizeSnapshot({
    bots: [{
      botId: 'wecom_leaky',
      connected: false,
      state: 'error',
      bot: { name: '企业微信机器人', appIdMasked: 'app••••1' },
      error: { code: 'runtime-error', message: 'app_secret=raw-leaked-value expired' },
    }],
  });
  assert.doesNotMatch(JSON.stringify(snapshot), /raw-leaked-value/);
  assert.equal(snapshot.bots[0].error.message, '企业微信连接尚未就绪');
});
