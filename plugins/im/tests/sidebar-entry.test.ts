import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  IM_ENTRY_ICON,
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

function toolsRow<T extends object>() {
  const children: T[] = [];
  return {
    children,
    get firstElementChild() {
      return children[0] ?? null;
    },
    get lastElementChild() {
      return children.at(-1) ?? null;
    },
    insertBefore(node: T, ref: T | null) {
      const from = children.indexOf(node);
      if (from >= 0) children.splice(from, 1);
      const index = ref === null ? children.length : children.indexOf(ref);
      children.splice(index < 0 ? children.length : index, 0, node);
    },
    append(node: T) {
      this.insertBefore(node, null);
    },
  };
}

test('tools row keeps market on the left and IM on the right', () => {
  const market = { id: 'market' };
  const im = { id: 'im' };
  const row = toolsRow<{ id: string }>();
  placeInToolsRow(row, im, 'end');
  placeInToolsRow(row, market, 'start');
  assert.deepEqual(row.children, [market, im]);
  placeInToolsRow(row, market, 'start');
  placeInToolsRow(row, im, 'end');
  assert.deepEqual(row.children, [market, im]);
});

test('IM sidebar entry mark is the dsh-im 3D portrait image', () => {
  assert.match(IM_ENTRY_ICON, /^<img /);
  assert.match(IM_ENTRY_ICON, /src="\/docs\/ip-3d\.jpg"/);
  assert.match(IM_ENTRY_ICON, /alt=""/);
  assert.match(IM_ENTRY_ICON, /width="15"/);
  assert.match(IM_ENTRY_ICON, /height="15"/);
});
