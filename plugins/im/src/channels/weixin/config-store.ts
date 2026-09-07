import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { normalizeWeixinApiBaseUrl } from './weixin-api.ts';

type NodeErrno = { code?: unknown };

export type WeixinAccount = {
  botId: string;
  accountId: string;
  tokenRef: string;
  ownerUserId: string;
  baseUrl: string;
  name?: string;
  createdAt: string;
  connectedAt: string | null;
};

export type WeixinDocument = {
  version: 1;
  accounts: readonly WeixinAccount[];
};

const EMPTY_DOCUMENT = Object.freeze({
  version: 1,
  accounts: Object.freeze([] as WeixinAccount[]),
}) as WeixinDocument;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function safeBotId(value: unknown) {
  const id = cleanString(value);
  return id && /^wx_[a-f0-9]{24}$/.test(id) ? id : null;
}

function safeTokenRef(value: unknown) {
  const ref = cleanString(value);
  return ref && /^DSH_WEIXIN_BOT_TOKEN_[A-F0-9]{24}$/.test(ref) ? ref : null;
}

export function deriveWeixinBotIdentity(accountId: unknown) {
  const raw = cleanString(accountId);
  if (!raw) throw new TypeError('accountId is required');
  const digest = createHash('sha256').update(raw).digest('hex').slice(0, 24);
  return {
    botId: `wx_${digest}`,
    tokenRef: `DSH_WEIXIN_BOT_TOKEN_${digest.toUpperCase()}`,
  };
}

export function maskWeixinAccountId(accountId: unknown) {
  const value = cleanString(accountId) ?? '';
  if (value.length <= 10) return value ? `${value.slice(0, 3)}•••` : '微信机器人';
  return `${value.slice(0, 6)}••••${value.slice(-4)}`;
}

function normalizeAccount(value: unknown): WeixinAccount | null {
  if (!isRecord(value)) return null;
  const accountId = cleanString(value.accountId);
  const ownerUserId = cleanString(value.ownerUserId);
  const botId = safeBotId(value.botId);
  const tokenRef = safeTokenRef(value.tokenRef);
  if (!accountId || !ownerUserId || !botId || !tokenRef) return null;
  const derived = deriveWeixinBotIdentity(accountId);
  if (derived.botId !== botId || derived.tokenRef !== tokenRef) return null;
  let baseUrl: string;
  try {
    baseUrl = String(normalizeWeixinApiBaseUrl(value.baseUrl));
  } catch {
    return null;
  }
  const name = cleanString(value.name);
  return Object.freeze({
    botId,
    accountId,
    tokenRef,
    ownerUserId,
    baseUrl,
    ...(name ? { name } : {}),
    createdAt: cleanString(value.createdAt) ?? new Date().toISOString(),
    connectedAt: cleanString(value.connectedAt),
  });
}

function normalizeDocument(value: unknown): WeixinDocument | null {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.accounts)) return null;
  const accounts = value.accounts.map(normalizeAccount);
  if (accounts.some((account) => account === null)) return null;
  const validAccounts = accounts as WeixinAccount[];
  const ids = new Set<string>();
  const accountIds = new Set<string>();
  const refs = new Set<string>();
  for (const account of validAccounts) {
    if (ids.has(account.botId) || accountIds.has(account.accountId) || refs.has(account.tokenRef)) {
      return null;
    }
    ids.add(account.botId);
    accountIds.add(account.accountId);
    refs.add(account.tokenRef);
  }
  return Object.freeze({ version: 1 as const, accounts: Object.freeze(validAccounts) });
}

export class WeixinConfigStore {
  #path: string;
  #value: WeixinDocument = EMPTY_DOCUMENT;
  #writeQueue: Promise<void> = Promise.resolve();

  constructor(path: string) {
    this.#path = path;
  }

  async load() {
    try {
      const normalized = normalizeDocument(JSON.parse(await readFile(this.#path, 'utf8')));
      if (!normalized) throw new Error('dsh-weixin config contains invalid account data');
      this.#value = normalized;
    } catch (error) {
      if ((error as NodeErrno)?.code !== 'ENOENT') throw error;
      this.#value = EMPTY_DOCUMENT;
    }
    return this;
  }

  list() {
    return structuredClone(this.#value.accounts);
  }

  get(botId: unknown) {
    const account = this.#value.accounts.find((candidate) => candidate.botId === botId);
    return account ? structuredClone(account) : null;
  }

  getByAccountId(accountId: unknown) {
    const account = this.#value.accounts.find((candidate) => candidate.accountId === accountId);
    return account ? structuredClone(account) : null;
  }

  async save(value: unknown) {
    const normalized = normalizeAccount(value);
    if (!normalized) throw new Error('Refusing to persist incomplete dsh-weixin account data');
    return this.#mutate((accounts) => {
      const accountCollision = accounts.find(
        (account) => account.accountId === normalized.accountId && account.botId !== normalized.botId,
      );
      const refCollision = accounts.find(
        (account) => account.tokenRef === normalized.tokenRef && account.botId !== normalized.botId,
      );
      if (accountCollision || refCollision) throw new Error('Duplicate Weixin account identity');
      const index = accounts.findIndex((account) => account.botId === normalized.botId);
      if (index === -1) accounts.push(normalized);
      else accounts[index] = normalized;
      return structuredClone(normalized);
    });
  }

  async remove(botId: unknown) {
    if (!safeBotId(botId)) throw new TypeError('Invalid Weixin bot id');
    return this.#mutate((accounts) => {
      const index = accounts.findIndex((account) => account.botId === botId);
      if (index === -1) return null;
      const [removed] = accounts.splice(index, 1);
      return structuredClone(removed);
    });
  }

  async clear() {
    const operation = this.#writeQueue.then(async () => {
      try {
        await unlink(this.#path);
      } catch (error) {
        if ((error as NodeErrno)?.code !== 'ENOENT') throw error;
      }
      this.#value = EMPTY_DOCUMENT;
    });
    this.#writeQueue = operation.then(() => undefined, () => undefined);
    await operation;
  }

  async #mutate<T>(mutator: (accounts: WeixinAccount[]) => T) {
    let result!: T;
    const operation = this.#writeQueue.then(async () => {
      const accounts = [...this.#value.accounts];
      result = mutator(accounts);
      const document = Object.freeze({ version: 1 as const, accounts: Object.freeze(accounts) });
      await this.#write(document);
      this.#value = document;
    });
    this.#writeQueue = operation.then(() => undefined, () => undefined);
    await operation;
    return result;
  }

  async #write(document: WeixinDocument) {
    await mkdir(dirname(this.#path), { recursive: true, mode: 0o700 });
    const temporary = `${this.#path}.tmp`;
    await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(temporary, this.#path);
  }
}
