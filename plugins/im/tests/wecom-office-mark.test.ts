import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'vitest';

// dsh-im cannot import sibling plugin source, so the dsh-wecom-office 3D portrait is
// duplicated into dsh-im for the office row. This test pins the copy to the canonical
// portrait so the two can never drift.
test('the WeCom Office mark inside dsh-im is byte-identical to the canonical dsh-wecom-office portrait', () => {
  const duplicated = readFileSync(new URL('../src/client/assets/wecom-office-3d.jpg', import.meta.url));
  const canonical = readFileSync(new URL('../../wecom-office/docs/ip-3d.jpg', import.meta.url));
  assert.ok(duplicated.equals(canonical));
});
