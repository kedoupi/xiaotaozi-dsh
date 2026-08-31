// @ts-nocheck
import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  OFFICE_STATUS_ROUTE,
  callOffice,
  normalizeOfficeStatus,
  officeErrorMessage,
} from '../../../src/client/channels/wecom/office-api.ts';

test('normalizeOfficeStatus keeps only safe browser fields', () => {
  const status = normalizeOfficeStatus({
    ok: true,
    cliInstalled: true,
    mainStatus: 'active',
    activeBotId: 'wecom_a',
    authorized: true,
    allowWrite: false,
    cliPath: 'wecom-cli',
    configDir: '/safe/path',
    bots: [{ botId: 'wecom_a', remoteBotId: 'raw_remote_id', secretRef: 'secret://wecom/a' }],
    secretRef: 'secret://wecom/a',
    remoteBotId: 'raw_remote_id',
    selectedBotId: 'wecom_a',
    qr: { qrCodeDataUrl: 'data:image/png;base64,AAAA' },
  });
  assert.equal(status.activeBotId, 'wecom_a');
  assert.equal(status.allowWrite, false);
  assert.equal(status.ok, true);
  assert.deepEqual(Object.keys(status).sort(), [
    'activeBotId', 'allowWrite', 'authorized', 'cliInstalled', 'cliPath', 'configDir', 'mainStatus', 'ok',
  ]);
  assert.doesNotMatch(JSON.stringify(status), /secretRef|raw_remote_id|secret:\/\/|qrCodeDataUrl/);
});

test('normalizeOfficeStatus rejects non-status payloads', () => {
  assert.throws(() => normalizeOfficeStatus({ ok: false }));
  assert.throws(() => normalizeOfficeStatus(null));
  assert.throws(() => normalizeOfficeStatus('active'));
  assert.throws(() => normalizeOfficeStatus({ ok: true }));
});

test('normalizeOfficeStatus accepts a failed snapshot with a cleaned public error', () => {
  const status = normalizeOfficeStatus({
    ok: false,
    cliInstalled: true,
    mainStatus: 'active',
    activeBotId: 'wecom_a',
    authorized: true,
    allowWrite: true,
    cliPath: 'wecom-cli',
    configDir: '/safe/path',
    bots: [],
    lastError: { code: 'auth-failed', message: '目标机器人授权失败，请重试。' },
  });
  assert.equal(status.ok, false);
  assert.equal(status.activeBotId, 'wecom_a');
  assert.deepEqual(status.lastError, { code: 'auth-failed', message: '目标机器人授权失败，请重试。' });
});

test('normalizeOfficeStatus never echoes secrets inside a public error', () => {
  const status = normalizeOfficeStatus({
    ok: false,
    cliInstalled: true,
    mainStatus: 'activate-failed',
    activeBotId: '',
    authorized: false,
    allowWrite: false,
    cliPath: 'wecom-cli',
    configDir: '/safe/path',
    bots: [],
    lastError: { code: 'secret-ref-missing', message: 'secretRef=secret://wecom/a token: abc123' },
  });
  assert.equal(status.activeBotId, null);
  assert.ok(status.lastError);
  assert.doesNotMatch(status.lastError.message, /secret:\/\/|abc123|secretRef|token/i);
  assert.doesNotMatch(status.lastError.code, /secret/i);
});

function jsonResponse(body, { failJson = false } = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => {
      if (failJson) throw new Error('invalid json');
      return body;
    },
  };
}

function validSnapshot(overrides = {}) {
  return {
    ok: true,
    cliInstalled: true,
    mainStatus: 'active',
    activeBotId: 'wecom_a',
    authorized: true,
    allowWrite: true,
    cliPath: 'wecom-cli',
    configDir: '/safe/path',
    bots: [],
    ...overrides,
  };
}

test('callOffice posts the action to the loopback office route with the IM hint', async () => {
  const seen = [];
  const fakeFetch = async (url, init) => {
    seen.push({ url, init });
    return jsonResponse(validSnapshot());
  };
  const status = await callOffice('activate', { botId: 'wecom_a' }, fakeFetch);
  assert.equal(status.activeBotId, 'wecom_a');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, OFFICE_STATUS_ROUTE);
  assert.equal(seen[0].url, '/_dsh/dsh-wecom-office/status');
  assert.equal(seen[0].init.method, 'POST');
  assert.equal(seen[0].init.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(seen[0].init.body), {
    action: 'activate',
    botId: 'wecom_a',
    imAvailableHint: true,
  });
});

test('callOffice defaults to a status action with an empty payload', async () => {
  const seen = [];
  const fakeFetch = async (url, init) => {
    seen.push({ url, init });
    return jsonResponse(validSnapshot());
  };
  await callOffice('status', {}, fakeFetch);
  assert.deepEqual(JSON.parse(seen[0].init.body), { action: 'status', imAvailableHint: true });
});

test('callOffice rejects non-JSON and non-status payloads without echoing forbidden fields', async () => {
  await assert.rejects(
    () => callOffice('status', {}, async () => jsonResponse(null, { failJson: true })),
    /企业微信办公/,
  );
  await assert.rejects(
    () => callOffice('status', {}, async () => jsonResponse({ ok: false })),
    /企业微信办公/,
  );
  await assert.rejects(
    () => callOffice('status', {}, async () => jsonResponse({
      ok: false,
      error: 'secretRef=secret://wecom/a token: abc123',
    })),
    (error) => {
      assert.doesNotMatch(error.message, /secret:\/\/|abc123|secretRef|token/i);
      return true;
    },
  );
  await assert.rejects(
    () => callOffice('status', {}, async () => { throw new Error('network down'); }),
    /企业微信办公/,
  );
});

test('officeErrorMessage keeps clean messages and masks forbidden ones', () => {
  assert.equal(officeErrorMessage(new Error('目标机器人授权失败')), '目标机器人授权失败');
  const masked = officeErrorMessage(new Error('secretRef=secret://wecom/a'));
  assert.doesNotMatch(masked, /secret:\/\/|secretRef/i);
  assert.equal(officeErrorMessage(undefined), '企业微信办公操作失败，请稍后重试。');
});
