import { installOwnedProduction } from '../shared/install-production.ts';
import { createProductionController } from './production.ts';
import { installDingtalkRpc } from './rpc.ts';

type HostContext = {
  effect: (factory: () => unknown, label?: string) => unknown;
  connection?: {
    rpc?: {
      handle?: (channel: unknown, handler: unknown, options?: unknown) => unknown;
    };
  };
};
type DingtalkHostController = {
  status: () => unknown;
  startProvisioning: (options?: unknown) => unknown;
  bindCredentials: (payload: unknown) => unknown;
  reconnectBot: (botId: unknown) => unknown;
  deleteBot: (botId: unknown) => unknown;
};

export const name = 'dsh-dingtalk-host';
export const inject = ['connection', 'credentials', 'webServer', 'typertGateway'];

export async function apply(ctx: unknown, config: Record<string, unknown> = {}) {
  const host = ctx as HostContext;
  const controller = config.controller as DingtalkHostController | undefined;
  if (controller) {
    return installDingtalkRpc(host, controller, config.rpcOptions, config.rpcAuthority);
  }

  const internals = (config.internals ?? {}) as Record<string, unknown>;
  const production = await createProductionController(ctx, config, internals);
  return installOwnedProduction(
    host,
    production,
    () => installDingtalkRpc(
      host,
      production.controller,
      config.rpcOptions,
      config.rpcAuthority,
    ),
    'dsh-dingtalk: close bot connections',
  );
}

export function createDingtalkHostPlugin(config: Record<string, unknown> = {}) {
  return Object.freeze({ name, inject, apply: (ctx: unknown) => apply(ctx, config) });
}

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
