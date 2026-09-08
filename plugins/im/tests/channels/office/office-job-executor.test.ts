import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { OfficeJobExecutor } from '../../../src/channels/office/office-job-executor.ts';
import { OfficeTransport } from '../../../src/channels/office/office-transport.ts';
import { HarnessClient, HarnessTurnError } from '../../../src/channels/shared/harness-client.ts';
import { OfficeRuntime } from '../../../src/channels/office/office-runtime.ts';
import { OfficeController } from '../../../src/channels/office/office-controller.ts';
import { Config, createImHostPlugin } from '../../../src/index.ts';
import { createProductionController } from '../../../src/host/channels/office/production.ts';

const jobId = 'job-dddddddddddddddddddddddddddddddd';
const sessionId = 'session-test';
const config = {
  baseUrl: 'https://office.example.com', deviceId: 'synthetic-device',
  maxConcurrency: 1, heartbeatSeconds: 30,
  workspaces: { fixture: process.env.TMPDIR! },
  instructionPresets: { execute: 'Return evidence' },
};
const interaction = {
  kind: 'approval', interactionId: 'approval-failure', sessionId,
  payload: { type: 'approval/requested', sessionId,
    approvalId: 'approval-failure', toolName: 'apply_patch', callId: 'call-test' },
  toolCall: { callId: 'call-test', name: 'apply_patch', arguments: '{"patch":"safe"}' },
  respond: async (_value?: unknown) => ({ accepted: true }),
};
async function eventually(predicate: () => boolean) {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('condition did not become true');
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function controlledSleep() {
  const calls: { delay: number; resolve: () => void; settled: boolean }[] = [];
  const sleep = (delay: number, _value: unknown, { signal }: { signal: AbortSignal }) => new Promise<void>((resolve, reject) => {
    const call = { delay, resolve: () => finish(), settled: false };
    const finish = (error?: unknown) => {
      if (call.settled) return;
      call.settled = true;
      signal.removeEventListener('abort', onAbort);
      if (error) reject(error); else resolve();
    };
    const onAbort = () => finish(signal.reason);
    calls.push(call);
    if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true });
  });
  return { calls, sleep };
}
function pendingUntilAbort(signal: AbortSignal) {
  return new Promise<never>((_resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}
function fixture(cancelTimeoutMs = 10_000) {
  const clock = controlledSleep();
  const ack = deferred<{ accepted: boolean }>();
  void ack.promise.catch(() => undefined);
  const calls = { asks: 0, completions: 0, failures: 0, approvals: 0,
    cancellations: [] as unknown[], cancellationSignals: [] as AbortSignal[], warnings: [] as unknown[][] };
  let signal: AbortSignal;
  const harness = {
    createOfficeSession: async (_options?: unknown) => sessionId,
    ask: async (_id: string, _prompt: string, options: any): Promise<string> => {
      calls.asks++;
      signal = options.signal;
      return pendingUntilAbort(signal);
    },
    rpc: async (method: string, payload: unknown, timeoutMs: number, options?: { signal: AbortSignal }) => {
      calls.cancellations.push({ method, payload, timeoutMs });
      calls.cancellationSignals.push(options!.signal);
      return ack.promise;
    },
  };
  const transport = {
    getJob: async (_id?: string, _options?: unknown) => ({ job: { id: jobId,
      workspaceAlias: 'fixture', instructionPreset: 'execute', markdown: '# Fixture' } }),
    acceptJob: async () => ({ leaseToken: 'synthetic-lease' }),
    renewJob: async () => ({ ok: true }),
    progressJob: async () => ({ ok: true }),
    requestApproval: async () => { calls.approvals++; return { ok: true }; },
    failJob: async (_id?: string, _lease?: string, _body?: unknown, _options?: { signal: AbortSignal }) => { calls.failures++; return { ok: true }; },
    completeJob: async () => { calls.completions++; return { ok: true }; },
  };
  const executor = new OfficeJobExecutor({ config, transport, createHarness: () => harness,
    logger: { ...console, warn: (...args: unknown[]) => calls.warnings.push(args), debug() {} }, sleepImpl: clock.sleep as typeof import('node:timers/promises').setTimeout, cancelTimeoutMs });
  return { executor, harness, transport, calls, clock, ack, get signal() { return signal; } };
}

test('failed approval presentation disposes its waiter before job abort without unhandled rejection', async () => {
  const f = fixture();
  f.ack.resolve({ accepted: true });
  let replyAbortListeners = -1;
  f.transport.requestApproval = async () => { f.calls.approvals++; throw new Error('presentation failed'); };
  f.harness.ask = async (_id, _prompt, options) => {
    f.calls.asks++;
    const before = getEventListeners(options.signal, 'abort').length;
    try { await options.onInteraction(interaction); }
    finally { replyAbortListeners = getEventListeners(options.signal, 'abort').length - before; }
    return 'must not complete';
  };
  const unhandled: unknown[] = [];
  const onUnhandled = (error: unknown) => { unhandled.push(error); };
  process.on('unhandledRejection', onUnhandled);
  try {
    assert.equal(f.executor.offer(jobId), true);
    await eventually(() => f.calls.approvals === 1);
    await f.executor.close();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.calls.asks, 1);
    assert.equal(f.calls.completions, 0);
    assert.deepEqual(unhandled, []);
    assert.equal(replyAbortListeners, 0);
    assert.equal(f.calls.cancellations.length, 1, 'failed local interaction does not prove the remote turn stopped');
  } finally {
    process.removeListener('unhandledRejection', onUnhandled);
    await f.executor.close();
  }
});

async function owner(f: ReturnType<typeof fixture>) {
  let stored: any = { ...config, deviceTokenRef: 'synthetic-ref' };
  let starts = 0;
  let removed = 0;
  const runtime = new OfficeRuntime({ config, token: 'synthetic', jobExecutor: f.executor, createHarness: undefined,
    transport: { heartbeat: async () => ({ jobs: [] }),
      stream: async ({ signal }: any) => pendingUntilAbort(signal) },
    sleepImpl: f.clock.sleep as typeof import('node:timers/promises').setTimeout, logger: { ...console, error() {} } });
  const controller = new OfficeController({
    credentials: { resolve: async () => ({ value: 'synthetic' }), set: async () => {}, unset: async () => { removed++; } },
    configStore: { get: () => stored, save: async () => {}, clear: async () => { stored = null; } },
    createRuntime: () => { starts++; return runtime; },
  });
  await controller.initialize();
  return { runtime, controller, get starts() { return starts; }, get removed() { return removed; }, get stored() { return stored; } };
}

for (const action of ['cancel', 'close', 'lease loss', 'runtime.stop', 'remove', 'reconnect']) {
  test(`${action} awaits a single cancellation acknowledgement after an accepted ask`, async () => {
    const f = fixture();
    const o = await owner(f);
    let closed = false;
    let closing = Promise.resolve();
    try {
      f.executor.offer(jobId);
      await eventually(() => f.calls.asks === 1);
      if (action === 'cancel') assert.equal(f.executor.cancel(jobId), true);
      if (action === 'lease loss') {
        f.transport.renewJob = async () => { throw new Error('lease lost'); };
        f.clock.calls.find(call => !call.settled && call.delay === 30_000)!.resolve();
        await new Promise(resolve => setImmediate(resolve));
      }
      closing = (action === 'remove' ? o.controller.remove()
        : action === 'reconnect' ? o.controller.reconnect()
          : action === 'runtime.stop' ? o.runtime.stop() : f.executor.close()).then(() => { closed = true; });
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(f.calls.cancellations, [{ method: 'session.cancel',
        payload: { sessionId, keepInbox: true }, timeoutMs: 10_000 }]);
      assert.equal(closed, false);
      assert.equal(f.signal.aborted, true);
      assert.notEqual(f.calls.cancellationSignals[0], f.signal);
      assert.equal(f.calls.cancellationSignals[0].aborted, false);
      assert.equal(f.executor.cancel(jobId), true);
      const second = f.executor.close();
      assert.equal(f.calls.cancellations.length, 1);
      f.ack.resolve({ accepted: true });
      await Promise.all([closing, second]);
      assert.equal(f.calls.completions, 0);
      assert.equal(f.calls.failures, 0);
      assert.equal(f.calls.cancellations.length, 1);
      assert.equal(f.executor.status.running, 0);
    } finally {
      f.ack.resolve({ accepted: true });
      await closing.catch(() => undefined);
      await o.controller.close();
    }
  });
}

for (const action of ['remove', 'reconnect']) {
  for (const result of ['rejected', 'negative', 'malformed']) {
    test(`${action} retains old ownership on ${result} cancellation and permits a verified retry`, async () => {
      const f = fixture();
      const o = await owner(f);
      try {
        f.executor.offer(jobId);
        await eventually(() => f.calls.asks === 1);
        const stopping = action === 'remove' ? o.controller.remove() : o.controller.reconnect();
        const outcome = stopping.then(() => null, (error: Error) => error);
        await new Promise(resolve => setImmediate(resolve));
        if (result === 'rejected') f.ack.reject(new Error('synthetic-lease secret prompt'));
        else f.ack.resolve(result === 'negative' ? { accepted: false } : { ok: true } as any);
        const error = await outcome;
        assert.ok(error instanceof Error, 'uncertain shutdown must reject');
        assert.match(error.message, /cancellation.*uncertain/i);
        assert.doesNotMatch(error.message, /synthetic-lease|secret prompt/);
        assert.equal(o.starts, 1);
        assert.equal(o.removed, 0);
        assert.ok(o.stored);
        assert.equal(f.executor.status.running, 1, 'retain uncertain execution ownership');
        assert.ok(f.calls.warnings.some(args => args.join(' ').includes(sessionId)));
        assert.doesNotMatch(JSON.stringify(f.calls.warnings), /synthetic-lease|secret prompt/);
        f.harness.rpc = async (method, payload, timeoutMs) => {
          f.calls.cancellations.push({ method, payload, timeoutMs });
          return { accepted: true };
        };
        if (action === 'remove') await o.controller.remove(); else await o.controller.reconnect();
        assert.equal(f.calls.cancellations.length, 2);
        assert.equal(f.executor.status.running, 0);
        assert.equal(action === 'remove' ? o.removed : o.starts, action === 'remove' ? 1 : 2);
      } finally {
        // Ensure RED's unused fake RPC promise is observed too; not an approval-waiter observer.
        void f.ack.promise.catch(() => undefined);
        f.ack.resolve({ accepted: true });
        f.harness.rpc = async () => ({ accepted: true });
        await o.controller.close();
      }
    });
  }
}

test('close retains a late created session, cancels it, and never prompts it', async () => {
  const f = fixture();
  const created = deferred<string>();
  let creates = 0;
  f.harness.createOfficeSession = async () => { creates++; return created.promise; };
  f.executor.offer(jobId);
  await eventually(() => creates === 1);
  let closed = false;
  const closing = f.executor.close().then(() => { closed = true; });
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(closed, false);
    created.resolve(sessionId);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.calls.asks, 0);
    assert.deepEqual(f.calls.cancellations, [{ method: 'session.cancel', payload: { sessionId, keepInbox: true }, timeoutMs: 10_000 }]);
    assert.equal(closed, false);
    f.ack.resolve({ accepted: true });
    await closing;
    assert.equal(f.calls.completions, 0);
  } finally {
    created.resolve(sessionId); f.ack.resolve({ accepted: true }); await closing;
  }
});

