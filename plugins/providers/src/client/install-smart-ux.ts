import { createElement } from "react";
import type {} from "./plugin-center-contract.ts";
import type { Context as ClientContext } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import {
  HiddenModelSeat,
  SmartComposerGuard,
  type SmartUxInjected,
} from "./SmartUx.tsx";
import {
  getRoutingSnapshot,
  preloadRouting,
  subscribeRouting,
} from "./routing-live.ts";
import {
  MODEL_SEAT_SLOT,
  SHADOW_PRIORITY,
  SMART_DOCK_SLOT,
  shouldHideModelPicker,
  smartUxDockRegistration,
} from "./smart-ux.ts";
import type { Rpc } from "./workspace-shared.ts";
import {
  HistoricalComposer,
  type HistoricalComposerInjected,
} from "./HistoricalComposer.tsx";

export function installSmartUx(ctx: ClientContext): () => void {
  const connection = ctx.get("connection") as { rpc: Rpc };
  let disposeSeat: (() => void) | undefined;
  let disposeDock: (() => void) | undefined;

  const sync = (): void => {
    const hide = shouldHideModelPicker(getRoutingSnapshot());
    if (hide && disposeSeat === undefined) {
      disposeSeat = ctx.slots.inject(MODEL_SEAT_SLOT, () =>
        ctx.slots.register(
          {
            name: MODEL_SEAT_SLOT,
            priority: SHADOW_PRIORITY,
          },
          HiddenModelSeat,
        ),
      );
      disposeDock = ctx.slots.inject(SMART_DOCK_SLOT, () =>
        ctx.slots.register(
          {
            ...smartUxDockRegistration(),
          },
          (
            slotProps: Omit<SmartUxInjected, "rpc"> &
              Pick<HistoricalComposerInjected, "useSessions">,
          ) => {
            const selected = slotProps.useSessions(
              (selection) =>
                selection.phase === "ready" &&
                selection.current === slotProps.sessionId,
            );
            return selected
              ? createElement(SmartComposerGuard, {
                  ...slotProps,
                  rpc: connection.rpc,
                })
              : null;
          },
        ),
      );
    }
    if (!hide && disposeSeat !== undefined) {
      disposeSeat();
      disposeSeat = undefined;
      disposeDock?.();
      disposeDock = undefined;
    }
  };

  const disposeHistorical = ctx.slots.inject("shell.overlay", () =>
    ctx.slots.register(
      { name: "shell.overlay", id: "providers-historical-composer", order: 80 },
      (slotProps: Omit<HistoricalComposerInjected, "rpc">) =>
        createElement(HistoricalComposer, {
          ...slotProps,
          rpc: connection.rpc,
        }),
    ),
  );
  const off = subscribeRouting(sync);
  const cancelPreload = preloadRouting(connection.rpc);
  sync();
  return () => {
    cancelPreload();
    off();
    disposeHistorical();
    disposeSeat?.();
    disposeDock?.();
  };
}
