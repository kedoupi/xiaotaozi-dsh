// @ts-nocheck
import { installOwnedProduction } from '../shared/install-production.ts';
import { createProductionController } from './production.ts';
import { installWeixinRpc } from './rpc.ts';

export const name = 'dsh-weixin-host';
export const inject = ['connection', 'credentials', 'webServer', 'typertGateway'];

export async function apply(ctx, config = {}) {
  if (config?.controller) {
    return installWeixinRpc(ctx, config.controller, config.rpcOptions, config.rpcAuthority);
  }

  const production = await createProductionController(ctx, config, config.internals);
  return installOwnedProduction(
    ctx,
    production,
    () => installWeixinRpc(
      ctx,
      production.controller,
      config.rpcOptions,
      config.rpcAuthority,
    ),
    'dsh-weixin: close account connections',
  );
}

export function createWeixinHostPlugin(config) {
  return Object.freeze({ name, inject, apply: (ctx) => apply(ctx, config) });
}

export { createProductionController } from './production.ts';
export {
  WEIXIN_ENDPOINTS,
  WEIXIN_RPC_CHANNEL,
  WEIXIN_RPC_ENDPOINTS,
  createWeixinRpcHandler,
  installWeixinRpc,
} from './rpc.ts';
export { WeixinController } from '../../../channels/weixin/weixin-controller.ts';
export { WeixinRuntime } from '../../../channels/weixin/weixin-runtime.ts';