test('runtime accepts an injected executor without an optional close method', async () => {
  const runtime = new OfficeRuntime({ config, token: 'synthetic', jobExecutor: { status: { running: 0 } } });
  const status = await runtime.stop();
  assert.equal(status.state, 'idle');
  assert.equal(status.connected, false);
});

test('runtime starts job cancellation before a delayed transport drain', async () => {
  const f = fixture();
  const heartbeat = deferred<{ jobs: never[] }>();
  let heartbeats = 0;
  const runtime = new OfficeRuntime({ config, token: 'synthetic', jobExecutor: f.executor, createHarness: undefined,
    transport: {
      heartbeat: async () => { heartbeats++; return heartbeat.promise; },
      stream: async () => {},
    }, logger: { ...console, error() {} } });
  runtime.start();
  f.executor.offer(jobId);
  await eventually(() => f.calls.asks === 1 && heartbeats === 1);
  const stopping = runtime.stop();
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.calls.cancellations.length, 1);
  } finally {
    f.ack.resolve({ accepted: true }); heartbeat.resolve({ jobs: [] }); await stopping;
  }
});

for (const resolution of ['approved', 'rejected', 'external', 'response failure', 'cancel pending', 'pre-aborted']) {
  test(`approval waiter settles once and removes its listener: ${resolution}`, async () => {
    const f = fixture();
    f.ack.resolve({ accepted: true });
    const responses: any[] = [];
    let options: any;
    let listeners = -1;
    let interactionError: unknown;
    f.harness.ask = async (_id, _prompt, value) => {
      f.calls.asks++; options = value;
      if (resolution === 'pre-aborted') f.executor.cancel(jobId);
      const before = getEventListeners(options.signal, 'abort').length;
      try {
        await options.onInteraction({ ...interaction, respond: async (response: unknown) => {
          responses.push(response);
          if (resolution === 'response failure') throw new Error('response failed');
          return { accepted: true };
        } });
      } catch (error) { interactionError = error; throw error; }
      finally {
        // Cancellation also removes the renewal listener; compare absolute zero when aborted.
        listeners = getEventListeners(options.signal, 'abort').length - (options.signal.aborted ? 0 : before);
      }
      return 'finished';
    };
    f.executor.offer(jobId);
    try {
      await eventually(() => f.calls.approvals === 1);
      const event = { type: 'approval.reply', data: { jobId, approvalId: interaction.interactionId,
        decision: resolution === 'rejected' ? 'rejected' : 'approved' } };
      if (resolution === 'cancel pending') f.executor.cancel(jobId);
      else if (resolution === 'external') options.onInteractionResolved({ interactionId: interaction.interactionId });
      else if (resolution !== 'pre-aborted') assert.equal(f.executor.handleEvent(event), true);
      assert.equal(f.executor.handleEvent(event), false, 'duplicate response is not delivered');
      await eventually(() => f.executor.status.running === 0);
      assert.equal(listeners, 0);
      assert.equal(responses.length, ['cancel pending', 'pre-aborted'].includes(resolution) ? 0 : 1);
      assert.equal(Boolean(interactionError), ['response failure', 'cancel pending', 'pre-aborted'].includes(resolution));
      if (responses.length) assert.equal(responses[0].value.outcome,
        ['rejected', 'external'].includes(resolution) ? 'rejected' : 'allowed-once');
      assert.equal(f.calls.completions, interactionError ? 0 : 1);
    } finally { await f.executor.close(); }
  });
}

