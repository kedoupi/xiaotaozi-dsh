import { randomUUID } from 'node:crypto';

import { deriveWecomBotIdentity, maskWecomBotId, type WecomBot } from './config-store.ts';
import {
  connectionTestMessage,
  connectionTestTargetUnavailable,
} from '../shared/connection-test.ts';
import { sendBindUsageGuide } from '../../usage-guide.ts';
import { publicMessageFailure } from '../shared/message-failure.ts';

const ACTIVE_ATTEMPT_STATES = new Set<string>(['pending', 'connecting']);
const TERMINAL_ATTEMPT_STATES = new Set<string>(['connected', 'failed', 'cancelled', 'expired']);

type PublicError = {
  code: string;
  message: string;
};

type WecomLogger = {
  error?: (...args: unknown[]) => unknown;
  warn?: (...args: unknown[]) => unknown;
  info?: (...args: unknown[]) => unknown;
  debug?: (...args: unknown[]) => unknown;
};

type CredentialRecord = {
  value?: unknown;
};

type WecomCredentials = {
  resolve: (ref: unknown) => Promise<CredentialRecord | undefined>;
  set: (ref: unknown, value: unknown) => unknown;
  unset: (ref: unknown) => unknown;
};

type WecomConfigStoreLike = {
  list: () => WecomBot[];
  get: (botId: unknown) => WecomBot | null;
  getByRemoteBotId: (remoteBotId: unknown) => WecomBot | null;
  save: (value: unknown) => unknown;
  remove: (botId: unknown) => unknown;
};

type QrStartResult = {
  scode?: unknown;
  verificationUrl?: unknown;
  expiresAt?: unknown;
  pollIntervalMs?: unknown;
};

type QrPollResult = {
  status?: unknown;
  remoteBotId?: unknown;
  secret?: unknown;
  name?: unknown;
};

type WecomQrAuthLike = {
  start: (options?: { signal?: AbortSignal }) => Promise<QrStartResult> | QrStartResult;
  poll: (options?: { scode?: unknown; signal?: AbortSignal }) => Promise<QrPollResult> | QrPollResult;
};

type WecomRuntimeStatusLike = {
  ready?: boolean;
  wecomConnectionState?: string;
  harnessReachable?: boolean;
  lastCheckedAt?: number | null;
  lastConnectedAt?: number | null;
  messagesReceived?: number;
  messagesReplied?: number;
  lastMessageError?: unknown;
};

type WecomRuntimeLike = {
  readonly status?: WecomRuntimeStatusLike;
  start: () => unknown;
  stop: () => unknown;
  sendConnectionTest?: (text: string) => Promise<unknown>;
  state?: object;
};

type CreateRuntimeArgs = {
  botId: string;
  config: WecomBot;
  secret: unknown;
};

type CreateRuntimeFn = (args: CreateRuntimeArgs) => Promise<WecomRuntimeLike> | WecomRuntimeLike;
type DeleteStateFn = (args: { botId: string; config: WecomBot }) => unknown;

type WecomControllerOptions = {
  qrAuth: WecomQrAuthLike;
  credentials: WecomCredentials;
  configStore: WecomConfigStoreLike;
  createRuntime: CreateRuntimeFn;
  deleteState?: DeleteStateFn;
  logger?: WecomLogger;
};

type BindCredentialsInput = {
  botId?: unknown;
  secret?: unknown;
};

type ProvisioningAttempt = {
  id: string;
  state: string;
  createdAt: number;
  expiresAt: number | null;
  pollIntervalMs: number;
  qrRevision: number;
  verificationUrl: string | null;
  scode: string | null;
  botId: string | null;
  error: PublicError | null;
  controller: AbortController;
  polling: Promise<unknown> | null;
  transition: Promise<unknown> | null;
};

function cleanString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function safeError(code: string, message: string): PublicError {
  return Object.freeze({ code, message });
}

