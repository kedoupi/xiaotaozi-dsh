// @ts-nocheck
import { installOwnedProduction } from '../shared/install-production.ts';
import { createProductionController } from './production.ts';
import { installSlackRpc } from './rpc.ts';

export const name = 'dsh-im-slack-host';
export const inject = ['connection', 'credentials', 'webServer', 'typertGateway'];

export async function apply(ctx, config = {}) {
  if (config?.controller) return installSlackRpc(ctx, config.controller, config.rpcAuthority);
  const production = await createProductionController(ctx, config, config.internals ?? {});
  return installOwnedProduction(
    ctx,
    production,
    () => installSlackRpc(ctx, production.controller, config.rpcAuthority),
    'dsh-im: close Slack bot connections',
  );
}

export function createSlackHostPlugin(config) {
  return Object.freeze({ name, inject, apply: (ctx) => apply(ctx, config) });
}

export { createProductionController } from './production.ts';
export {
  SLACK_ENDPOINTS,
  SLACK_RPC_CHANNEL,
  SLACK_RPC_ENDPOINTS,
  createSlackRpcHandler,
  installSlackRpc,
} from './rpc.ts';
export { SlackController } from '../../../channels/slack/slack-controller.ts';
export { SlackRuntime } from '../../../channels/slack/slack-runtime.ts';