test('close drains a late ask result after cancelling but never publishes completion', async () => {
  const f = fixture();
  const answer = deferred<string>();
  f.harness.ask = async () => { f.calls.asks++; return answer.promise; };
  f.executor.offer(jobId);
  await eventually(() => f.calls.asks === 1);
  let closed = false;
  const closing = f.executor.close().then(() => { closed = true; });
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.calls.cancellations.length, 1);
    f.ack.resolve({ accepted: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(closed, false, 'cancellation acknowledgement is not local task drain');
    assert.equal(f.executor.status.running, 1);
    answer.resolve('late result');
    await closing;
    assert.equal(f.calls.completions, 0);
    assert.equal(f.executor.status.running, 0);
  } finally { answer.resolve('late'); f.ack.resolve({ accepted: true }); await closing; }
});

for (const delivery of ['pending', 'finished', 'failed']) {
  test(`already finished Harness work is not cancelled with ${delivery} result delivery`, async () => {
    const f = fixture();
    const delivered = deferred<{ ok: boolean }>();
    f.harness.ask = async () => { f.calls.asks++; return 'finished'; };
    f.transport.completeJob = async () => { f.calls.completions++; return delivered.promise; };
    f.executor.offer(jobId);
    await eventually(() => f.calls.completions === 1);
    if (delivery === 'finished') delivered.resolve({ ok: true });
    if (delivery === 'failed') delivered.reject(new Error('delivery failed'));
    if (delivery !== 'pending') await eventually(() => f.executor.status.running === 0);
    const closing = f.executor.close();
    delivered.resolve({ ok: true });
    await closing;
    assert.equal(f.calls.cancellations.length, 0);
  });
}

