import {
  TOKEN_BOT_ENDPOINTS,
  createTokenBotRpcHandler,
  installTokenBotRpc,
} from '../shared/rpc.ts';

type TokenBotController = {
  status: () => unknown;
  bindCredentials: (payload: unknown) => unknown;
  reconnectBot: (botId: unknown) => unknown;
  deleteBot: (botId: unknown) => unknown;
};
type RpcContext = {
  connection?: {
    rpc?: {
      handle?: (channel: unknown, handler: unknown, options?: unknown) => unknown;
    };
  };
};

export const DISCORD_RPC_CHANNEL = '/discord';
export const DISCORD_ENDPOINTS = TOKEN_BOT_ENDPOINTS;
export const DISCORD_RPC_ENDPOINTS = Object.freeze(Object.values(DISCORD_ENDPOINTS));

export function createDiscordRpcHandler(controller: TokenBotController | null | undefined) {
  return createTokenBotRpcHandler(controller, { channel: 'Discord' });
}

export function installDiscordRpc(
  ctx: RpcContext | null | undefined,
  controller: TokenBotController | null | undefined,
  authority?: unknown,
) {
  return installTokenBotRpc(ctx, controller, {
    channel: 'Discord',
    rpcChannel: DISCORD_RPC_CHANNEL,
    authority,
  });
}