function publicAttempt(record: ProvisioningAttempt | null | undefined) {
  if (!record) return null;
  return {
    attemptId: record.id,
    status: record.state,
    pollIntervalMs: record.pollIntervalMs,
    qrRevision: record.qrRevision,
    ...(record.verificationUrl ? { verificationUrl: record.verificationUrl } : {}),
    ...(record.expiresAt ? { expiresAt: record.expiresAt } : {}),
    ...(record.botId ? { botId: record.botId } : {}),
    ...(record.error ? { error: structuredClone(record.error) } : {}),
  };
}

export class WecomController {
  #qrAuth: WecomQrAuthLike;
  #credentials: WecomCredentials;
  #configStore: WecomConfigStoreLike;
  #createRuntime: CreateRuntimeFn;
  #deleteState: DeleteStateFn;
  #logger: WecomLogger;
  #runtimes = new Map<string, WecomRuntimeLike>();
  #errors = new Map<string, PublicError>();
  #attempts = new Map<string, ProvisioningAttempt>();
  #activeAttemptId: string | null = null;
  #transitions = new Map<string, Promise<unknown>>();
  #revision = 0;
  #closed = false;

  constructor({
    qrAuth,
    credentials,
    configStore,
    createRuntime,
    deleteState = async () => {},
    logger = console,
  }: WecomControllerOptions) {
    if (!qrAuth || typeof qrAuth.start !== 'function' || typeof qrAuth.poll !== 'function') {
      throw new TypeError('Enterprise WeChat QR auth is required');
    }
    if (!credentials || typeof credentials.resolve !== 'function'
      || typeof credentials.set !== 'function' || typeof credentials.unset !== 'function') {
      throw new TypeError('WecomController requires the DSH credential provider');
    }
    if (!configStore || typeof configStore.list !== 'function'
      || typeof configStore.save !== 'function' || typeof configStore.remove !== 'function') {
      throw new TypeError('WecomController requires a config store');
    }
    if (typeof createRuntime !== 'function') throw new TypeError('createRuntime is required');
    this.#qrAuth = qrAuth;
    this.#credentials = credentials;
    this.#configStore = configStore;
    this.#createRuntime = createRuntime;
    this.#deleteState = deleteState;
    this.#logger = logger;
  }

  async initialize() {
    if (this.#closed) return this.status();
    for (const config of this.#configStore.list()) {
      await this.#withBotTransition(config.botId, async () => {
        const existing = this.#runtimes.get(config.botId)?.status;
        if (this.#closed || existing?.ready || existing?.wecomConnectionState === 'connecting') return;
        const secret = await this.#resolveSecret(config.secretRef);
        if (!secret) {
          this.#errors.set(config.botId, safeError('missing-secret', '企业微信机器人凭据缺失，请移除后重新扫码。'));
          return;
        }
        try {
          await this.#startRuntime(config, secret);
          this.#errors.delete(config.botId);
        } catch (error) {
          this.#errors.set(config.botId, safeError('connection-failed', '企业微信连接未就绪，插件会自动重试。'));
          this.#logger.warn?.(`[dsh-im:wecom] bot ${config.botId} failed to initialize`);
        } finally {
          this.#touch();
        }
      });
    }
    return this.status();
  }

