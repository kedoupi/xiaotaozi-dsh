// @ts-nocheck
import { installOwnedProduction } from '../shared/install-production.ts';
import { createProductionController } from './production.ts';
import { installWecomRpc } from './rpc.ts';

export const name = 'dsh-im-wecom-host';
export const inject = ['connection', 'credentials', 'webServer', 'typertGateway'];

export async function apply(ctx, config = {}) {
  if (config?.controller) {
    return installWecomRpc(ctx, config.controller, config.rpcOptions, config.rpcAuthority);
  }
  const production = await createProductionController(ctx, config, config.internals);
  return installOwnedProduction(
    ctx,
    production,
    () => installWecomRpc(
      ctx,
      production.controller,
      config.rpcOptions,
      config.rpcAuthority,
    ),
    'dsh-im: close Enterprise WeChat bot connections',
  );
}

export function createWecomHostPlugin(config) {
  return Object.freeze({ name, inject, apply: (ctx) => apply(ctx, config) });
}

export { createProductionController } from './production.ts';
export {
  WECOM_ENDPOINTS,
  WECOM_RPC_CHANNEL,
  WECOM_RPC_ENDPOINTS,
  createWecomRpcHandler,
  installWecomRpc,
} from './rpc.ts';
export { WecomController } from '../../../channels/wecom/wecom-controller.ts';
export { WecomRuntime } from '../../../channels/wecom/wecom-runtime.ts';
