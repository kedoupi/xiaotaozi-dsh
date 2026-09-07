import { ImagePromptError } from '../shared/image-prompt.ts';

const FEISHU_MISSING_MESSAGE_SCOPE_CODE = 99991672;
const FEISHU_ERROR_BODY_LIMIT = 64 * 1024;
const FEISHU_ERROR_BODY_TIMEOUT_MS = 1_000;
const FEISHU_IMAGE_PERMISSION_MESSAGE =
  '飞书机器人缺少图片读取权限。请在飞书开放平台为该应用添加 im:message:readonly，发布新版本并完成必要的管理员审批后，再重新发送图片。';

type FeishuSenderId = {
  open_id?: unknown;
  user_id?: unknown;
};
type FeishuEvent = {
  message?: {
    chat_type?: unknown;
    chat_id?: unknown;
    content?: unknown;
    message_type?: unknown;
    mentions?: Array<{ key?: unknown } | null | undefined> | null;
    message_id?: unknown;
  };
  sender?: {
    sender_id?: FeishuSenderId;
    sender_type?: unknown;
  };
};
type FeishuParsedContent = Record<string, unknown> & {
  text?: unknown;
  title?: unknown;
  content?: unknown;
  image_key?: unknown;
};
type HeadersLike = {
  get?: (name: string) => unknown;
  [key: string]: unknown;
};
type DestroyableStream = AsyncIterable<unknown> & {
  destroy?: (reason?: unknown) => unknown;
};
type FeishuResource = {
  headers?: HeadersLike;
  getReadableStream?: () => DestroyableStream | undefined;
};
type FeishuClient = {
  im?: {
    v1?: {
      messageResource?: {
        get?: (args: unknown) => Promise<FeishuResource | undefined>;
      };
    };
  };
};
type ProviderError = {
  code?: unknown;
  error?: { code?: unknown };
  response?: { data?: unknown };
  data?: unknown;
  cause?: unknown;
};
type LoadOptions = {
  signal?: AbortSignal;
  maxBytes?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asDestroyableStream(value: unknown): DestroyableStream | null {
  if (!value || typeof value !== 'object') return null;
  if (typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] !== 'function') return null;
  return value as DestroyableStream;
}

export function conversationKey(event: FeishuEvent | null | undefined) {
  const chatType = event?.message?.chat_type;
  if (chatType === 'p2p') {
    const senderId = event?.sender?.sender_id?.open_id || event?.sender?.sender_id?.user_id;
    if (!senderId) throw new Error('Feishu p2p event has no sender id');
    return `p2p:${senderId}`;
  }
  const chatId = event?.message?.chat_id;
  if (!chatId) throw new Error('Feishu group event has no chat id');
  return `group:${chatId}`;
}

function parsedMessageContent(event: FeishuEvent | null | undefined): FeishuParsedContent | null {
  const value = event?.message?.content;
  if (value && typeof value === 'object') return value as FeishuParsedContent;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed as FeishuParsedContent : null;
  } catch {
    return null;
  }
}

function withoutMentions(text: unknown, event: FeishuEvent | null | undefined) {
  let result = typeof text === 'string' ? text : '';
  for (const mention of event?.message?.mentions ?? []) {
    if (typeof mention?.key === 'string' && mention.key) {
      result = result.replaceAll(mention.key, '');
    }
  }
  return result.trim();
}

export function extractText(event: FeishuEvent | null | undefined) {
  if (event?.message?.message_type !== 'text') return null;
  const parsed = parsedMessageContent(event);
  return parsed ? withoutMentions(parsed.text, event) : null;
}

function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function postContent(event: FeishuEvent | null | undefined, parsed = parsedMessageContent(event)) {
  if (event?.message?.message_type !== 'post') return null;
  if (!parsed) return null;

  const lines = [];
  const title = nonEmptyString(withoutMentions(parsed.title, event));
  if (title) lines.push(title);
  const imageKeys = [];
  for (const paragraph of Array.isArray(parsed.content) ? parsed.content : []) {
    if (!Array.isArray(paragraph)) continue;
    let visibleText = '';
    for (const element of paragraph) {
      const item = isRecord(element) ? element : {};
      const tag = String(item.tag ?? '').toLowerCase();
      if (tag === 'img') {
        const key = nonEmptyString(item.image_key);
        if (key) imageKeys.push(key);
      } else if (tag === 'text' || tag === 'a' || tag === 'link') {
        if (typeof item.text === 'string') visibleText += item.text;
      }
    }
    const line = nonEmptyString(withoutMentions(visibleText, event));
    if (line) lines.push(line);
  }

  return {
    text: lines.join('\n'),
    imageKeys,
  };
}

