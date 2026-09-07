type QrConnectCallbacks = {
  onSuccess: (...args: unknown[]) => unknown;
  onFailure: (error: unknown) => unknown;
};

type QrConnectOptions = {
  displayQrCodeToConsole?: boolean;
  source?: string;
  signal?: AbortSignal;
};

type QrStart = (
  callbacks: QrConnectCallbacks,
  options?: QrConnectOptions,
) => (() => void) | void | undefined;

type QqQrAuthOptions = {
  start?: QrStart;
  load?: () => Promise<QrStart>;
  source?: string;
};

type QqConnectorModule = {
  startQrConnect: QrStart;
};

export class QqQrAuth {
  #start?: QrStart;
  #load: () => Promise<QrStart>;
  #source: string;

  constructor({
    start,
    load = async () => (
      await import('@tencent-connect/qqbot-connector') as QqConnectorModule
    ).startQrConnect,
    source = 'deepseek-harness',
  }: QqQrAuthOptions = {}) {
    if (start !== undefined && typeof start !== 'function') throw new TypeError('QQ QR connector is required');
    if (typeof load !== 'function') throw new TypeError('QQ QR connector loader is required');
    this.#start = start;
    this.#load = load;
    this.#source = source;
  }

  start(callbacks: QrConnectCallbacks, { signal }: { signal?: AbortSignal } = {}) {
    if (!callbacks || typeof callbacks.onSuccess !== 'function'
      || typeof callbacks.onFailure !== 'function') {
      throw new TypeError('QQ QR callbacks are required');
    }
    const options: QrConnectOptions = {
      displayQrCodeToConsole: false,
      source: this.#source,
      signal,
    };
    if (this.#start) return this.#start(callbacks, options);

    let disposed = false;
    let disposeConnector: (() => void) | void | undefined;
    void this.#load().then((start) => {
      if (disposed || signal?.aborted) return;
      if (typeof start !== 'function') throw new TypeError('QQ QR connector is unavailable');
      disposeConnector = start(callbacks, options);
    }).catch((error: unknown) => {
      if (!disposed && !signal?.aborted) callbacks.onFailure(error);
    });
    return () => {
      disposed = true;
      disposeConnector?.();
    };
  }
}
