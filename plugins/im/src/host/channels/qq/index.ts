import { installOwnedProduction } from '../shared/install-production.ts';
import { createProductionController } from './production.ts';
import { installQqRpc } from './rpc.ts';

type HostContext = {
  effect: (factory: () => unknown, label?: string) => unknown;
  connection?: {
    rpc?: {
      handle?: (channel: unknown, handler: unknown, options?: unknown) => unknown;
    };
  };
};
type QqHostController = {
  status: () => unknown;
  startProvisioning: () => unknown;
  bindCredentials: (payload: unknown) => unknown;
  reconnectBot: (botId: unknown) => unknown;
  deleteBot: (botId: unknown) => unknown;
};

export const name = 'dsh-im-qq-host';
export const inject = ['connection', 'credentials', 'webServer', 'typertGateway'];

export async function apply(ctx: unknown, config: Record<string, unknown> = {}) {
  const host = ctx as HostContext;
  const controller = config.controller as QqHostController | undefined;
  if (controller) {
    return installQqRpc(host, controller, config.rpcOptions, config.rpcAuthority);
  }
  const internals = (config.internals ?? {}) as Record<string, unknown>;
  const production = await createProductionController(ctx, config, internals);
  return installOwnedProduction(
    host,
    production,
    () => installQqRpc(
      host,
      production.controller,
      config.rpcOptions,
      config.rpcAuthority,
    ),
    'dsh-im: close QQ bot connections',
  );
}

export function createQqHostPlugin(config: Record<string, unknown> = {}) {
  return Object.freeze({ name, inject, apply: (ctx: unknown) => apply(ctx, config) });
}

export { createProductionController } from './production.ts';
export { QQ_ENDPOINTS, QQ_RPC_CHANNEL, QQ_RPC_ENDPOINTS, createQqRpcHandler, installQqRpc } from './rpc.ts';
export { QqController } from '../../../channels/qq/qq-controller.ts';
export { QqRuntime } from '../../../channels/qq/qq-runtime.ts';
