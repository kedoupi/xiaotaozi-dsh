import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { t } from './i18n.ts';

const FILES_DIRECTORY = join('.dsh-im', 'inbound');

type AsyncIterableStream = AsyncIterable<unknown> & {
  [Symbol.asyncIterator](): AsyncIterator<unknown>;
};

interface InboundFileLoadResult {
  data?: Buffer | Uint8Array | unknown;
  buffer?: Buffer | Uint8Array;
  name?: string;
  filename?: string;
  mediaType?: string;
  mimetype?: string;
  stream?: AsyncIterableStream;
  [Symbol.asyncIterator]?: () => AsyncIterator<unknown>;
}

export interface InboundFileSource {
  data?: unknown;
  name?: string;
  mediaType?: string;
  load?: (options?: { signal?: AbortSignal }) => Promise<
    InboundFileLoadResult | Buffer | Uint8Array | null | undefined
  >;
}

export interface InboundFileMessage {
  files?: InboundFileSource[] | null;
}

export interface StagedInboundFile {
  name: string;
  path: string;
  mediaType?: string;
}

export interface StagedInboundFiles {
  files: readonly StagedInboundFile[];
  cleanup: () => Promise<void>;
}

type PromptContentPart = { type: 'text'; text: string };
type HarnessPrompt = string | PromptContentPart[] | readonly PromptContentPart[];

export class InboundFileError extends Error {
  code: string;
  userMessage: string;

  constructor(
    code: string,
    message: string,
    userMessage: string = t('文件接收失败，请重新发送后再试。', undefined),
    options: ErrorOptions = {},
  ) {
    super(message, options);
    this.name = 'InboundFileError';
    this.code = code;
    this.userMessage = userMessage;
  }
}

function fileSources(message: InboundFileMessage | null | undefined): InboundFileSource[] {
  return Array.isArray(message?.files) ? message.files.filter(Boolean) : [];
}

function displayName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value
    .replaceAll('\\', '/')
    .split('/')
    .at(-1)
    ?.replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  return cleaned || fallback;
}

function storageName(value: unknown, index: number): string {
  const cleaned = displayName(value, 'file')
    .replace(/[^\p{L}\p{N}._ -]/gu, '_')
    .replace(/^\.+/, '')
    .slice(0, 160) || 'file';
  return `${String(index + 1).padStart(2, '0')}-${cleaned}`;
}

interface LoadedInboundFile {
  data?: Buffer;
  stream?: AsyncIterableStream;
  name?: string;
  mediaType?: string;
}

function loadedFile(value: unknown): LoadedInboundFile | null {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { data: Buffer.from(value) };
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as InboundFileLoadResult;
  const raw = record.data ?? record.buffer;
  if (Buffer.isBuffer(raw) || raw instanceof Uint8Array) {
    return {
      data: Buffer.from(raw),
      name: record.name ?? record.filename,
      mediaType: record.mediaType ?? record.mimetype,
    };
  }
  const streamSource = record.stream ?? (
    typeof record[Symbol.asyncIterator] === 'function' ? record as AsyncIterableStream : null
  );
  if (streamSource && typeof streamSource[Symbol.asyncIterator] === 'function') {
    return {
      stream: streamSource,
      name: record.name ?? record.filename,
      mediaType: record.mediaType ?? record.mimetype,
    };
  }
  return null;
}

export function hasInboundFiles(message: InboundFileMessage | null | undefined): boolean {
  return fileSources(message).length > 0;
}

/** Start provider downloads immediately while preserving the lazy file-source contract. */
export function prefetchInboundFiles(
  message: InboundFileMessage,
  { signal }: { signal?: AbortSignal } = {},
): InboundFileMessage {
  const sources = fileSources(message);
  if (sources.length === 0) return message;
  return {
    ...message,
    files: sources.map((source) => {
      if (source?.data !== undefined || typeof source?.load !== 'function') return source;
      let download: Promise<unknown>;
      try {
        download = Promise.resolve(source.load({ signal }));
      } catch (error) {
        download = Promise.reject(error);
      }
      download.catch(() => undefined);
      return {
        ...source,
        async load({ signal: loadSignal }: { signal?: AbortSignal } = {}) {
          loadSignal?.throwIfAborted();
          const result = await download;
          loadSignal?.throwIfAborted();
          return result as InboundFileLoadResult | Buffer | Uint8Array | null | undefined;
        },
      };
    }),
  };
}

