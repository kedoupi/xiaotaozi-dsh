export type RpcAuthority = 'loopback' | 'trusted-host';

const RPC_AUTHORITIES = new Set<RpcAuthority>(['loopback', 'trusted-host']);

/**
 * Resolve the browser authority accepted by an IM management RPC channel.
 * The default keeps credential and bot-management operations on loopback.
 */
export function resolveRpcAuthority(value?: unknown): RpcAuthority {
  if (value === undefined) return 'loopback';
  if (RPC_AUTHORITIES.has(value as RpcAuthority)) return value as RpcAuthority;
  throw new TypeError('dsh-im rpcAuthority must be "loopback" or "trusted-host"');
}
