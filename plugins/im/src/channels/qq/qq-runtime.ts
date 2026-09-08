import { QQBot, typingIndicator, type QQBotOptions } from '@tencent-connect/qqbot-nodejs';

import {
  connectionTestTarget,
  connectionTestTargetUnavailable,
} from '../shared/connection-test.ts';
import { createQqBridgeStatus, QqHarnessBridge } from './qq-bridge.ts';

type CodedError = Error & { code: string };

type QqRuntimeConfig = {
  botId: string;
  appId: string;
  ownerUserOpenid?: string | null;
};

type QqLogger = {
  error?: (...args: unknown[]) => unknown;
  warn?: (...args: unknown[]) => unknown;
  info?: (...args: unknown[]) => unknown;
  debug?: (...args: unknown[]) => unknown;
};

type QqHarness = {
  ensureRunning: () => unknown;
};

type QqRuntimeState = {
  setConnectionTestTarget?: (target: object) => unknown;
  getConnectionTestTarget?: () => unknown;
};

type QqBotClient = {
  start: (signal?: AbortSignal) => unknown;
  stop: () => unknown;
  sendText: (target: unknown, text: unknown) => unknown;
  use?: (middleware: unknown) => unknown;
  on: (event: string, listener: (...args: unknown[]) => unknown) => unknown;
};

type QqBotFactory = (options: QQBotOptions) => unknown;

type TypingMiddlewareContext = {
  message?: {
    senderId?: unknown;
  };
};

type TypingMiddlewareFactory = (options: {
  keepAlive: boolean;
  predicate: (ctx: TypingMiddlewareContext) => boolean;
}) => unknown;

type QqHarnessBridgeLike = {
  accept: (message: unknown) => unknown;
  waitForIdle: () => Promise<unknown> | unknown;
};

export type QqRuntimeStatus = {
  startedAt: string | null;
  ready: boolean;
  qqConnectionState: string;
  harnessReachable: boolean;
  lastCheckedAt: number | null;
  lastConnectedAt: number | null;
  lastError: string | null;
  messagesReceived: number;
  messagesReplied: number;
  messagesRejected: number;
  artifactsSent: number;
  artifactSendErrors: number;
  lastMessageAt: string | number | null;
  lastReplyAt: string | number | null;
  lastRejectedAt: string | number | null;
  lastMessageError: string | null;
};