for (const delivery of ['finished', 'pending']) {
  test(`terminal no-text Harness error releases ownership without cancellation: ${delivery} failure delivery`, async () => {
    const f = fixture();
    f.ack.resolve({ accepted: true });
    const delivered = deferred<{ ok: boolean }>();
    const client = new HarnessClient({ baseUrl: 'https://harness.example.test', workspace: config.workspaces.fixture,
      agentPreset: undefined, commandExecutor: undefined, controlExecutor: undefined,
      sessionMaintenanceExecutor: undefined, fileIngressExecutor: undefined });
    client.ensureRunning = async () => true;
    client.watchInteractions = async (_id, options) => {
      const watch = options as { onOpen(): void; signal: AbortSignal };
      watch.onOpen();
      return pendingUntilAbort(watch.signal);
    };
    let promptRpcId: string | undefined;
    let terminalErrors = 0;
    client.rpc = async (method, _payload, _timeout, options) => {
      if (method === 'session.history') return { events: promptRpcId ? [
        { event: { seq: 1, type: 'turn/start', data: { turn: 1 } } },
        { event: { seq: 2, type: 'user/message', data: { turn: 1, source: { rpcId: promptRpcId } } } },
        { event: { seq: 3, type: 'turn/end', data: { turn: 1, reason: {
          kind: 'error', error: { code: 'HTTP_400', message: 'maximum prompt length exceeded' },
        } } } },
      ] : [] };
      assert.equal(method, 'session.prompt');
      promptRpcId = (options as { rpcId: string }).rpcId;
      return { accepted: true };
    };
    f.harness.ask = async (id, prompt, options) => {
      f.calls.asks++;
      try { return await client.ask(id, prompt, options); }
      catch (error) { if (error instanceof HarnessTurnError) terminalErrors++; throw error; }
    };
    f.transport.failJob = async () => { f.calls.failures++; return delivered.promise; };
    f.executor.offer(jobId);
    try {
      await eventually(() => f.calls.failures === 1);
      assert.equal(f.calls.asks, 1);
      assert.ok(promptRpcId, 'real Harness ask accepted a prompt and polled turn/end');
      assert.equal(terminalErrors, 1);
      if (delivery === 'finished') {
        delivered.resolve({ ok: true });
        await eventually(() => f.executor.status.running === 0);
      }
      const closing = f.executor.close();
      delivered.resolve({ ok: true });
      await closing;
      assert.equal(f.calls.failures, 1);
      assert.equal(f.calls.completions, 0);
      assert.equal(f.calls.cancellations.length, 0, 'turn/end error is finished work, not a local transport failure');
      assert.equal(f.executor.status.running, 0);
    } finally { delivered.resolve({ ok: true }); await f.executor.close(); }
  });
}

