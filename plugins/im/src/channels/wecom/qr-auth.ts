const GENERATE_URL = 'https://work.weixin.qq.com/ai/qc/generate';
const POLL_URL = 'https://work.weixin.qq.com/ai/qc/query_result';
const QR_TTL_MS = 5 * 60_000;
const POLL_INTERVAL_MS = 3_000;

type FetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};
type FetchImpl = (url: URL | string, init?: RequestInit) => Promise<FetchResponse>;
type WecomQrAuthOptions = {
  fetch?: FetchImpl;
  clock?: () => number;
  source?: string;
  platform?: number;
};
type WecomQrStartOptions = {
  signal?: AbortSignal;
};
type WecomQrPollOptions = {
  scode?: unknown;
  signal?: AbortSignal;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function defaultPlatform() {
  if (process.platform === 'win32') return 2;
  if (process.platform === 'linux') return 3;
  return 1;
}

function cleanString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function safeVerificationUrl(value: unknown) {
  const raw = cleanString(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname === 'work.weixin.qq.com' && (!url.port || url.port === '443')
      ? url.href : null;
  } catch {
    return null;
  }
}

function combinedSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
}

async function requestJson(fetchImpl: FetchImpl, url: URL, signal?: AbortSignal) {
  const response = await fetchImpl(url, {
    method: 'GET',
    redirect: 'error',
    signal: combinedSignal(signal, 10_000),
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Enterprise WeChat QR service returned HTTP ${response.status}`);
  const value: unknown = await response.json();
  return isRecord(value) ? value : {};
}

export class WecomQrAuth {
  #fetch: FetchImpl;
  #clock: () => number;
  #source: string;
  #platform: number;

  constructor({
    fetch: fetchImpl = globalThis.fetch as FetchImpl,
    clock = () => Date.now(),
    source = 'deepseek-harness',
    platform = defaultPlatform(),
  }: WecomQrAuthOptions = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required');
    this.#fetch = fetchImpl;
    this.#clock = clock;
    this.#source = source;
    this.#platform = [1, 2, 3].includes(platform) ? platform : defaultPlatform();
  }

  async start({ signal }: WecomQrStartOptions = {}) {
    const url = new URL(GENERATE_URL);
    url.searchParams.set('source', this.#source);
    url.searchParams.set('plat', String(this.#platform));
    const body = await requestJson(this.#fetch, url, signal);
    const data = isRecord(body.data) ? body.data : undefined;
    const scode = cleanString(data?.scode);
    const verificationUrl = safeVerificationUrl(data?.auth_url);
    if (!scode || !verificationUrl) throw new Error('Enterprise WeChat QR service returned invalid data');
    return {
      scode,
      verificationUrl,
      expiresAt: this.#clock() + QR_TTL_MS,
      pollIntervalMs: POLL_INTERVAL_MS,
    };
  }

  async poll({ scode, signal }: WecomQrPollOptions = {}) {
    const code = cleanString(scode);
    if (!code) throw new TypeError('Enterprise WeChat QR poll code is required');
    const url = new URL(POLL_URL);
    url.searchParams.set('scode', code);
    const body = await requestJson(this.#fetch, url, signal);
    const data = isRecord(body.data) ? body.data : undefined;
    const state = cleanString(data?.status)?.toLowerCase();
    if (state === 'success') {
      const info = isRecord(data?.bot_info) ? data.bot_info : undefined;
      const remoteBotId = cleanString(info?.botid);
      const secret = cleanString(info?.secret);
      if (!remoteBotId || !secret) throw new Error('Enterprise WeChat QR result omitted bot credentials');
      const name = cleanString(info?.name) || cleanString(info?.bot_name) || cleanString(info?.nickname);
      return { status: 'success', remoteBotId, secret, ...(name ? { name } : {}) };
    }
    if (state === 'expired' || state === 'timeout') return { status: 'expired' };
    if (state === 'fail' || state === 'failed' || state === 'error') return { status: 'failed' };
    return { status: 'waiting' };
  }
}
