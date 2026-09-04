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
  if (!empty && last === undefined && !blocked) {
    return <div ref={rootRef} className="dshM-smartUx" data-dsh-providers-smart-ux="1" hidden />;
  }

  return (
    <div ref={rootRef} className="dshM-smartUx" data-dsh-providers-smart-ux="1">
      {empty || blocked
        ? <p className="dshM-emptyPool" role="alert">{EMPTY_POOL_GUIDE}</p>
        : null}
      {!empty && last !== undefined
        ? (
          <details className="dshM-turnModel">
            <summary>本轮模型</summary>
            <span>{last.displayName}</span>
          </details>
        )
        : null}
    </div>
  );
}
