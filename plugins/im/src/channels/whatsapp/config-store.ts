import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { t } from '../shared/i18n.ts';

type NodeErrno = { code?: unknown };

export const WHATSAPP_ACCESS_MODES = Object.freeze({
  selfOnly: 'self-only',
  privateAllowlist: 'private-allowlist',
  open: 'open',
});

export type WhatsappAccessMode = typeof WHATSAPP_ACCESS_MODES[keyof typeof WHATSAPP_ACCESS_MODES];

export type WhatsappAccessPolicy = {
  accessMode: WhatsappAccessMode;
  allowedNumbers: readonly string[];
};

export type WhatsappBot = {
  botId: string;
  accountJid: string;
  authDirectory: string;
  name: string;
  createdAt: string;
  connectedAt: string | null;
} & WhatsappAccessPolicy;

export type WhatsappDocument = {
  version: 2;
  bots: readonly WhatsappBot[];
};

const EMPTY_DOCUMENT = Object.freeze({
  version: 2,
  bots: Object.freeze([] as WhatsappBot[]),
}) as WhatsappDocument;
const BOT_ID_PATTERN = /^whatsapp_[a-f0-9]{24}$/;
const AUTH_DIRECTORY_PATTERN = /^[a-f0-9-]{36}$/;
const WHATSAPP_PHONE_NUMBER = /^[1-9]\d{4,14}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function normalizeWhatsappAccountJid(value: unknown) {
  const jid = cleanString(value)?.toLowerCase();
  return /^\d{5,32}@(s\.whatsapp\.net|lid)$/.test(jid ?? '') ? jid : null;
}

export function deriveWhatsappBotId(accountJid: unknown) {
  const normalized = normalizeWhatsappAccountJid(accountJid);
  if (!normalized) throw new TypeError('A valid WhatsApp account JID is required');
  return `whatsapp_${createHash('sha256').update(normalized).digest('hex').slice(0, 24)}`;
}

export function maskWhatsappAccount(accountJid: unknown) {
  const digits = normalizeWhatsappAccountJid(accountJid)?.split('@')[0] ?? '';
  if (!digits) return t('WhatsApp账号');
  if (digits.length <= 7) return `${digits.slice(0, 2)}•••${digits.slice(-2)}`;
  return `${digits.slice(0, 4)}••••${digits.slice(-4)}`;
}

export function normalizeWhatsappAllowedNumbers(value: unknown) {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) {
    throw new TypeError('allowedNumbers must be an array of WhatsApp phone numbers');
  }
  const normalized = value.map((entry) => {
    const number = typeof entry === 'string' ? entry.trim().replace(/^\+/, '') : '';
    if (!WHATSAPP_PHONE_NUMBER.test(number)) {
      throw new TypeError('allowedNumbers contains an invalid WhatsApp phone number');
    }
    return number;
  });
  return Object.freeze([...new Set(normalized)]);
}

export function normalizeWhatsappAccessPolicy(value: unknown = {}): WhatsappAccessPolicy {
  if (!isRecord(value)) {
    throw new TypeError('WhatsApp access policy must be an object');
  }
  const accessMode = value.accessMode ?? WHATSAPP_ACCESS_MODES.selfOnly;
  if (!Object.values(WHATSAPP_ACCESS_MODES).includes(accessMode as WhatsappAccessMode)) {
    throw new TypeError('WhatsApp accessMode is invalid');
  }
  return Object.freeze({
    accessMode: accessMode as WhatsappAccessMode,
    allowedNumbers: normalizeWhatsappAllowedNumbers(value.allowedNumbers),
  });
}

export class WhatsappConfigStore {
  #path: string;
  #value: WhatsappDocument = EMPTY_DOCUMENT;
  #writeQueue: Promise<void> = Promise.resolve();

  constructor(path: string) {
    this.#path = path;
  }

  async load() {
    try {
      const normalized = this.#normalizeDocument(JSON.parse(await readFile(this.#path, 'utf8')));
      if (!normalized) throw new Error('dsh-im WhatsApp config contains invalid account data');
      this.#value = normalized;
    } catch (error) {
      if ((error as NodeErrno)?.code !== 'ENOENT') throw error;
      this.#value = EMPTY_DOCUMENT;
    }
    return this;
  }

