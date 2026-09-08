import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';

import { normalizeOfficeBaseUrl, OFFICE_PROTOCOL_VERSION } from './protocol.ts';

const ALIAS = /^[a-z][a-z0-9-]{1,63}$/;
const DEVICE_ID = /^[a-z0-9][a-z0-9_-]{2,63}$/i;

type NodeErrno = { code?: unknown };
type OfficeMapKind = 'workspace' | 'preset';

export type OfficeConfig = {
  version: 1;
  protocolVersion: typeof OFFICE_PROTOCOL_VERSION;
  baseUrl: string;
  deviceId: string;
  deviceTokenRef: string;
  maxConcurrency: number;
  heartbeatSeconds: number;
  workspaces: Readonly<Record<string, string>>;
  instructionPresets: Readonly<Record<string, string>>;
  createdAt: string;
  updatedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeMap(value: unknown, { kind }: { kind: OfficeMapKind }) {
  if (!isRecord(value)) return null;
  const output: Record<string, string> = {};
  for (const [rawId, rawValue] of Object.entries(value)) {
    const id = cleanString(rawId);
    const item = cleanString(rawValue);
    if (!id || !ALIAS.test(id) || !item) return null;
    if (kind === 'workspace' && !isAbsolute(item)) return null;
    if (kind === 'preset' && item.length > 8_000) return null;
    output[id] = item;
  }
  return Object.freeze(output);
}

export function normalizeOfficeConfig(value: unknown): OfficeConfig | null {
  if (!isRecord(value)) return null;
  let baseUrl: string;
  try {
    baseUrl = normalizeOfficeBaseUrl(value.baseUrl).origin;
  } catch {
    return null;
  }
  const deviceId = cleanString(value.deviceId);
  const deviceTokenRef = cleanString(value.deviceTokenRef);
  const workspaces = normalizeMap(value.workspaces ?? {}, { kind: 'workspace' });
  const instructionPresets = normalizeMap(value.instructionPresets ?? {}, { kind: 'preset' });
  const maxConcurrency = Number(value.maxConcurrency ?? 1);
  const heartbeatSeconds = Number(value.heartbeatSeconds ?? 30);
  if (!deviceId || !DEVICE_ID.test(deviceId) || !deviceTokenRef
    || !/^DSH_OFFICE_DEVICE_TOKEN_[A-F0-9]{24}$/.test(deviceTokenRef)
    || !workspaces || !instructionPresets
    || !Number.isInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 4
    || !Number.isInteger(heartbeatSeconds) || heartbeatSeconds < 10 || heartbeatSeconds > 300) {
    return null;
  }
  return Object.freeze({
    version: 1,
    protocolVersion: OFFICE_PROTOCOL_VERSION,
    baseUrl,
    deviceId,
    deviceTokenRef,
    maxConcurrency,
    heartbeatSeconds,
    workspaces,
    instructionPresets,
    createdAt: cleanString(value.createdAt) ?? new Date().toISOString(),
    updatedAt: cleanString(value.updatedAt) ?? new Date().toISOString(),
  });
}

export class OfficeConfigStore {
  #path: string;
  #value: OfficeConfig | null = null;
  #queue: Promise<void> = Promise.resolve();

  constructor(path: string) { this.#path = path; }

  async load() {
    try {
      const normalized = normalizeOfficeConfig(JSON.parse(await readFile(this.#path, 'utf8')));
      if (!normalized) throw new Error('dsh-im AI Office config is invalid');
      this.#value = normalized;
    } catch (error) {
      if ((error as NodeErrno)?.code !== 'ENOENT') throw error;
      this.#value = null;
    }
    return this;
  }

  get() { return this.#value ? structuredClone(this.#value) : null; }

  async save(value: unknown) {
    const normalized = normalizeOfficeConfig(value);
    if (!normalized) throw new Error('Refusing to persist invalid AI Office configuration');
    const operation = this.#queue.then(async () => {
      await mkdir(dirname(this.#path), { recursive: true, mode: 0o700 });
      const temporary = `${this.#path}.tmp`;
      await writeFile(temporary, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, this.#path);
      this.#value = normalized;
    });
    this.#queue = operation.then(() => undefined, () => undefined);
    await operation;
    return this.get();
  }

  async clear() {
    const operation = this.#queue.then(async () => {
      try { await unlink(this.#path); } catch (error) { if ((error as NodeErrno)?.code !== 'ENOENT') throw error; }
      this.#value = null;
    });
    this.#queue = operation.then(() => undefined, () => undefined);
    await operation;
  }
}