for (const cancellation of ['acknowledged', 'negative', 'rejected']) {
  test(`close interrupts in-flight failure delivery and propagates ${cancellation} cancellation`, async () => {
    const f = fixture();
    const response = deferred<Response>();
    let deliveryAborted = false;
    let deliverySignal: AbortSignal | undefined;
    let fetches = 0;
    const transport = new OfficeTransport({ ...config, token: 'synthetic',
      fetchImpl: async (_url, options) => {
        fetches++;
        deliverySignal = options?.signal ?? undefined;
        const onAbort = () => { deliveryAborted = true; response.reject(deliverySignal!.reason); };
        if (deliverySignal?.aborted) onAbort();
        else deliverySignal?.addEventListener('abort', onAbort, { once: true });
        try { return await response.promise; }
        finally { deliverySignal?.removeEventListener('abort', onAbort); }
      },
    });
    f.harness.ask = async () => {
      f.calls.asks++;
      // A local rejection resembling a terminal error must not be trusted by name/code.
      throw Object.assign(new Error('history transport failed'), { name: 'HarnessTurnError', code: 'HTTP_400' });
    };
    f.transport.failJob = async (id, lease, body, options) => {
      f.calls.failures++;
      return transport.failJob(id, lease, body, options);
    };
    f.executor.offer(jobId);
    let closing: Promise<Error | null> = Promise.resolve(null);
    let settled = false;
    try {
      await eventually(() => fetches === 1);
      assert.equal(f.calls.asks, 1);
      closing = f.executor.close().then(() => { settled = true; return null; }, (error: Error) => { settled = true; return error; });
      await eventually(() => f.calls.cancellations.length === 1);
      if (cancellation === 'rejected') f.ack.reject(new Error('RPC rejected'));
      else f.ack.resolve({ accepted: cancellation === 'acknowledged' });
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(deliveryAborted, true, 'shutdown must abort the real OfficeTransport failure request');
      await eventually(() => settled);
      const error = await closing;
      assert.equal(f.calls.failures, 1);
      assert.equal(f.calls.completions, 0);
      if (cancellation === 'acknowledged') {
        assert.equal(error, null);
        assert.equal(f.executor.status.running, 0);
      } else {
        assert.match(error!.message, /cancellation.*uncertain/i);
        assert.equal(f.executor.status.running, 1);
        f.harness.rpc = async () => ({ accepted: true });
        await f.executor.close();
        assert.equal(f.executor.status.running, 0);
      }
    } finally {
      // Release only this fake fetch on RED; production must abort it without this escape.
      response.resolve(Response.json({ ok: true }));
      f.ack.resolve({ accepted: true });
      await closing;
      f.harness.rpc = async () => ({ accepted: true });
      await f.executor.close();
    }
  });
}

