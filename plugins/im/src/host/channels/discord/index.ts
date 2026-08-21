// @ts-nocheck
import { installOwnedProduction } from '../shared/install-production.ts';
import { createProductionController } from './production.ts';
import { installDiscordRpc } from './rpc.ts';

export const name = 'dsh-im-discord-host';
export const inject = ['connection', 'credentials', 'webServer', 'typertGateway'];

export async function apply(ctx, config = {}) {
  if (config?.controller) {
    return installDiscordRpc(ctx, config.controller, config.rpcAuthority);
  }
  const production = await createProductionController(ctx, config, config.internals ?? {});
  return installOwnedProduction(
    ctx,
    production,
    () => installDiscordRpc(ctx, production.controller, config.rpcAuthority),
    'dsh-im: close Discord bot connections',
  );
}

export function createDiscordHostPlugin(config) {
  return Object.freeze({ name, inject, apply: (ctx) => apply(ctx, config) });
}

export { createProductionController } from './production.ts';
export {
  DISCORD_ENDPOINTS,
  DISCORD_RPC_CHANNEL,
  DISCORD_RPC_ENDPOINTS,
  createDiscordRpcHandler,
  installDiscordRpc,
} from './rpc.ts';
export { DiscordController } from '../../../channels/discord/discord-controller.ts';
export { DiscordRuntime } from '../../../channels/discord/discord-runtime.ts';
