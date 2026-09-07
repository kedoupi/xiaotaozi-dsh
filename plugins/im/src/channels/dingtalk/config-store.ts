import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

type NodeErrno = { code?: unknown };

export type DingtalkApprovedSender = {
  senderKey: string;
  staffId: string;
  displayName: string | null;
  approvedAt: string | null;
};

export type DingtalkBot = {
  botId: string;
  clientId: string;
  secretRef: string;
  approvedSenders: readonly DingtalkApprovedSender[];
};

export type DingtalkDocument = {
  version: 1;
  bots: readonly DingtalkBot[];
};

const EMPTY_DOCUMENT: DingtalkDocument = Object.freeze({
  version: 1,
  bots: Object.freeze([] as DingtalkBot[]),
});
const STORED_BOT_KEYS = new Set(['clientId', 'secretRef', 'approvedSenders']);

function cleanString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function safeBotId(value: unknown) {
  const id = cleanString(value);
  return id && /^dt_[a-f0-9]{24}$/.test(id) ? id : null;
}

function safeSecretRef(value: unknown) {
  const ref = cleanString(value);
  return ref && /^DSH_DINGTALK_BOT_SECRET_[A-F0-9]{24}$/.test(ref) ? ref : null;
}

function safeSenderKey(value: unknown) {
  const key = cleanString(value);
  return key && /^dt_sender_[a-f0-9]{32}$/.test(key) ? key : null;
}

function normalizeApprovedSender(value: unknown): DingtalkApprovedSender | null {
  const record = typeof value === 'string' ? { staffId: value } : value;
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const rec = record as Record<string, unknown>;
  const senderKey = safeSenderKey(rec.senderKey);
  const staffId = cleanString(rec.staffId);
  if (!senderKey || !staffId) return null;
  return Object.freeze({
    senderKey,
    staffId,
    displayName: cleanString(rec.displayName),
    approvedAt: cleanString(rec.approvedAt),
  });
}

function normalizeApprovedSenders(value: unknown): readonly DingtalkApprovedSender[] | null {
  if (!Array.isArray(value)) return null;
  const senders = value.map(normalizeApprovedSender);
  if (senders.some((sender) => sender === null)) return null;
  const approved = senders as DingtalkApprovedSender[];
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const sender of approved) {
    if (ids.has(sender.staffId) || keys.has(sender.senderKey)) return null;
    ids.add(sender.staffId);
    keys.add(sender.senderKey);
  }
  return Object.freeze(approved);
}

/**
 * Derives stable non-secret identifiers for a DingTalk bot credential.
 * @param {string} clientId DingTalk application client ID.
 * @returns {{botId: string, secretRef: string}} Derived identifiers.
 */
export function deriveDingtalkBotIdentity(clientId: unknown) {
  const value = cleanString(clientId);
  if (!value) throw new TypeError('clientId is required');
  const valueDigest = digest(value).slice(0, 24);
  return Object.freeze({
    botId: `dt_${valueDigest}`,
    secretRef: `DSH_DINGTALK_BOT_SECRET_${valueDigest.toUpperCase()}`,
  });
}

/**
 * Creates a random browser-safe key for an approved DingTalk sender.
 * @returns {string} Opaque sender key.
 */
export function deriveDingtalkSenderKey() {
  return `dt_sender_${randomUUID().replaceAll('-', '')}`;
}

/**
 * Redacts a DingTalk sender ID for display.
 * @param {string} staffId DingTalk staff ID.
 * @returns {string} Partially redacted identifier.
 */
export function maskDingtalkSenderId(staffId: unknown) {
  const value = cleanString(staffId);
  if (!value) return '钉钉用户';
  return '身份已隐藏';
}

/**
 * Redacts a DingTalk client ID for display.
 * @param {string} clientId DingTalk application client ID.
 * @returns {string} Partially redacted client ID.
 */
export function maskDingtalkClientId(clientId: unknown) {
  const value = cleanString(clientId);
  if (!value) return '钉钉机器人';
  if (value.length <= 8) return `${value.slice(0, 2)}••••`;
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

function normalizeBot(value: unknown, { stored = false }: { stored?: boolean } = {}): DingtalkBot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  if ('clientSecret' in rec || 'client_secret' in rec || 'deviceCode' in rec) return null;
  if (stored && Object.keys(rec).some((key) => !STORED_BOT_KEYS.has(key))) return null;
  const clientId = cleanString(rec.clientId);
  const secretRef = safeSecretRef(rec.secretRef);
  const approvedSenders = normalizeApprovedSenders(rec.approvedSenders ?? []);
  if (!clientId || !secretRef || !approvedSenders) return null;
  const identity = deriveDingtalkBotIdentity(clientId);
  if (identity.secretRef !== secretRef) return null;
  const suppliedBotId = rec.botId === undefined ? identity.botId : safeBotId(rec.botId);
  if (suppliedBotId !== identity.botId) return null;
  return Object.freeze({
    botId: identity.botId,
    clientId,
    secretRef,
    approvedSenders,
  });
}

