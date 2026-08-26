import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  isNewSessionLabel,
  placeInToolsRow,
} from '../src/client/sidebar-entry.ts';

test('matches the New Session button labels', () => {
  assert.equal(isNewSessionLabel('新会话'), true);
  assert.equal(isNewSessionLabel('新建会话'), true);
  assert.equal(isNewSessionLabel(' New Session '), true);
  assert.equal(isNewSessionLabel('新会话历史'), false);
  assert.equal(isNewSessionLabel(''), false);
});

function toolsRow() {
  return {
    children: [] as object[],
    get firstElementChild() {
      return this.children[0] ?? null;
    },
    get lastElementChild() {
      return this.children.at(-1) ?? null;
    },
    insertBefore(node: object, ref: object | null) {
      const from = this.children.indexOf(node);
      if (from >= 0) this.children.splice(from, 1);
      const index = ref === null ? this.children.length : this.children.indexOf(ref);
      this.children.splice(index < 0 ? this.children.length : index, 0, node);
    },
    append(node: object) {
      this.insertBefore(node, null);
    },
  };
}

test('tools row keeps market on the left and IM on the right', () => {
  const market = { id: 'market' };
  const im = { id: 'im' };
  const row = toolsRow();
  placeInToolsRow(row, im, 'end');
  placeInToolsRow(row, market, 'start');
  assert.deepEqual(row.children, [market, im]);
  placeInToolsRow(row, market, 'start');
  placeInToolsRow(row, im, 'end');
  assert.deepEqual(row.children, [market, im]);
});
