// @ts-nocheck
import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  classifyMessageFailure,
  messageFailureText,
  publicMessageFailure,
} from '../src/channels/shared/message-failure.ts';

const options = { referenceId: 'MF-TEST01', at: 123 };

test('message failures distinguish stable Harness transport errors', () => {
  assert.equal(classifyMessageFailure({
    code: 'harness-connect-failed', method: 'host.describe',
  }, options).code, 'HARNESS_CONNECT');
  assert.equal(classifyMessageFailure({
    code: 'harness-connect-failed', method: 'session.history',
  }, options).code, 'HARNESS_RESULT_UNCERTAIN');
  assert.equal(classifyMessageFailure({
    code: 'harness-timeout', method: 'session.prompt',
  }, options).code, 'HARNESS_RESULT_UNCERTAIN');
  assert.equal(classifyMessageFailure({
    code: 'harness-auth-required', method: 'host.describe',
  }, options).code, 'HARNESS_ACCESS');
  assert.equal(classifyMessageFailure({
    code: 'harness-api-not-found', method: 'session.history',
  }, options).code, 'HARNESS_PROTOCOL');
});

test('message failures use verified turn-end provider codes without exposing provider detail', () => {
  for (const [providerCode, code] of [
    ['AUTH', 'MODEL_AUTH'],
    ['QUOTA', 'MODEL_QUOTA'],
    ['RATE_LIMIT', 'MODEL_RATE_LIMIT'],
    ['CONTEXT_WINDOW_EXCEEDED', 'MODEL_CONTEXT_LIMIT'],
    ['UNKNOWN_MODEL', 'MODEL_UNAVAILABLE'],
    ['TIMEOUT', 'MODEL_TIMEOUT'],
    ['TRANSPORT', 'MODEL_TRANSPORT'],
    ['SERVER', 'MODEL_SERVICE'],
    ['STREAM_CLOSED', 'MODEL_STREAM'],
    ['EMPTY_RESPONSE', 'MODEL_EMPTY_REPLY'],
    ['CONTENT_FILTER', 'MODEL_CONTENT_REJECTED'],
  ]) {
    const failure = classifyMessageFailure({
      code: 'harness-turn-failed',
      providerCode,
      message: 'provider-token /private/path',
      reason: { error: { message: 'secret provider payload' } },
    }, options);
    assert.equal(failure.code, code);
    assert.doesNotMatch(JSON.stringify(failure), /provider-token|private|secret provider/);
  }

  assert.equal(classifyMessageFailure({
    code: 'channel-send-failed', providerCode: 'RATE_LIMIT', status: 429,
  }, options).code, 'CHANNEL_RATE_LIMIT');
  assert.equal(classifyMessageFailure({
    code: 'harness-turn-failed', providerCode: 'PRIVATE_PROVIDER_CODE',
  }, options).code, 'INTERNAL_UNKNOWN');
});

test('message failure text contains a safe code and traceable reference', () => {
  const failure = classifyMessageFailure(new Error('secret-shaped internal detail'), options);
  assert.deepEqual(failure, {
    code: 'INTERNAL_UNKNOWN',
    reason: 'INTERNAL_UNKNOWN',
    message: '任务未完成。请不要在同一会话里连点重试；请先 /stop，再开新会话后重试。若持续发生，把参考号给管理员。',
    referenceId: 'MF-TEST01',
    at: 123,
  });
  assert.match(messageFailureText(failure), /错误码：INTERNAL_UNKNOWN；参考号：MF-TEST01/);
  assert.doesNotMatch(messageFailureText(failure), /secret-shaped/);
});

test('workspace failures describe projects, never paths or workspaces', () => {
  const failure = classifyMessageFailure({ code: 'workspace-project-not-found' }, options);
  assert.equal(failure.code, 'WORKSPACE_UNAVAILABLE');
  assert.equal(failure.message, '当前项目不存在或暂不可用。请重新选择项目后重试。');
  assert.doesNotMatch(failure.message, /工作区|路径/);
});

test('tool_calls history errors tell the user to start a new session', () => {
  const failure = classifyMessageFailure({
    message: "An assistant message with 'tool_calls' must be followed by tool messages responding to each 'tool_call_id'.",
  }, options);
  assert.equal(failure.code, 'TURN_HISTORY_INVALID');
  assert.match(failure.message, /开新会话/);
});

test('public message failure keeps only bounded safe fields', () => {
  assert.deepEqual(publicMessageFailure({
    ...classifyMessageFailure({ code: 'agent-busy' }, options),
    providerDetail: 'secret',
    stack: '/private/path',
  }), {
    code: 'SESSION_BUSY',
    reason: 'SESSION_BUSY',
    message: '当前会话仍在处理上一项任务。请等待完成，或发送 /stop 后重试。',
    referenceId: 'MF-TEST01',
    at: 123,
  });
});

test('artifact permission failures use the shared channel permission classification', () => {
  const error = new Error('private provider permission detail');
  error.code = 'artifact-permission-required';

  const failure = classifyMessageFailure(error, {
    userMessage: '结果文件已生成，但机器人没有文件发送权限。',
    reason: error.code,
    referenceId: 'MF-ART12345',
    at: 123,
  });

  assert.deepEqual(failure, {
    code: 'CHANNEL_PERMISSION',
    reason: 'ARTIFACT_PERMISSION_REQUIRED',
    message: '结果文件已生成，但机器人没有文件发送权限。',
    referenceId: 'MF-ART12345',
    at: 123,
  });
});
