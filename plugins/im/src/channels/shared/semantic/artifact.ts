import { createHash, randomUUID } from 'node:crypto';
import { sessionEventLog } from '../../../session-log.ts';
import { constants as fsConstants } from 'node:fs';
import { copyFile, lstat, mkdtemp, open, realpath, unlink, type FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const OUTBOUND_ARTIFACT_TOOL = 'dsh_im_return_file';

type CodedError = {
  code?: unknown;
  name?: unknown;
};

type ArtifactCode = {
  startsWith?: (prefix: string) => boolean;
};

type SessionEventData = {
  turn?: unknown;
  source?: {
    rpcId?: unknown;
  };
};

type SessionEvent = {
  type?: unknown;
  data?: SessionEventData;
};

type SessionLike = {
  id?: unknown;
  header?: {
    id?: unknown;
    cwd?: unknown;
  };
  snapshotEvents?: () => unknown;
  events?: unknown;
};

type AgentLike = {
  session?: SessionLike | null;
};

type FileIdentity = {
  dev?: unknown;
  ino?: unknown;
  size?: unknown;
  mtimeNs?: unknown;
  ctimeNs?: unknown;
  isFile?: () => boolean;
};

type ArtifactReadStreamOptions = {
  autoClose?: boolean;
  start?: number;
  end?: number;
  highWaterMark?: number;
  signal?: AbortSignal;
};

type ArtifactFileHandle = {
  createReadStream?: (options?: ArtifactReadStreamOptions) => AsyncIterable<Buffer | Uint8Array | string>;
  read: (
    buffer: Buffer,
    offset?: number,
    length?: number,
    position?: number | null,
  ) => Promise<{ bytesRead?: number }>;
  close?: () => Promise<unknown>;
  stat?: (options?: { bigint?: boolean }) => Promise<FileIdentity>;
};

type AbortableSignal = {
  aborted?: unknown;
  reason?: unknown;
  throwIfAborted: () => void;
};

type ReadExactOptions = {
  signal?: AbortableSignal | null;
  errorCode?: string;
  errorMessage?: string;
};

type ArtifactOrigin = {
  sessionId: string;
  turn: number;
  callId: string | null;
};

type ArtifactRecord = {
  kind: string;
  schemaVersion: number;
  artifactId: string;
  deliveryKey: string;
  fileName: string;
  mediaType: string;
  size: number;
  digest: string;
  source: string;
  registeredBy: {
    kind: string;
    eventId: string;
    toolName: string;
  };
  origin: ArtifactOrigin;
  createdAt: number;
};

type PublicArtifact = {
  artifactId: string;
  fileName: string;
  size: number;
};

type ArtifactStorage = {
  path: string;
  materializing: number;
  materialized: boolean;
  releaseRequested: boolean;
  cleanupRequested: boolean;
  cleanupDeferred: boolean;
  onCleanup?: () => void;
};

type ArtifactConsumer = {
  sessionId: string;
  promptRpcId: string;
  turn: number | null;
  released: boolean;
};

type ClaimBinding = {
  turnKeys: Set<string>;
  onAbort: ((event?: Event) => void) | null;
};

type StageArgs = {
  path?: unknown;
};

type StageExec = {
  agent?: AgentLike;
  signal?: AbortSignal | null;
  callId?: unknown;
};

type ToolExec = StageExec & {
  name?: unknown;
  parent?: unknown;
  token?: unknown;
};

type ToolResult = {
  isError?: unknown;
};

type PendingParent = {
  artifacts: ArtifactRecord[];
};

type MaterializedFile = {
  artifactId: string;
  deliveryKey: string;
  fileName: string;
  mediaType: string;
  size: number;
  bytes: Buffer;
};

type PluginContext = {
  tools?: {
    register?: (definition: unknown) => unknown;
  };
  systemPrompt?: {
    section?: (section: unknown) => unknown;
  };
  on?: (event: string, listener: (...args: unknown[]) => unknown) => unknown;
};

type Thenable = {
  then?: unknown;
};

function codedError(error: unknown) {
  return error as CodedError | undefined;
}

function artifactCoded(error: unknown) {
  return codedError(error)?.code as ArtifactCode | undefined;
}

function asInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

const ARTIFACT_KIND = 'dsh-im-outbound-artifact';
const ARTIFACT_READ_CHUNK_BYTES = 64 * 1024;
const MIME_BY_EXTENSION = new Map([
  ['.csv', 'text/csv'],
  ['.doc', 'application/msword'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.json', 'application/json'],
  ['.md', 'text/markdown'],
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.rar', 'application/vnd.rar'],
  ['.txt', 'text/plain'],
  ['.webp', 'image/webp'],
  ['.xls', 'application/vnd.ms-excel'],
  ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['.xml', 'application/xml'],
  ['.zip', 'application/zip'],
]);

const artifactStorage = new WeakMap<object, ArtifactStorage>();
const materializedArtifactSources = new WeakMap<object, ArtifactRecord>();
const artifactProviderSettlements = new WeakMap<object, Set<Promise<unknown>>>();
let managedSnapshotDirectoryPromise: Promise<string> | undefined;

function managedSnapshotDirectory() {
  managedSnapshotDirectoryPromise ??= mkdtemp(join(tmpdir(), 'dsh-im-outbound-'));
  return managedSnapshotDirectoryPromise;
}

function artifactError(code: string, message: string) {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

function currentTurn(agent: AgentLike | null | undefined) {
  const events = sessionEventLog<SessionEvent>(agent?.session);
  if (events.length === 0 && agent?.session == null) return null;
  let turn: number | null = null;
  for (const event of events) {
    if (event?.type === 'turn/start') {
      turn = asInteger(event.data?.turn);
    } else if (event?.type === 'turn/end' && event.data?.turn === turn) {
      turn = null;
    }
  }
  return turn !== null && turn >= 0 ? turn : null;
}

function sessionIdOf(session: SessionLike | null | undefined) {
  const sessionId = session?.id ?? session?.header?.id;
  return typeof sessionId === 'string' && sessionId ? sessionId : null;
}

function turnKey(sessionId: unknown, turn: unknown) {
  return `${sessionId}\u0000${turn}`;
}

function promptKey(sessionId: unknown, promptRpcId: unknown) {
  return `${sessionId}\u0000${promptRpcId}`;
}

function safeFileName(value: unknown) {
  const cleaned = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\p{Cf}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'result.bin';
  return [...cleaned].slice(0, 255).join('');
}

function mediaTypeFor(name: string) {
  return MIME_BY_EXTENSION.get(extname(name).toLowerCase()) ?? 'application/octet-stream';
}

function sha256(bytes: Buffer | Uint8Array | string) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sameIdentity(left: FileIdentity | null | undefined, right: FileIdentity | null | undefined) {
  return typeof left?.dev === 'bigint'
    && typeof left?.ino === 'bigint'
    && typeof left?.size === 'bigint'
    && typeof left?.mtimeNs === 'bigint'
    && typeof left?.ctimeNs === 'bigint'
    && left.dev === right?.dev
    && left.ino === right?.ino
    && left.size === right?.size
    && left.mtimeNs === right?.mtimeNs
    && left.ctimeNs === right?.ctimeNs;
}

async function hashFile(path: string, signal?: AbortSignal | null) {
  let handle: FileHandle | undefined;
  try {
    handle = await open(path, fsConstants.O_RDONLY);
    const hash = createHash('sha256');
    const stream = handle.createReadStream({
      autoClose: false,
      highWaterMark: ARTIFACT_READ_CHUNK_BYTES,
      ...(signal ? { signal } : {}),
    });
    for await (const chunk of stream) {
      signal?.throwIfAborted();
      hash.update(chunk);
    }
    return hash.digest('hex');
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

/** Read exactly the observed file size and prove EOF. No project-level size or time limit applies. */
export async function readExactArtifactFile(handle: ArtifactFileHandle, expectedSize: number, {
  signal,
  errorCode = 'artifact-changed',
  errorMessage = 'The result file changed while it was being read.',
}: ReadExactOptions = {}) {
  const changed = () => artifactError(errorCode, errorMessage);
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 0) throw changed();
  signal?.throwIfAborted();

  let bytes: Buffer;
  try {
    bytes = Buffer.allocUnsafe(expectedSize);
  } catch {
    throw changed();
  }

  if (typeof handle?.createReadStream === 'function') {
    const stream = handle.createReadStream({
      autoClose: false,
      start: 0,
      // Node's end offset is inclusive, so this reads one byte beyond the
      // observed size when the file grows and catches the change.
      end: expectedSize,
      highWaterMark: ARTIFACT_READ_CHUNK_BYTES,
      ...(signal ? { signal: signal as AbortSignal } : {}),
    });
    let offset = 0;
    for await (const chunk of stream) {
      signal?.throwIfAborted();
      const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (offset + part.length > expectedSize) throw changed();
      part.copy(bytes, offset);
      offset += part.length;
    }
    if (offset !== expectedSize) throw changed();
    return bytes;
  }

  let offset = 0;
  while (offset < expectedSize) {
    signal?.throwIfAborted();
    const length = Math.min(ARTIFACT_READ_CHUNK_BYTES, expectedSize - offset);
    const result = await handle.read(bytes, offset, length, offset);
    const bytesRead = Number(result?.bytesRead ?? 0);
    if (!Number.isInteger(bytesRead) || bytesRead <= 0 || bytesRead > length) throw changed();
    offset += bytesRead;
  }
  signal?.throwIfAborted();
  const probe = Buffer.allocUnsafe(1);
  if ((await handle.read(probe, 0, 1, expectedSize))?.bytesRead !== 0) throw changed();
  return bytes;
}

async function snapshotFile(workspace: string, requestedPath: string, signal?: AbortSignal | null) {
  signal?.throwIfAborted();
  let storagePath: string | undefined;
  try {
    const candidate = isAbsolute(requestedPath)
      ? requestedPath
      : resolve(workspace, requestedPath);
    const canonicalWorkspace = await realpath(workspace);
    const canonicalPath = await realpath(candidate);
    const fromWorkspace = relative(canonicalWorkspace, canonicalPath);
    if (fromWorkspace === '..' || fromWorkspace.startsWith(`..${sep}`) || isAbsolute(fromWorkspace)) {
      throw artifactError('artifact-outside-workspace', 'The requested file is outside the Session workspace.');
    }
    const source = await lstat(canonicalPath, { bigint: true });
    if (!source.isFile()) {
      throw artifactError('artifact-not-file', 'The requested path is not a file.');
    }

    const directory = await managedSnapshotDirectory();
    storagePath = join(directory, `${randomUUID()}.artifact`);
    await copyFile(canonicalPath, storagePath, fsConstants.COPYFILE_EXCL);
    signal?.throwIfAborted();

    const snapshot = await lstat(storagePath, { bigint: true });
    const size = Number(snapshot.size);
    if (!snapshot.isFile() || !Number.isSafeInteger(size) || size < 0) {
      throw artifactError('artifact-unavailable', 'The file could not be prepared for delivery.');
    }
    const fileName = safeFileName(basename(candidate));
    return Object.freeze({
      fileName,
      mediaType: mediaTypeFor(fileName),
      size,
      digest: await hashFile(storagePath, signal),
      storagePath,
    });
  } catch (error) {
    if (storagePath) await unlink(storagePath).catch(() => undefined);
    if (artifactCoded(error)?.startsWith?.('artifact-')) throw error;
    if (signal?.aborted) throw signal.reason ?? error;
    throw artifactError('artifact-unavailable', 'The requested file is unavailable.');
  }
}

function publicArtifact(artifact: ArtifactRecord) {
  return Object.freeze({
    artifactId: artifact.artifactId,
    fileName: artifact.fileName,
    size: artifact.size,
  });
}

function artifactKey(artifact: ArtifactRecord) {
  return artifact.artifactId;
}

function cleanupArtifactStorage(artifact: object) {
  const storage = artifactStorage.get(artifact);
  if (!storage) return;
  storage.releaseRequested = true;
  if (storage.materializing > 0) {
    storage.cleanupRequested = true;
    return;
  }
  const pending = [...artifactProviderSettlements.get(artifact) ?? []];
  if (pending.length > 0) {
    if (!storage.cleanupDeferred) {
      storage.cleanupDeferred = true;
      void Promise.allSettled(pending).finally(() => {
        storage.cleanupDeferred = false;
        cleanupArtifactStorage(artifact);
      });
    }
    return;
  }
  artifactStorage.delete(artifact);
  artifactProviderSettlements.delete(artifact);
  storage.onCleanup?.();
  void unlink(storage.path).catch(() => undefined);
}

/**
 * Holds successful tool results until the channel that owns the Session Turn
 * collects them. It does not decide which files a user may send.
 */
export class OutboundArtifactRegistry {
  #turns = new Map<string, Map<string, ArtifactRecord>>();
  #stagedTurns = new Map<string, Map<string, ArtifactRecord>>();
  #claimedTurns = new Map<string, Map<string, ArtifactRecord>>();
  #claimSignals = new Map<string, AbortSignal>();
  #signalClaims = new Map<AbortSignal, ClaimBinding>();
  #consumersByPrompt = new Map<string, ArtifactConsumer>();
  #consumersByTurn = new Map<string, ArtifactConsumer>();
  #openTurns = new Map<string, number>();
  #uuid: () => string;

  constructor({ uuid = randomUUID }: { uuid?: () => string } = {}) {
    if (typeof uuid !== 'function') throw new TypeError('uuid must be a function');
    this.#uuid = uuid;
  }

  /**
   * Bind one channel request to the Turn it starts. This owns cleanup only:
   * it never changes tool visibility or decides whether a file may be sent.
   */
  openConsumer(sessionId: unknown, promptRpcId: unknown) {
    if (typeof sessionId !== 'string' || !sessionId
      || typeof promptRpcId !== 'string' || !promptRpcId) {
      throw new TypeError('sessionId and promptRpcId are required');
    }
    const key = promptKey(sessionId, promptRpcId);
    const consumer = {
      sessionId,
      promptRpcId,
      turn: null,
      released: false,
    };
    this.#consumersByPrompt.set(key, consumer);
    return () => {
      if (consumer.released) return;
      consumer.released = true;
      if (this.#consumersByPrompt.get(key) === consumer) {
        this.#consumersByPrompt.delete(key);
      }
      if (consumer.turn !== null) {
        const keyForTurn = turnKey(sessionId, consumer.turn);
        if (this.#consumersByTurn.get(keyForTurn) === consumer) {
          this.#consumersByTurn.delete(keyForTurn);
        }
        // Claimed artifacts have already crossed into the provider pipeline and
        // are released there. discard() only removes unclaimed work.
        this.discard(sessionId, consumer.turn);
      }
    };
  }

  /** Observe durable Session events solely to terminate unclaimed snapshots. */
  observeSessionEvent(session: SessionLike | null | undefined, event: unknown) {
    const sessionId = sessionIdOf(session);
    if (!sessionId || !event || typeof event !== 'object') return;
    const record = event as SessionEvent;
    if (record.type === 'turn/start') {
      const turn = asInteger(record.data?.turn);
      if (turn !== null && turn >= 0) this.#openTurns.set(sessionId, turn);
      return;
    }
    if (record.type === 'user/message') {
      const rpcId = record.data?.source?.rpcId;
      const turn = this.#openTurns.get(sessionId) ?? currentTurn({ session });
      if (typeof rpcId !== 'string' || !rpcId || turn === null || !Number.isInteger(turn)) return;
      this.#openTurns.set(sessionId, turn);
      const consumer = this.#consumersByPrompt.get(promptKey(sessionId, rpcId));
      if (!consumer || consumer.released) return;
      consumer.turn = turn;
      this.#consumersByTurn.set(turnKey(sessionId, turn), consumer);
      return;
    }
    if (record.type !== 'turn/end') return;
    const turn = asInteger(record.data?.turn);
    if (turn === null || turn < 0) return;
    if (this.#openTurns.get(sessionId) === turn) this.#openTurns.delete(sessionId);
    const consumer = this.#consumersByTurn.get(turnKey(sessionId, turn));
    if (!consumer || consumer.released) this.discard(sessionId, turn);
  }

  /** A disposed Session cannot have another channel consumer claim its files. */
  disposeSession(session: SessionLike | null | undefined) {
    const sessionId = sessionIdOf(session);
    if (!sessionId) return;
    const prefix = `${sessionId}\u0000`;
    const artifacts = new Set<ArtifactRecord>();
    for (const entries of [this.#turns, this.#stagedTurns]) {
      for (const [key, turnArtifacts] of entries) {
        if (!key.startsWith(prefix)) continue;
        for (const artifact of turnArtifacts.values()) artifacts.add(artifact);
        entries.delete(key);
      }
    }
    for (const [key, consumer] of this.#consumersByPrompt) {
      if (!key.startsWith(prefix)) continue;
      consumer.released = true;
      this.#consumersByPrompt.delete(key);
    }
    for (const key of this.#consumersByTurn.keys()) {
      if (key.startsWith(prefix)) this.#consumersByTurn.delete(key);
    }
    this.#openTurns.delete(sessionId);
    for (const artifact of artifacts) cleanupArtifactStorage(artifact);
  }

  async stage(args: StageArgs | null | undefined, exec: StageExec | null | undefined) {
    const requestedPath = args?.path;
    if (typeof requestedPath !== 'string' || !requestedPath.trim()) {
      throw new TypeError('A file path is required.');
    }
    const agent = exec?.agent;
    const sessionId = agent?.session?.header?.id;
    const workspace = agent?.session?.header?.cwd;
    const turn = currentTurn(agent);
    if (typeof sessionId !== 'string' || !sessionId
      || typeof workspace !== 'string' || !workspace || turn === null) {
      throw artifactError(
        'artifact-context-required',
        'A live Harness Session is required to return a file.',
      );
    }

    const snapshot = await snapshotFile(workspace, requestedPath, exec?.signal);
    const { storagePath, ...snapshotMetadata } = snapshot;
    const artifact = Object.freeze({
      kind: ARTIFACT_KIND,
      schemaVersion: 1,
      artifactId: this.#uuid(),
      deliveryKey: this.#uuid(),
      ...snapshotMetadata,
      source: 'managed-temp',
      registeredBy: Object.freeze({
        kind: 'tool-result',
        eventId: typeof exec?.callId === 'string' ? exec.callId : 'unknown',
        toolName: OUTBOUND_ARTIFACT_TOOL,
      }),
      origin: Object.freeze({
        sessionId,
        turn,
        callId: typeof exec?.callId === 'string' ? exec.callId : null,
      }),
      createdAt: Date.now(),
    });
    artifactStorage.set(artifact, {
      path: storagePath,
      materializing: 0,
      materialized: false,
      releaseRequested: false,
      cleanupRequested: false,
      cleanupDeferred: false,
      onCleanup: () => this.#forgetArtifact(artifact),
    });
    const keyForTurn = turnKey(sessionId, turn);
    let staged = this.#stagedTurns.get(keyForTurn);
    if (!staged) {
      staged = new Map();
      this.#stagedTurns.set(keyForTurn, staged);
    }
    staged.set(artifactKey(artifact), artifact);
    return artifact;
  }

  commit(artifact: ArtifactRecord | null | undefined) {
    if (artifact?.kind !== ARTIFACT_KIND || !artifactStorage.has(artifact)) return null;
    const keyForTurn = turnKey(artifact.origin.sessionId, artifact.origin.turn);
    const key = artifactKey(artifact);
    const staged = this.#stagedTurns.get(keyForTurn);
    if (staged?.get(key) !== artifact) return null;
    staged.delete(key);
    if (staged.size === 0) this.#stagedTurns.delete(keyForTurn);
    let committed = this.#turns.get(keyForTurn);
    if (!committed) {
      committed = new Map();
      this.#turns.set(keyForTurn, committed);
    }
    committed.set(key, artifact);
    return publicArtifact(artifact);
  }

  release(artifact: ArtifactRecord | null | undefined) {
    if (artifact?.kind !== ARTIFACT_KIND) return;
    const keyForTurn = turnKey(artifact.origin.sessionId, artifact.origin.turn);
    const key = artifactKey(artifact);
    const staged = this.#stagedTurns.get(keyForTurn);
    if (staged?.get(key) === artifact) staged.delete(key);
    if (staged?.size === 0) this.#stagedTurns.delete(keyForTurn);
    cleanupArtifactStorage(artifact);
  }

  take(sessionId: unknown, turn: unknown, { signal }: { signal?: AbortSignal | null } = {}) {
    const keyForTurn = turnKey(sessionId, turn);
    const committed = this.#turns.get(keyForTurn);
    this.#turns.delete(keyForTurn);
    if (!committed) return [];
    if (signal?.aborted) {
      for (const artifact of committed.values()) cleanupArtifactStorage(artifact);
      return [];
    }
    const claimed = this.#claimedTurns.get(keyForTurn) ?? new Map();
    this.#claimedTurns.set(keyForTurn, claimed);
    const artifacts: ArtifactRecord[] = [];
    for (const [key, artifact] of committed) {
      if (!artifactStorage.has(artifact)) continue;
      claimed.set(key, artifact);
      artifacts.push(artifact);
    }
    if (claimed.size === 0) this.#claimedTurns.delete(keyForTurn);
    else if (!this.#bindClaimSignal(keyForTurn, signal)) return [];
    return artifacts;
  }

  discard(sessionId: unknown, turn: unknown) {
    if (typeof sessionId !== 'string' || !Number.isInteger(turn)) return;
    const keyForTurn = turnKey(sessionId, turn);
    const artifacts = new Set([
      ...this.#turns.get(keyForTurn)?.values() ?? [],
      ...this.#stagedTurns.get(keyForTurn)?.values() ?? [],
    ]);
    this.#turns.delete(keyForTurn);
    this.#stagedTurns.delete(keyForTurn);
    for (const artifact of artifacts) cleanupArtifactStorage(artifact);
  }

  clear() {
    const artifacts = new Set<ArtifactRecord>();
    for (const entries of this.#turns.values()) {
      for (const artifact of entries.values()) artifacts.add(artifact);
    }
    for (const entries of this.#stagedTurns.values()) {
      for (const artifact of entries.values()) artifacts.add(artifact);
    }
    for (const entries of this.#claimedTurns.values()) {
      for (const artifact of entries.values()) artifacts.add(artifact);
    }
    for (const artifact of artifacts) cleanupArtifactStorage(artifact);
    this.#turns.clear();
    this.#stagedTurns.clear();
    this.#claimedTurns.clear();
    for (const turnKey of this.#claimSignals.keys()) this.#releaseClaimSignal(turnKey);
    for (const consumer of this.#consumersByPrompt.values()) consumer.released = true;
    this.#consumersByPrompt.clear();
    this.#consumersByTurn.clear();
    this.#openTurns.clear();
  }

  #bindClaimSignal(turnKey: string, signal?: AbortSignal | null) {
    if (!signal) return true;
    this.#releaseClaimSignal(turnKey);
    let claim = this.#signalClaims.get(signal);
    if (!claim) {
      const binding: ClaimBinding = { turnKeys: new Set(), onAbort: null };
      binding.onAbort = () => {
        for (const claimedTurnKey of [...binding.turnKeys]) {
          for (const artifact of this.#claimedTurns.get(claimedTurnKey)?.values() ?? []) {
            cleanupArtifactStorage(artifact);
          }
        }
      };
      claim = binding;
      this.#signalClaims.set(signal, claim);
      signal.addEventListener('abort', claim.onAbort!, { once: true });
    }
    claim.turnKeys.add(turnKey);
    this.#claimSignals.set(turnKey, signal);
    if (signal.aborted) {
      claim.onAbort!();
      return false;
    }
    return true;
  }

  #releaseClaimSignal(turnKey: string) {
    const signal = this.#claimSignals.get(turnKey);
    if (!signal) return;
    this.#claimSignals.delete(turnKey);
    const claim = this.#signalClaims.get(signal);
    claim?.turnKeys.delete(turnKey);
    if (claim?.turnKeys.size === 0) {
      signal.removeEventListener('abort', claim.onAbort!);
      this.#signalClaims.delete(signal);
    }
  }

  #forgetArtifact(artifact: ArtifactRecord) {
    const keyForTurn = turnKey(artifact.origin.sessionId, artifact.origin.turn);
    const key = artifactKey(artifact);
    const committed = this.#turns.get(keyForTurn);
    if (committed?.get(key) === artifact) committed.delete(key);
    if (committed?.size === 0) this.#turns.delete(keyForTurn);
    const staged = this.#stagedTurns.get(keyForTurn);
    if (staged?.get(key) === artifact) staged.delete(key);
    if (staged?.size === 0) this.#stagedTurns.delete(keyForTurn);
    const claimed = this.#claimedTurns.get(keyForTurn);
    if (claimed?.get(key) === artifact) claimed.delete(key);
    if (claimed?.size === 0) {
      this.#claimedTurns.delete(keyForTurn);
      this.#releaseClaimSignal(keyForTurn);
    }
  }

}

export const outboundArtifactRegistry = new OutboundArtifactRegistry();

/**
 * Build a two-phase tool: execute stages a file; the authoritative tools/result
 * observer commits only a successful native call or successful Code Mode parent.
 */
export function createOutboundArtifactTool({
  registry = outboundArtifactRegistry,
}: { registry?: OutboundArtifactRegistry } = {}) {
  const staged = new WeakMap<object, ArtifactRecord>();
  const pendingByParent = new Map<unknown, PendingParent>();
  const appendPending = (parent: unknown, artifact: ArtifactRecord) => {
    let pending = pendingByParent.get(parent);
    if (!pending) {
      pending = { artifacts: [] };
      pendingByParent.set(parent, pending);
    }
    pending.artifacts.push(artifact);
  };
  const definition = Object.freeze({
    name: OUTBOUND_ARTIFACT_TOOL,
    description: 'Send a readable file or generated image to the user through the current conversation. Existing and newly created files are both valid.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: {
          type: 'string',
          description: 'Path inside the current workspace; an absolute in-workspace path is also accepted.',
        },
      },
      required: ['path'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          artifactId: { type: 'string' },
          fileName: { type: 'string' },
          size: { type: 'number' },
        },
        required: ['artifactId', 'fileName', 'size'],
      },
      render: (_args: unknown, value: PublicArtifact) => [{
        type: 'text',
        text: `Registered ${value.fileName} (${value.size} bytes) for IM delivery.`,
      }],
    },
    async execute(args: StageArgs, exec: ToolExec) {
      const artifact = await registry.stage(args, exec);
      staged.set(exec, artifact);
      return publicArtifact(artifact);
    },
  });

  const onResult = (exec: ToolExec, result: ToolResult | null | undefined) => {
    if (exec?.name === OUTBOUND_ARTIFACT_TOOL) {
      const artifact = staged.get(exec);
      if (!artifact) return;
      staged.delete(exec);
      if (result?.isError) {
        registry.release(artifact);
        return;
      }
      if (exec.parent === undefined) registry.commit(artifact);
      else appendPending(exec.parent, artifact);
      return;
    }
    const pending = pendingByParent.get(exec?.token);
    if (!pending) return;
    pendingByParent.delete(exec.token);
    if (result?.isError) {
      for (const artifact of pending.artifacts) registry.release(artifact);
      return;
    }
    if (exec.parent !== undefined) {
      for (const artifact of pending.artifacts) appendPending(exec.parent, artifact);
      return;
    }
    for (const artifact of pending.artifacts) registry.commit(artifact);
  };

  return Object.freeze({ definition, onResult });
}

/** Register the file-return tool without a per-request Gate. */
export function installOutboundArtifactTool(
  ctx: unknown,
  { registry = outboundArtifactRegistry }: { registry?: OutboundArtifactRegistry } = {},
) {
  const host = ctx as PluginContext | null | undefined;
  if (typeof host?.tools?.register !== 'function'
    || typeof host?.systemPrompt?.section !== 'function'
    || typeof host?.on !== 'function') return false;
  const tool = createOutboundArtifactTool({ registry });
  host.tools.register!(tool.definition);
  host.on!('tools/result', (exec, result) => tool.onResult(exec as ToolExec, result as ToolResult));
  host.on!('session/event', (session, event) => (
    registry.observeSessionEvent(session as SessionLike, event)
  ));
  host.on!('session/disposed', (session) => registry.disposeSession(session as SessionLike));
  host.systemPrompt.section!({
    name: 'dsh-im:return-file',
    order: 115,
    text: `When the user asks to receive a file or generated image, call ${OUTBOUND_ARTIFACT_TOOL} with its path. Existing files can be sent directly; do not recreate or rename a file solely for delivery.`,
  });
  return true;
}

/** Materialize the registered snapshot for the channel provider. */
export async function materializeOutboundArtifact(artifact: unknown, {
  signal,
}: { signal?: AbortableSignal | null } = {}) {
  const record = artifact as ArtifactRecord | null | undefined;
  if (signal?.aborted) {
    cleanupArtifactStorage(record as object);
    signal.throwIfAborted();
  }
  if (record?.kind !== ARTIFACT_KIND || record.schemaVersion !== 1
    || !artifactStorage.has(record)
    || typeof record.digest !== 'string'
    || !Number.isSafeInteger(record.size) || record.size < 0) {
    throw artifactError('artifact-invalid', 'The file registration is invalid.');
  }
  const storage = artifactStorage.get(record)!;
  storage.materializing += 1;
  let handle: FileHandle | undefined;
  let materialized = false;
  try {
    const noFollow = Number.isInteger(fsConstants.O_NOFOLLOW) ? fsConstants.O_NOFOLLOW : 0;
    handle = await open(storage.path, fsConstants.O_RDONLY | noFollow);
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size !== BigInt(record.size)) {
      throw artifactError('artifact-invalid', 'The file registration is invalid.');
    }
    const bytes = await readExactArtifactFile(handle, record.size, {
      signal,
      errorCode: 'artifact-invalid',
      errorMessage: 'The file registration is invalid.',
    });
    const after = await handle.stat({ bigint: true });
    if (!sameIdentity(before, after)
      || bytes.byteLength !== record.size
      || sha256(bytes) !== record.digest) {
      throw artifactError('artifact-invalid', 'The file registration is invalid.');
    }
    signal?.throwIfAborted();
    materialized = true;
    const file = Object.freeze({
      artifactId: record.artifactId,
      deliveryKey: record.deliveryKey,
      fileName: record.fileName,
      mediaType: record.mediaType,
      size: record.size,
      bytes,
    });
    materializedArtifactSources.set(file, record);
    storage.materialized = true;
    return file;
  } catch (error) {
    if (artifactCoded(error)?.startsWith?.('artifact-')) throw error;
    if (signal?.aborted) throw signal.reason ?? error;
    throw artifactError('artifact-invalid', 'The file registration is invalid.');
  } finally {
    await handle?.close().catch(() => undefined);
    storage.materializing -= 1;
    if (!materialized || storage.cleanupRequested) {
      cleanupArtifactStorage(record);
    }
  }
}

/** Keep a materialized snapshot alive until an unabortable provider call settles. */
export function trackOutboundArtifactProviderPromise(file: unknown, promise: unknown) {
  const artifact = materializedArtifactSources.get(file as object);
  if (!artifact || !artifactStorage.has(artifact)
    || !promise || typeof (promise as Thenable).then !== 'function') return promise;
  const settlements = artifactProviderSettlements.get(artifact) ?? new Set();
  const settlement = Promise.resolve(promise).then(
    () => undefined,
    () => undefined,
  );
  settlements.add(settlement);
  artifactProviderSettlements.set(artifact, settlements);
  void settlement.finally(() => {
    settlements.delete(settlement);
    if (settlements.size === 0) artifactProviderSettlements.delete(artifact);
  });
  return promise;
}

/** Release a claimed snapshot after its provider send reaches a terminal result. */
export function releaseOutboundArtifact(artifact: unknown) {
  const record = artifact as object;
  const storage = artifactStorage.get(record);
  if (storage) storage.releaseRequested = true;
  cleanupArtifactStorage(record);
}
