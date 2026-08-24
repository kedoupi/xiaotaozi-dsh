// @ts-nocheck
import assert from 'node:assert/strict';
import { onTestFinished, test, vi } from 'vitest';
import {
  cardActionProbeCard,
  menuCard,
  menuHelpText,
} from '../../../src/channels/feishu/feishu-cards.ts';

function buttons(value, result = []) {
  if (Array.isArray(value)) {
    for (const item of value) buttons(item, result);
    return result;
  }
  if (!value || typeof value !== 'object') return result;
  if (value.tag === 'button') result.push(value);
  for (const child of Object.values(value)) buttons(child, result);
  return result;
}

test('menu appends watchlist and keeps repair number-only', () => {
  const card = JSON.parse(menuCard());
  assert.match(JSON.stringify(card), /6 · 修复卡片按钮/);
  const actions = buttons(card).flatMap((button) => (
    button.behaviors?.map((behavior) => behavior?.value?.action) ?? []
  ));
  assert.deepEqual(actions, ['sessions', 'workspaces', 'new', 'status', 'help', 'watchlist']);
  assert.equal(actions.includes('repair'), false);
});

test('menu help advertises watch and archived commands', () => {
  const help = menuHelpText();
  assert.match(help, /\/watchlist/);
  assert.match(help, /\/watch ID 或序号/);
  assert.doesNotMatch(help, /\/presetlist/);
});

test('card-action probe carries only its action and opaque nonce', () => {
  const nonce = '0123456789abcdef0123456789abcdef';
  const card = JSON.parse(cardActionProbeCard(nonce));
  const probe = buttons(card)[0];
  assert.deepEqual(probe.behaviors, [{
    type: 'callback',
    value: { action: 'repair_verify', nonce },
  }]);
  assert.throws(() => cardActionProbeCard('{{client_id}}'), /safe card-action probe nonce/);
});
