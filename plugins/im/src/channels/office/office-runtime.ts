import { setTimeout as sleep } from 'node:timers/promises';

import { type OfficeConfig } from './config-store.ts';
import { OfficeJobExecutor } from './office-job-executor.ts';
import { OfficeTransport } from './office-transport.ts';
import { OFFICE_PROTOCOL_VERSION } from './protocol.ts';

const RETRY_DELAYS = Object.freeze([1_000, 3_000, 10_000, 30_000]);

type OfficeRuntimeConfig = Pick<OfficeConfig,
  'baseUrl' | 'deviceId' | 'workspaces' | 'instructionPresets' | 'maxConcurrency' | 'heartbeatSeconds'>;
type OfficeLogger = {
  error?: (...args: unknown[]) => unknown;
};
type OfficeHeartbeat = {
  jobs?: unknown;
};
type OfficeStreamEvent = {
  id?: string;
  type?: string;
  data?: unknown;
};
type OfficeTransportLike = {
  heartbeat: (
    payload: unknown,
    options?: { signal?: AbortSignal },
  ) => Promise<OfficeHeartbeat | undefined>;
  stream: (options: {
    signal?: AbortSignal;
    lastEventId?: string | null;
    onOpen?: () => void;
    onEvent?: (event: OfficeStreamEvent) => unknown;
  }) => Promise<unknown>;
};
type OfficeJobExecutorLike = {
  status?: unknown;
  offer?: (jobId: string) => boolean;
  handleEvent?: (event: OfficeStreamEvent) => unknown;
  close?: () => Promise<unknown> | unknown;
};
type SleepImpl = (
  delay: number,
  value?: undefined,
  options?: { signal?: AbortSignal },
) => Promise<unknown>;
type OfficeConnectionError = {
  code: string;
  message: string;
};
type OfficeRuntimeStatus = {
  state: string;
  connected: boolean;
  startedAt: string | null;
  lastHeartbeatAt: string | null;
  lastEventAt: string | null;
  lastEventId: string | null;
  lastEventType: string | null;
  reconnects: number;
  jobsOffered: number;
  error: OfficeConnectionError | null;
};

