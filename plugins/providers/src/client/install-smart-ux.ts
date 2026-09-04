import { createElement } from "react";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import { parseRoutingContract } from "../router/contract.ts";
import { HiddenModelSeat, SmartComposerGuard } from "./SmartUx.tsx";
import {
  getRoutingSnapshot,
  loadRoutingContract,
  publishRouting,
  subscribeRouting,
} from "./routing-live.ts";
import {
  MODEL_SEAT_SLOT,
  SHADOW_PRIORITY,
  SMART_DOCK_ID,
  SMART_DOCK_SLOT,
  shouldHideModelPicker,
} from "./smart-ux.ts";
import type { Rpc } from "./workspace-shared.ts";

export function installSmartUx(ctx: ClientContext): () => void {
  const connection = ctx.get("connection") as { rpc: Rpc };
  let disposeSeat: (() => void) | undefined;
  let disposeDock: (() => void) | undefined;

  const sync = (): void => {
    const hide = shouldHideModelPicker(getRoutingSnapshot());
    if (hide && disposeSeat === undefined) {
      disposeSeat = ctx.slots.inject(MODEL_SEAT_SLOT, () => ctx.slots.register({
        name: MODEL_SEAT_SLOT,
        priority: SHADOW_PRIORITY,
      }, HiddenModelSeat)) as unknown as () => void;
      disposeDock = ctx.slots.inject(SMART_DOCK_SLOT, () => ctx.slots.register({
        name: SMART_DOCK_SLOT,
        id: SMART_DOCK_ID,
        priority: SHADOW_PRIORITY,
      }, (slotProps: { inputActions?: { submit(): void } }) => createElement(SmartComposerGuard, {
        rpc: connection.rpc,
        inputActions: slotProps.inputActions,
      }))) as unknown as () => void;
    }
    if (!hide && disposeSeat !== undefined) {
      disposeSeat();
      disposeSeat = undefined;
      disposeDock?.();
      disposeDock = undefined;
    }
  };

  const off = subscribeRouting(sync);
  void loadRoutingContract(connection.rpc).then((next) => {
    publishRouting(next);
  }).catch(() => {
    publishRouting(parseRoutingContract(undefined));
  });
  sync();
  return () => {
    off();
    disposeSeat?.();
    disposeDock?.();
  };
}
