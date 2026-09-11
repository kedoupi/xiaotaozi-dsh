import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { EMPTY_POOL_GUIDE } from "../router/empty-pool.ts";
import type { RoutingContract } from "../router/contract.ts";
import {
  getRoutingSnapshot,
  loadRoutingContract,
  publishRouting,
  subscribeRouting,
} from "./routing-live.ts";
import {
  findHeroChipRow,
  GIT_GRAPH_CHIP_ANCHOR,
  heroTrailRight,
  heroViewport,
  isHeroPhase,
  nudgePastOverlap,
  placedChipBox,
} from "./hero-chip.ts";
import {
  attachDockToComposerCard,
  formatTurnModelDetail,
  formatTurnModelLabel,
  installComposerEnterGuard,
  shouldBlockSmartSend,
  SMART_UX_REFRESH_MS,
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
  const [hero, setHero] = useState(false);
  const [heroPlacement, setHeroPlacement] = useState<{ left: number; top: number }>();
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
      for (const ms of SMART_UX_REFRESH_MS) {
        window.setTimeout(() => {
          void loadRoutingContract(rpc).then(publishRouting);
        }, ms);
      }
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
  const visible = empty || blocked || turnLabel !== undefined;
  const heroChip = visible && turnLabel !== undefined && !empty && !blocked;

  useLayoutEffect(() => {
    const node = rootRef.current;
    if (node === null || !visible) {
      setHero(false);
      setHeroPlacement(undefined);
      return;
    }
    if (!heroChip || !isHeroPhase(node)) {
      setHero(false);
      setHeroPlacement(undefined);
      return attachDockToComposerCard(node);
    }
    setHero(true);
    const place = (): void => {
      const context = findHeroChipRow(node);
      if (context === undefined) return;
      const rowRect = context.heroRow.getBoundingClientRect();
      const selfRect = node.getBoundingClientRect();
      if (rowRect.width <= 0 || selfRect.width <= 0) return;
      const git = node.ownerDocument.querySelector(GIT_GRAPH_CHIP_ANCHOR);
      const extras = git instanceof Element ? [git] : [];
      const right = heroTrailRight(context.heroRow, extras);
      if (right === null) return;
      const next = heroViewport(rowRect, selfRect.height, right);
      const blockers = extras.flatMap((extra) => {
        const box = placedChipBox(extra);
        return box === undefined ? [] : [box];
      });
      next.left = nudgePastOverlap(next.left, selfRect.width, blockers);
      setHeroPlacement((previous) => {
        if (
          previous !== undefined
          && Math.abs(previous.left - next.left) < 0.5
          && Math.abs(previous.top - next.top) < 0.5
        ) {
          return previous;
        }
        return next;
      });
    };
    place();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(place);
    observer?.observe(node);
    const context = findHeroChipRow(node);
    if (context !== undefined) {
      observer?.observe(context.heroRow);
      observer?.observe(context.stack);
    }
    const git = node.ownerDocument.querySelector(GIT_GRAPH_CHIP_ANCHOR);
    if (git instanceof Element) observer?.observe(git);
    const mutations = typeof MutationObserver === "undefined"
      ? undefined
      : new MutationObserver(place);
    const watchRoot = context?.stack ?? node.ownerDocument.body;
    mutations?.observe(watchRoot, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer?.disconnect();
      mutations?.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [visible, heroChip, turnLabel, empty, blocked]);

  const placed = heroPlacement !== undefined;

  return (
    <div
      ref={rootRef}
      className={`dshM-smartUx${hero ? " is-hero" : ""}${hero && placed ? " is-placed" : ""}`}
      data-dsh-providers-smart-ux="1"
      style={hero && placed
        ? { left: `${String(heroPlacement.left)}px`, top: `${String(heroPlacement.top)}px` }
        : undefined}
      {...visible ? {} : { "data-empty": "1" }}
    >
      {empty || blocked
        ? <p className="dshM-emptyPool" role="alert">{EMPTY_POOL_GUIDE}</p>
        : null}
      {turnLabel !== undefined && last !== undefined
        ? (
          <p
            className="dshM-turnModel"
            data-dsh-providers-turn-model="1"
            aria-label={snapshot.switchNotice === undefined ? turnLabel : `${turnLabel}。${snapshot.switchNotice}`}
            title={snapshot.switchNotice}
          >
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
      {snapshot.switchNotice === undefined || empty || blocked || hero
        ? null
        : <p className="dshM-switchNotice" role="status">{snapshot.switchNotice}</p>}
    </div>
  );
}
