import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

type NodeErrno = { code?: unknown };

export type FeishuWatchEntry = {
  sessionId: string;
  chatId: string;
};

export type FeishuState = {
  version: 1;
  sessions: Record<string, unknown>;
  seenMessageIds: unknown[];
  watches: Record<string, unknown>;
  includeArchivedSessions: boolean;
};

const EMPTY_STATE = Object.freeze({
  version: 1,
  sessions: {},
  seenMessageIds: [],
  watches: {},
  includeArchivedSessions: false,
}) as FeishuState;

/** One conversation key may watch at most this many sessions. */
export const MAX_WATCHES_PER_KEY = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

/** A persisted watch entry: the watched session plus its delivery target. */
function validWatchEntry(value: unknown): value is FeishuWatchEntry {
  return Boolean(
    value
    && typeof value === 'object'
    && typeof (value as FeishuWatchEntry).sessionId === 'string' && (value as FeishuWatchEntry).sessionId.length > 0
    && typeof (value as FeishuWatchEntry).chatId === 'string' && (value as FeishuWatchEntry).chatId.length > 0,
  );
}

export class StateStore {
  #path: string;
  #state: FeishuState = structuredClone(EMPTY_STATE);
  #writeQueue: Promise<void> = Promise.resolve();

  constructor(path: string) {
    this.#path = path;
  }

  async load() {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.#path, 'utf8'));
      const record = isRecord(parsed) ? parsed : {};
      this.#state = {
        version: 1,
        sessions: record.sessions && typeof record.sessions === 'object'
          ? record.sessions as Record<string, unknown>
          : {},
        seenMessageIds: Array.isArray(record.seenMessageIds) ? record.seenMessageIds.slice(-1000) : [],
        watches: record.watches && typeof record.watches === 'object'
          ? record.watches as Record<string, unknown>
          : {},
        includeArchivedSessions: typeof record.includeArchivedSessions === 'boolean'
          ? record.includeArchivedSessions
          : false,
      };
    } catch (error) {
      if ((error as NodeErrno)?.code !== 'ENOENT') throw error;
      await this.#persist();
    }
    return this;
  }

  sessionFor(key: string) {
    return this.#state.sessions[key] ?? null;
  }

  async setSession(key: string, sessionId: string) {
    this.#state.sessions[key] = sessionId;
    await this.#persist();
  }

  async clearSession(key: string) {
    delete this.#state.sessions[key];
    await this.#persist();
  }

  async clearSessions() {
    this.#state.sessions = {};
    await this.#persist();
  }

  hasSeen(messageId: unknown) {
    return this.#state.seenMessageIds.includes(messageId);
  }

  async markSeen(messageId: unknown) {
    if (this.hasSeen(messageId)) return;
    this.#state.seenMessageIds.push(messageId);
    if (this.#state.seenMessageIds.length > 1000) {
      this.#state.seenMessageIds.splice(0, this.#state.seenMessageIds.length - 1000);
    }
    await this.#persist();
  }

  snapshot() {
    return structuredClone(this.#state);
  }

  // ── Watches (persisted: surviving restarts) ─────────────────────────────

  watchEntries(key: string) {
    const list = this.#state.watches[key];
    return Array.isArray(list) ? list.filter(validWatchEntry) : [];
  }

  watchEntry(key: string, sessionId: string) {
    return this.watchEntries(key).find((entry) => entry.sessionId === sessionId) ?? null;
  }

  async setWatch(key: string, entry: FeishuWatchEntry) {
    const list = (this.#state.watches[key] ?? []) as FeishuWatchEntry[];
    const index = list.findIndex((existing) => existing.sessionId === entry.sessionId);
    if (index === -1) {
      if (list.length >= MAX_WATCHES_PER_KEY) list.shift();
      list.push(entry);
    } else {
      list[index] = entry;
    }
    this.#state.watches[key] = list;
    await this.#persist();
  }

  async removeWatch(key: string, sessionId: string) {
    const list = (this.#state.watches[key] ?? []) as FeishuWatchEntry[];
    this.#state.watches[key] = list.filter((entry) => entry.sessionId !== sessionId);
    await this.#persist();
  }

  async clearWatches(key: string) {
    delete this.#state.watches[key];
    await this.#persist();
  }

  /** Every conversation key currently watching the given session. */
  keysWatching(sessionId: string) {
    return Object.entries(this.#state.watches)
      .filter(([, list]) => Array.isArray(list) && list.some((entry) => validWatchEntry(entry) && entry.sessionId === sessionId))
      .map(([key]) => key);
  }

  /** Unique watched session ids across all keys (restart compensation). */
  watchedSessionIds() {
    const ids = new Set<string>();
    for (const list of Object.values(this.#state.watches)) {
      if (!Array.isArray(list)) continue;
      for (const entry of list) if (validWatchEntry(entry)) ids.add(entry.sessionId);
    }
    return [...ids];
  }

  // ── Session-list archived policy (per bot) ───────────────────

  includesArchivedSessions() {
    return this.#state.includeArchivedSessions === true;
  }

  async setIncludeArchivedSessions(include: unknown) {
    this.#state.includeArchivedSessions = include === true;
    await this.#persist();
  }

  async remove() {
    this.#writeQueue = this.#writeQueue.then(async () => {
      this.#state = structuredClone(EMPTY_STATE);
      try {
        await unlink(this.#path);
      } catch (error) {
        if ((error as NodeErrno)?.code !== 'ENOENT') throw error;
      }
    });
    await this.#writeQueue;
  }

  async #persist() {
    const snapshot = JSON.stringify(this.#state, null, 2) + '\n';
    this.#writeQueue = this.#writeQueue.then(async () => {
      await mkdir(dirname(this.#path), { recursive: true, mode: 0o700 });
      const temporary = `${this.#path}.tmp`;
      await writeFile(temporary, snapshot, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, this.#path);
    });
    await this.#writeQueue;
  }
}
