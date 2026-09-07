import { ImagePromptError } from '../shared/image-prompt.ts';

const FEISHU_MISSING_MESSAGE_SCOPE_CODE = 99991672;
const FEISHU_ERROR_BODY_LIMIT = 64 * 1024;
const FEISHU_ERROR_BODY_TIMEOUT_MS = 1_000;
const FEISHU_IMAGE_PERMISSION_MESSAGE =
  '飞书机器人缺少图片读取权限。请在飞书开放平台为该应用添加 im:message:readonly，发布新版本并完成必要的管理员审批后，再重新发送图片。';

type FeishuMention = {
  key?: unknown;
};

type FeishuMessage = {
  chat_type?: unknown;
  chat_id?: unknown;
  message_type?: unknown;
  content?: unknown;
  mentions?: FeishuMention[];
  message_id?: unknown;
};

type FeishuEvent = {
  message?: FeishuMessage;
  sender?: {
    sender_id?: {
      open_id?: unknown;
      user_id?: unknown;
    };
    sender_type?: unknown;
  };
};

type DestroyableAsyncIterable = AsyncIterable<unknown> & {
  destroy?: (error?: unknown) => unknown;
};

type FeishuResource = {
  headers?: unknown;
  getReadableStream?: () => unknown;
};

type FeishuClient = {
  im?: {
    v1?: {
      messageResource?: {
        get?: (request: {
          path: { message_id: unknown; file_key: string };
          params: { type: string };
        }) => FeishuResource | Promise<FeishuResource | undefined> | undefined;
      };
    };
  };
};

