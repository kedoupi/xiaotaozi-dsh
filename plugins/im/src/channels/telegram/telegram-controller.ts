import { TokenBotController } from '../shared/token-bot-controller.ts';
import {
  deriveTelegramBotIdentity,
  maskTelegramBotId,
  normalizeTelegramAccessPolicy,
} from './config-store.ts';
import { inspectTelegramToken } from './telegram-api.ts';
import { TELEGRAM_DESCRIPTOR } from './telegram-bridge.ts';

type TelegramConfigStoreLike = {
  get: (botId: string) => Record<string, unknown> | null | undefined;
};

type TelegramControllerInit = {
  credentials: unknown;
  configStore: TelegramConfigStoreLike;
  createRuntime: unknown;
  inspectToken?: typeof inspectTelegramToken;
  deleteState?: (input?: unknown) => unknown;
  logger?: { warn?: (...args: unknown[]) => unknown };
};

export class TelegramController extends TokenBotController {
  #configStore: TelegramConfigStoreLike;

  constructor(options: TelegramControllerInit) {
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

  async setAccessPolicy(botId: string, value: unknown) {
    const accessPolicy = normalizeTelegramAccessPolicy(value as Record<string, unknown>);
    return this.updateBotConfig(botId, (config) => ({ ...config, ...accessPolicy }));
  }
}