export type QqRuntimeOptions = {
  config: QqRuntimeConfig;
  appSecret: string;
  harness: QqHarness;
  state: QqRuntimeState;
  logger?: QqLogger;
  replyTimeoutMs?: number;
  connectTimeoutMs?: number;
  createBot?: QqBotFactory;
  typingMiddleware?: TypingMiddlewareFactory;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function timeoutError() {
  const error = new Error('QQ WebSocket did not become ready in time') as CodedError;
  error.code = 'connect-timeout';
  return error;
}

function rememberedC2cOpenid(state: QqRuntimeState) {
  const remembered = connectionTestTarget(state);
  if (!isRecord(remembered) || remembered.scope !== 'c2c') return '';
  return typeof remembered.targetId === 'string' ? remembered.targetId.trim() : '';
}

function isQqBotClient(value: unknown): value is QqBotClient {
  return isRecord(value)
    && typeof value.start === 'function'
    && typeof value.stop === 'function';
}

export function createQqRuntimeStatus(): QqRuntimeStatus {
  return {
    startedAt: null,
    ready: false,
    qqConnectionState: 'idle',
    harnessReachable: false,
    lastCheckedAt: null,
    lastConnectedAt: null,
    // lastError comes from the bridge snapshot so the two halves share one field.
    ...createQqBridgeStatus(),
  };
}

export class QqRuntime {
  #config: QqRuntimeConfig;
  #appSecret: string;
  #harness: QqHarness;
  #state: QqRuntimeState;
  #logger: QqLogger;
  #replyTimeoutMs: number;
  #connectTimeoutMs: number;
  #createBot: QqBotFactory;
  #typingMiddleware: TypingMiddlewareFactory;
  #status: QqRuntimeStatus = createQqRuntimeStatus();
  #bot: QqBotClient | null = null;
  #bridge: QqHarnessBridgeLike | null = null;
  #abortController: AbortController | null = null;
  #runTask: Promise<unknown> | null = null;
  #starting: Promise<QqRuntimeStatus> | null = null;

  constructor({
    config,
    appSecret,
    harness,
    state,
    logger = console,
    replyTimeoutMs = 600_000,
    connectTimeoutMs = 20_000,
    createBot = (options) => new QQBot(options),
    typingMiddleware = typingIndicator as TypingMiddlewareFactory,
  }: QqRuntimeOptions) {
    if (!config || !appSecret || !harness || !state) {
      throw new TypeError('QqRuntime requires config, app secret, Harness, and state');
    }
    this.#config = config;
    this.#appSecret = appSecret;
    this.#harness = harness;
    this.#state = state;
    this.#logger = logger;
    this.#replyTimeoutMs = replyTimeoutMs;
    this.#connectTimeoutMs = connectTimeoutMs;
    this.#createBot = createBot;
    this.#typingMiddleware = typingMiddleware;
  }

  get status() {
    return structuredClone(this.#status);
  }

  get state() {
    return this.#state;
  }

  async sendConnectionTest(text: unknown) {
    if (!this.#status.ready || !this.#bot) {
      throw connectionTestTargetUnavailable('QQ机器人');
    }
    const ownerUserOpenid = typeof this.#config.ownerUserOpenid === 'string'
      ? this.#config.ownerUserOpenid.trim()
      : '';
    const rememberedUserOpenid = rememberedC2cOpenid(this.#state);
    const target = rememberedUserOpenid
      ? { scope: 'c2c', targetId: rememberedUserOpenid }
      : (ownerUserOpenid && ownerUserOpenid !== '*'
        ? { scope: 'c2c', targetId: ownerUserOpenid }
        : null);
    if (!target) throw connectionTestTargetUnavailable('QQ机器人');
    await this.#bot.sendText(target, text);
    return { sent: true };
  }

  async start() {
    if (this.#status.ready && this.#bot) return this.status;
    if (this.#starting) return this.#starting;
    this.#starting = this.#start().finally(() => {
      this.#starting = null;
    });
    return this.#starting;
  }

  async #start() {
    await this.stop();
    this.#status.startedAt = new Date().toISOString();
    this.#status.qqConnectionState = 'connecting';
    this.#status.lastError = null;
    await this.#harness.ensureRunning();
    this.#status.harnessReachable = true;

    const sdkLogger = {
      error: (...args: unknown[]) => this.#logger.error?.(...args),
      warn: (...args: unknown[]) => this.#logger.warn?.(...args),
      info: (...args: unknown[]) => this.#logger.info?.(...args),
      debug: () => {},
    };
    const created = this.#createBot({
      appId: this.#config.appId,
      appSecret: this.#appSecret,
      accountId: this.#config.botId,
      logger: sdkLogger,
      transport: 'websocket',
      tokenPrefetch: 'sync',
    });
    if (!isQqBotClient(created)) {
      throw new TypeError('QQ bot factory returned an invalid client');
    }
    const bot = created;
    const controller = new AbortController();
    this.#abortController = controller;
    this.#bot = bot;
    this.#bridge = new QqHarnessBridge({
      bot,
      ownerUserOpenid: this.#config.ownerUserOpenid,
      harness: this.#harness,
      state: this.#state,
      status: this.#status,
      logger: this.#logger,
      replyTimeoutMs: this.#replyTimeoutMs,
      signal: controller.signal,
    } as unknown as ConstructorParameters<typeof QqHarnessBridge>[0]);
    bot.use?.(this.#typingMiddleware({
      keepAlive: true,
      predicate: (ctx) => this.#config.ownerUserOpenid === '*'
        || ctx?.message?.senderId === this.#config.ownerUserOpenid,
    }));

    let readyResolve!: (value?: unknown) => void;
    let readyReject!: (error?: unknown) => void;
    const ready = new Promise((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });
    const onReady = () => {
      const now = Date.now();
      this.#status.ready = true;
      this.#status.qqConnectionState = 'connected';
      this.#status.lastCheckedAt = now;
      this.#status.lastConnectedAt = now;
      this.#status.lastError = null;
      readyResolve();
    };
    const onError = (error: unknown) => {
      if (!this.#status.ready) readyReject(error);
      else {
        this.#status.lastError = errorMessage(error);
        this.#logger.warn?.(`[dsh-im:qq] bot ${this.#config.botId} connection error:`, error);
      }
    };
    const onMessage = (_ctx: unknown, message: unknown) => {
      const task = this.#bridge?.accept(message);
      if (!task) return;
      void Promise.resolve(task).catch((error: unknown) => {
        if (controller.signal.aborted) return;
        this.#logger.error?.(
          `[dsh-im:qq] bot ${this.#config.botId} message handling failed:`,
          error,
        );
      });
    };
    bot.on('ready', onReady);
    bot.on('resumed', onReady);
    bot.on('error', onError);
    bot.on('message', onMessage);

    const runTask = Promise.resolve().then(() => bot.start(controller.signal));
    this.#runTask = runTask;
    runTask.catch((error: unknown) => {
      if (controller.signal.aborted) return;
      readyReject(error);
      this.#status.ready = false;
      this.#status.qqConnectionState = 'failed';
      this.#status.lastError = errorMessage(error);
      this.#logger.error?.(`[dsh-im:qq] bot ${this.#config.botId} connection stopped:`, error);
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        ready,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(timeoutError()), this.#connectTimeoutMs);
        }),
      ]);
      this.#status.ready = true;
      this.#status.qqConnectionState = 'connected';
      this.#status.lastCheckedAt = Date.now();
      this.#status.lastConnectedAt = Date.now();
      return this.status;
    } catch (error: unknown) {
      this.#status.ready = false;
      this.#status.qqConnectionState = 'failed';
      this.#status.lastError = errorMessage(error);
      await this.stop();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async stop() {
    const bot = this.#bot;
    const bridge = this.#bridge;
    const runTask = this.#runTask;
    this.#abortController?.abort();
    this.#abortController = null;
    this.#bot = null;
    this.#bridge = null;
    this.#runTask = null;
    try {
      bot?.stop();
    } catch (error: unknown) {
      this.#logger.warn?.(`[dsh-im:qq] bot ${this.#config.botId} failed to stop cleanly:`, error);
    }
    await Promise.race([
      runTask?.catch(() => undefined) ?? Promise.resolve(),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
    await bridge?.waitForIdle();
    this.#status.ready = false;
    this.#status.qqConnectionState = 'idle';
    return this.status;
  }
}
