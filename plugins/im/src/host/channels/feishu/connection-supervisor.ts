const DEFAULT_RETRY_DELAYS_MS = Object.freeze([250, 1_000, 3_000, 5_000, 10_000, 30_000]);

type SupervisorTotals = { configured: number; connected: number };
type SupervisorStatus = {
  totals?: { configured?: unknown; connected?: unknown };
  bots?: Array<{ connected?: unknown } | null | undefined>;
};
type SupervisorController = {
  initialize: () => unknown;
  status: () => unknown;
};
type SupervisorHarness = {
  ensureRunning: () => unknown;
};
type SupervisorLogger = {
  warn?: (...args: unknown[]) => unknown;
};
type TimerHandle = { unref?: () => void };
type SupervisorOptions = {
  controller?: SupervisorController | null;
  harness?: SupervisorHarness | null;
  logger?: SupervisorLogger;
  retryDelaysMs?: unknown;
  healthyIntervalMs?: number;
  setTimeoutImpl?: (callback: () => void, delay: number) => TimerHandle;
  clearTimeoutImpl?: (handle: TimerHandle) => void;
};

function safeDelay(value: unknown, fallback: number) {
  return Number.isFinite(value) && (value as number) >= 0 ? (value as number) : fallback;
}

function safeRetryDelays(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return [...DEFAULT_RETRY_DELAYS_MS];
  const delays = value.map((delay) => safeDelay(delay, -1)).filter((delay) => delay >= 0);
  return delays.length > 0 ? delays : [...DEFAULT_RETRY_DELAYS_MS];
}

function totals(status: SupervisorStatus | null | undefined): SupervisorTotals {
  const reported = status?.totals;
  const configured = Number.isInteger(reported?.configured)
    ? Number(reported?.configured)
    : (Array.isArray(status?.bots) ? status.bots.length : 0);
  const connected = Number.isInteger(reported?.connected)
    ? Number(reported?.connected)
    : (Array.isArray(status?.bots)
      ? status.bots.filter((bot) => bot?.connected === true).length
      : 0);
  return { configured, connected };
}

/**
 * Starts bot connections only after the in-process Harness HTTP API is ready,
 * then periodically reconciles failed/offline bots. Timers never keep the Host
 * alive on their own and shutdown waits for an in-flight reconciliation.
 */
export class ConnectionSupervisor {
  #controller: SupervisorController;
  #harness: SupervisorHarness;
  #logger: SupervisorLogger;
  #retryDelaysMs: number[];
  #healthyIntervalMs: number;
  #setTimeout: (callback: () => void, delay: number) => TimerHandle;
  #clearTimeout: (handle: TimerHandle) => void;
  #timer: TimerHandle | null = null;
  #running: Promise<void> | null = null;
  #retryIndex = 0;
  #started = false;
  #closed = false;
  #ready: Promise<unknown>;
  #resolveReady: ((status: unknown) => void) | null = null;

  constructor({
    controller,
    harness,
    logger = console,
    retryDelaysMs,
    healthyIntervalMs = 15_000,
    setTimeoutImpl = (callback, delay) => setTimeout(callback, delay),
    clearTimeoutImpl = (handle) => {
      clearTimeout(handle as ReturnType<typeof setTimeout>);
    },
  }: SupervisorOptions) {
    if (!controller
      || typeof controller.initialize !== 'function'
      || typeof controller.status !== 'function') {
      throw new TypeError('ConnectionSupervisor requires a controller');
    }
    if (!harness || typeof harness.ensureRunning !== 'function') {
      throw new TypeError('ConnectionSupervisor requires a Harness client');
    }
    this.#controller = controller;
    this.#harness = harness;
    this.#logger = logger;
    this.#retryDelaysMs = safeRetryDelays(retryDelaysMs);
    this.#healthyIntervalMs = safeDelay(healthyIntervalMs, 15_000);
    this.#setTimeout = setTimeoutImpl;
    this.#clearTimeout = clearTimeoutImpl;
    this.#ready = new Promise((resolve) => {
      this.#resolveReady = resolve;
    });
  }

  get ready() {
    return this.#ready;
  }

  start() {
    if (this.#started || this.#closed) return this;
    this.#started = true;
    this.#schedule(0);
    return this;
  }

  async close() {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#timer !== null) {
      this.#clearTimeout(this.#timer);
      this.#timer = null;
    }
    await this.#running?.catch(() => undefined);
    this.#resolveReady?.(null);
    this.#resolveReady = null;
  }

  #schedule(delayMs: number) {
    if (this.#closed) return;
    this.#timer = this.#setTimeout(() => {
      this.#timer = null;
      void this.#run();
    }, delayMs);
    this.#timer?.unref?.();
  }

  async #run() {
    if (this.#closed || this.#running) return;
    const operation = this.#reconcile();
    this.#running = operation;
    try {
      await operation;
    } finally {
      if (this.#running === operation) this.#running = null;
    }
  }

  async #reconcile() {
    try {
      await this.#harness.ensureRunning();
    } catch (error) {
      if (this.#closed) return;
      this.#retry('Harness Host is not ready', error);
      return;
    }
    if (this.#closed) return;

    try {
      await this.#controller.initialize();
      if (this.#closed) return;

      const status = await this.#controller.status();
      this.#resolveReady?.(status);
      this.#resolveReady = null;
      const current = totals(status as SupervisorStatus);
      if (current.connected < current.configured) {
        const delay = this.#retryDelaysMs[Math.min(this.#retryIndex, this.#retryDelaysMs.length - 1)];
        this.#retryIndex += 1;
        this.#logger.warn?.(
          `[dsh-feishu] ${current.connected}/${current.configured} bots connected; retrying automatically in ${delay}ms`,
        );
        this.#schedule(delay);
        return;
      }

      this.#retryIndex = 0;
      this.#schedule(this.#healthyIntervalMs);
    } catch (error) {
      if (this.#closed) return;
      this.#retry('Bot connection reconciliation failed', error);
    }
  }

  #retry(message: string, error: unknown) {
    const delay = this.#retryDelaysMs[Math.min(this.#retryIndex, this.#retryDelaysMs.length - 1)];
    this.#retryIndex += 1;
    this.#logger.warn?.(
      `[dsh-feishu] ${message}; retrying automatically in ${delay}ms`,
      error,
    );
    this.#schedule(delay);
  }
}

export function createConnectionSupervisor(options: SupervisorOptions) {
  return new ConnectionSupervisor(options);
}
