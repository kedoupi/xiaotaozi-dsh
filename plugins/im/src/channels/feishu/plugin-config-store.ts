import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  normalizeFeishuGroupResponseMode,
  type FeishuGroupResponseMode,
} from './group-response-mode.ts';

export const LEGACY_FEISHU_SECRET_REF = 'DSH_FEISHU_APP_SECRET';

type NodeErrno = { code?: unknown };

export type FeishuPluginDomain = 'feishu' | 'lark';

export type FeishuPluginBot = {
  id: string;
  appId: string;
  secretRef: string;
  ownerOpenIds: readonly string[];
  domain: FeishuPluginDomain;
  botName: string | null;
  botOpenId: string | null;
  activated: unknown;
  groupResponseMode: FeishuGroupResponseMode;
  groupMessagePermissionGranted: boolean;
  deletionPending: boolean;
  connectedAt: string | null;
  createdAt: string | null;
};

export type FeishuPluginBotView = FeishuPluginBot & {
  ownerOpenId: string;
};

export type FeishuPluginDocument = {
  version: 2;
  bots: readonly FeishuPluginBot[];
};

const EMPTY_DOCUMENT = Object.freeze({
  version: 2,
  bots: Object.freeze([] as FeishuPluginBot[]),
}) as FeishuPluginDocument;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value !== 'undefined' && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function safeId(value: unknown) {
  const id = cleanString(value);
  return id && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : null;
}

function legacyBotId(appId: string) {
  return `bot_${createHash('sha256').update(appId).digest('hex').slice(0, 24)}`;
}

function normalizeOwners(value: Record<string, unknown>) {
  const candidates = Array.isArray(value.ownerOpenIds)
    ? value.ownerOpenIds
    : [value.ownerOpenId];
  return [...new Set(candidates.map(cleanString).filter((id): id is string => Boolean(id)))];
}

function normalizeBot(value: unknown, { legacy = false } = {}): FeishuPluginBot | null {
  if (!isRecord(value)) return null;
  const appId = cleanString(value.appId);
  const ownerOpenIds = normalizeOwners(value);
  if (!appId || ownerOpenIds.length === 0) return null;
  const id = safeId(value.id) ?? (legacy ? legacyBotId(appId) : null);
  const secretRef = cleanString(value.secretRef) ?? (legacy ? LEGACY_FEISHU_SECRET_REF : null);
  if (!id || !secretRef) return null;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(secretRef)) return null;
  const domain = value.domain === 'lark' ? 'lark' : 'feishu';
  return Object.freeze({
    id,
    appId,
    secretRef,
    ownerOpenIds: Object.freeze(ownerOpenIds),
    domain,
    botName: cleanString(value.botName),
    botOpenId: cleanString(value.botOpenId),
    activated: value.activated ?? null,
    groupResponseMode: normalizeFeishuGroupResponseMode(value.groupResponseMode),
    groupMessagePermissionGranted: value.groupMessagePermissionGranted === true,
    deletionPending: value.deletionPending === true,
    connectedAt: cleanString(value.connectedAt),
    createdAt: cleanString(value.createdAt) ?? cleanString(value.connectedAt),
  });
}

function normalizeDocument(value: unknown) {
  if (!isRecord(value)) return null;
  if (value.version === 2 && Array.isArray(value.bots)) {
    const bots = value.bots.map((bot) => normalizeBot(bot));
    if (bots.some((bot) => bot === null)) {
      throw new Error('dsh-feishu config contains an invalid bot entry');
    }
    const validBots = bots as FeishuPluginBot[];
    const ids = new Set<string>();
    const refs = new Set<string>();
    const appIds = new Set<string>();
    for (const bot of validBots) {
      if (ids.has(bot.id) || refs.has(bot.secretRef) || appIds.has(bot.appId)) {
        throw new Error('dsh-feishu config contains duplicate bot identities');
      }
      ids.add(bot.id);
      refs.add(bot.secretRef);
      appIds.add(bot.appId);
    }
    return { value: Object.freeze({ version: 2 as const, bots: Object.freeze(validBots) }), migrated: false };
  }

  // Version 1 was a single non-secret bot object. Preserve its existing
  // credential reference so an environment-backed secret remains usable.
  const legacyBot = normalizeBot(value, { legacy: true });
  if (!legacyBot) return null;
  return {
    value: Object.freeze({ version: 2 as const, bots: Object.freeze([legacyBot]) }),
    migrated: true,
  };
}

