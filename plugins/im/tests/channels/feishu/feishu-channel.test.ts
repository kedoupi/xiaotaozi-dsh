// @ts-nocheck
import { onTestFinished, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { VerifiedFeishuChannel } from '../../../src/channels/feishu/feishu-channel.ts';

function fakeClient(overrides = {}) {
  const calls = {
    creates: [],
    replies: [],
    updates: [],
    settings: [],
    cardUpdates: [],
    recalls: [],
    reactionsAdded: [],
    reactionsRemoved: [],
  };
  const client = {
    cardkit: { v1: {
      card: {
        create: async (request) => {
          calls.creates.push(request);
          return { code: 0, data: { card_id: 'card-test' } };
        },
        settings: async (request) => {
          calls.settings.push(request);
          return { code: 0 };
        },
        update: async (request) => {
          calls.cardUpdates.push(request);
          return { code: 0 };
        },
      },
      cardElement: {
        content: async (request) => {
          calls.updates.push(request);
          return { code: 0 };
        },
      },
    } },
    im: { v1: {
      message: {
        reply: async (request) => {
          calls.replies.push(request);
          return { code: 0, data: { message_id: 'om-stream' } };
        },
        create: async () => ({ code: 0, data: { message_id: 'om-stream' } }),
        delete: async (request) => {
          calls.recalls.push(request);
          return { code: 0 };
        },
      },
      messageReaction: {
        create: async (request) => {
          calls.reactionsAdded.push(request);
          return { code: 0, data: { reaction_id: 'reaction-test' } };
        },
        delete: async (request) => {
          calls.reactionsRemoved.push(request);
          return { code: 0 };
        },
      },
    } },
  };

  if (overrides.updateContent) client.cardkit.v1.cardElement.content = overrides.updateContent;
  if (overrides.finishCard) client.cardkit.v1.card.settings = overrides.finishCard;
  if (overrides.updateCard) client.cardkit.v1.card.update = overrides.updateCard;
  return { client, calls };
}

function createdCard(calls) {
  return JSON.parse(calls.creates[0].data.data);
}

function updatedCard(calls, index = 0) {
  return JSON.parse(calls.cardUpdates[index].data.card.data);
}

test('VerifiedFeishuChannel streams content then fully updates the card header', async () => {
  const { client, calls } = fakeClient();
  const channel = new VerifiedFeishuChannel({ client, initialText: '正在回复…' });

  const result = await channel.stream('oc_chat', {
    markdown: async (controller) => {
      await controller.setContent('第一段');
      await controller.setContent('第一段和第二段');
    },
  }, { replyTo: 'om_user' });

  assert.deepEqual(result, { messageId: 'om-stream' });
  assert.equal(calls.replies[0].path.message_id, 'om_user');
  const created = createdCard(calls);
  assert.equal(created.header.title.content, '回复中');
  assert.equal(created.config.streaming_mode, true);
  assert.deepEqual(calls.updates.map((call) => ({
    content: call.data.content,
    sequence: call.data.sequence,
  })), [
    { content: '第一段', sequence: 1 },
    { content: '第一段和第二段', sequence: 2 },
  ]);
  assert.equal(calls.settings[0].data.sequence, 3);
  assert.deepEqual(JSON.parse(calls.settings[0].data.settings), {
    config: {
      streaming_mode: false,
      summary: { content: '第一段和第二段' },
    },
  });
  assert.equal(calls.cardUpdates[0].data.sequence, 4);
  const finished = updatedCard(calls);
  assert.equal(finished.header.title.content, '回复');
  assert.equal(finished.header.template, 'green');
  assert.equal(finished.config.streaming_mode, false);
  assert.equal(finished.body.elements[0].content, '第一段和第二段');
  assert.equal(calls.recalls.length, 0);
});

test('VerifiedFeishuChannel puts a stop button on the running card', async () => {
  const { client, calls } = fakeClient();
  const channel = new VerifiedFeishuChannel({ client });
  const ready = [];

  await channel.stream('oc_chat', {
    markdown: async (controller) => {
      await controller.setContent('正文');
    },
  }, {
    replyTo: 'om_user',
    conversationKey: 'p2p:ou_user',
    runId: 'run-stop',
    onCardReady: (info) => ready.push(info),
  });

  const created = createdCard(calls);
  const stop = created.body.elements.find((element) => element.tag === 'button');
  assert.equal(stop?.behaviors?.[0]?.value?.action, 'stop_reply');
  assert.equal(stop?.behaviors?.[0]?.value?.runId, 'run-stop');
  assert.deepEqual(ready, [{ messageId: 'om-stream', runId: 'run-stop', cardId: 'card-test' }]);
  assert.equal(updatedCard(calls).body.elements.some((element) => element.tag === 'button'), false);
});

test('VerifiedFeishuChannel keeps a failed streaming card instead of recalling it', async () => {
  const { client, calls } = fakeClient({
    updateContent: async () => ({ code: 230099, msg: 'element update failed' }),
  });
  const channel = new VerifiedFeishuChannel({ client });

  await assert.rejects(channel.stream('oc_chat', {
    markdown: async (controller) => controller.setContent('最终回答'),
  }, { replyTo: 'om_user' }), /cardElement\.content failed/);

  assert.equal(calls.recalls.length, 0);
  assert.equal(calls.settings.length, 1);
  assert.equal(updatedCard(calls).header.title.content, '出错了');
  assert.equal(updatedCard(calls).header.template, 'red');
});

test('VerifiedFeishuChannel keeps the card when finalization fails', async () => {
  const { client, calls } = fakeClient({
    finishCard: async (request) => {
      calls.settings.push(request);
      return { code: 230099, msg: 'card finalization failed' };
    },
  });
  const channel = new VerifiedFeishuChannel({ client });

  await assert.rejects(channel.stream('oc_chat', {
    markdown: async (controller) => controller.setContent('已经生成的回答'),
  }, { replyTo: 'om_user' }), /card\.settings failed/);

  assert.equal(calls.recalls.length, 0);
  assert.equal(calls.settings.length, 1);
});

test('VerifiedFeishuChannel finalizes a producer failure as 出错了 on the same card', async () => {
  const { client, calls } = fakeClient();
  const channel = new VerifiedFeishuChannel({ client });

  await channel.stream('oc_chat', {
    markdown: async (controller) => {
      await controller.setContent('处理失败：上下文过长');
      controller.fail();
    },
  }, { replyTo: 'om_user' });

  const finished = updatedCard(calls);
  assert.equal(finished.header.title.content, '出错了');
  assert.equal(finished.body.elements[0].content, '处理失败：上下文过长');
  assert.equal(calls.recalls.length, 0);
});

test('VerifiedFeishuChannel checks reaction API results', async () => {
  const { client, calls } = fakeClient();
  const channel = new VerifiedFeishuChannel({ client });

  const reactionId = await channel.addReaction('om_user', 'OnIt');
  await channel.removeReaction('om_user', reactionId);

  assert.equal(reactionId, 'reaction-test');
  assert.equal(calls.reactionsAdded[0].data.reaction_type.emoji_type, 'OnIt');
  assert.equal(calls.reactionsRemoved[0].path.reaction_id, 'reaction-test');
});
