const ACTIVE_STATES = new Set([
  'starting',
  'qr_ready',
  'polling',
  'slow_down',
  'domain_switched',
  'saving',
]);

const SDK_POLLING_STATES = new Set([
  'polling',
  'slow_down',
  'domain_switched',
]);

const KNOWN_ERROR_CODES = ['access_denied', 'expired_token', 'abort'] as const;

export const REGISTRATION_STATES = Object.freeze({
  IDLE: 'idle',
  STARTING: 'starting',
  QR_READY: 'qr_ready',
  POLLING: 'polling',
  SLOW_DOWN: 'slow_down',
  DOMAIN_SWITCHED: 'domain_switched',
  SAVING: 'saving',
  SUCCEEDED: 'succeeded',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  ERROR: 'error',
} as const);

type KnownErrorCode = (typeof KNOWN_ERROR_CODES)[number];

export type RegistrationPublicError = {
  code: string;
  message: string;
};

export type RegistrationCredentials = {
  client_id: string;
  client_secret: string;
  user_info?: Record<string, unknown>;
};

export type RegistrationSnapshot = {
  state: string;
  attempt: number;
  updatedAt: number;
  error?: RegistrationPublicError;
  qrCodeUrl?: string | null;
  expiresAt?: number | null;
  pollIntervalSeconds?: number | null;
  remainingSeconds?: number;
};

type TimerHandle = {
  unref?: (() => unknown) | undefined;
};

type SetTimeoutFn = (callback: () => void, delay: number) => TimerHandle;
type ClearTimeoutFn = (handle: TimerHandle) => void;

type RegistrationAttempt = {
  id: number;
  controller: AbortController;
  qrCodeUrl: string | null;
  expiresAt: number | null;
  pollIntervalSeconds: number | null;
  expiryTimer: TimerHandle | null;
};

type QrReadyInfo = {
  url?: unknown;
  expireIn?: unknown;
};

type StatusChangeInfo = {
  status?: unknown;
  interval?: unknown;
};

export type RegisterAppOptions = Record<string, unknown> & {
  signal: AbortSignal;
  onQRCodeReady: (info: QrReadyInfo) => unknown;
  onStatusChange: (info: StatusChangeInfo) => unknown;
};

export type RegistrationManagerOptions = {
  registerApp?: unknown;
  onCredentials?: unknown;
  now?: () => number;
  setTimeout?: SetTimeoutFn;
  clearTimeout?: ClearTimeoutFn;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isKnownErrorCode(value: unknown): value is KnownErrorCode {
  return typeof value === 'string' && (KNOWN_ERROR_CODES as readonly string[]).includes(value);
}

function isSdkPollingState(value: unknown): value is string {
  return typeof value === 'string' && SDK_POLLING_STATES.has(value);
}

function errorCode(error: unknown) {
  const code = isRecord(error) ? error.code : undefined;
  if (isKnownErrorCode(code)) return code;
  return 'registration_failed';
}

function publicError(error: unknown): RegistrationPublicError {
  const code = errorCode(error);
  const messages: Record<string, string> = {
    access_denied: 'Registration was denied.',
    abort: 'Registration was cancelled.',
    expired_token: 'The registration QR code expired.',
  };

  // SDK/network errors are deliberately not copied verbatim. Besides keeping
  // the API stable, this prevents a downstream error from reflecting a secret
  // into a status response.
  return {
    code,
    message: messages[code] ?? 'Unable to register the Feishu app.',
  };
}

function expirySeconds(value: unknown) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new TypeError('registerApp onQRCodeReady returned an invalid expireIn');
  }
  return seconds;
}

function copyUserInfo(userInfo: unknown) {
  if (userInfo === undefined) return undefined;
  if (userInfo === null || typeof userInfo !== 'object' || Array.isArray(userInfo)) {
    throw new TypeError('registerApp returned invalid user_info');
  }
  return { ...userInfo };
}

/**
 * Owns one Feishu device-registration attempt at a time.
 *
 * `start()` intentionally does not await the long-running SDK poll. Consumers
 * start an attempt and then poll `status()` until it reaches a terminal state.
 * The App Secret never becomes manager state and is only handed to the injected
 * `onCredentials` callback.
 */
export class RegistrationManager {
  #registerApp: (options: RegisterAppOptions) => unknown;
  #onCredentials: (credentials: RegistrationCredentials) => unknown;
  #now: () => number;
  #setTimeout: SetTimeoutFn;
  #clearTimeout: ClearTimeoutFn;
  #attempt = 0;
  #active: RegistrationAttempt | null = null;
  #snapshot: RegistrationSnapshot;

