import { installOwnedProduction } from '../shared/install-production.ts';
import { createProductionController } from './production.ts';
import { installWhatsappRpc } from './rpc.ts';

type HostContext = {
  effect: (factory: () => unknown, label?: string) => unknown;
  connection?: {
    rpc?: {
      handle?: (channel: unknown, handler: unknown, options?: unknown) => unknown;
    };
  };
};
type WhatsappHostController = {
  status: () => unknown;
  beginProvisioning: () => unknown;
  reconnectBot: (botId: unknown) => unknown;
  deleteBot: (botId: unknown) => unknown;
  setAccessPolicy: (botId: unknown, policy: unknown) => unknown;
};

export const name = 'dsh-im-whatsapp-host';
export const inject = ['connection', 'webServer', 'typertGateway'];

export async function apply(ctx: unknown, config: Record<string, unknown> = {}) {
  const host = ctx as HostContext;
  const controller = config.controller as WhatsappHostController | undefined;
  if (controller) {
    return installWhatsappRpc(host, controller, config.rpcOptions, config.rpcAuthority);
  }
  const internals = (config.internals ?? {}) as Record<string, unknown>;
  const production = await createProductionController(ctx, config, internals);
  return installOwnedProduction(
    host,
    production,
    () => installWhatsappRpc(
      host,
      production.controller,
      config.rpcOptions,
      config.rpcAuthority,
    ),
    'dsh-im: close WhatsApp Web connections',
  );
}

export function createWhatsappHostPlugin(config: Record<string, unknown> = {}) {
  return Object.freeze({ name, inject, apply: (ctx: unknown) => apply(ctx, config) });
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
