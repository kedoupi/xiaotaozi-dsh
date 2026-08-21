// @ts-nocheck
import { installOwnedProduction } from '../shared/install-production.ts';
import { createProvisioningBackedController } from './controller.ts';
import { createProductionController } from './production.ts';
import { installFeishuRpc } from './rpc.ts';

export const name = 'dsh-feishu-host';
export const inject = ['connection', 'credentials', 'webServer', 'typertGateway'];

function controllerFrom(ctx, config) {
  if (config?.controller) return config.controller;
  if (typeof config?.createController === 'function') return config.createController();
  if (typeof config?.createProvisioningManager === 'function') {
    return createProvisioningBackedController(config);
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
export async function apply(ctx, config = {}) {
  const controller = controllerFrom(ctx, config);
  if (controller) {
    return installFeishuRpc(ctx, controller, config.rpcOptions, config.rpcAuthority);
  }

  const production = await createProductionController(ctx, config);
  return installOwnedProduction(
    ctx,
    production,
    () => installFeishuRpc(
      ctx,
      production.controller,
      config.rpcOptions,
      config.rpcAuthority,
    ),
    'dsh-feishu: close controller and live connection',
  );
}

/** Create a programmatic plugin module with dependencies closed over. */
export function createFeishuHostPlugin(config) {
  return Object.freeze({
    name,
    inject,
    apply: (ctx) => apply(ctx, config),
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
