import {
  parseRoutingContract,
  routingRefreshTiming,
  type RoutingContract,
} from "../router/contract.ts";
import type { Rpc, RpcResult } from "./workspace-shared.ts";

export const PROVIDERS_CHANNEL = "/providers-auth";
const DEFAULT_CONTRACT: RoutingContract = { mode: "manual", candidateCount: 0 };
let snapshot: RoutingContract = DEFAULT_CONTRACT;
let revision = 0;
let pendingIntents = 0;
const listeners = new Set<(next: RoutingContract) => void>();

export function getRoutingSnapshot(): RoutingContract {
  return snapshot;
}
export function publishRouting(next: RoutingContract): void {
  revision += 1;
  snapshot = next;
  for (const listener of listeners) listener(snapshot);
}
export function subscribeRouting(
  listener: (next: RoutingContract) => void,
): () => void {
  listeners.add(listener);
  listener(snapshot);
  return () => {
    listeners.delete(listener);
  };
}
/** Test reset only. Mount disposal must never remove another mount's subscribers. */
export function resetRoutingLive(): void {
  revision += 1;
  snapshot = DEFAULT_CONTRACT;
  listeners.clear();
}
export async function loadRoutingContract(
  rpc: Rpc,
  sessionId?: string,
): Promise<RoutingContract> {
  const result = (await rpc.call(
    PROVIDERS_CHANNEL,
    "routing",
    sessionId === undefined ? {} : { sessionId },
  )) as RpcResult<unknown>;
  if (!result.ok) throw new Error("Routing snapshot unavailable");
  return parseRoutingContract(result.value);
}

/** Shared revision plus mount-local read order; user intent wins before its RPC settles. */
export function createRoutingPublisher(): {
  read(): (next: RoutingContract) => boolean;
  intent(): { publish(next: RoutingContract): boolean; finish(): void };
  dispose(): void;
} {
  let disposed = false;
  let reads = 0;
  const finishes = new Set<() => void>();
  return {
    read() {
      const order = ++reads;
      const version = revision;
      return (next) => {
        if (
          disposed ||
          order !== reads ||
          version !== revision ||
          pendingIntents > 0
        )
          return false;
        publishRouting(next);
        return true;
      };
    },
    intent() {
      const version = ++revision;
      reads += 1;
      let pending = !disposed;
      if (pending) pendingIntents += 1;
      const finish = (): void => {
        if (pending) {
          pending = false;
          pendingIntents -= 1;
        }
        finishes.delete(finish);
      };
      finishes.add(finish);
      return {
        publish(next) {
          if (disposed || !pending || version !== revision) return false;
          finish();
          publishRouting(next);
          return true;
        },
        finish,
      };
    },
    dispose() {
      disposed = true;
      for (const finish of finishes) finish();
    },
  };
}

export function preloadRouting(rpc: Rpc): () => void {
  const publisher = createRoutingPublisher();
  const publish = publisher.read();
  void loadRoutingContract(rpc)
    .then(publish)
    .catch(() => {});
  return () => publisher.dispose();
}

/** Root useSessions selection is the sole authority for a truly session-less surface. */
export function routingSessionIdentity(selection: {
  phase: string;
  current?: string;
}):
  | { kind: "pending" }
  | { kind: "historical" }
  | { kind: "session"; sessionId: string } {
  if (selection.phase !== "ready") return { kind: "pending" };
  return selection.current === undefined
    ? { kind: "historical" }
    : { kind: "session", sessionId: selection.current };
}

