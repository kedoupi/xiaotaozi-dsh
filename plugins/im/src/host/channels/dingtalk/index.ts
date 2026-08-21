// @ts-nocheck
import { installOwnedProduction } from '../shared/install-production.ts';
import { createProductionController } from './production.ts';
import { installDingtalkRpc } from './rpc.ts';

export const name = 'dsh-dingtalk-host';
export const inject = ['connection', 'credentials', 'webServer', 'typertGateway'];

export async function apply(ctx, config = {}) {
  if (config?.controller) {
    return installDingtalkRpc(ctx, config.controller, config.rpcOptions, config.rpcAuthority);
  }

  const production = await createProductionController(ctx, config, config.internals);
  return installOwnedProduction(
    ctx,
    production,
    () => installDingtalkRpc(
      ctx,
      production.controller,
      config.rpcOptions,
      config.rpcAuthority,
    ),
    'dsh-dingtalk: close bot connections',
  );
}

export function createDingtalkHostPlugin(config) {
  return Object.freeze({ name, inject, apply: (ctx) => apply(ctx, config) });
}

export { createConnectionSupervisor, ConnectionSupervisor } from './connection-supervisor.ts';
export { createProductionController } from './production.ts';
export {
  DINGTALK_ENDPOINTS,
  DINGTALK_RPC_CHANNEL,
  DINGTALK_RPC_ENDPOINTS,
  createDingtalkRpcHandler,
  installDingtalkRpc,
} from './rpc.ts';
export { DingtalkController } from '../../../channels/dingtalk/dingtalk-controller.ts';
export { DingtalkRuntime } from '../../../channels/dingtalk/dingtalk-runtime.ts';
