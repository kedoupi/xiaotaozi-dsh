// @ts-nocheck
import { TokenBotController } from '../shared/token-bot-controller.ts';
import { deriveDiscordBotIdentity, maskDiscordBotId } from './config-store.ts';
import { inspectDiscordToken } from './discord-api.ts';
import { DISCORD_DESCRIPTOR } from './discord-bridge.ts';

export class DiscordController extends TokenBotController {
  constructor(options) {
    super({
      ...options,
      descriptor: DISCORD_DESCRIPTOR,
      inspectToken: options.inspectToken ?? inspectDiscordToken,
      deriveIdentity: deriveDiscordBotIdentity,
      maskPlatformId: maskDiscordBotId,
    });
  }
}
