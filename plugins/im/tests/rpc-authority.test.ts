// @ts-nocheck
import { onTestFinished, test, vi } from 'vitest';
import assert from 'node:assert/strict';

import { resolveRpcAuthority } from '../src/rpc-authority.ts';

test('IM management RPC authority defaults to loopback and accepts explicit trusted hosts', () => {
  assert.equal(resolveRpcAuthority(), 'loopback');
  assert.equal(resolveRpcAuthority('loopback'), 'loopback');
  assert.equal(resolveRpcAuthority('trusted-host'), 'trusted-host');
});

test('IM management RPC authority rejects unknown policy values', () => {
  assert.throws(
    () => resolveRpcAuthority('public'),
    /rpcAuthority must be "loopback" or "trusted-host"/,
  );
});
