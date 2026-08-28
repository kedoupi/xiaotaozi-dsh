// @ts-nocheck
import { DEFAULT_WEIXIN_MAX_MESSAGE_CHARS, WeixinApiError } from './weixin-api.ts';
import { createWeixinBridgeStatus, WeixinHarnessBridge } from './weixin-bridge.ts';
import {
  connectionTestTarget,
  connectionTestTargetUnavailable,
} from '../shared/connection-test.ts';

const DEFAULT_START_RETRY_DELAYS_MS = Object.freeze([250, 1_000, 3_000]);

function startRetryDelays(value) {
  if (value === undefined) return [...DEFAULT_START_RETRY_DELAYS_MS];
  if (!Array.isArray(value)) throw new TypeError('startRetryDelaysMs must be an array');
  return value.map((wait) => {
    if (!Number.isFinite(wait) || wait < 0) {
      throw new TypeError('startRetryDelaysMs must contain non-negative delays');
    }
    return wait;
  });
}

function retryableStartError(error) {
  if (!(error instanceof WeixinApiError)) return false;
  if (error.code === 'network-error' || error.code === 'timeout') return true;
  return error.code === 'http-error'
    && (error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500);
}

function runtimeStartError(code, cause) {
  const error = new Error(`Weixin runtime failed during ${code}`, { cause });
  error.name = 'WeixinRuntimeStartError';
  error.code = code;
  return error;
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }
    const finish = () => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function createWeixinRuntimeStatus() {
  return {
    startedAt: null,
    ready: false,
    weixinConnectionState: 'idle',
    harnessReachable: false,
    lastCheckedAt: null,
    lastError: null,
    ...createWeixinBridgeStatus(),
  };
}

export class WeixinRuntime {
  #api;
  #config;
  #token;
  #harness;
  #state;
  #logger;
  #replyTimeoutMs;
  #maxMessageChars;
  #startRetryDelaysMs;
  #status = createWeixinRuntimeStatus();
  #bridge = null;
  #abortController = null;
  #monitor = null;
  #starting = null;
  #startController = null;

  constructor({
    api,
    config,
    token,
    harness,
    state,
    logger = console,
    replyTimeoutMs = 600_000,
    maxMessageChars = DEFAULT_WEIXIN_MAX_MESSAGE_CHARS,
    startRetryDelaysMs,
  }) {
    if (!api || !config || !token || !harness || !state) {
      throw new TypeError('WeixinRuntime requires API, account, token, Harness, and state');
    }
    this.#api = api;
    this.#config = config;
    this.#token = token;
    this.#harness = harness;
    this.#state = state;
    this.#logger = logger;
    this.#replyTimeoutMs = replyTimeoutMs;
    this.#maxMessageChars = maxMessageChars;
    this.#startRetryDelaysMs = startRetryDelays(startRetryDelaysMs);
  }