  async startProvisioning() {
    if (this.#closed) throw new Error('Enterprise WeChat controller is closed');
    if (this.#activeAttemptId) await this.cancelProvisioning(this.#activeAttemptId);
    const record: ProvisioningAttempt = {
      id: randomUUID(),
      state: 'pending',
      createdAt: Date.now(),
      expiresAt: null,
      pollIntervalMs: 3_000,
      qrRevision: 1,
      verificationUrl: null,
      scode: null,
      botId: null,
      error: null,
      controller: new AbortController(),
      polling: null,
      transition: null,
    };
    this.#attempts.set(record.id, record);
    this.#activeAttemptId = record.id;
    this.#touch();
    try {
      const started = await this.#qrAuth.start({ signal: record.controller.signal });
      record.scode = cleanString(started.scode);
      record.verificationUrl = cleanString(started.verificationUrl);
      record.expiresAt = Number(started.expiresAt);
      record.pollIntervalMs = Math.min(10_000, Math.max(500, Number(started.pollIntervalMs) || 3_000));
      if (!record.scode || !record.verificationUrl || !Number.isFinite(record.expiresAt)) {
        throw new Error('Enterprise WeChat QR auth returned incomplete data');
      }
      this.#touch();
      return publicAttempt(record);
    } catch (error) {
      record.state = record.controller.signal.aborted ? 'cancelled' : 'failed';
      record.error = record.controller.signal.aborted
        ? safeError('cancelled', '扫码绑定已取消。')
        : safeError('qr-start-failed', '无法生成企业微信二维码，请稍后重试。');
      this.#finishAttempt(record);
      throw error;
    }
  }

  async registrationStatus(attemptId: string) {
    const record = this.#attempts.get(attemptId);
    if (!record || TERMINAL_ATTEMPT_STATES.has(record.state)) return publicAttempt(record);
    if (record.state === 'connecting') return publicAttempt(record);
    if (Date.now() >= (record.expiresAt ?? 0)) {
      record.state = 'expired';
      record.error = safeError('expired', '企业微信二维码已过期，请重新生成。');
      record.controller.abort();
      this.#finishAttempt(record);
      return publicAttempt(record);
    }
    if (!record.polling) {
      const polling = this.#pollAttempt(record).finally(() => {
        if (record.polling === polling) record.polling = null;
      });
      record.polling = polling;
    }
    await record.polling.catch(() => undefined);
    return publicAttempt(record);
  }

