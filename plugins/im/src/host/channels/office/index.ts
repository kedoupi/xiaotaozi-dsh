import { installOwnedProduction } from '../shared/install-production.ts';
import { createProductionController } from './production.ts';
import { installOfficeRpc } from './rpc.ts';

type HostContext = {
  effect: (factory: () => unknown, label?: string) => unknown;
  connection?: {
    rpc?: {
      handle?: (channel: unknown, handler: unknown, options?: unknown) => unknown;
    };
  };
};
type OfficeHostController = {
  status: () => unknown;
  configure: (payload: unknown) => unknown;
  reconnect: () => unknown;
  test: () => unknown;
  remove: () => unknown;
};

export async function apply(ctx: unknown, config: Record<string, unknown> = {}) {
  const host = ctx as HostContext;
  const controller = config.controller as OfficeHostController | undefined;
  if (controller) {
    return installOfficeRpc(host, controller, config.rpcAuthority);
  }
  const internals = (config.internals ?? {}) as Record<string, unknown>;
  const production = await createProductionController(ctx, config, internals);
  return installOwnedProduction(
    host,
    production,
    () => installOfficeRpc(host, production.controller, config.rpcAuthority),
    'dsh-im: close AI Office connector',
  );
}
