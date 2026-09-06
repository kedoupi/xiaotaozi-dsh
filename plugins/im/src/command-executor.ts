/**
 * Adapt the Host's Typert command gateway to the channel Harness client.
 * Programmatic production fixtures may omit the gateway and exercise other assembly paths.
 */
type CommandExecutorOptions = {
  signal?: AbortSignal;
};

type TypertGateway = {
  invoke: (request: unknown) => unknown;
};

type CommandExecutorContext = {
  typertGateway?: TypertGateway | null;
};

type GatewayFailure = {
  name?: unknown;
  code?: unknown;
  endpoint?: unknown;
  message?: unknown;
};

export function createHarnessCommandExecutor(
  ctx: CommandExecutorContext | null | undefined,
  provided: unknown,
) {
  if (provided !== undefined) {
    if (typeof provided !== 'function') throw new TypeError('commandExecutor must be a function');
    return provided;
  }
  const gateway = ctx?.typertGateway;
  if (!gateway) return undefined;
  if (typeof gateway.invoke !== 'function') {
    throw new TypeError('dsh-im requires a callable ctx.typertGateway');
  }
  return async (
    sessionId: unknown,
    line: unknown,
    options: CommandExecutorOptions = {},
  ) => {
    const request = {
      namespace: 'commands',
      method: 'execute',
      args: { agentId: sessionId, line, images: [] },
      signal: options.signal,
    };
    try {
      return await gateway.invoke(request);
    } catch (error) {
      // Newer Hosts require images; older Hosts reject that field before
      // invoking the command. Retry only that exact pre-dispatch failure so
      // a business failure can never cause compaction to run twice.
      const failure = error as GatewayFailure;
      if (failure?.name !== 'TypertGatewayError'
        || failure.code !== 'arguments-invalid'
        || failure.endpoint !== 'commands/execute'
        || failure.message !== 'typert gateway: commands/execute: args fields do not match the descriptor: unexpected "images"') {
        throw error;
      }
      options.signal?.throwIfAborted();
      return gateway.invoke({
        ...request,
        args: { agentId: sessionId, line },
      });
    }
  };
}
