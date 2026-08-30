// @ts-nocheck
import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';
import {
  STOP_REPLY_ACTION,
  STREAM_ELEMENT_ID,
  buildStreamingReplyCard,
  cardActionCallbackCard,
  headerTemplateForReplyStatus,
  nextReplyCardBody,
  parseStopReplyAction,
  stopReplyKeyAllowed,
  summaryForReplyCard,
  titleForReplyStatus,
} from '../../../src/channels/feishu/feishu-reply-card.ts';
import { setImHostLanguage } from '../../../src/channels/shared/i18n.ts';

afterEach(() => {
  setImHostLanguage('zh');
});

function markdownElement(card) {
  return card.body.elements.find((element) => element.tag === 'markdown');
}

test('running CardKit reply card has a blue 回复中 header and waiting body', () => {
  const card = buildStreamingReplyCard({ status: 'running', streaming: true });
  assert.equal(card.schema, '2.0');
  assert.equal(card.header.title.content, '回复中');
  assert.equal(card.header.template, 'blue');
  assert.equal(card.config.streaming_mode, true);
  assert.equal(card.config.update_multi, true);
  assert.equal(card.config.streaming_config.print_step.default, 1);
  const md = markdownElement(card);
  assert.equal(md.element_id, STREAM_ELEMENT_ID);
  assert.equal(md.content, '正在回复…');
});

test('done card turns the header green and drops streaming', () => {
  const card = buildStreamingReplyCard({
    status: 'done',
    body: '完整答案',
    streaming: false,
  });
  assert.equal(card.header.title.content, '回复');
  assert.equal(card.header.template, 'green');
  assert.equal(card.config.streaming_mode, false);
  assert.equal(markdownElement(card).content, '完整答案');
});

test('failed and stopped headers stay distinct and do not stream', () => {
  const failed = buildStreamingReplyCard({ status: 'failed', body: '半段' });
  const stopped = buildStreamingReplyCard({ status: 'stopped', body: '半段' });
  assert.equal(titleForReplyStatus('failed'), '出错了');
  assert.equal(titleForReplyStatus('stopped'), '已停止');
  assert.equal(headerTemplateForReplyStatus('failed'), 'red');
  assert.equal(headerTemplateForReplyStatus('stopped'), 'grey');
  assert.equal(failed.config.streaming_mode, false);
  assert.equal(stopped.config.streaming_mode, false);
});

test('summary prefers the body and falls back to the status title', () => {
  assert.equal(summaryForReplyCard('running', ''), '回复中');
  assert.equal(summaryForReplyCard('done', ''), '回答完成');
  assert.equal(summaryForReplyCard('done', '短'), '短');
  assert.equal(summaryForReplyCard('done', `${'x'.repeat(60)}`).length, 50);
});

test('tool and empty updates keep the previous assistant body', () => {
  assert.equal(nextReplyCardBody({ type: 'tool', name: 'grep' }, '已有正文'), '已有正文');
  assert.equal(nextReplyCardBody({ type: 'tool', name: 'grep' }, undefined), undefined);
  assert.equal(nextReplyCardBody({ type: 'text', text: '' }, '已有正文'), '已有正文');
  assert.equal(nextReplyCardBody({ type: 'text', text: '新正文' }, '已有正文'), '新正文');
});

test('running card with a conversation key includes a stop button', () => {
  const card = buildStreamingReplyCard({
    status: 'running',
    streaming: true,
    key: 'p2p:ou_user',
    runId: 'run-1',
  });
  const stop = card.body.elements.find((element) => element.tag === 'button');
  assert.ok(stop);
  assert.equal(stop.type, 'danger');
  assert.equal(stop.behaviors[0].value.action, STOP_REPLY_ACTION);
  assert.equal(stop.behaviors[0].value.key, 'p2p:ou_user');
  assert.equal(stop.behaviors[0].value.runId, 'run-1');
  assert.deepEqual(parseStopReplyAction(stop.value), { key: 'p2p:ou_user', runId: 'run-1' });
});

test('done card never keeps the stop button', () => {
  const card = buildStreamingReplyCard({
    status: 'done',
    body: '完',
    key: 'p2p:ou_user',
    runId: 'run-1',
  });
  assert.equal(card.body.elements.some((element) => element.tag === 'button'), false);
});

test('stop reply is scoped to the operator or group chat', () => {
  assert.equal(stopReplyKeyAllowed('p2p:ou_user', { operatorOpenId: 'ou_user' }), true);
  assert.equal(stopReplyKeyAllowed('p2p:ou_other', { operatorOpenId: 'ou_user' }), false);
  assert.equal(stopReplyKeyAllowed('group:oc_chat', { chatId: 'oc_chat' }), true);
  assert.equal(stopReplyKeyAllowed('group:oc_other', { chatId: 'oc_chat' }), false);
});

test('card action callback wraps schema 2.0 as raw card data', () => {
  const card = buildStreamingReplyCard({ status: 'stopped', body: '半段' });
  assert.deepEqual(cardActionCallbackCard(card), {
    card: { type: 'raw', data: card },
  });
  assert.deepEqual(cardActionCallbackCard(null), {});
});
