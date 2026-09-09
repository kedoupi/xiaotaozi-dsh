import { useLayoutEffect, useState } from "react";
import type { RoutingContract } from "../router/contract.ts";
import {
  createRoutingObserver,
  getRoutingSnapshot,
  routingSessionIdentity,
  subscribeRouting,
} from "./routing-live.ts";
import { formatTurnModelLabel } from "./smart-ux.ts";
import { mountHistoricalComposer } from "./historical-composer.ts";
import type { Rpc } from "./workspace-shared.ts";

// RootStandardProps subset; never infer absence from optional session props.
export interface HistoricalComposerInjected {
  rpc: Rpc;
  useSessions<T>(
    select: (selection: { phase: string; current?: string }) => T,
  ): T;
}

export function HistoricalComposer(props: HistoricalComposerInjected): null {
  const historical = props.useSessions(
    (selection) => routingSessionIdentity(selection).kind === "historical",
  );
  const [snapshot, setSnapshot] = useState<RoutingContract>(getRoutingSnapshot);
  useLayoutEffect(() => {
    if (!historical) return;
    const observer = createRoutingObserver(props.rpc, setSnapshot);
    const off = subscribeRouting((next) => {
      setSnapshot((current) => ({
        ...current,
        mode: next.mode,
        candidateCount: next.candidateCount,
      }));
      observer.refresh();
    });
    observer.update(undefined, false);
    return () => {
      off();
      observer.dispose();
    };
  }, [props.rpc, historical]);
  const label =
    historical &&
    snapshot.mode === "smart" &&
    snapshot.attribution === "historical" &&
    snapshot.lastSelected !== undefined
      ? formatTurnModelLabel(snapshot.lastSelected.displayName, "historical")
      : undefined;
  // Layout cleanup removes our portal before the selected-session paint.
  useLayoutEffect(() => {
    if (label === undefined) return;
    return mountHistoricalComposer(document, label);
  }, [label]);
  return null;
}