  get status() {
    return structuredClone(this.#status);
  }

  get state() {
    return this.#state;
  }

  async start() {
    if (this.#status.ready && this.#monitor) return this.status;
    if (this.#starting) return this.#starting;
    this.#starting = this.#start().finally(() => {
      this.#starting = null;
    });
    return this.#starting;
  }

  async #start() {
    const controller = new AbortController();
    this.#startController = controller;
    const signal = controller.signal;
    let notified = false;
    try {
      await this.#shutdown();
      signal.throwIfAborted();
      this.#status.startedAt = new Date().toISOString();
      this.#status.weixinConnectionState = 'connecting';
      this.#status.lastError = null;
      try {
        await this.#harness.ensureRunning();
      } catch (error) {
        throw runtimeStartError('harness-unreachable', error);
      }
      signal.throwIfAborted();
      this.#status.harnessReachable = true;
      await this.#notifyStart(signal);
      notified = true;
      signal.throwIfAborted();
      this.#abortController = controller;
      this.#bridge = new WeixinHarnessBridge({
        api: this.#api,
        baseUrl: this.#config.baseUrl,
        token: this.#token,
        ownerUserId: this.#config.ownerUserId,
        harness: this.#harness,
        state: this.#state,
        status: this.#status,
        logger: this.#logger,
        replyTimeoutMs: this.#replyTimeoutMs,
        maxMessageChars: this.#maxMessageChars,
        signal,
      });
      this.#status.ready = true;
      this.#status.weixinConnectionState = 'connected';
      this.#status.lastCheckedAt = Date.now();
      this.#monitor = this.#runMonitor(signal).catch((error) => {
        if (signal.aborted) return;
        this.#status.ready = false;
        this.#status.weixinConnectionState = 'failed';
        this.#status.lastError = error?.message ?? String(error);
        this.#logger.error?.(`[dsh-weixin] account ${this.#config.botId} monitor stopped:`, error);
      });
      return this.status;
    } catch (error) {
      controller.abort();
      if (this.#abortController === controller) this.#abortController = null;
      this.#bridge = null;
      if (notified) {
        await this.#api.notifyStop({
          baseUrl: this.#config.baseUrl,
          token: this.#token,
          signal: AbortSignal.timeout(10_000),
        }).catch(() => undefined);
      }
      this.#status.ready = false;
      this.#status.weixinConnectionState = 'failed';
      this.#status.lastError = error?.message ?? String(error);
      throw error;
    } finally {
      if (this.#startController === controller) this.#startController = null;
    }
  }

  async #notifyStart(signal) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.#api.notifyStart({
          baseUrl: this.#config.baseUrl,
          token: this.#token,
          signal,
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        const wait = this.#startRetryDelaysMs[attempt];
        if (wait === undefined || !retryableStartError(error)) throw error;
        this.#logger.warn?.(
          `[dsh-weixin] account ${this.#config.botId} start request failed; retrying in ${wait}ms:`,
          error,
        );
        await delay(wait, signal);
      }
    }
  }

  async #runMonitor(signal) {
    let consecutiveFailures = 0;
    // The polling cursor advances in memory right away so the loop keeps
    // fetching new batches, but it is only persisted after every accept of the
    // batch has settled: a crash before then re-fetches the batch instead of
    // silently dropping it (at-least-once).
    let pollCursor = this.#state.getUpdatesBuf();
    let cursorPersistence = Promise.resolve();
    try {
      while (!signal.aborted) {
        try {
          const response = await this.#api.getUpdates({
            baseUrl: this.#config.baseUrl,
            token: this.#token,
            getUpdatesBuf: pollCursor,
            signal,
          });
          if (signal.aborted) return;
          const rejected = (response?.ret !== undefined && response.ret !== 0)
            || (response?.errcode !== undefined && response.errcode !== 0);
          if (rejected) {
            const code = response.errcode ?? response.ret;
            throw new WeixinApiError(
              code === -14 ? 'stale-token' : 'updates-rejected',
              code === -14 ? '微信登录凭据已失效，请移除账号后重新扫码。' : '微信消息同步请求被拒绝。',
            );
          }
          consecutiveFailures = 0;
          this.#status.ready = true;
          this.#status.weixinConnectionState = 'connected';
          this.#status.lastCheckedAt = Date.now();
          this.#status.lastError = null;

          const accepted = (response?.msgs ?? []).map((message) => (
            this.#bridge.accept(message).catch((error) => {
              if (signal.aborted) return;
              this.#logger.error?.(
                `[dsh-weixin] account ${this.#config.botId} message handling failed:`,
                error,
              );
            })
          ));
          if (typeof response?.get_updates_buf === 'string' && response.get_updates_buf) {
            const nextCursor = response.get_updates_buf;
            pollCursor = nextCursor;
            const batchSettled = Promise.allSettled(accepted);
            cursorPersistence = cursorPersistence
              .then(() => batchSettled)
              .then(() => {
                if (signal.aborted) return undefined;
                return this.#state.setGetUpdatesBuf(nextCursor);
              })
              .catch((error) => {
                this.#logger.warn?.(
                  `[dsh-weixin] account ${this.#config.botId} failed to persist the poll cursor:`,
                  error,
                );
              });
          }
        } catch (error) {
          if (signal.aborted) return;
          consecutiveFailures += 1;
          this.#status.lastError = error?.message ?? String(error);
          this.#logger.warn?.(
            `[dsh-weixin] account ${this.#config.botId} poll failed (${consecutiveFailures}/3):`,
            error,
          );
          if (error instanceof WeixinApiError && error.code === 'stale-token') throw error;
          if (consecutiveFailures >= 3) throw error;
          await delay(Math.min(2_000 * (2 ** (consecutiveFailures - 1)), 10_000), signal);
        }
      }
    } finally {
      await cursorPersistence;
    }
  }

  async stop() {
    // Abort an in-flight start (including notifyStart retry waits) and wait
    // for it to settle so no bridge/monitor is created after stop returns.
    this.#startController?.abort();
    const starting = this.#starting;
    if (starting) await starting.catch(() => undefined);
    return this.#shutdown();
  }

  async #shutdown() {
    const monitor = this.#monitor;
    const bridge = this.#bridge;
    const wasStarted = Boolean(this.#abortController || monitor || this.#status.ready);
    this.#abortController?.abort();
    this.#abortController = null;
    this.#monitor = null;
    await bridge?.close?.();
    await monitor?.catch(() => undefined);
    await bridge?.waitForIdle();
    this.#bridge = null;
    if (wasStarted) {
      try {
        await this.#api.notifyStop({
          baseUrl: this.#config.baseUrl,
          token: this.#token,
          signal: AbortSignal.timeout(10_000),
        });
      } catch (error) {
        this.#logger.warn?.(`[dsh-weixin] account ${this.#config.botId} stop notification failed:`, error);
      }
    }
    this.#status.ready = false;
    this.#status.weixinConnectionState = 'idle';
    return this.status;
  }

  async sendConnectionTest(text) {
    const remembered = connectionTestTarget(this.#state);
    const toUserId = typeof remembered?.toUserId === 'string' && remembered.toUserId.trim()
      ? remembered.toUserId.trim()
      : null;
    if (!toUserId) throw connectionTestTargetUnavailable('微信机器人');
    if (!this.#status.ready || !this.#abortController) {
      throw new Error('Weixin runtime is not connected');
    }
    const contextToken = typeof remembered.contextToken === 'string' && remembered.contextToken.trim()
      ? remembered.contextToken.trim()
      : undefined;
    await this.#api.sendText({
      baseUrl: this.#config.baseUrl,
      token: this.#token,
      toUserId,
      text,
      ...(contextToken ? { contextToken } : {}),
      signal: this.#abortController.signal,
    });
    return { sent: true };
  }
}
