import { installOwnedProduction } from '../shared/install-production.ts';
import { createProductionController } from './production.ts';
import { installSlackRpc } from './rpc.ts';

type HostContext = {
  effect: (factory: () => unknown, label?: string) => unknown;
  connection?: {
    rpc?: {
      handle?: (channel: unknown, handler: unknown, options?: unknown) => unknown;
    };
  };
};
type SlackHostController = {
  status: () => unknown;
  bindCredentials: (payload: unknown) => unknown;
  reconnectBot: (botId: unknown) => unknown;
  deleteBot: (botId: unknown) => unknown;
};

export const name = 'dsh-im-slack-host';
export const inject = ['connection', 'credentials', 'webServer', 'typertGateway'];

export async function apply(ctx: unknown, config: Record<string, unknown> = {}) {
  const host = ctx as HostContext;
  const controller = config.controller as SlackHostController | undefined;
  if (controller) {
    return installSlackRpc(host, controller, config.rpcAuthority);
  }
  const internals = (config.internals ?? {}) as Record<string, unknown>;
  const production = await createProductionController(ctx, config, internals);
  return installOwnedProduction(
    host,
    production,
    () => installSlackRpc(host, production.controller, config.rpcAuthority),
    'dsh-im: close Slack bot connections',
  );
}

export function createSlackHostPlugin(config: Record<string, unknown> = {}) {
  return Object.freeze({ name, inject, apply: (ctx: unknown) => apply(ctx, config) });
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
