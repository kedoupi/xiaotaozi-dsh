import { t } from './i18n.ts';

const DEFAULT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_IMAGES = 20;
const DEFAULT_MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;

export const DEFAULT_IMAGE_PROMPT = '请分析这张图片。';

type NamedError = {
  name?: unknown;
  message?: unknown;
};

type DownloadBody = {
  cancel?: () => { catch?: (onrejected?: unknown) => unknown };
  [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array>;
};

type DownloadResponse = {
  ok?: boolean;
  status?: number;
  headers?: {
    get?: (name: string) => unknown;
  };
  body?: DownloadBody | null;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

type FetchImpl = (input: URL, init?: RequestInit) => Promise<DownloadResponse>;

type FetchImageBufferOptions = {
  fetchImpl?: FetchImpl;
  headers?: HeadersInit;
  signal?: AbortSignal | null;
  maxBytes?: number;
  timeoutMs?: number;
  allowedHosts?: unknown;
};

type ImageSource = {
  size?: unknown;
  data?: unknown;
  name?: unknown;
  filename?: unknown;
  load?: (options?: { signal?: AbortSignal; maxBytes?: number }) => unknown;
};

type ImageMessage = {
  content?: unknown;
  images?: unknown;
};

type PromptContentOptions = {
  signal?: AbortSignal;
  maxImageBytes?: number;
  maxImages?: number;
  maxTotalImageBytes?: number;
};

type LoadedImage = {
  data: Buffer;
  name?: unknown;
};

type TextContentPart = {
  type: 'text';
  text: string;
};

type ImageContentPart = {
  type: 'image';
  mediaType: string;
  data: string;
  name?: string;
};

type PromptContentPart = TextContentPart | ImageContentPart;

type AttachmentError = {
  code?: unknown;
  details?: {
    reason?: unknown;
  };
};

export class ImagePromptError extends Error {
  code: string;
  userMessage: string;

  constructor(code: string, message: string, userMessage: string, options: ErrorOptions = {}) {
    super(message, options);
    this.name = 'ImagePromptError';
    this.code = code;
    this.userMessage = userMessage;
  }
}

const HOST_ATTACHMENT_USER_MESSAGES = Object.freeze({
  MODEL_DOES_NOT_SUPPORT_IMAGES:
    '当前模型不支持图片，请用 /models 查看可用模型，再用 /model <序号> 切换后重发。',
  IMAGE_TOO_LARGE: '图片超过宿主允许的大小，请压缩后重试。',
  IMAGE_TOO_MANY_PIXELS: '图片分辨率过高，请压缩后重试。',
  INVALID_IMAGE: '图片内容无效或格式不受支持，请重新发送。',
  INVALID_IMAGE_BASE64: '未能读取图片内容，请重新发送。',
  IMAGE_TYPE_MISMATCH: '图片格式与实际内容不一致，请重新发送。',
  TOO_MANY_IMAGES: '一次发送的图片数量超过宿主限制，请减少后重试。',
  IMAGES_TOO_LARGE: '图片总大小超过宿主限制，请减少图片或压缩后重试。',
});

type HostAttachmentReason = keyof typeof HOST_ATTACHMENT_USER_MESSAGES;

function requestSignal(signal: AbortSignal | null | undefined, timeoutMs: number) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function cancelResponseBody(response: DownloadResponse | null | undefined) {
  try {
    await response?.body?.cancel?.();
  } catch {
    // The original download error is more useful than a best-effort cleanup failure.
  }
}

function errorName(error: unknown) {
  return (error as NamedError | undefined)?.name;
}

function errorMessage(error: unknown) {
  const message = (error as NamedError | undefined)?.message;
  return typeof message === 'string' ? message : String(error);
}

function hostedByMessagingPlatform(target: URL, allowedHosts: unknown) {
  return !Array.isArray(allowedHosts) || allowedHosts.some((rule) => (
    typeof rule === 'string'
    && (target.hostname === rule
      || (rule.startsWith('.')
        && (target.hostname === rule.slice(1) || target.hostname.endsWith(rule))))
  ));
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function translatedText(text: string, params?: Record<string, unknown> | null) {
  return t(text, params) as string;
}

export async function fetchImageBuffer(url: unknown, {
  fetchImpl = fetch as FetchImpl,
  headers,
  signal,
  maxBytes = DEFAULT_MAX_IMAGE_BYTES,
  timeoutMs = 15_000,
  allowedHosts,
}: FetchImageBufferOptions = {}) {
  const target = new URL(url as string | URL);
  if (target.protocol !== 'https:') throw new Error('Image download URL must use HTTPS');
  if (!hostedByMessagingPlatform(target, allowedHosts)) {
    throw new Error('Image download URL is not hosted by the messaging platform');
  }
  const response = await fetchImpl(target, {
    method: 'GET',
    headers,
    signal: requestSignal(signal, timeoutMs),
    redirect: 'manual',
  });
  const status = response?.status;
  if (typeof status === 'number' && Number.isInteger(status) && status >= 300 && status < 400) {
    await cancelResponseBody(response);
    throw new ImagePromptError(
      'image-redirect-blocked',
      `Image download redirect was blocked (HTTP ${status})`,
      translatedText('图片下载地址发生了重定向，暂时无法读取。'),
    );
  }
  if (!response?.ok) {
    await cancelResponseBody(response);
    throw new ImagePromptError(
      'image-http-error',
      `Image download failed with HTTP ${response?.status ?? 'unknown'}`,
      translatedText('图片下载失败（HTTP {status}），请重新发送后再试。', { status: response?.status ?? 'unknown' }),
    );
  }
  const declaredLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await cancelResponseBody(response);
    throw new ImagePromptError(
      'image-too-large',
      `Image response declares ${declaredLength} bytes; the limit is ${maxBytes}`,
      translatedText('图片超过 5 MB，请压缩后重试。'),
    );
  }

  const body = response.body;
  if (body?.[Symbol.asyncIterator]) {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      const data = Buffer.from(chunk);
      size += data.length;
      if (size > maxBytes) {
        await body.cancel?.().catch?.(() => undefined);
        throw new ImagePromptError(
          'image-too-large',
          `Image response exceeded ${maxBytes} bytes`,
          translatedText('图片超过 5 MB，请压缩后重试。'),
        );
      }
      chunks.push(data);
    }
    return Buffer.concat(chunks, size);
  }

  const data = Buffer.from(await response.arrayBuffer());
  if (data.length > maxBytes) {
    throw new ImagePromptError(
      'image-too-large',
      `Image response contains ${data.length} bytes; the limit is ${maxBytes}`,
      translatedText('图片超过 5 MB，请压缩后重试。'),
    );
  }
  return data;
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function imageSources(message: ImageMessage | null | undefined): ImageSource[] {
  return Array.isArray(message?.images) ? message.images.filter(Boolean) as ImageSource[] : [];
}

function safeName(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const name = value
    .replaceAll('\\', '/')
    .split('/')
    .at(-1)
    ?.replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 255);
  return name || undefined;
}

function detectedImageMediaType(data: Buffer) {
  if (data.length >= 8
    && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47
    && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a) {
    return 'image/png';
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg';
  }
  if (data.length >= 6) {
    const signature = data.subarray(0, 6).toString('ascii');
    if (signature === 'GIF87a' || signature === 'GIF89a') return 'image/gif';
  }
  if (data.length >= 12
    && data.subarray(0, 4).toString('ascii') === 'RIFF'
    && data.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

function loadedImage(value: unknown): LoadedImage | null {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { data: Buffer.from(value) };
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as { data?: unknown; buffer?: unknown; name?: unknown; filename?: unknown };
  const raw = record.data ?? record.buffer;
  if (Buffer.isBuffer(raw) || raw instanceof Uint8Array) {
    return {
      data: Buffer.from(raw),
      name: record.name ?? record.filename,
    };
  }
  return null;
}

export function hasInboundImages(message: ImageMessage | null | undefined) {
  return imageSources(message).length > 0;
}

export function hasInboundPrompt(message: ImageMessage | null | undefined) {
  return Boolean(cleanText(message?.content)) || hasInboundImages(message);
}

export async function promptContentForMessage(message: ImageMessage | null | undefined, {
  signal,
  maxImageBytes = DEFAULT_MAX_IMAGE_BYTES,
  maxImages = DEFAULT_MAX_IMAGES,
  maxTotalImageBytes = DEFAULT_MAX_TOTAL_IMAGE_BYTES,
}: PromptContentOptions = {}) {
  const sources = imageSources(message);
  if (sources.length > maxImages) {
    throw new ImagePromptError(
      'too-many-images',
      `Image message contains ${sources.length} images; the limit is ${maxImages}`,
      translatedText('一次最多只能处理 {maxImages} 张图片。', { maxImages }),
    );
  }

  const text = cleanText(message?.content);
  const content: PromptContentPart[] = [];
  let totalImageBytes = 0;
  if (text) content.push({ type: 'text', text });
  else if (sources.length > 0) content.push({ type: 'text', text: translatedText(DEFAULT_IMAGE_PROMPT) });

  for (const [index, source] of sources.entries()) {
    signal?.throwIfAborted();
    if (finiteNumber(source?.size) && source.size > maxImageBytes) {
      throw new ImagePromptError(
        'image-too-large',
        `Image ${index + 1} declares ${source.size} bytes; the limit is ${maxImageBytes}`,
        translatedText('图片超过 5 MB，请压缩后重试。'),
      );
    }
    if (finiteNumber(source?.size) && totalImageBytes + source.size > maxTotalImageBytes) {
      throw new ImagePromptError(
        'images-too-large',
        `Images declare more than ${maxTotalImageBytes} bytes in total`,
        translatedText('一次发送的图片总大小过大，请减少图片数量或压缩后重试。'),
      );
    }

    let result: unknown;
    try {
      result = source?.data === undefined
        ? await source?.load?.({ signal, maxBytes: maxImageBytes })
        : source.data;
    } catch (error) {
      if (signal?.aborted || errorName(error) === 'AbortError' || errorName(error) === 'TimeoutError') throw error;
      if (error instanceof ImagePromptError) throw error;
      throw new ImagePromptError(
        'image-download-failed',
        `Unable to download image ${index + 1}: ${errorMessage(error)}`,
        translatedText('图片下载失败，请重新发送后再试。'),
        { cause: error },
      );
    }
    const loaded = loadedImage(result);
    if (!loaded?.data.length) {
      throw new ImagePromptError(
        'invalid-image-data',
        `Image ${index + 1} returned no data`,
        translatedText('未能读取图片内容，请重新发送。'),
      );
    }
    if (loaded.data.length > maxImageBytes) {
      throw new ImagePromptError(
        'image-too-large',
        `Image ${index + 1} contains ${loaded.data.length} bytes; the limit is ${maxImageBytes}`,
        translatedText('图片超过 5 MB，请压缩后重试。'),
      );
    }
    if (totalImageBytes + loaded.data.length > maxTotalImageBytes) {
      throw new ImagePromptError(
        'images-too-large',
        `Images contain more than ${maxTotalImageBytes} bytes in total`,
        translatedText('一次发送的图片总大小过大，请减少图片数量或压缩后重试。'),
      );
    }
    totalImageBytes += loaded.data.length;
    const mediaType = detectedImageMediaType(loaded.data);
    if (!mediaType) {
      throw new ImagePromptError(
        'unsupported-image-type',
        `Image ${index + 1} is not JPEG, PNG, GIF, or WebP`,
        translatedText('暂不支持该图片格式，请发送 JPEG、PNG、WebP 或 GIF 图片。'),
      );
    }
    const name = safeName(loaded.name ?? source?.name);
    content.push({
      type: 'image',
      mediaType,
      data: loaded.data.toString('base64'),
      ...(name ? { name } : {}),
    });
  }
  return content;
}

/** Return only allowlisted, user-safe image failure details. */
export function imagePromptDiagnostic(error: unknown) {
  if (error instanceof ImagePromptError) {
    return {
      code: 'image-prompt-error',
      reason: error.code,
      userMessage: error.userMessage,
    };
  }
  const record = error as AttachmentError | undefined;
  if (record?.code !== 'attachment-error' || typeof record?.details?.reason !== 'string') {
    return null;
  }
  const reason = record.details.reason;
  const userMessage = Object.hasOwn(HOST_ATTACHMENT_USER_MESSAGES, reason)
    ? translatedText(HOST_ATTACHMENT_USER_MESSAGES[reason as HostAttachmentReason])
    : null;
  return userMessage ? { code: 'attachment-error', reason, userMessage } : null;
}

export function imagePromptUserMessage(error: unknown) {
  return imagePromptDiagnostic(error)?.userMessage ?? null;
}
