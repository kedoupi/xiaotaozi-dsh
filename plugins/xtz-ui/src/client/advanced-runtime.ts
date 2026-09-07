import type { SettingsScope, SettingsScopeSnapshot } from './dsh-client-types.ts';

export type RuntimeNamespace = 'shell' | 'agent-loop' | 'web-search-deepseek';
export type RuntimeValues = Record<string, unknown>;
export type RuntimeWire<T> = { result: { ok: true; value: T } | { ok: false; error: { message: string } } };
export interface RuntimeCredentials {
  describe(payload: { refs: string[] }): Promise<RuntimeWire<{ credentials: Record<string, { configured?: boolean; writable?: boolean }> }>>;
  set(payload: { ref: string; value: string }): Promise<RuntimeWire<unknown>>;
}
export type RuntimeFormSnapshot = {
  fields: Record<string, { text: string; overridden: boolean; invalid: boolean }>;
  dirty: boolean; invalid: boolean; busy: boolean; available: boolean; writable: boolean;
  error: 'invalid' | 'saveFailed' | undefined; status: 'idle' | 'saving' | 'saved';
  credential: { configured: boolean; writable: boolean; loading: boolean; error: boolean };
};
export interface RuntimeForm {
  getSnapshot(): RuntimeFormSnapshot;
  subscribe(listener: () => void): () => void;
  edit(field: string, text: string): void;
  reset(field: string): void;
  discard(): void;
  save(): Promise<void>;
  refreshCredential(): Promise<void>;
  dispose(): void;
}
export type CreateRuntimeForm = (namespace: RuntimeNamespace,
  scope: SettingsScope<RuntimeValues>, credentials?: RuntimeCredentials) => RuntimeForm;

export const RUNTIME_FIELDS = {
  shell: { timeoutMs: 'number', maxOutputBytes: 'number' },
  'agent-loop': { maxParallelToolCalls: 'number' },
  'web-search-deepseek': { baseURL: 'text', maxUses: 'number' },
} as const;
type Draft = { text: string; clear: boolean };
type Write = { kind: 'unset' } | { kind: 'set'; value: string | number };
export function runtimeWrite(kind: 'number' | 'text', draft: Draft): Write | undefined {
  const text = draft.text.trim();
  if (draft.clear || text === '') return { kind: 'unset' };
  if (kind === 'text') return { kind: 'set', value: text };
  const value = Number(text);
  return Number.isFinite(value) ? { kind: 'set', value } : undefined;
}

function record(value: unknown): RuntimeValues {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as RuntimeValues : {};
}
function userRecord(scope: SettingsScope<RuntimeValues>): RuntimeValues {
  return record(scope.getSnapshot().user);
}
function accepted(user: RuntimeValues, field: string, write: Write): boolean {
  return write.kind === 'unset' ? !Object.hasOwn(user, field)
    : Object.hasOwn(user, field) && user[field] === write.value;
}
async function writeField(scope: SettingsScope<RuntimeValues>, field: string,
  write: Write, isDisposed: () => boolean): Promise<boolean> {
  if (isDisposed()) return false;
  if (write.kind === 'unset') await scope.unset(field);
  else await scope.set(field, write.value);
  if (isDisposed()) return false;
  return accepted(userRecord(scope), field, write);
}

type SaveCapture = {
  fields: { field: string; draft: Draft; write: Write; required: boolean }[];
  replacement: boolean;
  ref: string;
};