  constructor({
    registerApp,
    onCredentials,
    now = Date.now,
    setTimeout: setTimeoutFn = globalThis.setTimeout as unknown as SetTimeoutFn,
    clearTimeout: clearTimeoutFn = globalThis.clearTimeout as unknown as ClearTimeoutFn,
  }: RegistrationManagerOptions = {}) {
    if (typeof registerApp !== 'function') {
      throw new TypeError('RegistrationManager requires a registerApp function');
    }
    if (typeof onCredentials !== 'function') {
      throw new TypeError('RegistrationManager requires an onCredentials function');
    }
    if (typeof now !== 'function' || typeof setTimeoutFn !== 'function' || typeof clearTimeoutFn !== 'function') {
      throw new TypeError('RegistrationManager clock dependencies must be functions');
    }

    this.#registerApp = registerApp as (options: RegisterAppOptions) => unknown;
    this.#onCredentials = onCredentials as (credentials: RegistrationCredentials) => unknown;
    this.#now = now;
    this.#setTimeout = setTimeoutFn;
    this.#clearTimeout = clearTimeoutFn;
    this.#snapshot = this.#makeSnapshot(null, REGISTRATION_STATES.IDLE);
  }

  start(registerOptions: Record<string, unknown> = {}) {
    if (registerOptions === null || typeof registerOptions !== 'object' || Array.isArray(registerOptions)) {
      throw new TypeError('Registration options must be an object');
    }

    this.#supersedeActiveAttempt();

    const run: RegistrationAttempt = {
      id: ++this.#attempt,
      controller: new AbortController(),
      qrCodeUrl: null,
      expiresAt: null,
      pollIntervalSeconds: null,
      expiryTimer: null,
    };
    this.#active = run;
    this.#snapshot = this.#makeSnapshot(run, REGISTRATION_STATES.STARTING);

    const options: RegisterAppOptions = {
      ...registerOptions,
      signal: run.controller.signal,
      onQRCodeReady: (info) => this.#onQRCodeReady(run, info),
      onStatusChange: (info) => this.#onStatusChange(run, info),
    };

    // Put the SDK invocation on a microtask so a synchronous throw and a
    // Promise rejection follow the same path without making start() blocking.
    const registration = Promise.resolve().then(() => this.#registerApp(options));
    void registration.then(
      (result) => this.#onRegistrationSucceeded(run, result),
      (error) => this.#onRegistrationFailed(run, error),
    );

    return this.status();
  }

  status() {
    this.#expireIfNeeded();

    const snapshot: RegistrationSnapshot = { ...this.#snapshot };
    if (snapshot.error) snapshot.error = { ...snapshot.error };

    const run = this.#active;
    if (run && run.expiresAt !== null && ACTIVE_STATES.has(snapshot.state)) {
      snapshot.remainingSeconds = Math.max(0, Math.ceil((run.expiresAt - this.#now()) / 1000));
    }
    return snapshot;
  }

  cancel() {
    const run = this.#active;
    if (!run) return this.status();

    this.#finishRun(run, REGISTRATION_STATES.CANCELLED, {
      error: {
        code: 'abort',
        message: 'Registration was cancelled.',
      },
    });
    run.controller.abort();
    return this.status();
  }

  #isCurrent(run: RegistrationAttempt) {
    return this.#active === run;
  }

  #makeSnapshot(
    run: RegistrationAttempt | null,
    state: string,
    extra: Partial<RegistrationSnapshot> = {},
  ): RegistrationSnapshot {
    const snapshot: RegistrationSnapshot = {
      state,
      attempt: run?.id ?? this.#attempt,
      updatedAt: this.#now(),
      ...extra,
    };

    if (run?.qrCodeUrl && ACTIVE_STATES.has(state)) {
      snapshot.qrCodeUrl = run.qrCodeUrl;
      snapshot.expiresAt = run.expiresAt;
    }
    if (run && run.pollIntervalSeconds !== null && ACTIVE_STATES.has(state)) {
      snapshot.pollIntervalSeconds = run.pollIntervalSeconds;
    }
    return snapshot;
  }

  #setRunState(run: RegistrationAttempt, state: string, extra: Partial<RegistrationSnapshot> = {}) {
    if (!this.#isCurrent(run)) return;
    this.#snapshot = this.#makeSnapshot(run, state, extra);
  }

  #onQRCodeReady(run: RegistrationAttempt, info: QrReadyInfo) {
    if (!this.#isCurrent(run)) return;
    if (typeof info?.url !== 'string' || !info.url) {
      throw new TypeError('registerApp onQRCodeReady returned an invalid URL');
    }

    const seconds = expirySeconds(info.expireIn);
    run.qrCodeUrl = info.url;
    run.expiresAt = this.#now() + (seconds * 1000);
    this.#clearExpiryTimer(run);
    run.expiryTimer = this.#setTimeout(() => this.#expireRun(run), seconds * 1000);
    run.expiryTimer?.unref?.();
    this.#setRunState(run, REGISTRATION_STATES.QR_READY);
  }

  #onStatusChange(run: RegistrationAttempt, info: StatusChangeInfo) {
    if (!this.#isCurrent(run) || !isSdkPollingState(info?.status)) return;
    if (info.status === REGISTRATION_STATES.SLOW_DOWN && Number.isFinite(Number(info.interval))) {
      run.pollIntervalSeconds = Number(info.interval);
    }
    this.#setRunState(run, info.status);
  }

  async #onRegistrationSucceeded(run: RegistrationAttempt, result: unknown) {
    if (!this.#isCurrent(run)) return;

    const record = isRecord(result) ? result : undefined;
    const clientId = record?.client_id;
    const clientSecret = record?.client_secret;
    if (typeof clientId !== 'string' || !clientId || typeof clientSecret !== 'string' || !clientSecret) {
      this.#finishRun(run, REGISTRATION_STATES.ERROR, {
        error: {
          code: 'invalid_credentials',
          message: 'Feishu registration returned invalid credentials.',
        },
      });
      return;
    }

