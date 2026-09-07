import { installOwnedProduction } from '../shared/install-production.ts';
import { createProvisioningBackedController } from './controller.ts';
import { createProductionController } from './production.ts';
import { installFeishuRpc } from './rpc.ts';

type HostContext = {
  effect: (factory: () => unknown, label?: string) => unknown;
  connection?: {
    rpc?: {
      handle?: (channel: unknown, handler: unknown, options?: unknown) => unknown;
    };
  };
};
type FeishuHostController = {
  status: () => unknown;
  bindCredentials: (payload: unknown) => unknown;
  reconnectBot: (botId: unknown) => unknown;
  deleteBot: (botId: unknown) => unknown;
};
type FeishuHostConfig = Record<string, unknown> & {
  controller?: FeishuHostController;
  createController?: () => FeishuHostController;
  createProvisioningManager?: Parameters<typeof createProvisioningBackedController>[0]['createProvisioningManager'];
};

export const name = 'dsh-feishu-host';
export const inject = ['connection', 'credentials', 'webServer', 'typertGateway'];

function controllerFrom(_ctx: unknown, config: FeishuHostConfig) {
  if (config.controller) return config.controller;
  if (typeof config.createController === 'function') return config.createController();
  if (typeof config.createProvisioningManager === 'function') {
    return createProvisioningBackedController(
      config as Parameters<typeof createProvisioningBackedController>[0],
    );
  }
  // Cordis deliberately throws when a plugin reads an undeclared service,
  // even through optional chaining. Production uses the explicit services in
  // `inject`; test/programmatic controllers must therefore come from config.
  return undefined;
}

/**
 * Cordis/DSH Host plugin entry.  Production composition may supply an owned
 * controller service; tests and embedded distributions may inject one through
 * config without changing the Connection RPC boundary.
 */
export async function apply(ctx: unknown, config: Record<string, unknown> = {}) {
  const host = ctx as HostContext;
  const controller = controllerFrom(ctx, config);
  if (controller) {
    return installFeishuRpc(host, controller, config.rpcOptions, config.rpcAuthority);
  }

  const production = await createProductionController(ctx, config);
  return installOwnedProduction(
    host,
    production,
    () => installFeishuRpc(
      host,
      production.controller,
      config.rpcOptions,
      config.rpcAuthority,
    ),
    'dsh-feishu: close controller and live connection',
  );
}

/** Create a programmatic plugin module with dependencies closed over. */
export function createFeishuHostPlugin(config: Record<string, unknown> = {}) {
  return Object.freeze({
    name,
    inject,
    apply: (ctx: unknown) => apply(ctx, config),
  });
}

export {
  ProvisioningBackedController,
  createProvisioningBackedController,
} from './controller.ts';
export { createProductionController } from './production.ts';
export { ConnectionSupervisor, createConnectionSupervisor } from './connection-supervisor.ts';
export { MultiBotDshFeishuController } from '../../../channels/feishu/multi-bot-controller.ts';
export {
  FEISHU_APP_ID_REF,
  FEISHU_APP_SECRET_REF,
  createDshCredentialStore,
} from './credential-store.ts';
export {
  FEISHU_ENDPOINTS,
  FEISHU_MULTI_ENDPOINTS,
  FEISHU_RPC_CHANNEL,
  FEISHU_RPC_ENDPOINTS,
  createFeishuRpcHandler,
  installFeishuRpc,
  toPublicFeishuStatus,
} from './rpc.ts';