  async bindCredentials({ botId, secret }: BindCredentialsInput = {}) {
    if (this.#closed) throw new Error('Enterprise WeChat controller is closed');
    const remoteBotId = cleanString(botId);
    const normalizedSecret = cleanString(secret);
    if (!remoteBotId || !normalizedSecret) {
      throw new TypeError('Enterprise WeChat Bot ID and Secret are required');
    }
    if (this.#activeAttemptId) await this.cancelProvisioning(this.#activeAttemptId);
    if (this.#closed) throw new Error('Enterprise WeChat controller is closed');
    const identity = deriveWecomBotIdentity(remoteBotId);
    await this.#withBotTransition(identity.botId, async () => {
      if (this.#closed) throw new Error('Enterprise WeChat controller is closed');
      const previousConfig = this.#configStore.getByRemoteBotId(remoteBotId);
      const previousSecret = await this.#credentials.resolve(identity.secretRef).catch(() => undefined);
      if (this.#closed) throw new Error('Enterprise WeChat controller is closed');
      const config: WecomBot = {
        botId: identity.botId,
        remoteBotId,
        secretRef: identity.secretRef,
        ...(previousConfig?.name ? { name: previousConfig.name } : {}),
        createdAt: previousConfig?.createdAt ?? new Date().toISOString(),
        connectedAt: new Date().toISOString(),
      };
      await this.#credentials.set(identity.secretRef, normalizedSecret);
      try {
        await this.#configStore.save(config);
      } catch (error) {
        await this.#restoreCredential(identity.secretRef, previousSecret);
        throw error;
      }
      try {
        await this.#startRuntime(config, normalizedSecret);
        this.#errors.delete(identity.botId);
        if (!previousConfig) {
          void sendBindUsageGuide(this.#runtimes.get(identity.botId), {
            channelLabel: '企业微信',
            logger: this.#logger,
          });
        }
      } catch {
        this.#errors.set(
          identity.botId,
          safeError('connection-failed', '企业微信机器人已绑定，消息连接暂未就绪。'),
        );
        this.#logger.warn?.(`[dsh-im:wecom] bot ${identity.botId} credential connection failed`);
      }
      this.#touch();
    });
    return this.status();
  }

  async cancelProvisioning(attemptId: string) {
    const record = this.#attempts.get(attemptId);
    if (!record) return null;
    if (!TERMINAL_ATTEMPT_STATES.has(record.state)) {
      record.controller.abort();
      await Promise.allSettled([record.polling, record.transition].filter(Boolean));
      if (!TERMINAL_ATTEMPT_STATES.has(record.state)) record.state = 'cancelled';
      record.error ??= safeError('cancelled', '扫码绑定已取消。');
      this.#finishAttempt(record);
    }
    return publicAttempt(record);
  }

  async reconnectBot(botId: string) {
    const config = this.#configStore.get(botId);
    if (!config) throw new Error('Unknown Enterprise WeChat bot');
    await this.#withBotTransition(botId, async () => {
      const secret = await this.#resolveSecret(config.secretRef);
      if (!secret) throw new Error('Enterprise WeChat bot secret is missing');
      try {
        await this.#startRuntime(config, secret);
        this.#errors.delete(botId);
      } catch (error) {
        this.#errors.set(botId, safeError('connection-failed', '企业微信连接仍未就绪，请稍后重试。'));
        throw error;
      } finally {
        this.#touch();
      }
    });
    return this.status();
  }

  async sendConnectionTest(botId: string) {
    const config = this.#configStore.get(botId);
    if (!config) throw new Error('Unknown Enterprise WeChat bot');
    return this.#withBotTransition(botId, async () => {
      const runtime = this.#runtimes.get(botId);
      if (!runtime?.status?.ready || typeof runtime.sendConnectionTest !== 'function') {
        throw connectionTestTargetUnavailable('企业微信机器人');
      }
      return runtime.sendConnectionTest(connectionTestMessage(
        `${cleanString(config.name) || '企业微信机器人'}（${maskWecomBotId(config.remoteBotId)}）`,
      ));
    });
  }

  async deleteBot(botId: string) {
    const config = this.#configStore.get(botId);
    if (!config) throw new Error('Unknown Enterprise WeChat bot');
    await this.#withBotTransition(botId, async () => {
      const previous = await this.#credentials.resolve(config.secretRef).catch(() => undefined);
      await this.#stopRuntime(botId);
      try {
        await this.#credentials.unset(config.secretRef);
        await this.#configStore.remove(botId);
      } catch (error) {
        if (previous?.value) {
          await Promise.resolve(this.#credentials.set(config.secretRef, previous.value)).catch(() => undefined);
          await this.#startRuntime(config, previous.value).catch(() => undefined);
        }
        throw new Error('Unable to remove the Enterprise WeChat bot safely.', { cause: error });
      }
      await Promise.resolve(this.#deleteState({ botId, config })).catch((error: unknown) => {
        this.#logger.warn?.(`[dsh-im:wecom] bot ${botId} state cleanup failed:`, error);
      });
      this.#errors.delete(botId);
      this.#touch();
    });
    return this.status();
  }

  status() {
    const bots = this.#configStore.list().map((config) => {
      const runtimeStatus = this.#runtimes.get(config.botId)?.status ?? null;
      const connected = runtimeStatus?.ready === true
        && runtimeStatus.wecomConnectionState === 'connected'
        && runtimeStatus.harnessReachable === true;
      const state = connected ? 'connected'
        : runtimeStatus?.wecomConnectionState === 'connecting' ? 'connecting'
          : this.#errors.has(config.botId) || runtimeStatus?.wecomConnectionState === 'failed'
            ? 'error' : 'offline';
      return {
        botId: config.botId,
        state,
        connected,
        configured: true,
        bot: {
          name: cleanString(config.name) || '企业微信机器人',
          appIdMasked: maskWecomBotId(config.remoteBotId),
        },
        health: {
          status: connected ? 'healthy' : state === 'error' ? 'error' : 'offline',
          summary: connected ? '企业微信 WebSocket 长连接运行正常'
            : state === 'error' ? '企业微信连接未就绪，插件会自动重试' : '企业微信连接当前离线',
          lastCheckedAt: runtimeStatus?.lastCheckedAt ?? null,
          lastConnectedAt: runtimeStatus?.lastConnectedAt ?? null,
        },
        stats: {
          messagesReceived: runtimeStatus?.messagesReceived ?? 0,
          messagesReplied: runtimeStatus?.messagesReplied ?? 0,
        },
        error: structuredClone(this.#errors.get(config.botId) ?? null),
        lastMessageError: publicMessageFailure(runtimeStatus?.lastMessageError),
      };
    });
    const connectedCount = bots.filter((bot) => bot.connected).length;
    const active = this.#activeAttemptId ? this.#attempts.get(this.#activeAttemptId) : null;
    return {
      schemaVersion: 1,
      revision: this.#revision,
      state: active && ACTIVE_ATTEMPT_STATES.has(active.state) ? 'provisioning'
        : bots.length === 0 ? 'disconnected'
          : connectedCount === bots.length ? 'connected'
            : connectedCount > 0 ? 'degraded' : 'offline',
      bots,
      totals: { configured: bots.length, connected: connectedCount },
      ...(active && ACTIVE_ATTEMPT_STATES.has(active.state)
        ? { provisioning: publicAttempt(active) } : {}),
    };
  }

  async close() {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#activeAttemptId) await this.cancelProvisioning(this.#activeAttemptId);
    await Promise.allSettled([...this.#transitions.values()]);
    await Promise.allSettled([...this.#runtimes.keys()].map((botId) => this.#stopRuntime(botId)));
  }

  async #pollAttempt(record: ProvisioningAttempt) {
    try {
      const result = await this.#qrAuth.poll({ scode: record.scode, signal: record.controller.signal });
      if (record.controller.signal.aborted || TERMINAL_ATTEMPT_STATES.has(record.state)) return;
      if (result.status === 'waiting') return;
      if (result.status === 'expired') {
        record.state = 'expired';
        record.error = safeError('expired', '企业微信二维码已过期，请重新生成。');
        this.#finishAttempt(record);
        return;
      }
      if (result.status !== 'success') {
        record.state = 'failed';
        record.error = safeError('qr-connect-failed', '企业微信扫码没有完成，请重新生成二维码。');
        this.#finishAttempt(record);
        return;
      }
      record.state = 'connecting';
      record.verificationUrl = null;
      record.expiresAt = null;
      record.scode = null;
      this.#touch();
      const transition = this.#completeProvisioning(record, result);
      record.transition = transition;
      void transition.catch(() => undefined);
    } catch (error) {
      if (record.controller.signal.aborted) return;
      record.state = 'failed';
      record.error = safeError('qr-connect-failed', '企业微信扫码服务暂时不可用，请重新生成二维码。');
      this.#logger.warn?.('[dsh-im:wecom] QR polling failed');
      this.#finishAttempt(record);
    }
  }

  async #completeProvisioning(record: ProvisioningAttempt, result: QrPollResult) {
    try {
      const remoteBotId = cleanString(result.remoteBotId);
      const secret = cleanString(result.secret);
      if (!remoteBotId || !secret) throw new Error('Enterprise WeChat authorization returned incomplete credentials');
      record.botId = await this.#activateBot(record, {
        remoteBotId,
        secret,
        name: cleanString(result.name),
      });
      record.state = 'connected';
      record.error = null;
    } catch (error) {
      if (record.controller.signal.aborted) {
        record.state = 'cancelled';
        record.error = safeError('cancelled', '扫码绑定已取消。');
      } else {
        record.state = 'failed';
        record.error = safeError('activation-failed', '企业微信已授权，但无法安全保存接入配置。');
        this.#logger.error?.('[dsh-im:wecom] provisioning failed');
      }
    } finally {
      this.#finishAttempt(record);
    }
  }

  async #activateBot(record: ProvisioningAttempt, {
    remoteBotId,
    secret,
    name,
  }: {
    remoteBotId: string;
    secret: string;
    name: string | null;
  }) {
    const identity = deriveWecomBotIdentity(remoteBotId);
    const previousConfig = this.#configStore.getByRemoteBotId(remoteBotId);
    const previousSecret = await this.#credentials.resolve(identity.secretRef).catch(() => undefined);
    const botName = cleanString(name) || cleanString(previousConfig?.name);
    const config: WecomBot = {
      botId: identity.botId,
      remoteBotId,
      secretRef: identity.secretRef,
      ...(botName ? { name: botName } : {}),
      createdAt: previousConfig?.createdAt ?? new Date().toISOString(),
      connectedAt: new Date().toISOString(),
    };
    return this.#withBotTransition(identity.botId, async () => {
      await this.#credentials.set(identity.secretRef, secret);
      try {
        if (record.controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        await this.#configStore.save(config);
      } catch (error) {
        await this.#restoreCredential(identity.secretRef, previousSecret);
        throw error;
      }
      try {
        if (record.controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        await this.#startRuntime(config, secret);
        this.#errors.delete(identity.botId);
        if (!previousConfig) {
          void sendBindUsageGuide(this.#runtimes.get(identity.botId), {
            channelLabel: '企业微信',
            logger: this.#logger,
          });
        }
      } catch (error) {
        if (record.controller.signal.aborted) {
          await this.#stopRuntime(identity.botId);
          if (previousConfig) await Promise.resolve(this.#configStore.save(previousConfig)).catch(() => undefined);
          else {
            const removed = await Promise.resolve(this.#configStore.remove(identity.botId)).catch(() => null);
            if (removed) {
              await Promise.resolve(this.#deleteState({ botId: identity.botId, config })).catch((cleanupError: unknown) => {
                this.#logger.warn?.('[dsh-im:wecom] cancelled bot state cleanup failed:', cleanupError);
              });
            }
          }
          await this.#restoreCredential(identity.secretRef, previousSecret);
          throw error;
        }
        this.#errors.set(identity.botId, safeError('connection-failed', '企业微信机器人已绑定，消息连接暂未就绪。'));
        this.#logger.warn?.(`[dsh-im:wecom] bot ${identity.botId} activation connection failed`);
      }
      this.#touch();
      return identity.botId;
    });
  }

  async #startRuntime(config: WecomBot, secret: unknown) {
    if (this.#closed) throw new Error('Enterprise WeChat controller is closed');
    await this.#stopRuntime(config.botId);
    if (this.#closed) throw new Error('Enterprise WeChat controller is closed');
    const runtime = await this.#createRuntime({ botId: config.botId, config, secret });
    if (!runtime || typeof runtime.start !== 'function' || typeof runtime.stop !== 'function') {
      throw new TypeError('createRuntime returned an invalid Enterprise WeChat runtime');
    }
    this.#runtimes.set(config.botId, runtime);
    try {
      await runtime.start();
    } catch (error) {
      await Promise.resolve(runtime.stop()).catch(() => undefined);
      this.#runtimes.delete(config.botId);
      throw error;
    }
  }

  async #stopRuntime(botId: string) {
    const runtime = this.#runtimes.get(botId);
    this.#runtimes.delete(botId);
    await Promise.resolve(runtime?.stop()).catch((error: unknown) => {
      this.#logger.warn?.(`[dsh-im:wecom] bot ${botId} failed to stop cleanly:`, error);
    });
  }

  async #resolveSecret(ref: unknown) {
    const result = await this.#credentials.resolve(ref).catch(() => undefined);
    return cleanString(result?.value);
  }

  async #restoreCredential(ref: unknown, previous: CredentialRecord | undefined) {
    if (previous?.value) await Promise.resolve(this.#credentials.set(ref, previous.value)).catch(() => undefined);
    else await Promise.resolve(this.#credentials.unset(ref)).catch(() => undefined);
  }

  #withBotTransition<T>(botId: string, operation: () => T | Promise<T>): Promise<T> {
    const previous = this.#transitions.get(botId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    const settled = current.finally(() => {
      if (this.#transitions.get(botId) === settled) this.#transitions.delete(botId);
    });
    this.#transitions.set(botId, settled);
    return settled;
  }

  #finishAttempt(record: ProvisioningAttempt) {
    record.scode = null;
    record.verificationUrl = null;
    record.expiresAt = null;
    if (this.#activeAttemptId === record.id) this.#activeAttemptId = null;
    this.#touch();
    const terminal = [...this.#attempts.values()].filter((attempt) => TERMINAL_ATTEMPT_STATES.has(attempt.state));
    while (terminal.length > 16) {
      const attempt = terminal.shift();
      if (attempt) this.#attempts.delete(attempt.id);
    }
  }

  #touch() {
    this.#revision += 1;
  }
}
