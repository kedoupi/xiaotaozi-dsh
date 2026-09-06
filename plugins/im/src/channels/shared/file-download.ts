type CodedError = Error & { code: string; status?: unknown };

type DownloadBody = {
  cancel?: () => unknown;
  [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array>;
};

type DownloadResponse = {
  ok?: boolean;
  status?: number;
  body?: DownloadBody | null;
  arrayBuffer?: () => Promise<ArrayBuffer>;
};

type FetchImpl = (input: URL, init?: RequestInit) => Promise<DownloadResponse>;

type FileDownloadOptions = {
  fetchImpl?: FetchImpl;
  headers?: HeadersInit;
  signal?: AbortSignal | null;
  allowedHosts?: unknown;
};

async function cancelResponseBody(response: DownloadResponse | null | undefined) {
  try {
    await response?.body?.cancel?.();
  } catch {
    // Preserve the original download failure.
  }
}

function hostedByMessagingPlatform(target: URL, allowedHosts: unknown) {
  return !Array.isArray(allowedHosts) || allowedHosts.some((rule) => (
    typeof rule === 'string'
    && (target.hostname === rule
      || (rule.startsWith('.')
        && (target.hostname === rule.slice(1) || target.hostname.endsWith(rule))))
  ));
}

/**
 * Open a channel-hosted ordinary file as a stream.
 *
 * This deliberately has no plugin-defined size, type, count, or download-time
 * limit. The caller owns cancellation through its AbortSignal and the channel
 * remains the authority for its own file limits.
 */
export async function fetchFileStream(url: unknown, {
  fetchImpl = fetch as FetchImpl,
  headers,
  signal,
  allowedHosts,
}: FileDownloadOptions = {}) {
  const target = new URL(url as string | URL);
  if (target.protocol !== 'https:') throw new Error('File download URL must use HTTPS');
  if (!hostedByMessagingPlatform(target, allowedHosts)) {
    throw new Error('File download URL is not hosted by the messaging platform');
  }

  const response = await fetchImpl(target, {
    method: 'GET',
    headers,
    signal,
    redirect: 'manual',
  });
  const status = response?.status;
  if (typeof status === 'number' && Number.isInteger(status) && status >= 300 && status < 400) {
    await cancelResponseBody(response);
    const error = new Error(`File download redirect was blocked (HTTP ${status})`) as CodedError;
    error.code = 'file-redirect-blocked';
    throw error;
  }
  if (!response?.ok) {
    await cancelResponseBody(response);
    const error = new Error(`File download failed with HTTP ${response?.status ?? 'unknown'}`) as CodedError;
    error.code = 'file-http-error';
    error.status = response?.status;
    throw error;
  }
  if (response.body?.[Symbol.asyncIterator]) return { stream: response.body };
  if (typeof response.arrayBuffer === 'function') {
    const data = Buffer.from(await response.arrayBuffer());
    return {
      stream: (async function* fileBody() { yield data; }()),
    };
  }
  throw new Error('File download returned no readable body');
}
