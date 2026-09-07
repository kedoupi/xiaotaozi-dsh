import { connectionTestMessage } from './connection-test.ts';
import { sendBindUsageGuide } from '../../usage-guide.ts';
import { publicMessageFailure } from './message-failure.ts';

type CodedError = Error & { code: string };

type TokenDescriptor = {
  key: string;
  label: string;
  connectionLabel: string;
};

type TokenCredentialValue = {
  value?: unknown;
};

type TokenCredentials = {
  resolve: (ref: string) => Promise<TokenCredentialValue | undefined>;
  set: (ref: string, value: string) => Promise<unknown>;
  unset: (ref: string) => Promise<unknown>;
};

type TokenBotConfig = {
  botId: string;
  platformId: string;
  tokenRef: string;
  name?: unknown;
  username?: unknown;
  createdAt?: unknown;
  connectedAt?: unknown;
};

type TokenConfigStore = {
  list: () => TokenBotConfig[];
  get: (botId: string) => TokenBotConfig | null | undefined;
  getByPlatformId: (platformId: string) => TokenBotConfig | null | undefined;
  save: (config: TokenBotConfig) => Promise<TokenBotConfig | undefined> | TokenBotConfig | undefined;
  remove: (botId: string) => unknown;
};

type InspectedToken = {
  platformId?: unknown;
  name?: unknown;
  username?: unknown;
};

type TokenIdentity = {
  botId: string;
  tokenRef: string;
};

type TokenRuntimeStatus = {
  ready?: unknown;
  connectionState?: unknown;
  harnessReachable?: unknown;
  lastCheckedAt?: unknown;
  lastConnectedAt?: unknown;
  messagesReceived?: unknown;
  messagesReplied?: unknown;
  lastMessageError?: unknown;
};

type InspectTokenFn = (
  token: string,
) => Promise<InspectedToken | null | undefined> | InspectedToken | null | undefined;
type DeriveIdentityFn = (platformId: string) => TokenIdentity;
type MaskPlatformIdFn = (platformId: string) => string;
type CreateRuntimeFn = (input: {
  botId: string;
  config: TokenBotConfig;
  token: string;
}) => Promise<TokenRuntime | null | undefined> | TokenRuntime | null | undefined;

type TokenRuntime = {
  start: () => unknown;
  stop: () => Promise<unknown> | unknown;
  status?: TokenRuntimeStatus;
  sendConnectionTest?: (text: string) => Promise<unknown>;
  state?: object;
};

type TokenLogger = {
  warn?: (...args: unknown[]) => unknown;
};

export type TokenBotControllerOptions = {
  descriptor?: { key?: unknown; label?: unknown; connectionLabel?: unknown } | null;
  credentials?: unknown;
  configStore?: unknown;
  inspectToken?: unknown;
  deriveIdentity?: unknown;
  maskPlatformId?: unknown;
  createRuntime?: unknown;
  deleteState?: (input?: unknown) => unknown;
  logger?: TokenLogger;
};

function cleanString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function safeError(code: string, message: string) {
  return Object.freeze({ code, message });
}

export class TokenBotController {
  #descriptor: TokenDescriptor;
  #credentials: TokenCredentials;
  #configStore: TokenConfigStore;
  #inspectToken: InspectTokenFn;
  #deriveIdentity: DeriveIdentityFn;
  #maskPlatformId: MaskPlatformIdFn;
  #createRuntime: CreateRuntimeFn;
  #deleteState: (input?: unknown) => unknown;
  #logger: TokenLogger;
  #runtimes = new Map<string, TokenRuntime>();
  #errors = new Map<string, { code: string; message: string }>();
  #transitions = new Map<string, Promise<unknown>>();
  #revision = 0;
  #closed = false;