test('configured cancellation deadline bounds an unresponsive RPC and retains ownership for retry', async () => {
  const f = fixture(37);
  f.executor.offer(jobId);
  await eventually(() => f.calls.asks === 1);
  vi.useFakeTimers();
  try {
    const closing = f.executor.close();
    const outcome = closing.then(() => null, (error: Error) => error);
    await vi.advanceTimersByTimeAsync(36);
    assert.deepEqual(f.calls.cancellations, [{ method: 'session.cancel', payload: { sessionId, keepInbox: true }, timeoutMs: 37 }]);
    let settled = false; void outcome.then(() => { settled = true; });
    await Promise.resolve(); assert.equal(settled, false);
    await vi.advanceTimersByTimeAsync(1);
    assert.match((await outcome)!.message, /cancellation.*uncertain/i);
    assert.equal(f.calls.cancellationSignals[0].aborted, true);
    assert.equal(f.executor.status.running, 1);
    f.harness.rpc = async () => ({ accepted: true });
    await f.executor.close();
    assert.equal(f.executor.status.running, 0);
    assert.equal(f.calls.completions, 0);
  } finally { vi.useRealTimers(); f.ack.resolve({ accepted: true }); f.harness.rpc = async () => ({ accepted: true }); await f.executor.close(); }
});