    let userInfo;
    try {
      userInfo = copyUserInfo(record?.user_info);
    } catch {
      this.#finishRun(run, REGISTRATION_STATES.ERROR, {
        error: {
          code: 'invalid_credentials',
          message: 'Feishu registration returned invalid credentials.',
        },
      });
      return;
    }

    // Once the SDK has returned credentials, QR expiry no longer applies.
    // Remove the device URL before awaiting persistence so it also disappears
    // from the public `saving` status.
    this.#clearExpiryTimer(run);
    run.qrCodeUrl = null;
    run.expiresAt = null;
    run.pollIntervalSeconds = null;
    this.#setRunState(run, REGISTRATION_STATES.SAVING);
    try {
      await this.#onCredentials({
        client_id: clientId,
        client_secret: clientSecret,
        user_info: userInfo,
      });
    } catch {
      if (this.#isCurrent(run)) {
        this.#finishRun(run, REGISTRATION_STATES.ERROR, {
          error: {
            code: 'credentials_callback_failed',
            message: 'Unable to store the Feishu credentials.',
          },
        });
      }
      return;
    }

    if (this.#isCurrent(run)) {
      this.#finishRun(run, REGISTRATION_STATES.SUCCEEDED);
    }
  }

  #onRegistrationFailed(run: RegistrationAttempt, error: unknown) {
    if (!this.#isCurrent(run)) return;

    const code = errorCode(error);
    if (code === 'expired_token') {
      this.#finishRun(run, REGISTRATION_STATES.EXPIRED, {
        error: publicError(error),
      });
      return;
    }
    if (code === 'abort') {
      this.#finishRun(run, REGISTRATION_STATES.CANCELLED, {
        error: publicError(error),
      });
      return;
    }
    this.#finishRun(run, REGISTRATION_STATES.ERROR, {
      error: publicError(error),
    });
  }

  #expireIfNeeded() {
    const run = this.#active;
    if (run && run.expiresAt !== null && this.#now() >= run.expiresAt) {
      this.#expireRun(run);
    }
  }

  #expireRun(run: RegistrationAttempt) {
    if (!this.#isCurrent(run)) return;
    this.#finishRun(run, REGISTRATION_STATES.EXPIRED, {
      error: {
        code: 'expired_token',
        message: 'The registration QR code expired.',
      },
    });
    run.controller.abort();
  }

  #finishRun(run: RegistrationAttempt, state: string, extra: Partial<RegistrationSnapshot> = {}) {
    if (!this.#isCurrent(run)) return;
    this.#clearExpiryTimer(run);
    this.#snapshot = this.#makeSnapshot(run, state, extra);
    this.#active = null;
  }

  #clearExpiryTimer(run: RegistrationAttempt) {
    if (run.expiryTimer !== null) {
      this.#clearTimeout(run.expiryTimer);
      run.expiryTimer = null;
    }
  }

  #supersedeActiveAttempt() {
    const previous = this.#active;
    if (!previous) return;
    this.#clearExpiryTimer(previous);
    this.#active = null;
    previous.controller.abort();
  }
}

export default RegistrationManager;
