// @ts-nocheck
import assert from 'node:assert/strict';
import { test } from 'vitest';

import { TokenConnectionSupervisor } from '../../../src/host/channels/shared/connection-supervisor.ts';

const flush = () => new Promise((resolve) => setImmediate(resolve));

function scheduler() {
  const pending = [];
  return {
    pending,
    setTimeoutImpl(callback, delay) {
      const handle = { callback, delay, cancelled: false, unref() {} };
      pending.push(handle);
      return handle;
    },
    clearTimeoutImpl(handle) { handle.cancelled = true; },
    async runNext() {
      const handle = pending.shift();
      assert.ok(handle);
      assert.equal(handle.cancelled, false);
      handle.callback();
      await flush();
      await flush();
      return handle.delay;
    },
  };
}

test('supervisor starts configured runtimes after Harness is healthy', async () => {
  const timers = scheduler();
  let healthChecks = 0;
  let initializes = 0;
  const supervisor = new TokenConnectionSupervisor({
    channel: 'test',
    harness: { async ensureRunning() { healthChecks += 1; } },
    controller: {
      async initialize() {
        initializes += 1;
        return { totals: { configured: 1, connected: 1 } };
      },
      status() {},
    },
    setTimeoutImpl: timers.setTimeoutImpl,
    clearTimeoutImpl: timers.clearTimeoutImpl,
    healthyIntervalMs: 9_000,
  }).start();

  await timers.runNext();
  assert.equal(healthChecks, 1);
  assert.equal(initializes, 1);
  assert.equal((await supervisor.ready).totals.connected, 1);
  assert.equal(timers.pending[0].delay, 9_000);
  await supervisor.close();
});

test('supervisor retries an offline runtime without blocking startup', async () => {
  const timers = scheduler();
  const warnings = [];
  const supervisor = new TokenConnectionSupervisor({
    channel: 'test',
    harness: { async ensureRunning() {} },
    controller: {
      async initialize() { return { totals: { configured: 2, connected: 1 } }; },
      status() {},
    },
    logger: { warn: (...args) => warnings.push(args) },
    retryDelaysMs: [7, 11],
    setTimeoutImpl: timers.setTimeoutImpl,
    clearTimeoutImpl: timers.clearTimeoutImpl,
  }).start();

  await timers.runNext();
  assert.equal(timers.pending[0].delay, 7);
  assert.match(warnings[0][0], /1\/2 bots connected/);
  await supervisor.close();
});

test('supervisor waits for Harness and eventually reaches a healthy runtime', async () => {
  const timers = scheduler();
  let healthChecks = 0;
  let initializations = 0;
  const supervisor = new TokenConnectionSupervisor({
    channel: 'test',
    harness: {
      async ensureRunning() {
        healthChecks += 1;
        if (healthChecks === 1) throw new Error('Host is still starting');
      },
    },
    controller: {
      async initialize() {
        initializations += 1;
        return { totals: { configured: 1, connected: initializations > 1 ? 1 : 0 } };
      },
      status() {},
    },
    logger: { warn() {} },
    retryDelaysMs: [5, 10],
    healthyIntervalMs: 100,
    setTimeoutImpl: timers.setTimeoutImpl,
    clearTimeoutImpl: timers.clearTimeoutImpl,
  }).start();

  assert.equal(await timers.runNext(), 0);
  assert.equal(timers.pending[0].delay, 5);
  await timers.runNext();
  assert.equal(initializations, 1);
  assert.equal(timers.pending[0].delay, 10);
  await timers.runNext();
  assert.equal(initializations, 2);
  assert.equal((await supervisor.ready).totals.connected, 0);
  assert.equal(timers.pending[0].delay, 100);
  await supervisor.close();
  assert.equal(timers.pending[0].cancelled, true);
});