/** Per-mount observation only. RPC has no cancel face: fence its result, never overlap it. */
export function createRoutingObserver(
  rpc: Rpc,
  receive: (next: RoutingContract) => void,
  initialTiming?: RoutingContract["refreshTiming"],
): {
  update(
    sessionId: string | undefined,
    running: boolean,
    requestId?: string,
    queueKey?: string,
  ): void;
  refresh(): void;
  dispose(): void;
} {
  let timing = routingRefreshTiming(initialTiming);
  let sessionId: string | undefined;
  let running = false;
  let requestId: string | undefined;
  let queueKey: string | undefined;
  let initialized = false;
  let disposed = false;
  let generation = 0;
  let inFlight = false;
  let active = false;
  let requested = false;
  let startedAt = 0;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let poll: ReturnType<typeof setTimeout> | undefined;

  const clearTimers = (): void => {
    clearTimeout(deadline);
    clearTimeout(poll);
    deadline = undefined;
    poll = undefined;
  };
  const retire = (): void => {
    generation += 1;
    active = false;
    requested = false;
    clearTimers();
  };
  const armDeadline = (): void => {
    clearTimeout(deadline);
    const remaining = timing.totalTimeoutMs - (Date.now() - startedAt);
    if (remaining <= 0) {
      retire();
      return;
    }
    deadline = setTimeout(retire, remaining);
  };
  const pump = (): void => {
    if (disposed || !active || inFlight || !requested) return;
    requested = false;
    inFlight = true;
    const token = generation;
    const key = sessionId;
    const version = revision;
    void loadRoutingContract(rpc, key)
      .then((next) => {
        if (
          disposed ||
          !active ||
          token !== generation ||
          version !== revision ||
          pendingIntents > 0
        )
          return;
        timing = routingRefreshTiming(next.refreshTiming ?? timing);
        // An override may shorten, but must never reset, the observation budget.
        armDeadline();
        if (!active) return;
        const matches =
          key === undefined
            ? next.attribution === "historical"
            : next.attribution === "session" && next.sessionId === key;
        if (
          next.mode !== snapshot.mode ||
          next.candidateCount !== snapshot.candidateCount
        ) {
          // Guards and picker registration share controls, not session decisions.
          // Publish only changes so subscriber-triggered refreshes settle.
          const publishedRevision = revision + 1;
          publishRouting({
            ...snapshot,
            mode: next.mode,
            candidateCount: next.candidateCount,
          });
          // Synchronous subscribers can unmount, switch sessions or start intent.
          if (
            disposed ||
            token !== generation ||
            revision !== publishedRevision ||
            pendingIntents > 0 ||
            !active
          )
            return;
        }
        receive(
          matches
            ? next
            : {
                mode: next.mode,
                candidateCount: next.candidateCount,
                refreshTiming: next.refreshTiming,
              },
        );
      })
      .catch(() => {})
      .finally(() => {
        inFlight = false;
        if (disposed || !active) return;
        if (token !== generation || requested) {
          pump();
          return;
        }
        if (!running) {
          retire();
          return;
        }
        poll = setTimeout(() => {
          poll = undefined;
          requested = true;
          pump();
        }, timing.pollIntervalMs);
      });
  };
  const begin = (): void => {
    retire();
    active = true;
    startedAt = Date.now();
    requested = true;
    armDeadline();
    pump();
  };
  return {
    update(nextSessionId, nextRunning, nextRequestId, nextQueueKey): void {
      if (disposed) return;
      const switched = !initialized || sessionId !== nextSessionId;
      const changed =
        switched ||
        running !== nextRunning ||
        (nextRequestId !== undefined && requestId !== nextRequestId) ||
        (nextQueueKey !== undefined && queueKey !== nextQueueKey);
      if (switched || nextRequestId !== undefined) requestId = nextRequestId;
      if (switched || nextQueueKey !== undefined) queueKey = nextQueueKey;
      initialized = true;
      sessionId = nextSessionId;
      running = nextRunning;
      if (switched) {
        const global = getRoutingSnapshot();
        receive({ mode: global.mode, candidateCount: global.candidateCount });
      }
      if (changed) begin();
    },
    refresh(): void {
      if (disposed || !active) return;
      clearTimeout(poll);
      poll = undefined;
      requested = true;
      pump();
    },
    dispose(): void {
      disposed = true;
      retire();
    },
  };
}