  constructor({
    descriptor,
    credentials,
    configStore,
    inspectToken,
    deriveIdentity,
    maskPlatformId,
    createRuntime,
    deleteState = async () => {},
    logger = console,
  }: TokenBotControllerOptions) {
    if (!descriptor?.key || !descriptor?.label || !descriptor?.connectionLabel) {
      throw new TypeError('TokenBotController requires a channel descriptor');
    }
    if (!credentials || typeof (credentials as TokenCredentials).resolve !== 'function'
      || typeof (credentials as TokenCredentials).set !== 'function'
      || typeof (credentials as TokenCredentials).unset !== 'function') {
      throw new TypeError(`${String(descriptor.label)} requires the DSH credential provider`);
    }
    if (!configStore || typeof (configStore as TokenConfigStore).list !== 'function'
      || typeof (configStore as TokenConfigStore).save !== 'function'
      || typeof (configStore as TokenConfigStore).remove !== 'function') {
      throw new TypeError(`${String(descriptor.label)} requires a config store`);
    }
    if (typeof inspectToken !== 'function' || typeof deriveIdentity !== 'function'
      || typeof maskPlatformId !== 'function' || typeof createRuntime !== 'function') {
      throw new TypeError(`${String(descriptor.label)} controller dependencies are incomplete`);
    }
    this.#descriptor = descriptor as TokenDescriptor;
    this.#credentials = credentials as TokenCredentials;
    this.#configStore = configStore as TokenConfigStore;
    this.#inspectToken = inspectToken as InspectTokenFn;
    this.#deriveIdentity = deriveIdentity as DeriveIdentityFn;
    this.#maskPlatformId = maskPlatformId as MaskPlatformIdFn;
    this.#createRuntime = createRuntime as CreateRuntimeFn;
    this.#deleteState = deleteState;
    this.#logger = logger;
  }

