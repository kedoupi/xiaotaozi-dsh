// @ts-nocheck

export class QqQrAuth {
  #start;
  #load;
  #source;

  constructor({
    start,
    load = async () => (await import('@tencent-connect/qqbot-connector')).startQrConnect,
    source = 'deepseek-harness',
  } = {}) {
    if (start !== undefined && typeof start !== 'function') throw new TypeError('QQ QR connector is required');
    if (typeof load !== 'function') throw new TypeError('QQ QR connector loader is required');
    this.#start = start;
    this.#load = load;
    this.#source = source;
  }

  start(callbacks, { signal } = {}) {
    if (!callbacks || typeof callbacks.onSuccess !== 'function'
      || typeof callbacks.onFailure !== 'function') {
      throw new TypeError('QQ QR callbacks are required');
    }
    const options = {
      displayQrCodeToConsole: false,
      source: this.#source,
      signal,
    };
    if (this.#start) return this.#start(callbacks, options);

    let disposed = false;
    let disposeConnector;
    void this.#load().then((start) => {
      if (disposed || signal?.aborted) return;
      if (typeof start !== 'function') throw new TypeError('QQ QR connector is unavailable');
      disposeConnector = start(callbacks, options);
    }).catch((error) => {
      if (!disposed && !signal?.aborted) callbacks.onFailure(error);
    });
    return () => {
      disposed = true;
      disposeConnector?.();
    };
  }
}
