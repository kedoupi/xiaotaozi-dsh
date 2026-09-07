const DEFAULT_TIMEOUT_MS = 2_000;

const NOOP_REACTION = Object.freeze({
  success() {},
  error() {},
  clear() {},
  settled: () => Promise.resolve(),
});

type ReactionStatus = Record<string, number | undefined>;

type ReactionAdapter = {
  addReaction?: (
    target: unknown,
    emoji: unknown,
    options?: { signal?: AbortSignal },
  ) => unknown;
  removeReaction?: (
    target: unknown,
    previous: unknown,
    options?: { signal?: AbortSignal },
  ) => unknown;
};

type ReactionEmojis = {
  processing?: unknown;
  success?: unknown;
  error?: unknown;
};

type StatusLogger = {
  warn?: (...args: unknown[]) => unknown;
};

type StatusReactionOptions = {
  adapter?: ReactionAdapter | null;
  target?: unknown;
  reactions?: ReactionEmojis | null;
  status?: unknown;
  logger?: StatusLogger;
  label?: string;
  timeoutMs?: number;
};

function increment(status: unknown, key: string) {
  if (!status || typeof status !== 'object') return;
  const record = status as ReactionStatus;
  record[key] = (record[key] ?? 0) + 1;
}

async function runWithTimeout<T>(
  operation: (signal: AbortSignal) => T | Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const signal = AbortSignal.timeout(timeoutMs);
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason ?? new DOMException('Timed out', 'TimeoutError'));
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([operation(signal), aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort as () => void);
  }
}

/**
 * Starts a best-effort status reaction lifecycle which is deliberately not
 * part of the caller's message queue. Calls are serialized only for this one
 * source message; every provider operation is bounded and absorbs failures.
 */
export function beginStatusReaction({
  adapter,
  target,
  reactions,
  status,
  logger = console,
  label = 'channel',
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: StatusReactionOptions = {}) {
  if (!target
    || typeof adapter?.addReaction !== 'function'
    || typeof adapter?.removeReaction !== 'function'
    || typeof reactions?.processing !== 'string'
    || !reactions.processing
    || !Number.isSafeInteger(timeoutMs)
    || timeoutMs <= 0) return NOOP_REACTION;

  let currentReaction: unknown = null;
  let terminal = false;

  const safely = async (
    kind: 'add' | 'remove',
    operation: (signal: AbortSignal) => unknown,
  ) => {
    try {
      const value = await runWithTimeout(operation, timeoutMs);
      increment(status, kind === 'add' ? 'reactionsAdded' : 'reactionsRemoved');
      return { ok: true, value };
    } catch (cause) {
      increment(status, 'reactionErrors');
      const failure = cause as { message?: unknown; name?: unknown } | undefined;
      logger.warn?.(
        `[dsh-im:${label}] status reaction ${kind} failed:`,
        failure?.message ?? failure?.name ?? String(cause),
      );
      return { ok: false, value: null };
    }
  };

  const transition = async (emoji: unknown) => {
    if (currentReaction !== null) {
      const previous = currentReaction;
      currentReaction = null;
      await safely('remove', (signal) => adapter.removeReaction!(
        target,
        previous,
        { signal },
      ));
    }
    if (typeof emoji !== 'string' || !emoji) return;
    const added = await safely('add', (signal) => adapter.addReaction!(
      target,
      emoji,
      { signal },
    ));
    if (added.ok && added.value !== undefined && added.value !== null) {
      currentReaction = added.value;
    }
  };

  // Calling an async function starts the provider request synchronously up to
  // its first await, while the returned tail remains completely detached from
  // normal message processing.
  let tail = transition(reactions.processing);
  const finish = (emoji: unknown) => {
    if (terminal) return;
    terminal = true;
    tail = tail.then(() => transition(emoji), () => transition(emoji));
    void tail.catch(() => undefined);
  };

  return Object.freeze({
    success: () => finish(reactions.success),
    error: () => finish(reactions.error),
    clear: () => finish(null),
    settled: () => tail,
  });
}