function normalizeDocument(value: unknown): DingtalkDocument | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || (value as { version?: unknown }).version !== 1
    || !Array.isArray((value as { bots?: unknown }).bots)) return null;
  const bots = (value as { bots: unknown[] }).bots.map((bot) => normalizeBot(bot, { stored: true }));
  if (bots.some((bot) => bot === null)) return null;
  const normalized = bots as DingtalkBot[];
  const botIds = new Set<string>();
  const clientIds = new Set<string>();
  const secretRefs = new Set<string>();
  for (const bot of normalized) {
    if (botIds.has(bot.botId) || clientIds.has(bot.clientId) || secretRefs.has(bot.secretRef)) {
      return null;
    }
    botIds.add(bot.botId);
    clientIds.add(bot.clientId);
    secretRefs.add(bot.secretRef);
  }
  return Object.freeze({ version: 1, bots: Object.freeze(normalized) });
}

function storedDocument(document: DingtalkDocument) {
  return {
    version: 1,
    bots: document.bots.map((bot) => ({
      clientId: bot.clientId,
      secretRef: bot.secretRef,
      approvedSenders: bot.approvedSenders.map((sender) => ({
        senderKey: sender.senderKey,
        staffId: sender.staffId,
        displayName: sender.displayName,
        approvedAt: sender.approvedAt,
      })),
    })),
  };
}

/** Atomic non-secret DingTalk bot configuration store. */
export class DingtalkConfigStore {
  #path: string;
  #value: DingtalkDocument = EMPTY_DOCUMENT;
  #writeQueue: Promise<void> = Promise.resolve();

  /** @param {string} path Absolute or process-relative configuration file path. */
  constructor(path: unknown) {
    if (!cleanString(path)) throw new TypeError('config path is required');
    this.#path = path as string;
  }

  /** @returns {Promise<DingtalkConfigStore>} Loaded store. */
  async load() {
    try {
      const normalized = normalizeDocument(JSON.parse(await readFile(this.#path, 'utf8')));
      if (!normalized) throw new Error('dsh-dingtalk config contains invalid bot data');
      this.#value = normalized;
    } catch (error) {
      if ((error as NodeErrno)?.code !== 'ENOENT') throw error;
      this.#value = EMPTY_DOCUMENT;
    }
    return this;
  }

  /** @returns {Array<object>} Cloned bot configurations with derived bot IDs. */
  list() {
    return structuredClone(this.#value.bots);
  }

  /** @param {string} botId Derived bot ID. @returns {object|null} Bot configuration. */
  get(botId: unknown) {
    const found = this.#value.bots.find((bot) => bot.botId === botId);
    return found ? structuredClone(found) : null;
  }

  /** @param {string} clientId DingTalk client ID. @returns {object|null} Bot configuration. */
  getByClientId(clientId: unknown) {
    const found = this.#value.bots.find((bot) => bot.clientId === clientId);
    return found ? structuredClone(found) : null;
  }

  /** @param {object} value Bot configuration without a client secret. @returns {Promise<object>} Saved config. */
  async save(value: unknown) {
    const normalized = normalizeBot(value);
    if (!normalized) throw new Error('Refusing to persist invalid dsh-dingtalk bot data');
    return this.#mutate((bots) => {
      const collision = bots.find(
        (bot) => (bot.clientId === normalized.clientId || bot.secretRef === normalized.secretRef)
          && bot.botId !== normalized.botId,
      );
      if (collision) throw new Error('Duplicate DingTalk bot identity');
      const index = bots.findIndex((bot) => bot.botId === normalized.botId);
      if (index === -1) bots.push(normalized);
      else bots[index] = normalized;
      return structuredClone(normalized);
    });
  }

  /** @param {string} botId Derived bot ID. @returns {Promise<object|null>} Removed config. */
  async remove(botId: unknown) {
    if (!safeBotId(botId)) throw new TypeError('Invalid DingTalk bot id');
    return this.#mutate((bots) => {
      const index = bots.findIndex((bot) => bot.botId === botId);
      if (index === -1) return null;
      const [removed] = bots.splice(index, 1);
      return structuredClone(removed);
    });
  }

  /** Removes the configuration file and resets the in-memory store. */
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

  async #mutate<T>(mutator: (bots: DingtalkBot[]) => T): Promise<T> {
    let result!: T;
    const operation = this.#writeQueue.then(async () => {
      const bots = [...this.#value.bots];
      result = mutator(bots);
      const document = Object.freeze({ version: 1, bots: Object.freeze(bots) });
      await this.#write(document);
      this.#value = document;
    });
    this.#writeQueue = operation.then(() => undefined, () => undefined);
    await operation;
    return result;
  }

  async #write(document: DingtalkDocument) {
    await mkdir(dirname(this.#path), { recursive: true, mode: 0o700 });
    const temporary = `${this.#path}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(storedDocument(document), null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
      await rename(temporary, this.#path);
    } catch (error) {
      try {
        await unlink(temporary);
      } catch (cleanupError) {
        if ((cleanupError as NodeErrno)?.code !== 'ENOENT') throw new AggregateError([error, cleanupError]);
      }
      throw error;
    }
  }
}

export { deriveDingtalkBotIdentity as deriveDingTalkBotIdentity };
export { deriveDingtalkSenderKey as deriveDingTalkSenderKey };
export { maskDingtalkClientId as maskDingTalkClientId };
export { maskDingtalkSenderId as maskDingTalkSenderId };
export { DingtalkConfigStore as DingTalkConfigStore };
