// @ts-nocheck
import { installOwnedProduction } from '../shared/install-production.ts';
import { createProductionController } from './production.ts';
import { installTelegramRpc } from './rpc.ts';

export const name = 'dsh-im-telegram-host';
export const inject = ['connection', 'credentials', 'webServer', 'typertGateway'];

export async function apply(ctx, config = {}) {
  if (config?.controller) {
    return installTelegramRpc(ctx, config.controller, config.rpcAuthority);
  }
  const production = await createProductionController(ctx, config, config.internals ?? {});
  return installOwnedProduction(
    ctx,
    production,
    () => installTelegramRpc(ctx, production.controller, config.rpcAuthority),
    'dsh-im: close Telegram bot connections',
  );
}

export function createTelegramHostPlugin(config) {
  return Object.freeze({ name, inject, apply: (ctx) => apply(ctx, config) });
}

export { createProductionController } from './production.ts';
export {
  TELEGRAM_ENDPOINTS,
  TELEGRAM_RPC_CHANNEL,
  TELEGRAM_RPC_ENDPOINTS,
  createTelegramRpcHandler,
  installTelegramRpc,
} from './rpc.ts';
export { TelegramController } from '../../../channels/telegram/telegram-controller.ts';
export { TelegramRuntime } from '../../../channels/telegram/telegram-runtime.ts';
