// @ts-nocheck
import { TokenBotController } from '../shared/token-bot-controller.ts';
import {
  deriveTelegramBotIdentity,
  maskTelegramBotId,
  normalizeTelegramAccessPolicy,
} from './config-store.ts';
import { inspectTelegramToken } from './telegram-api.ts';
import { TELEGRAM_DESCRIPTOR } from './telegram-bridge.ts';

export class TelegramController extends TokenBotController {
  #configStore;

  constructor(options) {
    super({
      ...options,
      descriptor: TELEGRAM_DESCRIPTOR,
      inspectToken: options.inspectToken ?? inspectTelegramToken,
      deriveIdentity: deriveTelegramBotIdentity,
      maskPlatformId: maskTelegramBotId,
    });
    this.#configStore = options.configStore;
  }

  status() {
    const snapshot = super.status();
    return {
      ...snapshot,
      bots: snapshot.bots.map((bot) => {
        const config = this.#configStore.get(bot.botId);
        const accessPolicy = normalizeTelegramAccessPolicy(config ?? {});
        return { ...bot, accessPolicy };
      }),
    };
  }

  async setAccessPolicy(botId, value) {
    const accessPolicy = normalizeTelegramAccessPolicy(value);
    return this.updateBotConfig(botId, (config) => ({ ...config, ...accessPolicy }));
  }
}