  list() {
    return structuredClone(this.#value.bots);
  }

  get(botId: unknown) {
    const bot = this.#value.bots.find((candidate) => candidate.botId === botId);
    return bot ? structuredClone(bot) : null;
  }

  getByAccountJid(accountJid: unknown) {
    const normalized = normalizeWhatsappAccountJid(accountJid);
    const bot = this.#value.bots.find((candidate) => candidate.accountJid === normalized);
    return bot ? structuredClone(bot) : null;
  }

  async save(value: unknown) {
    const normalized = this.#normalizeBot(value);
    if (!normalized) throw new Error('Refusing to persist incomplete WhatsApp account data');
    return this.#mutate((bots) => {
      const duplicate = bots.find((bot) => bot.accountJid === normalized.accountJid
        && bot.botId !== normalized.botId);
      const authCollision = bots.find((bot) => bot.authDirectory === normalized.authDirectory
        && bot.botId !== normalized.botId);
      if (duplicate || authCollision) throw new Error('Duplicate WhatsApp account identity');
      const index = bots.findIndex((bot) => bot.botId === normalized.botId);
      if (index === -1) bots.push(normalized);
      else bots[index] = normalized;
      return structuredClone(normalized);
    });
  }

  async remove(botId: unknown) {
    if (typeof botId !== 'string' || !BOT_ID_PATTERN.test(botId)) throw new TypeError('Invalid WhatsApp bot id');
    return this.#mutate((bots) => {
      const index = bots.findIndex((bot) => bot.botId === botId);
      if (index === -1) return null;
      const [removed] = bots.splice(index, 1);
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

  #normalizeBot(value: unknown): WhatsappBot | null {
    if (!isRecord(value)) return null;
    const accountJid = normalizeWhatsappAccountJid(value.accountJid);
    const botId = cleanString(value.botId);
    const authDirectory = cleanString(value.authDirectory);
    const name = cleanString(value.name);
    if (!accountJid || !botId || !authDirectory || !name
      || !BOT_ID_PATTERN.test(botId) || !AUTH_DIRECTORY_PATTERN.test(authDirectory)
      || deriveWhatsappBotId(accountJid) !== botId) return null;
    let accessPolicy: WhatsappAccessPolicy;
    try {
      accessPolicy = normalizeWhatsappAccessPolicy(value);
    } catch {
      return null;
    }
    return Object.freeze({
      botId,
      accountJid,
      authDirectory,
      name,
      createdAt: cleanString(value.createdAt) ?? new Date().toISOString(),
      connectedAt: cleanString(value.connectedAt),
      ...accessPolicy,
    });
  }

  #normalizeDocument(value: unknown): WhatsappDocument | null {
    if (!isRecord(value) || value.version !== 2 || !Array.isArray(value.bots)) return null;
    const bots = value.bots.map((bot) => this.#normalizeBot(bot));
    if (bots.some((bot) => bot === null)) return null;
    const validBots = bots as WhatsappBot[];
    const botIds = new Set<string>();
    const accountJids = new Set<string>();
    const authDirectories = new Set<string>();
    for (const bot of validBots) {
      if (botIds.has(bot.botId) || accountJids.has(bot.accountJid)
        || authDirectories.has(bot.authDirectory)) return null;
      botIds.add(bot.botId);
      accountJids.add(bot.accountJid);
      authDirectories.add(bot.authDirectory);
    }
    return Object.freeze({ version: 2 as const, bots: Object.freeze(validBots) });
  }

  async #mutate<T>(mutator: (bots: WhatsappBot[]) => T) {
    let result!: T;
    const operation = this.#writeQueue.then(async () => {
      const bots = [...this.#value.bots];
      result = mutator(bots);
      const document = Object.freeze({ version: 2 as const, bots: Object.freeze(bots) });
      await this.#write(document);
      this.#value = document;
    });
    this.#writeQueue = operation.then(() => undefined, () => undefined);
    await operation;
    return result;
  }

  async #write(document: WhatsappDocument) {
    await mkdir(dirname(this.#path), { recursive: true, mode: 0o700 });
    const temporary = `${this.#path}.tmp`;
    await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(temporary, this.#path);
  }
}
