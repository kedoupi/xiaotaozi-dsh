import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  createDialogStack,
  focusDialogInitial,
  registerDialogKeys,
  restoreDialogFocus,
} from "../src/client/dialog-focus.ts";

const focusSource = readFileSync(
  new URL("../src/client/dialog-focus.ts", import.meta.url),
  "utf8",
);

function target(connected: boolean, calls: string[], name: string) {
  return {
    isConnected: connected,
    focus: () => calls.push(name),
  };
}

function keyEvent(key: string, calls: string[], shiftKey = false) {
  return {
    key,
    shiftKey,
    preventDefault: () => calls.push("prevent"),
    stopPropagation: () => calls.push("stop"),
  };
}

function keyScope(
  calls: string[],
  active: ReturnType<typeof target>,
  first: ReturnType<typeof target>,
  last: ReturnType<typeof target>,
  name: string,
) {
  return {
    close: () => calls.push(`${name}-close`),
    focusable: () => [first, last],
    activeElement: () => active,
    contains: (candidate: unknown) => candidate === first || candidate === last,
    focusDialog: () => calls.push(`${name}-dialog`),
  };
}

type FakeKeyEvent = ReturnType<typeof keyEvent>;

function keyTarget() {
  const listeners: Array<(event: FakeKeyEvent) => void> = [];
  return {
    target: {
      addKeyListener(listener: (event: FakeKeyEvent) => void) {
        listeners.push(listener);
      },
      removeKeyListener(listener: (event: FakeKeyEvent) => void) {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      },
    },
    dispatch(event: FakeKeyEvent) {
      for (const listener of [...listeners]) listener(event);
    },
    count: () => listeners.length,
  };
}

it("executes nested Escape and Tab only through the registered top handler", () => {
  const calls: string[] = [];
  const stack = createDialogStack<object>();
  const keys = keyTarget();
  const outer = {};
  const inner = {};
  const outerFirst = target(true, calls, "outer-first");
  const outerLast = target(true, calls, "outer-last");
  const innerFirst = target(true, calls, "inner-first");
  const innerLast = target(true, calls, "inner-last");
  expect(focusSource).toMatch(
    /const unregister = registerDialogKeys\(\s*\{\s*addKeyListener: \(listener\) =>\s*document\.addEventListener\("keydown", listener, true\),\s*removeKeyListener: \(listener\) =>\s*document\.removeEventListener\("keydown", listener, true\),\s*\},\s*dialogStack,\s*dialog,/u,
  );
  const unregisterOuter = registerDialogKeys(
    keys.target,
    stack,
    outer,
    keyScope(calls, outerLast, outerFirst, outerLast, "outer"),
  );
  const unregisterInner = registerDialogKeys(
    keys.target,
    stack,
    inner,
    keyScope(calls, innerFirst, innerFirst, innerLast, "inner"),
  );

  keys.dispatch(keyEvent("Tab", calls, true));
  expect(calls).toEqual(["prevent", "inner-last"]);

  calls.length = 0;
  keys.dispatch(keyEvent("Escape", calls));
  expect(calls).toEqual(["prevent", "stop", "inner-close"]);
  unregisterInner();
  unregisterOuter();
});

it("returns key ownership to outer and cleans StrictMode-like listeners and stack", () => {
  const calls: string[] = [];
  const stack = createDialogStack<object>();
  const keys = keyTarget();
  const outer = {};
  const inner = {};
  const focus = target(true, calls, "focus");
  const unregisterOuter = registerDialogKeys(
    keys.target,
    stack,
    outer,
    keyScope(calls, focus, focus, focus, "outer"),
  );
  const unregisterInner = registerDialogKeys(
    keys.target,
    stack,
    inner,
    keyScope(calls, focus, focus, focus, "inner"),
  );
  expect(keys.count()).toBe(2);

  unregisterInner();
  unregisterInner();
  expect(keys.count()).toBe(1);
  keys.dispatch(keyEvent("Tab", calls));
  expect(calls).toEqual(["prevent", "focus"]);
  calls.length = 0;
  keys.dispatch(keyEvent("Escape", calls));
  expect(calls).toEqual(["prevent", "stop", "outer-close"]);

  unregisterOuter();
  unregisterOuter();
  expect(keys.count()).toBe(0);
  const remount = registerDialogKeys(
    keys.target,
    stack,
    outer,
    keyScope(calls, focus, focus, focus, "remount"),
  );
  expect(keys.count()).toBe(1);
  calls.length = 0;
  keys.dispatch(keyEvent("Escape", calls));
  expect(calls).toEqual(["prevent", "stop", "remount-close"]);
  remount();
  remount();
  expect(keys.count()).toBe(0);
  calls.length = 0;
  keys.dispatch(keyEvent("Escape", calls));
  expect(calls).toEqual([]);
});

it("uses the explicit safe initial focus before other dialog actions", () => {
  const calls: string[] = [];
  const cancel = target(true, calls, "cancel");
  const danger = target(true, calls, "danger");
  const dialog = target(true, calls, "dialog");
  focusDialogInitial(cancel, [danger], dialog);
  expect(calls).toEqual(["cancel"]);
  expect(focusSource).toMatch(
    /focusDialogInitial\(initialFocus\?\.current, focusable\(\), dialog\)/u,
  );
});

it("restores the exact connected opener after cancel or Escape", () => {
  const calls: string[] = [];
  restoreDialogFocus(
    target(true, calls, "opener"),
    target(true, calls, "fallback"),
  );
  expect(calls).toEqual(["opener"]);
});

it("prefers an opener captured before its parent becomes hidden", () => {
  const calls: string[] = [];

  restoreDialogFocus(
    target(true, calls, "late-active-element"),
    target(true, calls, "fallback"),
    target(true, calls, "opener"),
  );

  expect(calls).toEqual(["opener"]);
});

it("restores a stable fallback when successful deletion removed the opener", () => {
  const calls: string[] = [];
  restoreDialogFocus(
    target(false, calls, "opener"),
    target(true, calls, "fallback"),
  );
  expect(calls).toEqual(["fallback"]);
});

it("skips a late active element when the preferred opener was removed", () => {
  const calls: string[] = [];

  restoreDialogFocus(
    target(true, calls, "late-active-element"),
    target(true, calls, "fallback"),
    target(false, calls, "removed-opener"),
  );

  expect(calls).toEqual(["fallback"]);
});