test('exported Config keeps Office disabled and wires its cancellation bound only to Office production/runtime/executor', async () => {
  assert.equal(Config({} as Config).officeEnabled, false);
  assert.equal(Config({} as Config).officeCancelTimeoutMs, 10_000);
  assert.throws(() => Config({ officeCancelTimeoutMs: 0 } as Config));
  const f = fixture();
  const otherConfigs: Record<string, unknown>[] = [];
  const other = async (_ctx: unknown, value: Record<string, unknown>) => { otherConfigs.push(value); };
  let production: any;
  const plugin = createImHostPlugin({
    applyFeishu: other, applyWeixin: other, applyDingtalk: other, applyWecom: other,
    applyQq: other, applySlack: other, applyTelegram: other, applyDiscord: other, applyWhatsapp: other,
    applyOffice: async (ctx, value) => {
      production = await createProductionController(ctx, value, {
        ConfigStore: class {
          async load() { return this; }
          get() { return { ...config, deviceTokenRef: 'synthetic-ref' }; }
          async save() {} async clear() {}
        },
        createHarness: () => f.harness,
        transport: { ...f.transport,
          heartbeat: async () => ({ jobs: [{ id: jobId }] }),
          stream: async ({ signal }: any) => pendingUntilAbort(signal) },
      });
    },
  });
  await plugin.apply({ credentials: { resolve: async () => ({ value: 'synthetic' }),
    set: async () => {}, unset: async () => {} }, logger: { ...console, warn() {}, error() {} } },
  { officeEnabled: true, officeCancelTimeoutMs: 73, isolateChannelFailures: false,
    office: { harnessBaseUrl: 'http://127.0.0.1:43999' } });
  try {
    assert.ok(production, 'Office production callback entered');
    await eventually(() => f.calls.asks === 1);
    const closing = production.close();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(f.calls.cancellations, [{ method: 'session.cancel', payload: { sessionId, keepInbox: true }, timeoutMs: 73 }]);
    assert.equal(otherConfigs.length, 9);
    assert.ok(otherConfigs.every(value => !('cancelTimeoutMs' in value)));
    f.ack.resolve({ accepted: true });
    await closing;
  } finally { f.ack.resolve({ accepted: true }); await production?.close(); }
});

test('a cancellation retry retains ownership while the old task finishes draining', async () => {
  const f = fixture(37);
  const renewed = deferred<{ ok: boolean }>();
  let renewals = 0;
  f.transport.renewJob = async () => { renewals++; return renewed.promise; };
  f.executor.offer(jobId);
  await eventually(() => f.calls.asks === 1);
  f.clock.calls.find(call => !call.settled)!.resolve();
  await eventually(() => renewals === 1);
  vi.useFakeTimers();
  try {
    f.executor.cancel(jobId);
    await vi.advanceTimersByTimeAsync(37);
    assert.equal(f.calls.warnings.length, 1);
    assert.equal(f.executor.cancel(jobId), true);
    await vi.advanceTimersByTimeAsync(0);
    assert.equal(f.calls.cancellations.length, 2);
    renewed.resolve({ ok: true });
    await vi.advanceTimersByTimeAsync(0);
    assert.equal(f.executor.status.running, 1, 'old drain must not release an in-flight retry');
    let closed = false;
    const closing = f.executor.close().then(() => { closed = true; });
    await vi.advanceTimersByTimeAsync(0);
    assert.equal(closed, false);
    f.ack.resolve({ accepted: true });
    await closing;
    assert.equal(f.calls.cancellations.length, 2);
    assert.equal(f.executor.status.running, 0);
  } finally {
    vi.useRealTimers(); renewed.resolve({ ok: true }); f.ack.resolve({ accepted: true }); await f.executor.close();
  }
});

test('a reply received during pending presentation cannot approve work after close', async () => {
  const f = fixture();
  const presented = deferred<{ ok: boolean }>();
  let responses = 0;
  f.transport.requestApproval = async () => { f.calls.approvals++; return presented.promise; };
  f.harness.ask = async (_id, _prompt, options) => {
    f.calls.asks++;
    await options.onInteraction({ ...interaction, respond: async () => { responses++; return { accepted: true }; } });
    return 'late approved result';
  };
  f.executor.offer(jobId);
  await eventually(() => f.calls.approvals === 1);
  assert.equal(f.executor.handleEvent({ type: 'approval.reply', data: {
    jobId, approvalId: interaction.interactionId, decision: 'approved',
  } }), true);
  let closed = false;
  const closing = f.executor.close().then(() => { closed = true; });
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.calls.cancellations.length, 1);
    assert.equal(closed, false);
    presented.resolve({ ok: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(responses, 0, 'already-resolved reply must be fenced after presentation await');
    assert.equal(closed, false);
    f.ack.resolve({ accepted: true });
    await closing;
    assert.equal(f.calls.completions, 0);
  } finally { presented.resolve({ ok: true }); f.ack.resolve({ accepted: true }); await closing; }
});