type LoadOptions = {
  signal?: AbortSignal;
  maxBytes?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asClient(value: unknown): FeishuClient | undefined {
  return isRecord(value) ? value as FeishuClient : undefined;
}

function asAsyncIterable(value: unknown): DestroyableAsyncIterable | undefined {
  return value && typeof (value as DestroyableAsyncIterable)[Symbol.asyncIterator] === 'function'
    ? value as DestroyableAsyncIterable
    : undefined;
}

function bufferFromChunk(chunk: unknown) {
  return Buffer.from(chunk as Uint8Array);
}

export function conversationKey(event: FeishuEvent) {
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

function parsedMessageContent(event: FeishuEvent) {
  const value = event?.message?.content;
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function withoutMentions(text: unknown, event: FeishuEvent) {
  let result = typeof text === 'string' ? text : '';
  for (const mention of event?.message?.mentions ?? []) {
    if (typeof mention?.key === 'string' && mention.key) {
      result = result.replaceAll(mention.key, '');
    }
  }
  return result.trim();
}

export function extractText(event: FeishuEvent) {
  if (event?.message?.message_type !== 'text') return null;
  const parsed = parsedMessageContent(event);
  return parsed ? withoutMentions(parsed.text, event) : null;
}

function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function postContent(event: FeishuEvent, parsed = parsedMessageContent(event)) {
  if (event?.message?.message_type !== 'post') return null;
  if (!parsed) return null;

  const lines: string[] = [];
  const title = nonEmptyString(withoutMentions(parsed.title, event));
  if (title) lines.push(title);
  const imageKeys: string[] = [];
  for (const paragraph of Array.isArray(parsed.content) ? parsed.content : []) {
    if (!Array.isArray(paragraph)) continue;
    let visibleText = '';
    for (const element of paragraph) {
      const item = isRecord(element) ? element : undefined;
      const tag = String(item?.tag ?? '').toLowerCase();
      if (tag === 'img') {
        const key = nonEmptyString(item?.image_key);
        if (key) imageKeys.push(key);
      } else if (tag === 'text' || tag === 'a' || tag === 'link') {
        if (typeof item?.text === 'string') visibleText += item.text;
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

function headerValue(headers: unknown, name: string) {
  const bag = headers as { get?: (headerName: string) => unknown; [key: string]: unknown } | undefined;
  if (typeof bag?.get === 'function') return bag.get(name);
  return bag?.[name] ?? bag?.[name.toLowerCase()] ?? null;
}

function declaredSize(headers: unknown) {
  const header = headerValue(headers, 'content-length');
  if (header === null || header === undefined || header === '') return null;
  const value = Number(header);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

async function readBoundedStream(stream: unknown, { signal, maxBytes }: { signal?: AbortSignal; maxBytes: number }) {
  const readable = asAsyncIterable(stream);
  if (!readable) {
    throw new Error('Feishu image download returned no readable stream');
  }
  signal?.throwIfAborted();
  const abort = () => readable.destroy?.(
    signal?.reason ?? new DOMException('Feishu image download aborted', 'AbortError'),
  );
  signal?.addEventListener('abort', abort, { once: true });
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of readable) {
      signal?.throwIfAborted();
      const data = bufferFromChunk(chunk);
      size += data.length;
      if (size > maxBytes) {
        readable.destroy?.();
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
  const record = value as Record<string, unknown>;
  const nested = isRecord(record.error) ? record.error : undefined;
  const code = record.code ?? nested?.code;
  return Number.isSafeInteger(Number(code)) ? Number(code) : null;
}

async function readFeishuErrorBody(stream: unknown, signal?: AbortSignal) {
  const readable = asAsyncIterable(stream);
  if (!readable) return null;
  signal?.throwIfAborted();
  const timeout = AbortSignal.timeout(FEISHU_ERROR_BODY_TIMEOUT_MS);
  const readSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const abort = () => readable.destroy?.(readSignal.reason);
  readSignal.addEventListener('abort', abort, { once: true });
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of readable) {
      const data = bufferFromChunk(chunk);
      size += data.length;
      if (size > FEISHU_ERROR_BODY_LIMIT) {
        readable.destroy?.();
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
    const record = value as Record<string, unknown>;
    const directCode = providerCode(record);
    const response = isRecord(record.response) ? record.response : undefined;
    const data = response?.data ?? record.data;
    if (directCode === FEISHU_MISSING_MESSAGE_SCOPE_CODE) {
      (data as DestroyableAsyncIterable | undefined)?.destroy?.();
      return directCode;
    }
    if (asAsyncIterable(data)) {
      const body = await readFeishuErrorBody(data, signal);
      try {
        const parsedCode = providerCode(body == null ? null : JSON.parse(body));
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

function feishuFileSource(event: FeishuEvent, client: unknown, file: unknown) {
  const key = nonEmptyString(isRecord(file) ? file.file_key : undefined);
  if (!key) return null;
  const api = asClient(client);
  return {
    name: nonEmptyString(isRecord(file) ? file.file_name : undefined) ?? 'file',
    async load({ signal }: LoadOptions = {}) {
      signal?.throwIfAborted();
      const resource = await api?.im?.v1?.messageResource?.get?.({
        path: {
          message_id: event.message!.message_id,
          file_key: key,
        },
        params: { type: 'file' },
      });
      signal?.throwIfAborted();
      const stream = asAsyncIterable(resource?.getReadableStream?.());
      if (!stream) {
        throw new Error('Feishu file download returned no readable body');
      }
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        signal?.throwIfAborted();
        chunks.push(bufferFromChunk(chunk));
      }
      return Buffer.concat(chunks);
    },
  };
}

function feishuImageSource(event: FeishuEvent, client: unknown, key: string) {
  const api = asClient(client);
  return {
    async load({ signal, maxBytes }: LoadOptions = {}) {
      signal?.throwIfAborted();
      let resource: FeishuResource | undefined;
      try {
        resource = await api?.im?.v1?.messageResource?.get?.({
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
      if (size !== null && size > (maxBytes as number)) {
        (resource?.getReadableStream?.() as DestroyableAsyncIterable | undefined)?.destroy?.();
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

export function extractInboundMessage(event: FeishuEvent, client: unknown) {
  const messageType = event?.message?.message_type;
  const parsed = parsedMessageContent(event);
  const post = postContent(event, parsed);
  const standaloneImageKey = messageType === 'image'
    ? nonEmptyString(parsed?.image_key)
    : null;
  const imageKeys = standaloneImageKey ? [standaloneImageKey] : post?.imageKeys ?? [];
  const file = messageType === 'file' ? feishuFileSource(event, client, parsed) : null;
  return {
    content: messageType === 'text' ? extractText(event) ?? '' : post?.text ?? '',
    images: imageKeys.map((key) => feishuImageSource(event, client, key)),
    files: file ? [file] : [],
  };
}

export function splitText(text: string, maxChars = 9000) {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
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

export function isBotSender(event: FeishuEvent) {
  return event?.sender?.sender_type === 'bot';
}

export function isAllowedSender(event: FeishuEvent, allowedOpenIds?: Set<string> | null) {
  if (!allowedOpenIds || allowedOpenIds.size === 0) return false;
  if (allowedOpenIds.has('*')) return true;
  const senderOpenId = event?.sender?.sender_id?.open_id;
  return typeof senderOpenId === 'string' && allowedOpenIds.has(senderOpenId);
}
