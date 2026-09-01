import { expect, it } from "vitest";
import { restoreDialogFocus } from "../src/client/dialog-focus.ts";

function target(connected: boolean, calls: string[], name: string) {
  return {
    isConnected: connected,
    focus: () => calls.push(name),
  };
}

it("restores the exact connected opener after cancel or Escape", () => {
  const calls: string[] = [];
  restoreDialogFocus(target(true, calls, "opener"), target(true, calls, "fallback"));
  expect(calls).toEqual(["opener"]);
});

it("restores a stable fallback when successful deletion removed the opener", () => {
  const calls: string[] = [];
  restoreDialogFocus(target(false, calls, "opener"), target(true, calls, "fallback"));
  expect(calls).toEqual(["fallback"]);
});
