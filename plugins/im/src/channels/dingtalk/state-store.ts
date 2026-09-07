import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

type NodeErrno = { code?: unknown };

export type DingtalkPendingSender = {
  requestId: string;
  staffId: string;
  displayName: string;
  requestedAt: string;
  lastSeenAt: string;
};

export type DingtalkState = {
  version: 1;
  sessions: Record<string, string>;
  seenMessageIds: string[];
  pendingSenders: Record<string, DingtalkPendingSender>;
};

type DingtalkStateStoreOptions = {
  idFactory?: () => string;
  now?: () => string;
};

const EMPTY_STATE = Object.freeze({
  version: 1,
  sessions: {},
  seenMessageIds: [],
  pendingSenders: {},
}) as DingtalkState;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function displayName(value: unknown) {
  return (nonEmptyString(value) ?? '钉钉用户').slice(0, 100);
}

function normalizePendingSender(value: unknown, fallbackRequestId: unknown): DingtalkPendingSender | null {
  if (!isRecord(value)) return null;
  const requestId = nonEmptyString(value.requestId) ?? nonEmptyString(fallbackRequestId);
  const staffId = nonEmptyString(value.staffId);
  const requestedAt = nonEmptyString(value.requestedAt) ?? nonEmptyString(value.lastSeenAt);
  const lastSeenAt = nonEmptyString(value.lastSeenAt) ?? requestedAt;
  if (!requestId || !staffId || !requestedAt || !lastSeenAt) return null;
  return {
    requestId,
    staffId,
    displayName: displayName(value.displayName ?? value.nick),
    requestedAt,
    lastSeenAt,
  };
}

function normalizeState(value: unknown): DingtalkState {
  if (!isRecord(value)) return structuredClone(EMPTY_STATE);
  const sessions: Record<string, string> = {};
  if (isRecord(value.sessions)) {
    for (const [key, sessionId] of Object.entries(value.sessions)) {
      const normalizedKey = nonEmptyString(key);
      const normalizedSession = nonEmptyString(sessionId);
      if (normalizedKey && normalizedSession) sessions[normalizedKey] = normalizedSession;
    }
  }

  const pendingSenders: Record<string, DingtalkPendingSender> = {};
  const entries = Array.isArray(value.pendingSenders)
    ? value.pendingSenders.map((entry) => [isRecord(entry) ? entry.requestId : undefined, entry] as const)
    : Object.entries(isRecord(value.pendingSenders) ? value.pendingSenders : {});
  for (const [key, candidate] of entries) {
    const pending = normalizePendingSender(candidate, key);
    if (!pending) continue;
    const duplicate = Object.values(pendingSenders).find((entry) => entry.staffId === pending.staffId);
    if (!duplicate || duplicate.lastSeenAt < pending.lastSeenAt) {
      if (duplicate) delete pendingSenders[duplicate.requestId];
      pendingSenders[pending.requestId] = pending;
    }
  }

  return {
    version: 1,
    sessions,
    seenMessageIds: Array.isArray(value.seenMessageIds)
      ? [...new Set(value.seenMessageIds.map(nonEmptyString).filter((id): id is string => Boolean(id)))].slice(-1_000)
      : [],
    pendingSenders,
  };
}

export class DingtalkStateStore {
  #path: string;
  #state: DingtalkState = structuredClone(EMPTY_STATE);
  #writeQueue: Promise<void> = Promise.resolve();
  #idFactory: () => string;
  #now: () => string;

  constructor(path: string, { idFactory = randomUUID, now = () => new Date().toISOString() }: DingtalkStateStoreOptions = {}) {
    if (!nonEmptyString(path)) throw new TypeError('state path is required');
    if (typeof idFactory !== 'function' || typeof now !== 'function') {
      throw new TypeError('idFactory and now must be functions');
    }
    this.#path = path;
    this.#idFactory = idFactory;
    this.#now = now;
  }

  async load() {
    try {
      this.#state = normalizeState(JSON.parse(await readFile(this.#path, 'utf8')));
    } catch (error) {
      if ((error as NodeErrno)?.code !== 'ENOENT') throw error;
      this.#state = structuredClone(EMPTY_STATE);
      await this.#persist();
    }
    return this;
  }

