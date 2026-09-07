import {
  deriveTokenBotIdentity,
  maskPlatformId,
  TokenBotConfigStore,
} from '../shared/token-config-store.ts';

const IDENTITY_OPTIONS = Object.freeze({
  botPrefix: 'discord',
  tokenRefPrefix: 'DSH_DISCORD_BOT_TOKEN',
});

export function deriveDiscordBotIdentity(platformId: unknown) {
  return deriveTokenBotIdentity(platformId, IDENTITY_OPTIONS);
}

export function maskDiscordBotId(platformId: unknown) {
  return maskPlatformId(platformId, 'Discord机器人');
}

export class DiscordConfigStore extends TokenBotConfigStore {
  constructor(path: string) {
    super(path, { channel: 'Discord', ...IDENTITY_OPTIONS });
  }
}
