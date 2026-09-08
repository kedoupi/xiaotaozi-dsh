const DEFAULT_UPDATE_INTERVAL_MS = 500;
const FAILURE_TEXT = '消息处理失败，请稍后重试。';

type StreamPhase =
  | 'idle'
  | 'starting'
  | 'active'
  | 'finishing'
  | 'finished'
  | 'failed'
  | 'aborted';

type StreamLogger = {
  error?: ((...args: unknown[]) => unknown) | undefined;
};

type StreamTimer = {
  setTimeout: (callback: () => void, delay: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

type CardCreateResult = {
  cardInstanceId?: unknown;
};

type CardRequest = {
  clientId: string;
  clientSecret: string;
  target: unknown;
  cardInstanceId: string;
  signal?: AbortSignal;
};

export type DingTalkCardApi = {
  createAiCard: (request: {
    clientId: string;
    clientSecret: string;
    target: unknown;
    initialText: string;
    signal?: AbortSignal;
  }) => Promise<CardCreateResult | null | undefined>;
  updateAiCard: (request: CardRequest & { text: string; finished: boolean }) => Promise<unknown>;
  finishAiCard: (request: CardRequest & { text: string }) => Promise<unknown>;
  failAiCard?: (request: CardRequest & { text: string; signal?: AbortSignal }) => Promise<unknown>;
};

export type DingTalkCardStreamOptions = {
  api?: DingTalkCardApi;
  clientId?: unknown;
  clientSecret?: unknown;
  target?: unknown;
  signal?: AbortSignal;
  logger?: StreamLogger;
  updateIntervalMs?: number;
  clock?: () => number;
  timer?: StreamTimer;
};

export type DingTalkCardStream = {
  start(initialText: string): Promise<boolean>;
  push(progressText: string): void;
  finish(finalText: string): Promise<boolean>;
};

function requiredText(value: unknown, name: string) {
  if (typeof value !== 'string') throw new TypeError(`${name} must be a string`);
  return value;
}

function requiredCredential(value: unknown, name: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${name} is required`);
  }
  return value.trim();
}

function isAbortedPhase(value: string) {
  return value === 'aborted';
}

/**
 * Creates one throttled DingTalk AI Card update stream.
 *
 * The stream owns a single card instance. Progress updates use latest-wins
 * buffering, while finish waits for an active update before sending the final
 * card content.
 *
 * @param options Stream dependencies and DingTalk request data.
 * @param options.api DingTalk AI Card API implementation.
 * @param options.clientId DingTalk application client id.
 * @param options.clientSecret DingTalk application client secret.
 * @param options.target DingTalk card delivery target.
 * @param options.signal Stream cancellation signal.
 * @param options.logger Safe diagnostic sink.
 * @param options.updateIntervalMs Minimum delay between updates.
 * @param options.clock Monotonic millisecond clock.
 * @param options.timer Timer implementation.
 * @returns Card stream controller.
 */
export function createDingTalkCardStream({
  api,
  clientId,
  clientSecret,
  target,
  signal,
  logger = console,
  updateIntervalMs = DEFAULT_UPDATE_INTERVAL_MS,
  clock = () => Date.now(),
  timer = {
    setTimeout: (callback: () => void, delay: number) => globalThis.setTimeout(callback, delay),
    clearTimeout: (handle: unknown) => {
      globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
    },
  },
}: DingTalkCardStreamOptions = {}): DingTalkCardStream {
  if (!api
    || typeof api.createAiCard !== 'function'
    || typeof api.updateAiCard !== 'function'
    || typeof api.finishAiCard !== 'function') {
    throw new TypeError('DingTalk AI Card API is required');
  }
  const normalizedClientId = requiredCredential(clientId, 'clientId');
  const normalizedClientSecret = requiredCredential(clientSecret, 'clientSecret');
  if (target === undefined || target === null) throw new TypeError('target is required');
  if (!Number.isFinite(updateIntervalMs) || updateIntervalMs < 0) {
    throw new TypeError('updateIntervalMs must be a non-negative number');
  }
  if (typeof clock !== 'function') throw new TypeError('clock must be a function');
  if (typeof timer?.setTimeout !== 'function' || typeof timer?.clearTimeout !== 'function') {
    throw new TypeError('timer must provide setTimeout and clearTimeout');
  }

  const readClock = () => {
    const value = clock();
    if (!Number.isFinite(value)) throw new TypeError('clock must return a finite timestamp');
    return value;
  };
  readClock();

  let phase: string = signal?.aborted ? 'aborted' : 'idle';
  let cardRequest: CardRequest | null = null;
  let pendingText: string | null = null;
  let scheduledUpdate: unknown = null;
  let updateWorker: Promise<void> | null = null;
  let finishPromise: Promise<boolean> | null = null;
  let cleanupPromise: Promise<boolean> | null = null;
  let lastUpdateAt = 0;

  const clearScheduledUpdate = () => {
    if (scheduledUpdate === null) return;
    timer.clearTimeout(scheduledUpdate);
    scheduledUpdate = null;
  };

  const removeAbortListener = () => signal?.removeEventListener('abort', onAbort);

  const close = (nextPhase: StreamPhase) => {
    phase = nextPhase;
    pendingText = null;
    clearScheduledUpdate();
    removeAbortListener();
  };

  const cleanupCard = () => {
    if (!cardRequest || typeof api.failAiCard !== 'function') return Promise.resolve(false);
    if (!cleanupPromise) {
      cleanupPromise = api.failAiCard({
        ...cardRequest,
        text: FAILURE_TEXT,
        signal: AbortSignal.timeout(5_000),
      }).then(
        () => true,
        () => false,
      );
    }
    return cleanupPromise;
  };

  const fail = (operation: string) => {
    if (phase === 'failed' || phase === 'finished' || phase === 'aborted') return;
    void cleanupCard();
    close('failed');
    logger?.error?.(`[dsh-dingtalk] AI Card ${operation} failed`);
  };

  function onAbort() {
    if (phase === 'finished' || phase === 'failed' || phase === 'aborted') return;
    void cleanupCard();
    close('aborted');
  }

  if (phase !== 'aborted') signal?.addEventListener('abort', onAbort, { once: true });

  const launchUpdate = () => {
    if (phase !== 'active' || updateWorker || pendingText === null) return;
    const delay = Math.max(0, lastUpdateAt + updateIntervalMs - readClock());
    if (delay > 0) {
      scheduledUpdate = timer.setTimeout(() => {
        scheduledUpdate = null;
        launchUpdate();
      }, delay);
      return;
    }

    const text = pendingText;
    pendingText = null;
    const request = cardRequest;
    updateWorker = (async () => {
      if (!request) return;
      try {
        await api.updateAiCard({ ...request, text, finished: false });
        lastUpdateAt = readClock();
      } catch {
        if (signal?.aborted || isAbortedPhase(phase)) return;
        fail('update');
      }
    })().finally(() => {
      updateWorker = null;
      if (phase === 'active' && pendingText !== null) launchUpdate();
    });
  };

  const start = async (initialText: string) => {
    requiredText(initialText, 'initialText');
    if (phase !== 'idle') return false;
    phase = 'starting';
    try {
      const created = await api.createAiCard({
        clientId: normalizedClientId,
        clientSecret: normalizedClientSecret,
        target,
        initialText,
        signal,
      });
      const cardInstanceId = typeof created?.cardInstanceId === 'string'
        ? created.cardInstanceId.trim()
        : '';
      if (!cardInstanceId) throw new TypeError('DingTalk did not return a card instance id');
      cardRequest = Object.freeze({
        clientId: normalizedClientId,
        clientSecret: normalizedClientSecret,
        target,
        cardInstanceId,
        signal,
      });
      if (phase !== 'starting') {
        void cleanupCard();
        return false;
      }
      lastUpdateAt = readClock();
      phase = 'active';
      return true;
    } catch {
      if (signal?.aborted || phase === 'aborted') {
        close('aborted');
        return false;
      }
      fail('creation');
      return false;
    }
  };

  const push = (progressText: string) => {
    requiredText(progressText, 'progressText');
    if (phase !== 'active') return;
    pendingText = progressText;
    if (!scheduledUpdate && !updateWorker) launchUpdate();
  };

  const finish = (finalText: string): Promise<boolean> => {
    requiredText(finalText, 'finalText');
    if (phase === 'finished') return Promise.resolve(true);
    if (phase === 'finishing') return finishPromise ?? Promise.resolve(false);
    if (phase !== 'active') return Promise.resolve(false);

    phase = 'finishing';
    pendingText = null;
    clearScheduledUpdate();
    const activeUpdate = updateWorker;
    const request = cardRequest;
    finishPromise = (async () => {
      if (activeUpdate) await activeUpdate;
      if (phase !== 'finishing') return false;
      if (!request) return false;
      try {
        await api.finishAiCard({ ...request, text: finalText });
        if (phase !== 'finishing') return false;
        close('finished');
        return true;
      } catch {
        if (signal?.aborted || isAbortedPhase(phase)) {
          close('aborted');
          return false;
        }
        fail('finish');
        return false;
      }
    })();
    return finishPromise;
  };

  return Object.freeze({ start, push, finish });
}
