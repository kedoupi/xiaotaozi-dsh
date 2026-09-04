import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { EMPTY_POOL_GUIDE } from "../src/router/empty-pool.ts";
import { zh } from "../src/client/locales.ts";
import {
  getRoutingSnapshot,
  publishRouting,
  resetRoutingLive,
  subscribeRouting,
} from "../src/client/routing-live.ts";
import {
  installComposerEnterGuard,
  MODEL_SEAT_SLOT,
  SHADOW_PRIORITY,
  SMART_DOCK_SLOT,
  shouldBlockSmartSend,
  shouldHideModelPicker,
  wrapComposerSubmit,
} from "../src/client/smart-ux.ts";

afterEach(() => {
  resetRoutingLive();
});

describe("smart selection UX contract", () => {
  it("hides the conversation picker only in smart mode", () => {
    expect(shouldHideModelPicker({ mode: "smart" })).toBe(true);
    expect(shouldHideModelPicker({ mode: "manual" })).toBe(false);
  });

  it("blocks send only when smart and the authorized pool is empty", () => {
    expect(shouldBlockSmartSend({ mode: "smart", candidateCount: 0 })).toBe(true);
    expect(shouldBlockSmartSend({ mode: "smart", candidateCount: 1 })).toBe(false);
    expect(shouldBlockSmartSend({ mode: "manual", candidateCount: 0 })).toBe(false);
  });

  it("keeps empty-pool copy in Chinese and in sync with locales", () => {
    expect(EMPTY_POOL_GUIDE).toContain("设置 → 模型");
    expect(EMPTY_POOL_GUIDE).toContain("勾选");
    expect(zh.routeEmpty).toContain("勾选");
    expect(zh.routeHint).toContain("对话里不再选手动模型");
  });

  it("wraps submit so an empty smart pool never calls through", () => {
    let sent = 0;
    let blocked = 0;
    const submit = wrapComposerSubmit(() => {
      sent += 1;
    }, {
      shouldBlock: () => shouldBlockSmartSend(getRoutingSnapshot()),
      onBlocked: () => {
        blocked += 1;
      },
    });
    publishRouting({ mode: "smart", candidateCount: 0 });
    submit();
    expect(sent).toBe(0);
    expect(blocked).toBe(1);
    publishRouting({ mode: "smart", candidateCount: 2 });
    submit();
    expect(sent).toBe(1);
    expect(blocked).toBe(1);
    publishRouting({ mode: "manual", candidateCount: 0 });
    submit();
    expect(sent).toBe(2);
  });

  it("publishes routing so picker hide flips without a restart", () => {
    const seen: string[] = [];
    const off = subscribeRouting((next) => {
      seen.push(next.mode);
    });
    expect(shouldHideModelPicker(getRoutingSnapshot())).toBe(false);
    publishRouting({ mode: "smart", candidateCount: 1 });
    expect(shouldHideModelPicker(getRoutingSnapshot())).toBe(true);
    publishRouting({ mode: "manual", candidateCount: 1 });
    expect(shouldHideModelPicker(getRoutingSnapshot())).toBe(false);
    off();
    expect(seen).toEqual(["manual", "smart", "manual"]);
  });

  it("captures Enter in the composer card when the smart pool is empty", () => {
    const root = {
      listener: undefined as ((event: Event) => void) | undefined,
      addEventListener(type: string, listener: (event: Event) => void) {
        if (type === "keydown") this.listener = listener;
      },
      removeEventListener(type: string) {
        if (type === "keydown") this.listener = undefined;
      },
    };
    let blocked = 0;
    const off = installComposerEnterGuard(root as unknown as ParentNode, {
      shouldBlock: () => true,
      onBlocked: () => {
        blocked += 1;
      },
    });
    const target = {
      closest(selector: string) {
        return selector.includes("contenteditable") ? this : null;
      },
    };
    const event = {
      defaultPrevented: false,
      key: "Enter",
      shiftKey: false,
      isComposing: false,
      repeat: false,
      target,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {},
    };
    root.listener?.(event as unknown as Event);
    expect(event.defaultPrevented).toBe(true);
    expect(blocked).toBe(1);
    off();
    expect(root.listener).toBeUndefined();
  });

  it("occupies the host model seat instead of disabling a visible picker", () => {
    const install = readFileSync(new URL("../src/client/install-smart-ux.ts", import.meta.url), "utf8");
    const seat = readFileSync(new URL("../src/client/SmartUx.tsx", import.meta.url), "utf8");
    const ux = readFileSync(new URL("../src/client/smart-ux.ts", import.meta.url), "utf8");
    expect(MODEL_SEAT_SLOT).toBe("conversation.input.model");
    expect(SMART_DOCK_SLOT).toBe("conversation.input.dock");
    expect(SHADOW_PRIORITY).toBeLessThan(0);
    expect(install).toContain("MODEL_SEAT_SLOT");
    expect(install).toContain("shouldHideModelPicker");
    expect(install).toContain("HiddenModelSeat");
    expect(install).toContain("disposeSeat");
    expect(seat).toContain("export function HiddenModelSeat(): null");
    expect(seat).toContain("return null");
    expect(seat).not.toMatch(/disabled=\{true\}/);
    expect(ux).not.toMatch(/pointer-events:\s*none/);
    expect(ux).not.toMatch(/aria-disabled/);
  });
});