  async initialize() {
    if (this.#closed) return this.status();
    for (const config of this.#configStore.list()) {
      await this.#withBotTransition(config.botId, async () => {
        if (this.#closed || this.#runtimes.get(config.botId)?.status?.ready) return;
        const token = await this.#resolveToken(config.tokenRef);
        if (!token) {
          this.#errors.set(config.botId, safeError(
            'missing-token',
            `${this.#descriptor.label}机器人凭据缺失，请移除后重新接入。`,
          ));
          return;
        }
        try {
          await this.#startRuntime(config, token);
          this.#errors.delete(config.botId);
        } catch (error) {
          this.#errors.set(config.botId, safeError(
            'connection-failed',
            `${this.#descriptor.label}连接未就绪，插件会自动重试。`,
          ));
          this.#logger.warn?.(
            `[dsh-im:${this.#descriptor.key}] bot ${config.botId} failed to initialize:`,
            error,
          );
        } finally {
          this.#touch();
        }
      });
    }
    return this.status();
  }

  async bindCredentials({ token }: { token?: unknown } = {}) {
    if (this.#closed) throw new Error(`${this.#descriptor.label} controller is closed`);
    const normalizedToken = cleanString(token);
    if (!normalizedToken) throw new TypeError(`${this.#descriptor.label} Bot Token is required`);
    const inspected = await this.#inspectToken(normalizedToken);
    const platformId = cleanString(inspected?.platformId);
    const name = cleanString(inspected?.name);
    if (!platformId || !name) throw new Error(`${this.#descriptor.label} returned an invalid bot identity`);
    const identity = this.#deriveIdentity(platformId);
    await this.#withBotTransition(identity.botId, async () => {
      if (this.#closed) throw new Error(`${this.#descriptor.label} controller is closed`);
      const previousConfig = this.#configStore.getByPlatformId(platformId);
      const previousToken = await this.#credentials.resolve(identity.tokenRef).catch(() => undefined);
      const config: TokenBotConfig = {
        botId: identity.botId,
        platformId,
        tokenRef: identity.tokenRef,
        name,
        username: cleanString(inspected?.username),
        createdAt: (previousConfig?.createdAt as string | undefined) ?? new Date().toISOString(),
        connectedAt: new Date().toISOString(),
      };
      await this.#credentials.set(identity.tokenRef, normalizedToken);
      let savedConfig: TokenBotConfig | undefined;
      try {
        savedConfig = await this.#configStore.save(config);
      } catch (error) {
        await this.#restoreCredential(identity.tokenRef, previousToken);
        throw error;
      }
      try {
        await this.#startRuntime(savedConfig ?? config, normalizedToken);
        this.#errors.delete(identity.botId);
        if (!previousConfig) {
          void sendBindUsageGuide(this.#runtimes.get(identity.botId), {
            channelLabel: this.#descriptor.label,
            logger: this.#logger,
          });
        }
      } catch (error) {
        this.#errors.set(identity.botId, safeError(
          'connection-failed',
          `${this.#descriptor.label}机器人已接入，消息连接暂未就绪。`,
        ));
        this.#logger.warn?.(
          `[dsh-im:${this.#descriptor.key}] bot ${identity.botId} credential connection failed:`,
          error,
        );
      }
      this.#touch();
    });
    return this.status();
  }

  async reconnectBot(botId: string) {
    const config = this.#configStore.get(botId);
    if (!config) throw new Error(`Unknown ${this.#descriptor.label} bot`);
    await this.#withBotTransition(botId, async () => {
      const token = await this.#resolveToken(config.tokenRef);
      if (!token) throw new Error(`${this.#descriptor.label} bot token is missing`);
      try {
        await this.#startRuntime(config, token);
        this.#errors.delete(botId);
      } catch (error) {
        this.#errors.set(botId, safeError(
          'connection-failed',
          `${this.#descriptor.label}连接仍未就绪，请稍后重试。`,
        ));
        throw error;
      } finally {
        this.#touch();
      }
    });
    return this.status();
  }

  async updateBotConfig(botId: string, update: (config: TokenBotConfig) => TokenBotConfig) {
    if (this.#closed) throw new Error(`${this.#descriptor.label} controller is closed`);
    if (typeof update !== 'function') throw new TypeError('Bot config update must be a function');
    await this.#withBotTransition(botId, async () => {
      if (this.#closed) throw new Error(`${this.#descriptor.label} controller is closed`);
      const config = this.#configStore.get(botId);
      if (!config) throw new Error(`Unknown ${this.#descriptor.label} bot`);
      const token = await this.#resolveToken(config.tokenRef);
      if (!token) throw new Error(`${this.#descriptor.label} bot token is missing`);
      if (this.#closed) throw new Error(`${this.#descriptor.label} controller is closed`);
      const nextConfig = update(config);
      const savedConfig = await this.#configStore.save(nextConfig);
      try {
        await this.#startRuntime(savedConfig ?? nextConfig, token);
        this.#errors.delete(botId);
      } catch (error) {
        this.#errors.set(botId, safeError(
          'connection-failed',
          `${this.#descriptor.label}连接仍未就绪，请稍后重试。`,
        ));
        throw error;
      } finally {
        this.#touch();
      }
    });
    return this.status();
  }

  async sendConnectionTest(botId: string) {
    const config = this.#configStore.get(botId);
    if (!config) throw new Error(`Unknown ${this.#descriptor.label} bot`);
    return this.#withBotTransition(botId, async () => {
      const runtime = this.#runtimes.get(botId);
      if (!runtime?.status?.ready || typeof runtime.sendConnectionTest !== 'function') {
        const error = new Error(`${this.#descriptor.label}机器人尚未连接`) as CodedError;
        error.code = 'test-target-unavailable';
        throw error;
      }
      const cardLabel = `${config.name}（${this.#maskPlatformId(config.platformId)}）`;
      await runtime.sendConnectionTest(connectionTestMessage(
        cardLabel,
        `${this.#descriptor.label}机器人`,
      ));
      return { sent: true };
    });
  }

  async deleteBot(botId: string) {
    const config = this.#configStore.get(botId);
    if (!config) throw new Error(`Unknown ${this.#descriptor.label} bot`);
    await this.#withBotTransition(botId, async () => {
      const previous = await this.#credentials.resolve(config.tokenRef).catch(() => undefined);
      await this.#stopRuntime(botId);
      try {
        await this.#credentials.unset(config.tokenRef);
        await this.#configStore.remove(botId);
      } catch (error) {
        if (previous?.value) {
          await this.#credentials.set(config.tokenRef, previous.value as string).catch(() => undefined);
          await this.#startRuntime(config, previous.value as string).catch(() => undefined);
        }
        throw new Error(`Unable to remove the ${this.#descriptor.label} bot safely.`, { cause: error });
      }
      await Promise.resolve(this.#deleteState({ botId, config })).catch((error: unknown) => {
        this.#logger.warn?.(
          `[dsh-im:${this.#descriptor.key}] bot ${botId} state cleanup failed:`,
          error,
        );
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
        && runtimeStatus.connectionState === 'connected'
        && runtimeStatus.harnessReachable === true;
      const state = connected ? 'connected'
        : runtimeStatus?.connectionState === 'connecting' ? 'connecting'
          : this.#errors.has(config.botId) || runtimeStatus?.connectionState === 'failed'
            ? 'error' : 'offline';
      return {
        botId: config.botId,
        state,
        connected,
        configured: true,
        bot: {
          name: config.name,
          username: config.username,
          idMasked: this.#maskPlatformId(config.platformId),
        },
        health: {
          status: connected ? 'healthy' : state === 'error' ? 'error' : 'offline',
          summary: connected ? `${this.#descriptor.label}${this.#descriptor.connectionLabel}运行正常`
            : state === 'error' ? `${this.#descriptor.label}连接未就绪，插件会自动重试`
              : `${this.#descriptor.label}连接当前离线`,
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
    return {
      schemaVersion: 1,
      revision: this.#revision,
      state: bots.length === 0 ? 'disconnected'
        : connectedCount === bots.length ? 'connected'
          : connectedCount > 0 ? 'degraded' : 'offline',
      bots,
      totals: { configured: bots.length, connected: connectedCount },
    };
  }

  async close() {
    if (this.#closed) return;
    this.#closed = true;
    await Promise.allSettled([...this.#transitions.values()]);
    await Promise.allSettled([...this.#runtimes.keys()].map((botId) => this.#stopRuntime(botId)));
  }

  async #startRuntime(config: TokenBotConfig, token: string) {
    if (this.#closed) throw new Error(`${this.#descriptor.label} controller is closed`);
    await this.#stopRuntime(config.botId);
    if (this.#closed) throw new Error(`${this.#descriptor.label} controller is closed`);
    const runtime = await this.#createRuntime({ botId: config.botId, config, token });
    if (!runtime || typeof runtime.start !== 'function' || typeof runtime.stop !== 'function') {
      throw new TypeError(`createRuntime returned an invalid ${this.#descriptor.label} runtime`);
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
      this.#logger.warn?.(
        `[dsh-im:${this.#descriptor.key}] bot ${botId} failed to stop cleanly:`,
        error,
      );
    });
  }

  async #resolveToken(ref: string) {
    const result = await this.#credentials.resolve(ref).catch(() => undefined);
    return cleanString(result?.value);
  }

  async #restoreCredential(ref: string, previous: TokenCredentialValue | undefined) {
    if (previous?.value) await this.#credentials.set(ref, previous.value as string).catch(() => undefined);
    else await this.#credentials.unset(ref).catch(() => undefined);
  }

  #withBotTransition<T>(botId: string, operation: () => T | Promise<T>) {
    const previous = this.#transitions.get(botId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    const settled = current.finally(() => {
      if (this.#transitions.get(botId) === settled) this.#transitions.delete(botId);
    });
    this.#transitions.set(botId, settled);
    return settled;
  }

  #touch() {
    this.#revision += 1;
  }
}