/** Stores only non-secret onboarding facts for all Feishu bots. */
export class PluginConfigStore {
  #path: string;
  #value: FeishuPluginDocument = EMPTY_DOCUMENT;
  #writeQueue: Promise<void> = Promise.resolve();

  constructor(path: string) {
    this.#path = path;
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.#path, 'utf8'));
      const normalized = normalizeDocument(parsed);
      if (!normalized) throw new Error('dsh-feishu config is incomplete or invalid');
      this.#value = normalized.value;
      if (normalized.migrated) await this.#writeDocument(this.#value);
    } catch (error) {
      if ((error as NodeErrno)?.code !== 'ENOENT') throw error;
      this.#value = EMPTY_DOCUMENT;
    }
    return this;
  }

  /** Backward-compatible single-bot view used by the original controller. */
  get(): FeishuPluginBotView | null {
    const bot = this.#value.bots[0];
    if (!bot) return null;
    const result = structuredClone(bot) as FeishuPluginBotView;
    result.ownerOpenId = result.ownerOpenIds[0];
    return result;
  }

  list() {
    return structuredClone(this.#value.bots);
  }

  getBot(id: unknown) {
    const bot = this.#value.bots.find((candidate) => candidate.id === id);
    return bot ? structuredClone(bot) : null;
  }

  /** Backward-compatible save replaces the original single-bot view. */
  async save(value: Record<string, unknown>) {
    const fallback = { ...value };
    if (!fallback.id) fallback.id = legacyBotId(cleanString(fallback.appId) ?? 'invalid');
    if (!fallback.secretRef) fallback.secretRef = LEGACY_FEISHU_SECRET_REF;
    const normalized = normalizeBot(fallback);
    if (!normalized) throw new Error('Refusing to persist incomplete dsh-feishu configuration');
    await this.#replaceBots([normalized]);
    return this.get();
  }

  async saveBot(value: unknown) {
    const normalized = normalizeBot(value);
    if (!normalized) throw new Error('Refusing to persist incomplete dsh-feishu bot configuration');
    return this.#mutate((bots) => {
      const collision = bots.find((bot) => bot.secretRef === normalized.secretRef && bot.id !== normalized.id);
      if (collision) throw new Error('Refusing to share a credential reference between Feishu bots');
      const appCollision = bots.find((bot) => bot.appId === normalized.appId && bot.id !== normalized.id);
      if (appCollision) throw new Error('Refusing to persist the same Feishu app twice');
      const index = bots.findIndex((bot) => bot.id === normalized.id);
      if (index === -1) bots.push(normalized);
      else bots[index] = normalized;
      return structuredClone(normalized);
    });
  }

  async removeBot(id: unknown) {
    if (!safeId(id)) throw new TypeError('Invalid Feishu bot id');
    return this.#mutate((bots) => {
      const index = bots.findIndex((bot) => bot.id === id);
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

  async #replaceBots(bots: readonly FeishuPluginBot[]) {
    const document = Object.freeze({ version: 2 as const, bots: Object.freeze([...bots]) });
    const operation = this.#writeQueue.then(async () => {
      await this.#writeDocument(document);
      this.#value = document;
    });
    this.#writeQueue = operation.then(() => undefined, () => undefined);
    await operation;
  }

  async #mutate<T>(mutator: (bots: FeishuPluginBot[]) => T) {
    let result: T;
    const operation = this.#writeQueue.then(async () => {
      const bots = [...this.#value.bots];
      result = mutator(bots);
      const document = Object.freeze({ version: 2 as const, bots: Object.freeze(bots) });
      await this.#writeDocument(document);
      this.#value = document;
    });
    this.#writeQueue = operation.then(() => undefined, () => undefined);
    await operation;
    return result!;
  }

  async #writeDocument(document: FeishuPluginDocument) {
    await mkdir(dirname(this.#path), { recursive: true, mode: 0o700 });
    const temporary = `${this.#path}.tmp`;
    await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, this.#path);
  }
}
