import { installOwnedProduction } from '../shared/install-production.ts';
import { createProductionController } from './production.ts';
import { installWecomRpc } from './rpc.ts';

type HostContext = {
  effect: (factory: () => unknown, label?: string) => unknown;
  connection?: {
    rpc?: {
      handle?: (channel: unknown, handler: unknown, options?: unknown) => unknown;
    };
  };
};
type WecomHostController = {
  status: () => unknown;
  bindCredentials: (payload: unknown) => unknown;
  reconnectBot: (botId: unknown) => unknown;
  deleteBot: (botId: unknown) => unknown;
};

export const name = 'dsh-im-wecom-host';
export const inject = ['connection', 'credentials', 'webServer', 'typertGateway'];

export async function apply(ctx: unknown, config: Record<string, unknown> = {}) {
  const host = ctx as HostContext;
  const controller = config.controller as WecomHostController | undefined;
  if (controller) {
    return installWecomRpc(host, controller, config.rpcOptions, config.rpcAuthority);
  }
  const internals = (config.internals ?? {}) as Record<string, unknown>;
  const production = await createProductionController(ctx, config, internals);
  return installOwnedProduction(
    host,
    production,
    () => installWecomRpc(
      host,
      production.controller,
      config.rpcOptions,
      config.rpcAuthority,
    ),
    'dsh-im: close Enterprise WeChat bot connections',
  );
}

export function createWecomHostPlugin(config: Record<string, unknown> = {}) {
  return Object.freeze({ name, inject, apply: (ctx: unknown) => apply(ctx, config) });
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
