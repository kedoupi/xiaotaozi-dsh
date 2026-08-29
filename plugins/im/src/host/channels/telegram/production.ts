// @ts-nocheck
import { TelegramConfigStore } from '../../../channels/telegram/config-store.ts';
import { TelegramController } from '../../../channels/telegram/telegram-controller.ts';
import { TelegramRuntime } from '../../../channels/telegram/telegram-runtime.ts';
import { ConversationStateStore } from '../../../channels/shared/conversation-state-store.ts';
import { createTokenProductionController } from '../shared/production.ts';

export { normalizeTelegramAllowedUsers } from '../../../channels/telegram/config-store.ts';

export function createProductionController(ctx, config = {}, internals = {}) {
  return createTokenProductionController(ctx, config, internals, {
    channel: 'telegram',
    ConfigStore: TelegramConfigStore,
    StateStore: ConversationStateStore,
    Controller: TelegramController,
    Runtime: TelegramRuntime,
  });
}