  sessionFor(key: string) {
    return this.#state.sessions[key] ?? null;
  }

  async setSession(key: unknown, sessionId: unknown) {
    const normalizedKey = nonEmptyString(key);
    const normalizedSession = nonEmptyString(sessionId);
    if (!normalizedKey || !normalizedSession) throw new TypeError('key and sessionId are required');
    this.#state.sessions[normalizedKey] = normalizedSession;
    await this.#persist();
  }

  async clearSession(key: unknown) {
    const normalizedKey = nonEmptyString(key);
    if (!normalizedKey || !(normalizedKey in this.#state.sessions)) return;
    delete this.#state.sessions[normalizedKey];
    await this.#persist();
  }

  async clearSessions() {
    this.#state.sessions = {};
    await this.#persist();
  }

  hasSeen(messageId: unknown) {
    const id = nonEmptyString(messageId);
    return Boolean(id && this.#state.seenMessageIds.includes(id));
  }

  async markSeen(messageId: unknown) {
    const id = nonEmptyString(messageId);
    if (!id) throw new TypeError('messageId is required');
    if (this.hasSeen(id)) return;
    this.#state.seenMessageIds.push(id);
    if (this.#state.seenMessageIds.length > 1_000) {
      this.#state.seenMessageIds.splice(0, this.#state.seenMessageIds.length - 1_000);
    }
    await this.#persist();
  }

  pendingSenders() {
    return Object.values(this.#state.pendingSenders)
      .sort((left, right) => left.requestedAt.localeCompare(right.requestedAt))
      .map((entry) => structuredClone(entry));
  }

  pendingSender(requestId: unknown) {
    const id = nonEmptyString(requestId);
    const entry = id ? this.#state.pendingSenders[id] : null;
    return entry ? structuredClone(entry) : null;
  }

  async recordPendingSender(staffIdOrEntry: unknown, name?: unknown, seenAt?: unknown) {
    const input = isRecord(staffIdOrEntry)
      ? staffIdOrEntry
      : { staffId: staffIdOrEntry, displayName: name, lastSeenAt: seenAt };
    const staffId = nonEmptyString(input.staffId);
    if (!staffId) throw new TypeError('staffId is required');
    const timestamp = nonEmptyString(input.lastSeenAt) ?? nonEmptyString(input.requestedAt) ?? this.#now();
    const existing = Object.values(this.#state.pendingSenders)
      .find((entry) => entry.staffId === staffId);
    const entry: DingtalkPendingSender = {
      requestId: existing?.requestId ?? `ding_sender_${this.#idFactory()}`,
      staffId,
      displayName: displayName(input.displayName ?? input.nick ?? name),
      requestedAt: existing?.requestedAt ?? timestamp,
      lastSeenAt: timestamp,
    };
    this.#state.pendingSenders[entry.requestId] = entry;
    await this.#persist();
    return structuredClone(entry);
  }

  async removePendingSender(requestId: unknown) {
    const id = nonEmptyString(requestId);
    if (!id || !this.#state.pendingSenders[id]) return false;
    delete this.#state.pendingSenders[id];
    await this.#persist();
    return true;
  }

  async removePendingSenderByStaffId(staffId: unknown) {
    const id = nonEmptyString(staffId);
    const pending = id
      ? Object.values(this.#state.pendingSenders).find((entry) => entry.staffId === id)
      : null;
    return pending ? this.removePendingSender(pending.requestId) : false;
  }

  snapshot() {
    return structuredClone(this.#state);
  }

  async remove() {
    await this.#writeQueue;
    try {
      await unlink(this.#path);
    } catch (error) {
      if ((error as NodeErrno)?.code !== 'ENOENT') throw error;
    }
    this.#state = structuredClone(EMPTY_STATE);
  }

  async #persist() {
    const snapshot = `${JSON.stringify(this.#state, null, 2)}\n`;
    const operation = this.#writeQueue.then(async () => {
      await mkdir(dirname(this.#path), { recursive: true, mode: 0o700 });
      const temporary = `${this.#path}.tmp`;
      await writeFile(temporary, snapshot, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, this.#path);
    });
    this.#writeQueue = operation.then(() => undefined, () => undefined);
    await operation;
  }
}

export const DingTalkStateStore = DingtalkStateStore;
