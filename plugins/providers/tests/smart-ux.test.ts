import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CAPABILITY_IMAGE_GUIDE, EMPTY_POOL_GUIDE } from "../src/router/empty-pool.ts";
import { zh } from "../src/client/locales.ts";
import { css } from "../src/client/styles.ts";
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
  SMART_DOCK_ID,
  SMART_DOCK_ORDER,
  SMART_DOCK_SLOT,
  SMART_UX_DOCK_LAYOUT,
  formatAssistantModelChip,
  formatTurnModelDetail,
  formatTurnModelLabel,
  pickComposerCardFromChildren,
  shouldBlockSmartSend,
  shouldHideModelPicker,
  shouldShowTurnModelChip,
  SMART_UX_REFRESH_MS,
  smartUxDockRegistration,
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
    expect(EMPTY_POOL_GUIDE).toBe("还没有可自动选择的模型。请到插件中心 → 已安装 → 模型勾选至少一个已授权模型。");
    expect(EMPTY_POOL_GUIDE).toContain("勾选");
    expect(CAPABILITY_IMAGE_GUIDE).toContain("支持图片输入");
    expect(CAPABILITY_IMAGE_GUIDE).toContain("插件中心 → 已安装 → 模型");
    expect(CAPABILITY_IMAGE_GUIDE).not.toContain("设置 → 模型");
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

  it("joins the composer dock as a list row, not a shadowed single seat", () => {
    const install = readFileSync(new URL("../src/client/install-smart-ux.ts", import.meta.url), "utf8");
    const seat = readFileSync(new URL("../src/client/SmartUx.tsx", import.meta.url), "utf8");
    const dock = smartUxDockRegistration();
    expect(dock).toEqual({
      name: "conversation.input.dock",
      id: SMART_DOCK_ID,
      order: SMART_DOCK_ORDER,
    });
    expect(SMART_DOCK_ORDER).toBeGreaterThan(20);
    expect(install).toContain("smartUxDockRegistration");
    expect(install).toContain("...smartUxDockRegistration()");
    expect(install).not.toMatch(/smartUxDockRegistration\(\)[\s\S]{0,80}priority:\s*SHADOW_PRIORITY/);
    expect(seat).toContain('className="dshM-turnModel"');
    expect(seat).toContain("formatTurnModelLabel");
    expect(seat).toContain("dshM-turnModelName");
    expect(seat).toContain("dshM-turnModelKicker");
    expect(seat).toContain("aria-label={turnLabel}");
    expect(seat).not.toMatch(/<details className="dshM-turnModel"/);
    expect(seat).not.toMatch(/<summary>本轮模型<\/summary>/);
    expect(seat).not.toMatch(/<details[^>]*\sopen(?:[\s>=]|$)/u);
    expect(css).toContain(`width: ${SMART_UX_DOCK_LAYOUT.width}`);
    expect(css).toContain(`margin-inline: ${SMART_UX_DOCK_LAYOUT.marginInline}`);
    expect(css).toContain(`position: ${SMART_UX_DOCK_LAYOUT.position}`);
    expect(css).toContain("*:has(> .dshM-smartUx)");
    expect(css).not.toMatch(/\.dshM-smartUx\s*\{[^}]*position:\s*(absolute|fixed)/);
    expect(css).not.toMatch(/\.dshM-turnModel\s*\{[^}]*position:\s*(absolute|fixed)/);
    expect(css).toMatch(/@media \(max-width: 720px\)[\s\S]*\.dshM-smartUx\s*\{[\s\S]*width:\s*100%/);
    expect(install).not.toContain("conversation.chat.turnTail");
    expect(install).not.toContain("conversation.chat.assistant-actions");
    expect(seat).toContain("attachDockToComposerCard");
    expect(seat).toContain("SMART_UX_REFRESH_MS");
    expect(seat).not.toMatch(/\shidden(?:[\s/>]|$)/);
    expect(css).toContain('*:has(> .dshM-smartUx[data-empty="1"])');
    expect(css).not.toContain(".dshM-smartUx[hidden]");
  });

  it("paints the turn model as a muted composer-edge chip, not a naked ink row", () => {
    const seat = readFileSync(new URL("../src/client/SmartUx.tsx", import.meta.url), "utf8");
    expect(css).toMatch(/\.dshM-smartUx\s*\{[^}]*--dshM-muted:\s*var\(--dsw-alias-label-secondary/);
    expect(css).toMatch(/\.dshM-smartUx\s*\{[^}]*justify-content:\s*flex-start/);
    expect(css).toMatch(/\.dshM-turnModel\s*\{[^}]*display:\s*inline-flex/);
    expect(css).toMatch(/\.dshM-turnModel\s*\{[^}]*border-radius:\s*999px/);
    expect(css).toMatch(/\.dshM-turnModel\s*\{[^}]*font-size:\s*11px/);
    expect(css).toMatch(/\.dshM-turnModelKicker\s*\{[^}]*font-size:\s*11px/);
    expect(css).toMatch(/\.dshM-turnModelDetail\s*>\s*summary\s*\{[^}]*font-size:\s*11px/);
    expect(css).toMatch(/\.dshM-turnModelDetail\s*>\s*summary\s*\{[^}]*opacity:\s*0\.72/);
    expect(seat).toContain("<span className=\"dshM-turnModelKicker\">本轮模型</span>");
    expect(seat).toContain("{last.displayName.trim()}");
    expect(css).not.toMatch(/\.dshM-smartUx\s*\{[^}]*position:\s*(absolute|fixed)/);
    expect(css).not.toMatch(/\.dshM-turnModel\s*\{[^}]*position:\s*(absolute|fixed)/);
  });

  it("shows the turn model name by default and never invents a placeholder", () => {
    expect(formatTurnModelLabel("DeepSeek V3")).toBe("本轮模型：DeepSeek V3");
    expect(formatTurnModelLabel("  ")).toBeUndefined();
    expect(formatTurnModelDetail({
      provider: "deepseek",
      model: "deepseek-chat",
      displayName: "DeepSeek V3",
    })).toBe("deepseek / deepseek-chat");
    expect(formatTurnModelDetail({
      provider: "p",
      model: "M",
      displayName: "p / M",
    })).toBeUndefined();
    expect(formatAssistantModelChip("DeepSeek V3")).toBe("模型：DeepSeek V3");
    expect(formatAssistantModelChip("")).toBeUndefined();
    expect(shouldShowTurnModelChip({
      mode: "smart",
      lastSelected: { provider: "p", model: "m", displayName: "M" },
    })).toBe(true);
    expect(shouldShowTurnModelChip({
      mode: "manual",
      lastSelected: { provider: "p", model: "m", displayName: "M" },
    })).toBe(false);
    expect(shouldShowTurnModelChip({ mode: "smart" })).toBe(false);
    expect(shouldShowTurnModelChip({
      mode: "smart",
      lastSelected: { provider: "p", model: "m", displayName: "   " },
    })).toBe(false);
  });

  it("attaches the dock cell to the composer card, the last stack sibling", () => {
    const dock = { id: "dock", contains: (other: { id: string }) => other.id === "chip" };
    const card = { id: "card", contains: () => false };
    expect(pickComposerCardFromChildren([dock, card], dock)).toEqual(card);
    expect(pickComposerCardFromChildren([dock], dock)).toBeUndefined();
    expect(SMART_UX_REFRESH_MS[0]).toBeLessThan(800);
  });
});
