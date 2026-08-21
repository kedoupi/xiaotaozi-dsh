// @ts-nocheck
import { installOwnedProduction } from '../shared/install-production.ts';
import { createProductionController } from './production.ts';
import { installWhatsappRpc } from './rpc.ts';

export const name = 'dsh-im-whatsapp-host';
export const inject = ['connection', 'webServer', 'typertGateway'];

export async function apply(ctx, config = {}) {
  if (config?.controller) {
    return installWhatsappRpc(ctx, config.controller, config.rpcOptions, config.rpcAuthority);
  }
  const production = await createProductionController(ctx, config, config.internals ?? {});
  return installOwnedProduction(
    ctx,
    production,
    () => installWhatsappRpc(
      ctx,
      production.controller,
      config.rpcOptions,
      config.rpcAuthority,
    ),
    'dsh-im: close WhatsApp Web connections',
  );
}

export function createWhatsappHostPlugin(config) {
  return Object.freeze({ name, inject, apply: (ctx) => apply(ctx, config) });
}

export { createProductionController } from './production.ts';
export {
  WHATSAPP_ENDPOINTS,
  WHATSAPP_RPC_CHANNEL,
  WHATSAPP_RPC_ENDPOINTS,
  createWhatsappRpcHandler,
  installWhatsappRpc,
} from './rpc.ts';
export { WhatsappController } from '../../../channels/whatsapp/whatsapp-controller.ts';
export { WhatsappRuntime } from '../../../channels/whatsapp/whatsapp-runtime.ts';
