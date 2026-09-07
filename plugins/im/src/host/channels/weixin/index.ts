import { installOwnedProduction } from '../shared/install-production.ts';
import { createProductionController } from './production.ts';
import { installWeixinRpc } from './rpc.ts';

type HostContext = {
  effect: (factory: () => unknown, label?: string) => unknown;
  connection?: {
    rpc?: {
      handle?: (channel: unknown, handler: unknown, options?: unknown) => unknown;
    };
  };
};
type WeixinHostController = {
  status: () => unknown;
  startProvisioning: () => unknown;
  reconnectBot: (botId: unknown) => unknown;
  deleteBot: (botId: unknown) => unknown;
};

export const name = 'dsh-weixin-host';
export const inject = ['connection', 'credentials', 'webServer', 'typertGateway'];

export async function apply(ctx: unknown, config: Record<string, unknown> = {}) {
  const host = ctx as HostContext;
  const controller = config.controller as WeixinHostController | undefined;
  if (controller) {
    return installWeixinRpc(host, controller, config.rpcOptions, config.rpcAuthority);
  }

  const internals = (config.internals ?? {}) as Record<string, unknown>;
  const production = await createProductionController(ctx, config, internals);
  return installOwnedProduction(
    host,
    production,
    () => installWeixinRpc(
      host,
      production.controller,
      config.rpcOptions,
      config.rpcAuthority,
    ),
    'dsh-weixin: close account connections',
  );
}

export function createWeixinHostPlugin(config: Record<string, unknown> = {}) {
  return Object.freeze({ name, inject, apply: (ctx: unknown) => apply(ctx, config) });
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
