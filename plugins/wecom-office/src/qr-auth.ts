import {
  QR_POLL_INTERVAL_MS,
  QR_SOURCE,
  QR_TTL_MS,
} from "./names.ts";
import { cleanString } from "./identity.ts";
import { OfficeError } from "./errors.ts";

const GENERATE_URL = "https://work.weixin.qq.com/ai/qc/generate";
const POLL_URL = "https://work.weixin.qq.com/ai/qc/query_result";

export function defaultQrPlatform(platform: NodeJS.Platform = process.platform): 1 | 2 | 3 {
  if (platform === "win32") return 2;
  if (platform === "linux") return 3;
  return 1;
}

export function safeVerificationUrl(value: unknown): string | null {
  const raw = cleanString(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.hostname === "work.weixin.qq.com" && (!url.port || url.port === "443")
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function combinedSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
}

async function requestJson(
  fetchImpl: typeof fetch,
  url: URL,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: "GET",
    redirect: "error",
    signal: combinedSignal(signal, 10_000),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new OfficeError("qr-failed", `企业微信扫码服务返回 HTTP ${String(response.status)}`);
  return response.json();
}

export interface QrStartResult {
  scode: string;
  verificationUrl: string;
  expiresAt: number;
  pollIntervalMs: number;
}

export type QrPollResult =
  | { status: "success"; remoteBotId: string; secret: string; name?: string }
  | { status: "expired" }
  | { status: "failed" }
  | { status: "waiting" };

export class OfficeQrAuth {
  #fetch: typeof fetch;
  #clock: () => number;
  #source: string;
  #platform: 1 | 2 | 3;

  constructor({
    fetch: fetchImpl = globalThis.fetch,
    clock = () => Date.now(),
    source = QR_SOURCE,
    platform = defaultQrPlatform(),
  }: {
    fetch?: typeof fetch;
    clock?: () => number;
    source?: string;
    platform?: 1 | 2 | 3;
  } = {}) {
    this.#fetch = fetchImpl;
    this.#clock = clock;
    this.#source = source;
    this.#platform = platform;
  }

  async start({ signal }: { signal?: AbortSignal } = {}): Promise<QrStartResult> {
    const url = new URL(GENERATE_URL);
    url.searchParams.set("source", this.#source);
    url.searchParams.set("plat", String(this.#platform));
    const body = await requestJson(this.#fetch, url, signal) as { data?: { scode?: unknown; auth_url?: unknown } };
    const scode = cleanString(body?.data?.scode);
    const verificationUrl = safeVerificationUrl(body?.data?.auth_url);
    if (!scode || !verificationUrl) throw new OfficeError("qr-failed", "企业微信扫码服务没有返回有效数据");
    return {
      scode,
      verificationUrl,
      expiresAt: this.#clock() + QR_TTL_MS,
      pollIntervalMs: QR_POLL_INTERVAL_MS,
    };
  }

  async poll({ scode, signal }: { scode: string; signal?: AbortSignal }): Promise<QrPollResult> {
    const code = cleanString(scode);
    if (!code) throw new TypeError("Enterprise WeChat QR poll code is required");
    const url = new URL(POLL_URL);
    url.searchParams.set("scode", code);
    const body = await requestJson(this.#fetch, url, signal) as {
      data?: { status?: unknown; bot_info?: { botid?: unknown; secret?: unknown; name?: unknown; bot_name?: unknown; nickname?: unknown } };
    };
    const state = cleanString(body?.data?.status)?.toLowerCase();
    if (state === "success") {
      const info = body?.data?.bot_info;
      const remoteBotId = cleanString(info?.botid);
      const secret = cleanString(info?.secret);
      if (!remoteBotId || !secret) throw new OfficeError("qr-failed", "扫码结果缺少机器人凭据");
      const name = cleanString(info?.name) ?? cleanString(info?.bot_name) ?? cleanString(info?.nickname);
      return { status: "success", remoteBotId, secret, ...(name ? { name } : {}) };
    }
    if (state === "expired" || state === "timeout") return { status: "expired" };
    if (state === "fail" || state === "failed" || state === "error") return { status: "failed" };
    return { status: "waiting" };
  }
}
