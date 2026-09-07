import { chmod, mkdir, readdir } from 'node:fs/promises';

import makeWASocket, {
  Browsers,
  DisconnectReason,
  jidNormalizedUser,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';

type DisconnectError = {
  output?: { statusCode?: unknown };
  data?: { statusCode?: unknown };
  statusCode?: unknown;
};

type WhatsappUser = {
  id?: unknown;
  name?: unknown;
};

type WhatsappAuthKeys = {
  set: (data: unknown) => unknown;
};

type WhatsappAuthState = {
  creds: { me?: WhatsappUser };
  keys: WhatsappAuthKeys;
};

type WhatsappSocket = {
  user?: WhatsappUser;
  ev: {
    on: (event: string, handler: (...args: unknown[]) => unknown) => unknown;
  };
  end: (error?: unknown) => unknown;
  logout: (reason?: unknown) => unknown;
};

type WhatsappConnectionUpdate = {
  qr?: unknown;
  connection?: unknown;
  lastDisconnect?: { error?: unknown };
};

type WhatsappMessageUpsert = {
  messages?: unknown;
  type?: unknown;
};

type WhatsappSessionIdentity = {
  accountJid: string;
  name: string;
};

type WhatsappSessionOptions = {
  authDir?: unknown;
  onQr?: (qr: string) => unknown;
  onMessage?: (message: unknown) => unknown;
  onDisconnect?: (info: { error: Error; loggedOut: boolean }) => unknown;
  signal?: AbortSignal | null;
  logger?: { error?: (message?: unknown) => unknown };
  makeSocket?: (options: unknown) => WhatsappSocket;
  loadAuthState?: (dir: string) => Promise<{
    state: WhatsappAuthState;
    saveCreds: () => unknown;
  }>;
};

const SILENT_LOGGER = Object.freeze({
  level: 'silent',
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
  fatal() {},
  child() { return this; },
});
const APPEND_RECENT_GRACE_MS = 60_000;

function abortError() {
  return Object.assign(new Error('WhatsApp connection was cancelled'), { name: 'AbortError' });
}

function disconnectStatus(error: unknown) {
  const err = error as DisconnectError | undefined;
  return err?.output?.statusCode ?? err?.data?.statusCode ?? err?.statusCode ?? null;
}

function messageTimestampMs(value: unknown) {
  let seconds: unknown = value;
  if (typeof seconds === 'string') {
    if (!/^\d+$/.test(seconds)) return null;
    seconds = Number(seconds);
  } else if (typeof seconds === 'bigint') {
    seconds = Number(seconds);
  } else if (seconds && typeof seconds === 'object') {
    seconds = Number(seconds.valueOf());
  }
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0
    ? seconds * 1_000
    : null;
}

async function hardenAuthDirectory(path: string) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700);
  const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
  await Promise.all(entries.filter((entry) => entry.isFile())
    .map((entry) => chmod(`${path}/${entry.name}`, 0o600).catch(() => undefined)));
}

function normalizeIdentity(socket: WhatsappSocket, authState: WhatsappAuthState) {
  const source = socket.user ?? authState.creds.me;
  const accountJid = jidNormalizedUser(typeof source?.id === 'string' ? source.id : undefined);
  if (!/^\d{5,32}@(s\.whatsapp\.net|lid)$/.test(accountJid ?? '')) {
    throw new Error('WhatsApp did not return a valid linked account');
  }
  return {
    accountJid,
    name: typeof source?.name === 'string' && source.name.trim()
      ? source.name.trim().slice(0, 100) : 'WhatsApp机器人',
  };
}

