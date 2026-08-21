// @ts-nocheck
import { installOwnedProduction } from '../shared/install-production.ts';
import { createProductionController } from './production.ts';
import { installOfficeRpc } from './rpc.ts';

export async function apply(ctx, config = {}) {
  if (config.controller) return installOfficeRpc(ctx, config.controller, config.rpcAuthority);
  const production = await createProductionController(ctx, config, config.internals ?? {});
  return installOwnedProduction(
    ctx,
    production,
    () => installOfficeRpc(ctx, production.controller, config.rpcAuthority),
    'dsh-im: close AI Office connector',
  );
}