export async function stageInboundFiles(
  message: InboundFileMessage,
  {
    workspace,
    signal,
  }: {
    workspace?: string;
    signal?: AbortSignal;
  } = {},
): Promise<StagedInboundFiles | null> {
  const sources = fileSources(message);
  if (sources.length === 0) return null;
  if (typeof workspace !== 'string' || !isAbsolute(workspace)) {
    throw new InboundFileError(
      'inbound-file-workspace-unavailable',
      'The Harness Session workspace is unavailable for inbound files.',
    );
  }

  signal?.throwIfAborted();
  const root = resolve(workspace, FILES_DIRECTORY);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(root, 'turn-'));
  const files: StagedInboundFile[] = [];

  try {
    for (const [index, source] of sources.entries()) {
      signal?.throwIfAborted();
      let value: unknown;
      try {
        value = source?.data === undefined
          ? await source?.load?.({ signal })
          : source.data;
      } catch (error) {
        if (signal?.aborted) throw error;
        const detail = error instanceof Error ? error.message : String(error);
        throw new InboundFileError(
          'inbound-file-download-failed',
          `Unable to download inbound file ${index + 1}: ${detail}`,
          t('文件下载失败，请重新发送后再试。', undefined),
          { cause: error },
        );
      }

      const loaded = loadedFile(value);
      if (!loaded) {
        throw new InboundFileError(
          'inbound-file-data-invalid',
          `Inbound file ${index + 1} returned no readable data.`,
        );
      }
      const name = displayName(loaded.name ?? source?.name, `file-${index + 1}`);
      const path = join(directory, storageName(name, index));
      if (loaded.data) {
        await writeFile(path, loaded.data, { mode: 0o600, signal });
      } else if (loaded.stream) {
        try {
          await pipeline(
            loaded.stream,
            createWriteStream(path, { flags: 'wx', mode: 0o600 }),
            { signal },
          );
        } catch (error) {
          if (signal?.aborted) throw error;
          const detail = error instanceof Error ? error.message : String(error);
          throw new InboundFileError(
            'inbound-file-download-failed',
            `Unable to stream inbound file ${index + 1}: ${detail}`,
            t('文件下载失败，请重新发送后再试。', undefined),
            { cause: error },
          );
        }
      } else {
        throw new InboundFileError(
          'inbound-file-data-invalid',
          `Inbound file ${index + 1} returned no readable data.`,
        );
      }
      const relativePath = relative(resolve(workspace), path);
      if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
        throw new InboundFileError(
          'inbound-file-path-invalid',
          'The staged inbound file escaped the Harness Session workspace.',
        );
      }
      const mediaType = loaded.mediaType ?? source?.mediaType;
      files.push(Object.freeze({
        name,
        path: relativePath,
        ...(typeof mediaType === 'string' && mediaType.trim()
          ? { mediaType: mediaType.trim() }
          : {}),
      }));
    }
    return Object.freeze({
      files: Object.freeze(files),
      async cleanup() {
        await rm(directory, { recursive: true, force: true });
      },
    });
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

/** Quote a workspace path so DSH user bubbles render it as a file chip. */
function inboundFileChip(path: string): string {
  if (typeof path !== 'string' || path.trim() === '') return '';
  if (path.includes('\n') || path.includes('"')) return path;
  return `@"${path}"`;
}

export function inboundFilesPromptText(files: readonly StagedInboundFile[] | null | undefined): string {
  if (!Array.isArray(files) || files.length === 0) return '';
  return files.map((file) => {
    const name = displayName(file?.name, 'file');
    const heading = t('已上传文件 {name}', { name });
    const chip = inboundFileChip(file?.path ?? '');
    return chip ? `${heading}\n${chip}` : heading;
  }).join('\n\n');
}

export function appendInboundFilesToPrompt(
  prompt: HarnessPrompt,
  staged: StagedInboundFiles | null | undefined,
): HarnessPrompt {
  const manifest = inboundFilesPromptText(staged?.files);
  if (!manifest) return prompt;
  if (Array.isArray(prompt)) return [...prompt, { type: 'text', text: manifest }];
  const text = typeof prompt === 'string' ? prompt.trim() : '';
  return text ? `${text}\n\n${manifest}` : manifest;
}

export function inboundFileUserMessage(error: unknown): string | null {
  return error instanceof InboundFileError ? error.userMessage : null;
}