export async function createWhatsappWebSession({
  authDir,
  onQr,
  onMessage,
  onDisconnect,
  signal,
  logger = console,
  makeSocket = makeWASocket as WhatsappSessionOptions['makeSocket'],
  loadAuthState = useMultiFileAuthState as WhatsappSessionOptions['loadAuthState'],
}: WhatsappSessionOptions = {}) {
  if (typeof authDir !== 'string' || !authDir || typeof onQr !== 'function') {
    throw new TypeError('WhatsApp Web session requires an auth directory and QR callback');
  }
  const dir = authDir;
  const createSocket = makeSocket as (options: unknown) => WhatsappSocket;
  const createAuthState = loadAuthState as (dir: string) => Promise<{
    state: WhatsappAuthState;
    saveCreds: () => unknown;
  }>;
  await hardenAuthDirectory(dir);
  const sessionStartedAt = Date.now();
  const { state, saveCreds } = await createAuthState(dir);
  const originalKeySet = state.keys.set.bind(state.keys);
  state.keys.set = async (data: unknown) => {
    await originalKeySet(data);
    await hardenAuthDirectory(dir);
  };

  let closed = false;
  let readySettled = false;
  let resolveReady: (value: WhatsappSessionIdentity) => void = () => {};
  let rejectReady: (reason?: unknown) => void = () => {};
  let saveQueue: Promise<unknown> = Promise.resolve();
  let socket: WhatsappSocket | null = null;
  let socketGeneration = 0;
  let restartTask: Promise<unknown> | null = null;
  const ready = new Promise<WhatsappSessionIdentity>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const settleFailure = (error: unknown) => {
    if (readySettled) return;
    readySettled = true;
    rejectReady(error);
  };
  const close = async () => {
    if (closed) return;
    closed = true;
    socketGeneration += 1;
    settleFailure(abortError());
    await restartTask?.catch(() => undefined);
    await saveQueue.catch(() => undefined);
    await Promise.resolve(socket?.end(undefined)).catch(() => undefined);
  };
  const logout = async () => {
    if (closed) return;
    closed = true;
    socketGeneration += 1;
    settleFailure(abortError());
    await restartTask?.catch(() => undefined);
    await saveQueue.catch(() => undefined);
    await Promise.resolve(socket?.logout('Removed from Xiaotaozi')).catch(() => undefined);
  };

  const startSocket = () => {
    const generation = ++socketGeneration;
    let connectionOpen = false;
    const nextSocket = createSocket({
      auth: state,
      browser: Browsers.macOS('Xiaotaozi'),
      logger: SILENT_LOGGER,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      getMessage: async () => undefined,
      generateHighQualityLinkPreview: false,
    });
    socket = nextSocket;

    const resolveWhenLinked = () => {
      if (!connectionOpen || !state.creds.me || readySettled) return;
      void saveQueue.then(() => {
        if (closed || readySettled || generation !== socketGeneration
          || !connectionOpen || !state.creds.me) return;
        readySettled = true;
        resolveReady(normalizeIdentity(nextSocket, state));
      }).catch((error) => settleFailure(error));
    };

    nextSocket.ev.on('creds.update', () => {
      if (closed || generation !== socketGeneration) return;
      saveQueue = saveQueue.then(async () => {
        await saveCreds();
        await hardenAuthDirectory(dir);
      });
      saveQueue.catch(() => logger.error?.('[dsh-im:whatsapp] failed to persist linked-device state'));
      resolveWhenLinked();
    });
    nextSocket.ev.on('connection.update', (...args: unknown[]) => {
      const update = (args[0] ?? {}) as WhatsappConnectionUpdate;
      if (closed || generation !== socketGeneration) return;
      if (typeof update.qr === 'string' && update.qr) onQr(update.qr);
      if (update.connection === 'open') {
        connectionOpen = true;
        resolveWhenLinked();
      }
      if (update.connection === 'close') {
        const status = disconnectStatus(update.lastDisconnect?.error);
        if (status === DisconnectReason.restartRequired) {
          restartTask ??= saveQueue.then(async () => {
            if (closed || generation !== socketGeneration) return;
            await Promise.resolve(nextSocket.end(undefined)).catch(() => undefined);
            if (closed || generation !== socketGeneration) return;
            startSocket();
          }).catch((error) => settleFailure(error)).finally(() => {
            restartTask = null;
          });
          return;
        }
        const loggedOut = status === DisconnectReason.loggedOut;
        const error = Object.assign(new Error(loggedOut
          ? 'WhatsApp linked device was removed from the phone'
          : 'WhatsApp Web connection closed'), { code: loggedOut ? 'logged-out' : 'connection-closed' });
        if (!readySettled) settleFailure(error);
        else onDisconnect?.({ error, loggedOut });
      }
    });
    nextSocket.ev.on('messages.upsert', (...args: unknown[]) => {
      const upsert = (args[0] ?? {}) as WhatsappMessageUpsert;
      const { messages, type } = upsert;
      if (closed || generation !== socketGeneration
        || (type !== 'notify' && type !== 'append') || typeof onMessage !== 'function') return;
      for (const message of Array.isArray(messages) ? messages : []) {
        if (type === 'append') {
          const record = message as { messageTimestamp?: unknown } | null;
          const timestamp = messageTimestampMs(record?.messageTimestamp);
          if (timestamp === null || timestamp < sessionStartedAt - APPEND_RECENT_GRACE_MS) continue;
        }
        Promise.resolve(onMessage(message)).catch(() => {
          logger.error?.('[dsh-im:whatsapp] failed to process an inbound WhatsApp message');
        });
      }
    });
  };

  startSocket();

  if (signal) {
    if (signal.aborted) await close();
    else signal.addEventListener('abort', () => void close(), { once: true });
  }
  return Object.freeze({
    get socket() { return socket; },
    ready,
    close,
    logout,
  });
}
