import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { positionHeroChip } from "./hero-chip.ts";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import { EMPTY_POOL_GUIDE } from "../router/empty-pool.ts";
import type { RoutingContract } from "../router/contract.ts";
import {
  getRoutingSnapshot,
  createRoutingObserver,
  subscribeRouting,
} from "./routing-live.ts";
import {
  formatTurnModelDetail,
  formatTurnModelLabel,
  installComposerEnterGuard,
  shouldBlockSmartSend,
  wrapComposerSubmit,
} from "./smart-ux.ts";
import type { Rpc } from "./workspace-shared.ts";

// Structural subset of pinned RC1 SessionStandardProps; ui-session's declaration
// merge is not present in this standalone package's type graph.
export interface SmartUxInjected {
  rpc: Rpc;
  sessionId: string;
  useSession<T>(
    select: (session: {
      running: boolean;
      blank: boolean;
      pendingSubmissions: readonly { requestId: string }[];
      queue: readonly {
        id: string;
        placement: "queued" | "steering" | "context";
      }[];
    }) => T,
  ): T;
  useInput<T>(
    select: (input: {
      phase: "plain" | "adjudicating" | "claimed" | "submitting";
    }) => T,
  ): T;
  inputActions: { submit(): void };
}

export function HiddenModelSeat(): null {
  return null;
}

export function SmartComposerGuard(props: SmartUxInjected): ReactNode {
  const [snapshot, setSnapshot] = useState<RoutingContract>(getRoutingSnapshot);
  const [blocked, setBlocked] = useState(false);
  const rpc = props.rpc;
  const rootRef = useRef<HTMLDivElement>(null);
  const blank = props.useSession((session) => session.blank);
  const running = props.useSession(
    (session) => session.running || session.pendingSubmissions.length > 0,
  );
  const requestId = props.useSession(
    (session) => session.pendingSubmissions.at(-1)?.requestId,
  );
  // RC1 retires submission echoes on admission. Queue occurrence/placement
  // changes still signal progress when the driver drains turns without idling.
  const queueKey = props.useSession((session) =>
    JSON.stringify(session.queue.map((item) => [item.id, item.placement])),
  );
  const inputPhase = props.useInput((input) => input.phase);
  const observer = useRef<ReturnType<typeof createRoutingObserver>>();
  useEffect(() => {
    const current = createRoutingObserver(
      rpc,
      setSnapshot,
      getRoutingSnapshot().refreshTiming,
    );
    observer.current = current;
    return () => {
      current.dispose();
      observer.current = undefined;
    };
  }, [rpc]);
  useEffect(() => {
    observer.current?.update(
      props.sessionId,
      running || inputPhase !== "plain",
      requestId,
      queueKey,
    );
  }, [rpc, props.sessionId, running, inputPhase, requestId, queueKey]);

  useEffect(
    () =>
      subscribeRouting((next) => {
        setSnapshot((current) => ({
          ...current,
          mode: next.mode,
          candidateCount: next.candidateCount,
        }));
        observer.current?.refresh();
        if (!shouldBlockSmartSend(next)) setBlocked(false);
      }),
    [],
  );

  useEffect(() => {
    const actions = props.inputActions;
    if (actions === undefined) return;
    const original = actions.submit;
    const wrapped = wrapComposerSubmit(() => original.call(actions), {
      shouldBlock: () => shouldBlockSmartSend(getRoutingSnapshot()),
      onBlocked: () => {
        setBlocked(true);
      },
    });
    actions.submit = wrapped;
    return () => {
      if (actions.submit === wrapped) actions.submit = original;
    };
  }, [props.inputActions]);

  useEffect(() => {
    return installComposerEnterGuard(document, {
      shouldBlock: () => shouldBlockSmartSend(getRoutingSnapshot()),
      onBlocked: () => {
        setBlocked(true);
      },
    });
  }, []);

  const empty = shouldBlockSmartSend(snapshot);
  const last =
    snapshot.attribution === "session" && snapshot.sessionId === props.sessionId
      ? snapshot.lastSelected
      : undefined;
  const turnLabel =
    !empty && last !== undefined
      ? formatTurnModelLabel(last.displayName, "session")
      : undefined;
  const turnDetail =
    !empty && last !== undefined ? formatTurnModelDetail(last) : undefined;
  const visible = empty || blocked || turnLabel !== undefined;
  const switchNotice = last === undefined ? undefined : snapshot.switchNotice;
  useLayoutEffect(() => {
    const node = rootRef.current;
    if (node === null || !visible || empty || blocked) return;
    return positionHeroChip(node);
  }, [visible, empty, blocked, turnLabel, props.sessionId, blank]);

  return (
    <div
      ref={rootRef}
      className="dshM-smartUx"
      data-dsh-providers-smart-ux="1"
      {...(visible ? {} : { "data-empty": "1" })}
    >
      {empty || blocked ? (
        <p className="dshM-emptyPool" role="alert">
          {EMPTY_POOL_GUIDE}
        </p>
      ) : null}
      {turnLabel !== undefined && last !== undefined ? (
        <p
          className="dshM-turnModel"
          data-dsh-providers-turn-model="1"
          aria-label={switchNotice === undefined ? turnLabel : `${turnLabel}。${switchNotice}`}
        >
          <span className="dshM-turnModelKicker">上次模型</span>
          <span className="dshM-turnModelName">{last.displayName.trim()}</span>
          {turnDetail === undefined ? null : (
            <details className="dshM-turnModelDetail">
              <summary>详情</summary>
              <span>{turnDetail}</span>
            </details>
          )}
        </p>
      ) : null}
      {switchNotice === undefined || empty || blocked ? null : (
        <p className="dshM-switchNotice" role="status">{switchNotice}</p>
      )}
    </div>
  );
}
