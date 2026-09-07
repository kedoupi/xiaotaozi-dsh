import {
  deriveTokenBotIdentity,
  maskPlatformId,
  TokenBotConfigStore,
} from '../shared/token-config-store.ts';

const IDENTITY_OPTIONS = Object.freeze({
  botPrefix: 'telegram',
  tokenRefPrefix: 'DSH_TELEGRAM_BOT_TOKEN',
});

export const TELEGRAM_ACCESS_MODES = Object.freeze({
  compatible: 'compatible',
  privateAllowlist: 'private-allowlist',
});

export const TELEGRAM_NEW_BOT_ACCESS_POLICY = Object.freeze({
  accessMode: TELEGRAM_ACCESS_MODES.privateAllowlist,
  allowedUsers: Object.freeze([] as string[]),
});

const TELEGRAM_USER_ID = /^[1-9]\d{0,15}$/;

export function normalizeTelegramAllowedUsers(value: unknown) {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) {
    throw new TypeError('allowedUsers must be an array of numeric Telegram User IDs');
  }
  const normalized = value.map((entry) => {
    const userId = typeof entry === 'number' && Number.isSafeInteger(entry)
      ? String(entry) : typeof entry === 'string' ? entry.trim() : '';
    if (!TELEGRAM_USER_ID.test(userId)) {
      throw new TypeError('allowedUsers contains an invalid Telegram User ID');
    }
    return userId;
  });
  return Object.freeze([...new Set(normalized)]);
}

export function normalizeTelegramAccessPolicy(value: unknown = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Telegram access policy must be an object');
  }
  const policy = value as { accessMode?: unknown; allowedUsers?: unknown };
  const accessMode = policy.accessMode ?? TELEGRAM_ACCESS_MODES.compatible;
  if (!(Object.values(TELEGRAM_ACCESS_MODES) as string[]).includes(accessMode as string)) {
    throw new TypeError('Telegram accessMode must be compatible or private-allowlist');
  }
  return Object.freeze({
    accessMode,
    allowedUsers: normalizeTelegramAllowedUsers(policy.allowedUsers),
  });
}

function normalizeTelegramBotExtension(value: object) {
  const hasAccessMode = Object.hasOwn(value, 'accessMode');
  const hasAllowedUsers = Object.hasOwn(value, 'allowedUsers');
  if (!hasAccessMode && !hasAllowedUsers) return {};
  try {
    const policy = normalizeTelegramAccessPolicy(value);
    return {
      ...(hasAccessMode ? { accessMode: policy.accessMode } : {}),
      ...(hasAllowedUsers || hasAccessMode ? { allowedUsers: policy.allowedUsers } : {}),
    };
  } catch {
    return null;
  }
}

export function deriveTelegramBotIdentity(platformId: unknown) {
  return deriveTokenBotIdentity(platformId, IDENTITY_OPTIONS);
}

export function maskTelegramBotId(platformId: unknown) {
  return maskPlatformId(platformId, 'Telegram机器人');
}

export class TelegramConfigStore extends TokenBotConfigStore {
  constructor(path: string) {
    super(path, {
      channel: 'Telegram',
      ...IDENTITY_OPTIONS,
      // TokenBotConfigStore is still @ts-nocheck and infers the default as () => {}.
      normalizeBotExtension: normalizeTelegramBotExtension as () => {},
    });
  }

  async save(value?: { platformId?: unknown } | null) {
    const previous = value?.platformId ? this.getByPlatformId(String(value.platformId)) : null;
    return super.save({ ...(previous ?? TELEGRAM_NEW_BOT_ACCESS_POLICY), ...value });
  }
}
