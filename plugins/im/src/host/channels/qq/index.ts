// @ts-nocheck
import { installOwnedProduction } from '../shared/install-production.ts';
import { createProductionController } from './production.ts';
import { installQqRpc } from './rpc.ts';

export const name = 'dsh-im-qq-host';
export const inject = ['connection', 'credentials', 'webServer', 'typertGateway'];

export async function apply(ctx, config = {}) {
  if (config?.controller) {
    return installQqRpc(ctx, config.controller, config.rpcOptions, config.rpcAuthority);
  }
  const production = await createProductionController(ctx, config, config.internals);
  return installOwnedProduction(
    ctx,
    production,
    () => installQqRpc(
      ctx,
      production.controller,
      config.rpcOptions,
      config.rpcAuthority,
    ),
    'dsh-im: close QQ bot connections',
  );
}

export function createQqHostPlugin(config) {
  return Object.freeze({ name, inject, apply: (ctx) => apply(ctx, config) });
}

export { createConnectionSupervisor, ConnectionSupervisor } from './connection-supervisor.ts';
export { createProductionController } from './production.ts';
export { QQ_ENDPOINTS, QQ_RPC_CHANNEL, QQ_RPC_ENDPOINTS, createQqRpcHandler, installQqRpc } from './rpc.ts';
export { QqController } from '../../../channels/qq/qq-controller.ts';
export { QqRuntime } from '../../../channels/qq/qq-runtime.ts';