function headerValue(headers: HeadersLike | null | undefined, name: string) {
  if (typeof headers?.get === 'function') return headers.get(name);
  return headers?.[name] ?? headers?.[name.toLowerCase()] ?? null;
}

function declaredSize(headers: HeadersLike | null | undefined) {
  const header = headerValue(headers, 'content-length');
  if (header === null || header === undefined || header === '') return null;
  const value = Number(header);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

async function readBoundedStream(
  stream: DestroyableStream | null | undefined,
  { signal, maxBytes }: { signal?: AbortSignal; maxBytes: number },
) {
  if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
    throw new Error('Feishu image download returned no readable stream');
  }
  signal?.throwIfAborted();
  const abort = () => stream.destroy?.(
    signal?.reason ?? new DOMException('Feishu image download aborted', 'AbortError'),
  );
  signal?.addEventListener('abort', abort, { once: true });
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of stream) {
      signal?.throwIfAborted();
      const data = Buffer.from(chunk as Uint8Array);
      size += data.length;
      if (size > maxBytes) {
        stream.destroy?.();
        throw new ImagePromptError(
          'image-too-large',
          `Feishu image exceeds ${maxBytes} bytes`,
          '图片超过 5 MB，请压缩后重试。',
        );
      }
      chunks.push(data);
    }
    signal?.throwIfAborted();
    return Buffer.concat(chunks, size);
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}

function providerCode(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const record = value as ProviderError;
  const code = record.code ?? record.error?.code;
  return Number.isSafeInteger(Number(code)) ? Number(code) : null;
}

async function readFeishuErrorBody(stream: DestroyableStream | null | undefined, signal?: AbortSignal) {
  if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') return null;
  signal?.throwIfAborted();
  const timeout = AbortSignal.timeout(FEISHU_ERROR_BODY_TIMEOUT_MS);
  const readSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const abort = () => stream.destroy?.(readSignal.reason);
  readSignal.addEventListener('abort', abort, { once: true });
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of stream) {
      const data = Buffer.from(chunk as Uint8Array);
      size += data.length;
      if (size > FEISHU_ERROR_BODY_LIMIT) {
        stream.destroy?.();
        return null;
      }
      chunks.push(data);
    }
    return Buffer.concat(chunks, size).toString('utf8');
  } catch {
    signal?.throwIfAborted();
    return null;
  } finally {
    readSignal.removeEventListener('abort', abort);
  }
}

async function feishuProviderCode(error: unknown, signal?: AbortSignal) {
  const pending: unknown[] = [error];
  const seen = new Set<unknown>();
  while (pending.length > 0 && seen.size < 8) {
    const value = pending.shift();
    if (!value || (typeof value !== 'object' && typeof value !== 'function') || seen.has(value)) {
      continue;
    }
    seen.add(value);
    const record = value as ProviderError & { destroy?: () => unknown };
    const directCode = providerCode(value);
    const data = record.response?.data ?? record.data;
    if (directCode === FEISHU_MISSING_MESSAGE_SCOPE_CODE) {
      (data as DestroyableStream | undefined)?.destroy?.();
      return directCode;
    }
    const stream = asDestroyableStream(data);
    if (stream) {
      const body = await readFeishuErrorBody(stream, signal);
      try {
        const parsedCode = providerCode(JSON.parse(body ?? 'null'));
        if (parsedCode === FEISHU_MISSING_MESSAGE_SCOPE_CODE) return parsedCode;
      } catch {
        // Non-JSON provider failures keep the generic image download message.
      }
    } else {
      const dataCode = providerCode(data);
      if (dataCode === FEISHU_MISSING_MESSAGE_SCOPE_CODE) return dataCode;
    }
    pending.push(record.cause);
  }
  return null;
}

