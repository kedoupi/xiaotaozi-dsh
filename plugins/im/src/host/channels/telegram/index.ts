import { installOwnedProduction } from '../shared/install-production.ts';
import { createProductionController } from './production.ts';
import { installTelegramRpc } from './rpc.ts';

type HostContext = {
  effect: (factory: () => unknown, label?: string) => unknown;
  connection?: {
    rpc?: {
      handle?: (channel: unknown, handler: unknown, options?: unknown) => unknown;
    };
  };
};
type TelegramHostController = {
  setAccessPolicy: (botId: unknown, policy: unknown) => unknown;
  status: () => unknown;
  bindCredentials: (payload: unknown) => unknown;
  reconnectBot: (botId: unknown) => unknown;
  deleteBot: (botId: unknown) => unknown;
};
export const name = 'dsh-im-telegram-host';
export const inject = ['connection', 'credentials', 'webServer', 'typertGateway'];

export async function apply(ctx: unknown, config: Record<string, unknown> = {}) {
  const host = ctx as HostContext;
  const controller = config.controller as TelegramHostController | undefined;
  if (controller) {
    return installTelegramRpc(host, controller, config.rpcAuthority);
  }
  const internals = (config.internals ?? {}) as Record<string, unknown>;
  const production = await createProductionController(ctx, config, internals);
  return installOwnedProduction(
    host,
    production,
    () => installTelegramRpc(host, production.controller, config.rpcAuthority),
    'dsh-im: close Telegram bot connections',
  );
}

export function createTelegramHostPlugin(config: Record<string, unknown> = {}) {
  return Object.freeze({ name, inject, apply: (ctx: unknown) => apply(ctx, config) });
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
