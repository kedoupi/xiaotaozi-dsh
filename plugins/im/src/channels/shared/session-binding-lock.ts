type LockState = object;
type LockTable = Map<string, Promise<void>>;

const bindingLocks = new WeakMap<LockState, LockTable>();

function stateLocks(state: LockState): LockTable {
  let locks = bindingLocks.get(state);
  if (!locks) {
    locks = new Map<string, Promise<void>>();
    bindingLocks.set(state, locks);
  }
  return locks;
}

/**
 * Serialize the short Session binding transaction for one conversation.
 * The caller must keep long-running Session work, such as ask(), outside.
 */
export async function withSessionBindingLock<T>(
  state: LockState,
  key: string,
  operation: () => T | Promise<T>,
): Promise<T> {
  const stateType = typeof state;
  if ((stateType !== 'object' && stateType !== 'function') || state === null) {
    throw new TypeError('state is required');
  }
  if (typeof key !== 'string' || !key) throw new TypeError('conversation key is required');
  if (typeof operation !== 'function') throw new TypeError('operation is required');

  const locks = stateLocks(state);
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  locks.set(key, current);

  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (locks.get(key) === current) {
      locks.delete(key);
      if (locks.size === 0) bindingLocks.delete(state);
    }
  }
}