async function feishuImageDownloadError(error: unknown, signal?: AbortSignal) {
  if (await feishuProviderCode(error, signal) !== FEISHU_MISSING_MESSAGE_SCOPE_CODE) return error;
  return new ImagePromptError(
    'feishu-image-permission-required',
    'Feishu image download requires the im:message:readonly tenant scope',
    FEISHU_IMAGE_PERMISSION_MESSAGE,
    { cause: error },
  );
}

function feishuFileSource(
  event: FeishuEvent,
  client: FeishuClient | null | undefined,
  file: unknown,
) {
  const record = isRecord(file) ? file : {};
  const key = nonEmptyString(record.file_key);
  if (!key) return null;
  return {
    name: nonEmptyString(record.file_name) ?? 'file',
    async load({ signal }: LoadOptions = {}) {
      signal?.throwIfAborted();
      const resource = await client?.im?.v1?.messageResource?.get?.({
        path: {
          message_id: event.message!.message_id,
          file_key: key,
        },
        params: { type: 'file' },
      });
      signal?.throwIfAborted();
      const stream = resource?.getReadableStream?.();
      if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
        throw new Error('Feishu file download returned no readable body');
      }
      const chunks = [];
      for await (const chunk of stream) {
        signal?.throwIfAborted();
        chunks.push(Buffer.from(chunk as Uint8Array));
      }
      return Buffer.concat(chunks);
    },
  };
}

function feishuImageSource(
  event: FeishuEvent,
  client: FeishuClient | null | undefined,
  key: string,
) {
  return {
    async load({ signal, maxBytes }: LoadOptions = {}) {
      signal?.throwIfAborted();
      let resource;
      try {
        resource = await client?.im?.v1?.messageResource?.get?.({
          path: {
            message_id: event.message!.message_id,
            file_key: key,
          },
          params: { type: 'image' },
        });
      } catch (error) {
        throw await feishuImageDownloadError(error, signal);
      }
      signal?.throwIfAborted();
      const size = declaredSize(resource?.headers);
      if (size !== null && size > maxBytes!) {
        (resource?.getReadableStream?.() as DestroyableStream).destroy?.();
        throw new ImagePromptError(
          'image-too-large',
          `Feishu image declares ${size} bytes; the limit is ${maxBytes}`,
          '图片超过 5 MB，请压缩后重试。',
        );
      }
      return readBoundedStream(resource?.getReadableStream?.(), { signal, maxBytes: maxBytes! });
    },
  };
}

export function extractInboundMessage(
  event: FeishuEvent | null | undefined,
  client?: FeishuClient | null,
) {
  const messageType = event?.message?.message_type;
  const parsed = parsedMessageContent(event);
  const post = postContent(event, parsed);
  const standaloneImageKey = messageType === 'image'
    ? nonEmptyString(parsed?.image_key)
    : null;
  const imageKeys = standaloneImageKey ? [standaloneImageKey] : post?.imageKeys ?? [];
  const file = messageType === 'file' ? feishuFileSource(event!, client, parsed) : null;
  return {
    content: messageType === 'text' ? extractText(event) ?? '' : post?.text ?? '',
    images: imageKeys.map((key) => feishuImageSource(event!, client, key)),
    files: file ? [file] : [],
  };
}

export function splitText(text: string, maxChars = 9000) {
  if (text.length <= maxChars) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > maxChars) {
    let splitAt = remaining.lastIndexOf('\n', maxChars);
    if (splitAt < Math.floor(maxChars * 0.6)) splitAt = maxChars;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n+/, '');
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export function isBotSender(event: FeishuEvent | null | undefined) {
  return event?.sender?.sender_type === 'bot';
}

export function isAllowedSender(
  event: FeishuEvent | null | undefined,
  allowedOpenIds: Set<string> | null | undefined,
) {
  if (!allowedOpenIds || allowedOpenIds.size === 0) return false;
  if (allowedOpenIds.has('*')) return true;
  const senderOpenId = event?.sender?.sender_id?.open_id;
  return typeof senderOpenId === 'string' && allowedOpenIds.has(senderOpenId);
}
