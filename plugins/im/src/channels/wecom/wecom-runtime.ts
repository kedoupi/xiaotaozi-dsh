// @ts-nocheck
import { WSAuthFailureError, WSClient, WSReconnectExhaustedError } from '@wecom/aibot-node-sdk';

import { createWecomBridgeStatus, WecomHarnessBridge } from './wecom-bridge.ts';
import { sendRememberedConnectionTest } from '../shared/connection-test.ts';
import { pluginSdkLogger, pluginTrace } from '../../trace.ts';
import { wecomJourney } from '../../journey-trace.ts';

function timeoutError() {
  const error = new Error('Enterprise WeChat WebSocket authentication timed out');
  error.code = 'connect-timeout';
  return error;
}

export function createWecomRuntimeStatus() {
  return {
    startedAt: null,
    ready: false,
    wecomConnectionState: 'idle',
    harnessReachable: false,
    lastCheckedAt: null,
    lastConnectedAt: null,
    lastError: null,
    ...createWecomBridgeStatus(),
  };
}

export class WecomRuntime {
  #config;
  #secret;
  #harness;
  #state;
  #botName;
  #logger;
  #replyTimeoutMs;
  #streamKeepaliveIntervalMs;
  #streamMaxDurationMs;
  #connectTimeoutMs;
  #maxReconnectAttempts;
  #createClient;
  #status = createWecomRuntimeStatus();
  #client = null;
  #bridge = null;
  #starting = null;
  #startController = null;
  #runtimeController = null;

  constructor({
    config,
    secret,
    harness,
    state,
    logger = console,
    replyTimeoutMs = 600_000,
    streamKeepaliveIntervalMs = 12_000,
    streamMaxDurationMs = 300_000,
    connectTimeoutMs = 20_000,
    maxReconnectAttempts = 10,
    createClient = (options) => new WSClient(options),
    botName,
  }) {
    if (!config || !secret || !harness || !state) {
      throw new TypeError('WecomRuntime requires config, secret, Harness, and state');
    }
    this.#config = config;
    this.#secret = secret;
    this.#harness = harness;
    this.#state = state;
    this.#botName = botName;
    this.#logger = logger;
    this.#replyTimeoutMs = replyTimeoutMs;
    this.#streamKeepaliveIntervalMs = streamKeepaliveIntervalMs;
    this.#streamMaxDurationMs = streamMaxDurationMs;
    this.#connectTimeoutMs = connectTimeoutMs;
    this.#maxReconnectAttempts = maxReconnectAttempts;
    this.#createClient = createClient;
  }

