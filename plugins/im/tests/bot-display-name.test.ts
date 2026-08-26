// @ts-nocheck
import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  BOT_DISPLAY_NAME_MAX,
  validateBotDisplayName,
} from '../src/channels/shared/bot-display-name.ts';

test('validateBotDisplayName trims, rejects oversize, and treats blank as empty', () => {
  assert.equal(validateBotDisplayName(null), null);
  assert.equal(validateBotDisplayName('  '), null);
  assert.equal(validateBotDisplayName('  客服甲  '), '客服甲');
  assert.throws(() => validateBotDisplayName(1), { code: 'bot-display-name-invalid' });
  assert.throws(
    () => validateBotDisplayName('x'.repeat(BOT_DISPLAY_NAME_MAX + 1)),
    { code: 'bot-display-name-too-long' },
  );
  assert.throws(() => validateBotDisplayName('bad\nname'), { code: 'bot-display-name-invalid' });
});