export type OfficeRuntimeOptions = {
  config: OfficeRuntimeConfig;
  token: string;
  logger?: OfficeLogger;
  transport?: OfficeTransportLike;
  createHarness?: unknown;
  jobExecutor?: OfficeJobExecutorLike | null;
  sleepImpl?: SleepImpl;
  cancelTimeoutMs?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function errorCode(error: unknown) {
  return isRecord(error) && typeof error.code === 'string' ? error.code : undefined;
}

function safeConnectionError(error: unknown): OfficeConnectionError {
  const code = errorCode(error) ?? 'office-connection-failed';
  const messages: Record<string, string> = {
    'invalid-device-token': 'AI Office 拒绝了 Device Token。',
    'office-hook-unavailable': 'AI Office Connector Hook 尚未就绪。',
    'office-protocol-mismatch': 'AI Office Connector 协议版本不兼容。',
    'office-transport-failed': '本机暂时无法访问 AI Office。',
  };
  return { code, message: messages[code] ?? 'AI Office 连接已中断。' };
}

export class OfficeRuntime {
  #config: OfficeRuntimeConfig;
  #token: string;
  #logger: OfficeLogger;
  #transport: OfficeTransportLike;
  #sleep: SleepImpl;
  #controller: AbortController | null = null;
  #task: Promise<void> | null = null;
  #status: OfficeRuntimeStatus;
  #jobs: OfficeJobExecutorLike | null;

  constructor({
    config,
    token,
    logger = console,
    transport,
    createHarness,
    jobExecutor,
    sleepImpl = sleep,
    cancelTimeoutMs = 10_000,
  }: OfficeRuntimeOptions) {
    this.#config = config;
    this.#token = token;
    this.#logger = logger;
    this.#sleep = sleepImpl;
    this.#transport = transport ?? new OfficeTransport({
      baseUrl: config.baseUrl, deviceId: config.deviceId, token,
    }) as OfficeTransportLike;
    this.#status = {
      state: 'idle', connected: false, startedAt: null, lastHeartbeatAt: null,
      lastEventAt: null, lastEventId: null, lastEventType: null, reconnects: 0,
      jobsOffered: 0, error: null,
    };
    this.#jobs = jobExecutor ?? (typeof createHarness === 'function' ? new OfficeJobExecutor({
      config,
      transport: this.#transport,
      createHarness,
      logger,
      cancelTimeoutMs,
    } as ConstructorParameters<typeof OfficeJobExecutor>[0]) as OfficeJobExecutorLike : null);
  }

  get status() {
    return structuredClone({
      ...this.#status,
      ...(this.#jobs ? { jobs: this.#jobs.status } : {}),
    });
  }

  capabilities() {
    return {
      protocolVersion: OFFICE_PROTOCOL_VERSION,
      deviceId: this.#config.deviceId,
      workspaces: Object.keys(this.#config.workspaces),
      instructionPresets: Object.keys(this.#config.instructionPresets),
      maxConcurrency: this.#config.maxConcurrency,
    };
  }

  async testConnection(signal?: AbortSignal) {
    await this.#transport.heartbeat({ ...this.capabilities(), probe: true }, { signal });
    return { ok: true };
  }

  start() {
    if (this.#task) return this.status;
    this.#controller = new AbortController();
    this.#status.startedAt = new Date().toISOString();
    this.#status.state = 'connecting';
    this.#task = this.#run(this.#controller.signal).finally(() => { this.#task = null; });
    this.#task.catch((error: unknown) => {
      if (this.#controller?.signal.aborted) return;
      this.#logger.error?.('[dsh-im:office] connector stopped:', error);
    });
    return this.status;
  }

  async #run(signal: AbortSignal) {
    let attempt = 0;
    while (!signal.aborted) {
      const attemptController = new AbortController();
      const attemptSignal = AbortSignal.any([signal, attemptController.signal]);
      try {
        const heartbeat = await this.#transport.heartbeat(this.capabilities(), { signal: attemptSignal });
        this.#offerJobs(heartbeat?.jobs);
        this.#status.lastHeartbeatAt = new Date().toISOString();
        let streamOpened = false;
        const heartbeatTask = this.#heartbeatLoop(attemptSignal, () => {
          if (streamOpened && !attemptSignal.aborted) attempt = 0;
        });
        const stream = this.#transport.stream({
          signal: attemptSignal,
          lastEventId: this.#status.lastEventId,
          onOpen: () => {
            this.#status.connected = true;
            this.#status.state = 'connected';
            this.#status.error = null;
            streamOpened = true;
          },
          onEvent: async (event) => {
            this.#status.lastEventAt = new Date().toISOString();
            this.#status.lastEventId = event.id ?? this.#status.lastEventId;
            this.#status.lastEventType = event.type ?? null;
            if (event.type === 'job.available') this.#status.jobsOffered += 1;
            this.#jobs?.handleEvent?.(event);
          },
        });
        await Promise.race([stream, heartbeatTask]);
      } catch (error: unknown) {
        if (signal.aborted) break;
        attemptController.abort();
        this.#status.connected = false;
        this.#status.state = 'reconnecting';
        this.#status.error = safeConnectionError(error);
        this.#status.reconnects += 1;
        const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
        attempt += 1;
        try { await this.#sleep(delay, undefined, { signal }); } catch { break; }
      } finally {
        attemptController.abort();
      }
    }
    this.#status.connected = false;
    this.#status.state = 'idle';
  }

  async #heartbeatLoop(signal: AbortSignal, onSuccess?: () => void) {
    while (!signal.aborted) {
      await this.#sleep(this.#config.heartbeatSeconds * 1_000, undefined, { signal });
      const heartbeat = await this.#transport.heartbeat(this.capabilities(), { signal });
      this.#offerJobs(heartbeat?.jobs);
      this.#status.lastHeartbeatAt = new Date().toISOString();
      onSuccess?.();
    }
  }

  #offerJobs(jobs: unknown) {
    if (!Array.isArray(jobs)) return;
    for (const job of jobs) {
      if (isRecord(job) && typeof job.id === 'string' && this.#jobs?.offer?.(job.id)) {
        this.#status.jobsOffered += 1;
      }
    }
  }

  async stop() {
    const task = this.#task;
    this.#controller?.abort();
    this.#controller = null;
    const results = await Promise.allSettled([
      this.#jobs?.close?.(),
      task?.catch(() => undefined),
    ]);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) throw failed.reason;
    this.#status.connected = false;
    this.#status.state = 'idle';
    return this.status;
  }
}
