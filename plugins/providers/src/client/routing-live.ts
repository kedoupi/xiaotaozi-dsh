import { parseRoutingContract, type RoutingContract } from "../router/contract.ts";
import type { Rpc, RpcResult } from "./workspace-shared.ts";

export const PROVIDERS_CHANNEL = "/providers-auth";

const DEFAULT_CONTRACT: RoutingContract = { mode: "manual", candidateCount: 0 };

let snapshot: RoutingContract = DEFAULT_CONTRACT;
const listeners = new Set<(next: RoutingContract) => void>();

export function getRoutingSnapshot(): RoutingContract {
  return snapshot;
}

export function publishRouting(next: RoutingContract): void {
  snapshot = next;
  for (const listener of listeners) listener(snapshot);
}

export function subscribeRouting(listener: (next: RoutingContract) => void): () => void {
  listeners.add(listener);
  listener(snapshot);
  return () => {
    listeners.delete(listener);
  };
}

export function resetRoutingLive(): void {
  snapshot = DEFAULT_CONTRACT;
  listeners.clear();
}

export async function loadRoutingContract(rpc: Rpc): Promise<RoutingContract> {
  const result = await rpc.call(PROVIDERS_CHANNEL, "routing", {}) as RpcResult<unknown>;
  if (!result.ok) return { mode: "manual", candidateCount: 0 };
  return parseRoutingContract(result.value);
}