  get status() {
    return structuredClone(this.#status);
  }

  get state() {
    return this.#state;
  }

  async start() {
    if (this.#status.ready && this.#client) return this.status;
    if (this.#starting) return this.#starting;
    this.#runtimeController?.abort(new DOMException('Enterprise WeChat runtime replaced', 'AbortError'));
    const controller = new AbortController();
    this.#startController = controller;
    this.#runtimeController = controller;
    this.#starting = this.#start(controller.signal).finally(() => {
      if (this.#startController === controller) this.#startController = null;
      this.#starting = null;
    });
    return this.#starting;
  }

  async #start(signal) {
    await this.#stopActive();
    signal.throwIfAborted();
    this.#status.startedAt = new Date().toISOString();
    this.#status.wecomConnectionState = 'connecting';
    this.#status.lastError = null;
    pluginTrace('dsh-im:wecom', `runtime state=connecting bot=${this.#config.botId}`);
    await this.#harness.ensureRunning();
    this.#status.harnessReachable = true;

    const client = this.#createClient({
      botId: this.#config.remoteBotId,
      secret: this.#secret,
      logger: pluginSdkLogger('dsh-im:wecom'),
      maxReconnectAttempts: this.#maxReconnectAttempts,
    });
    if (!client || typeof client.connect !== 'function' || typeof client.disconnect !== 'function') {
      throw new TypeError('Enterprise WeChat client factory returned an invalid client');
    }
    this.#client = client;
    this.#bridge = new WecomHarnessBridge({
      client,
      harness: this.#harness,
      state: this.#state,
      status: this.#status,
      logger: this.#logger,
      botName: this.#botName ?? this.#config.name,
      replyTimeoutMs: this.#replyTimeoutMs,
      streamKeepaliveIntervalMs: this.#streamKeepaliveIntervalMs,
      streamMaxDurationMs: this.#streamMaxDurationMs,
      signal,
    });

    let readyResolve;
    let readyReject;
    let authenticated = false;
    const ready = new Promise((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });
    const onAuthenticated = () => {
      if (this.#client !== client || signal.aborted) return;
      authenticated = true;
      const now = Date.now();
      this.#status.ready = true;
      this.#status.wecomConnectionState = 'connected';
      this.#status.lastCheckedAt = now;
      this.#status.lastConnectedAt = now;
      this.#status.lastError = null;
      pluginTrace('dsh-im:wecom', `runtime state=connected bot=${this.#config.botId}`);
      readyResolve();
    };
    const onDisconnected = () => {
      if (this.#client !== client) return;
      this.#status.ready = false;
      this.#status.wecomConnectionState = 'connecting';
      this.#status.lastCheckedAt = Date.now();
      pluginTrace('dsh-im:wecom', `runtime state=disconnected bot=${this.#config.botId}`);
    };
    const onReconnecting = () => {
      if (this.#client !== client) return;
      this.#status.ready = false;
      this.#status.wecomConnectionState = 'connecting';
      this.#status.lastCheckedAt = Date.now();
      pluginTrace('dsh-im:wecom', `runtime state=reconnecting bot=${this.#config.botId}`);
    };
    const onError = (error) => {
      if (this.#client !== client) return;
      const terminal = error instanceof WSAuthFailureError || error instanceof WSReconnectExhaustedError;
      if (!authenticated && terminal) readyReject(error);
      if (terminal) {
        this.#status.ready = false;
        this.#status.wecomConnectionState = 'failed';
        if (!signal.aborted) {
          wecomJourney.wsKick({ bot: this.#config.botId, reason: 'disconnected' });
        }
      }
      this.#status.lastError = terminal ? error.name : 'connection-error';
      pluginTrace('dsh-im:wecom', `runtime state=error bot=${this.#config.botId} reason=${this.#status.lastError}`);
      this.#logger.warn?.(`[dsh-im:wecom] bot ${this.#config.botId} connection error`);
    };
    const onMessage = (frame) => this.#bridge?.accept(frame);
    client.on('authenticated', onAuthenticated);
    client.on('disconnected', onDisconnected);
    client.on('reconnecting', onReconnecting);
    client.on('error', onError);
    client.on('message', onMessage);

    let timer;
    try {
      client.connect();
      await Promise.race([
        ready,
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(timeoutError()), this.#connectTimeoutMs);
        }),
      ]);
      return this.status;
    } catch (error) {
      if (signal.aborted) {
        await this.#stopActive();
        throw error;
      }
      this.#status.ready = false;
      this.#status.wecomConnectionState = 'failed';
      this.#status.lastError = error?.message ?? String(error);
      await this.#stopActive();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async stop() {
    const starting = this.#starting;
    this.#startController?.abort(new DOMException('Enterprise WeChat runtime stopped', 'AbortError'));
    this.#runtimeController?.abort(new DOMException('Enterprise WeChat runtime stopped', 'AbortError'));
    this.#runtimeController = null;
    await this.#stopActive();
    await starting?.catch(() => undefined);
    return this.status;
  }

  async sendConnectionTest(text) {
    return sendRememberedConnectionTest({
      state: this.#state,
      text,
      channelLabel: '企业微信机器人',
      send: async ({ chatId }, content) => {
        if (!this.#status.ready || !this.#client) {
          throw new Error('Enterprise WeChat runtime is not connected');
        }
        await this.#client.sendMessage(chatId, {
          msgtype: 'markdown',
          markdown: { content },
        });
      },
    });
  }

  async #stopActive() {
    const client = this.#client;
    const bridge = this.#bridge;
    this.#client = null;
    this.#bridge = null;
    try {
      client?.disconnect();
      client?.removeAllListeners?.();
    } catch (error) {
      this.#logger.warn?.(`[dsh-im:wecom] bot ${this.#config.botId} failed to stop cleanly`);
    }
    await bridge?.waitForIdle();
    this.#status.ready = false;
    this.#status.wecomConnectionState = 'idle';
  }
}