export const createRuntimeForm: CreateRuntimeForm = (namespace, scope, credentials) => {
  const definitions: Readonly<Record<string, 'number' | 'text'>> = RUNTIME_FIELDS[namespace];
  const search = namespace === 'web-search-deepseek';
  const drafts = new Map<string, Draft>();
  const listeners = new Set<() => void>();
  let replacement: string | undefined;
  let activeSave: SaveCapture | undefined;
  let disposed = false;
  let busy = false;
  let error: RuntimeFormSnapshot['error'];
  let status: RuntimeFormSnapshot['status'] = 'idle';
  let generation = 0;
  let metadataRef = '';
  let credential: RuntimeFormSnapshot['credential'] = {
    configured: false, writable: false, loading: search, error: false,
  };

  function credentialRef(): string {
    const ref = scope.getSnapshot().value?.apiKeyEnv;
    return typeof ref === 'string' && ref.trim() !== '' ? ref : 'DEEPSEEK_API_KEY';
  }
  function project(): RuntimeFormSnapshot {
    const host: SettingsScopeSnapshot<RuntimeValues> = scope.getSnapshot();
    const user = record(host.user);
    const fields: RuntimeFormSnapshot['fields'] = {};
    for (const [field, kind] of Object.entries(definitions)) {
      const draft = drafts.get(field);
      fields[field] = {
        text: draft?.clear ? String(record(host.base)[field] ?? '')
          : draft ? draft.text : String(host.value?.[field] ?? ''),
        overridden: Object.hasOwn(user, field),
        invalid: !!draft && runtimeWrite(kind, draft) === undefined,
      };
    }
    if (search) fields.apiKey = { text: replacement ?? '', overridden: false, invalid: false };
    const available = host.status === 'ready';
    return {
      fields, dirty: drafts.size > 0 || replacement !== undefined,
      invalid: Object.values(fields).some(field => field.invalid),
      busy, available, writable: available && host.writable === true,
      error, status, credential,
    };
  }
  let snapshot = project();
  function publish() {
    if (disposed) return;
    snapshot = project();
    for (const listener of [...listeners]) {
      if (disposed) break;
      if (listeners.has(listener)) listener();
    }
  }
  function assertField(field: string) {
    if (!Object.hasOwn(definitions, field) && !(search && field === 'apiKey')) {
      throw new Error('Unknown runtime field');
    }
  }
  function releaseCapture() {
    if (activeSave) activeSave.fields.length = 0;
    activeSave = undefined;
  }
  function metadataCurrent(id: number, ref: string) {
    return !disposed && generation === id && credentialRef() === ref;
  }
  async function refreshCredential() {
    if (disposed || !search) return;
    const ref = credentialRef();
    const id = ++generation;
    const configured = metadataRef === ref && credential.configured;
    metadataRef = ref;
    credential = { configured, writable: false, loading: true, error: false };
    publish();
    // A loading subscriber may have disposed us or started a newer read.
    if (!metadataCurrent(id, ref)) return;
    try {
      if (!credentials) throw new Error('Credentials unavailable');
      if (!metadataCurrent(id, ref)) return;
      const response = await credentials.describe({ refs: [ref] });
      if (!metadataCurrent(id, ref)) return;
      if (!response.result.ok) throw new Error('Metadata unavailable');
      const meta = response.result.value.credentials[ref];
      credential = { configured: meta?.configured === true, writable: meta?.writable === true, loading: false, error: false };
    } catch {
      if (!metadataCurrent(id, ref)) return;
      credential = { configured, writable: false, loading: false, error: true };
    }
    publish();
  }

  // Keep key text/payload out of the async save frame. Only the started transport
  // owns its payload; no key Draft is captured across ordinary field awaits.
  function startReplacement(ref: string): Promise<RuntimeWire<unknown>> | undefined {
    if (disposed || !credentials || credentialRef() !== ref || metadataRef !== ref
      || !credential.writable || credential.loading || credential.error || !replacement?.trim()) return;
    return credentials.set({ ref, value: replacement.trim() });
  }
  async function save() {
    if (disposed || busy || (!drafts.size && replacement === undefined)) return;
    const host = scope.getSnapshot();
    if (host.status !== 'ready' || !host.writable) return;
    activeSave = { fields: [], replacement: replacement !== undefined, ref: search ? credentialRef() : '' };
    for (const [field, draft] of drafts) {
      const write = runtimeWrite(definitions[field], draft);
      if (!write) {
        error = 'invalid'; status = 'idle'; releaseCapture(); publish(); return;
      }
      activeSave.fields.push({ field, draft, write, required: !accepted(record(host.user), field, write) });
    }
    busy = true; error = undefined; status = 'saving';
    let refresh = false;
    try {
      publish();
      if (disposed) return;
      let confirmed = true;
      for (const { field, write, required } of activeSave.fields) {
        if (disposed) return;
        if (!required) continue;
        const result = await writeField(scope, field, write, () => disposed);
        if (disposed) return;
        if (!result) confirmed = false;
      }
      if (activeSave.replacement) {
        const pending = startReplacement(activeSave.ref);
        if (!pending) confirmed = false;
        else {
          const response = await pending;
          if (disposed) return;
          if (!response.result.ok) confirmed = false;
        }
      }
      if (disposed) return;
      const final = scope.getSnapshot();
      // Final observed consistency includes filtered no-ops and earlier writes.
      // This is not rollback, CAS or protection from future Host changes.
      confirmed = confirmed && final.status === 'ready' && final.writable === true
        && (!search || credentialRef() === activeSave.ref)
        && activeSave.fields.every(({ field, write }) => accepted(record(final.user), field, write));
      if (confirmed) {
        for (const { field, draft } of activeSave.fields) {
          if (drafts.get(field) === draft) drafts.delete(field);
        }
        if (activeSave.replacement) replacement = undefined;
        refresh = activeSave.replacement;
        status = 'saved';
      } else {
        error = 'saveFailed'; status = 'idle';
      }
    } catch {
      if (!disposed) { error = 'saveFailed'; status = 'idle'; }
    } finally {
      releaseCapture();
      if (!disposed) { busy = false; publish(); }
    }
    // Failure here is metadata-only: never replay an accepted replacement.
    if (refresh && !disposed) await refreshCredential();
  }
  const unsubscribe = scope.subscribe(() => {
    if (disposed) return;
    if (search && credentialRef() !== metadataRef) void refreshCredential();
    else publish();
  });
  if (search) void refreshCredential();

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    edit(field, text) {
      if (disposed || busy) return;
      assertField(field);
      if (field === 'apiKey') replacement = text.trim() ? text : undefined;
      else drafts.set(field, { text, clear: false });
      error = undefined; status = 'idle'; publish();
    },
    reset(field) {
      if (disposed || busy) return;
      assertField(field);
      if (field === 'apiKey') return;
      drafts.set(field, { text: '', clear: true });
      error = undefined; status = 'idle'; publish();
    },
    discard() {
      if (disposed || busy) return;
      drafts.clear(); replacement = undefined;
      error = undefined; status = 'idle'; publish();
    },
    save, refreshCredential,
    dispose() {
      if (disposed) return;
      disposed = true; generation++;
      unsubscribe(); drafts.clear(); replacement = undefined; releaseCapture(); listeners.clear();
      busy = false;
      // Replace directly: publish deliberately ignores disposed forms. Historical
      // caller-held snapshots and already-started transports cannot be erased.
      snapshot = {
        fields: Object.fromEntries(Object.keys(snapshot.fields).map(field => [field, { text: '', overridden: false, invalid: false }])),
        dirty: false, invalid: false, busy: false, available: false, writable: false,
        error: undefined, status: 'idle',
        credential: { configured: false, writable: false, loading: false, error: false },
      };
    },
  };
};
