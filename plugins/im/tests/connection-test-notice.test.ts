// @ts-nocheck
import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  CONNECTION_TEST_CANNOT_PUSH,
  CONNECTION_TEST_NO_TARGET,
  CONNECTION_TEST_SENT,
  connectionTestFeedback,
} from '../src/client/connection-test-notice.ts';

test('connection-test copy treats a failed push as a channel limit, not a broken connection', () => {
  assert.equal(connectionTestFeedback({ sent: true }), CONNECTION_TEST_SENT);
  assert.equal(
    connectionTestFeedback({ sent: false, code: 'test-target-unavailable' }),
    CONNECTION_TEST_NO_TARGET,
  );
  assert.equal(
    connectionTestFeedback({ sent: false, code: 'test-message-failed' }),
    CONNECTION_TEST_CANNOT_PUSH,
  );
  assert.equal(
    connectionTestFeedback({ sent: false, code: 'test-message-failed' }, {
      sent: '自定义成功',
      unavailable: '自定义无目标',
    }),
    CONNECTION_TEST_CANNOT_PUSH,
  );
  assert.equal(connectionTestFeedback(null), null);
  assert.equal(connectionTestFeedback(undefined), null);
});
