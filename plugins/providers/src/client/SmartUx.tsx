import { useEffect, useRef, useState, type ReactNode } from "react";
import { EMPTY_POOL_GUIDE } from "../router/empty-pool.ts";
import type { RoutingContract } from "../router/contract.ts";
import {
  getRoutingSnapshot,
  loadRoutingContract,
  publishRouting,
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

interface SmartUxInjected {
  rpc?: Rpc;
  inputActions?: { submit(): void };
}

export function HiddenModelSeat(): null {
  return null;
}

export function SmartComposerGuard(props: SmartUxInjected): ReactNode {
  const [snapshot, setSnapshot] = useState<RoutingContract>(getRoutingSnapshot);
  const [blocked, setBlocked] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const rpc = props.rpc;

  useEffect(() => subscribeRouting((next) => {
    setSnapshot(next);
    if (!shouldBlockSmartSend(next)) setBlocked(false);
  }), []);

  useEffect(() => {
    const actions = props.inputActions;
    if (actions === undefined) return;
    const original = actions.submit.bind(actions);
    const refreshAfterSend = (): void => {
      if (rpc === undefined) return;
      window.setTimeout(() => {
        void loadRoutingContract(rpc).then(publishRouting);
      }, 800);
      window.setTimeout(() => {
        void loadRoutingContract(rpc).then(publishRouting);
      }, 2400);
    };
    actions.submit = wrapComposerSubmit(original, {
      shouldBlock: () => shouldBlockSmartSend(getRoutingSnapshot()),
      onBlocked: () => {
        setBlocked(true);
      },
    });
    const submit = actions.submit;
    actions.submit = () => {
      const before = getRoutingSnapshot();
      submit();
      if (!shouldBlockSmartSend(before)) refreshAfterSend();
    };
    return () => {
      actions.submit = original;
    };
  }, [props.inputActions, rpc]);

  useEffect(() => {
    return installComposerEnterGuard(document, {
      shouldBlock: () => shouldBlockSmartSend(getRoutingSnapshot()),
      onBlocked: () => {
        setBlocked(true);
      },
    });
  }, []);

  const empty = shouldBlockSmartSend(snapshot);
  const last = snapshot.lastSelected;
  const turnLabel = !empty && last !== undefined ? formatTurnModelLabel(last.displayName) : undefined;
  const turnDetail = !empty && last !== undefined ? formatTurnModelDetail(last) : undefined;
  if (!empty && turnLabel === undefined && !blocked) {
    return <div ref={rootRef} className="dshM-smartUx" data-dsh-providers-smart-ux="1" hidden />;
  }

  return (
    <div ref={rootRef} className="dshM-smartUx" data-dsh-providers-smart-ux="1">
      {empty || blocked
        ? <p className="dshM-emptyPool" role="alert">{EMPTY_POOL_GUIDE}</p>
        : null}
      {turnLabel !== undefined && last !== undefined
        ? (
          <p className="dshM-turnModel" data-dsh-providers-turn-model="1" aria-label={turnLabel}>
            <span className="dshM-turnModelKicker">本轮模型</span>
            <span className="dshM-turnModelName">{last.displayName.trim()}</span>
            {turnDetail === undefined
              ? null
              : (
                <details className="dshM-turnModelDetail">
                  <summary>详情</summary>
                  <span>{turnDetail}</span>
                </details>
              )}
          </p>
        )
        : null}
    </div>
  );
}
