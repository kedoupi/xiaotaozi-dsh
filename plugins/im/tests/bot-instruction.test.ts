// @ts-nocheck
import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  BOT_INSTRUCTION_MAX,
  validateBotInstruction,
  wrapPromptWithBotInstruction,
} from '../src/channels/shared/bot-instruction.ts';
import { setImHostLanguage } from '../src/channels/shared/i18n.ts';

test('validateBotInstruction trims, rejects oversize, and treats blank as empty', () => {
  assert.equal(validateBotInstruction(null), null);
  assert.equal(validateBotInstruction('  '), null);
  assert.equal(validateBotInstruction('  只做客服  '), '只做客服');
  assert.throws(() => validateBotInstruction(1), { code: 'bot-instruction-invalid' });
  assert.throws(
    () => validateBotInstruction('x'.repeat(BOT_INSTRUCTION_MAX + 1)),
    { code: 'bot-instruction-too-long' },
  );
});

test('wrapPromptWithBotInstruction prefixes strings and content arrays', () => {
  setImHostLanguage('zh');
  assert.equal(wrapPromptWithBotInstruction('你好', null), '你好');
  assert.equal(wrapPromptWithBotInstruction('你好', ''), '你好');
  assert.equal(
    wrapPromptWithBotInstruction('你好', '只做客服，不改代码。'),
    ['## 机器人职责', '只做客服，不改代码。', '', '## 用户消息', '你好'].join('\n'),
  );
  assert.deepEqual(
    wrapPromptWithBotInstruction([{ type: 'text', text: 'hi' }], '客服'),
    [
      { type: 'text', text: '## 机器人职责\n客服\n\n## 用户消息\n' },
      { type: 'text', text: 'hi' },
    ],
  );
});
