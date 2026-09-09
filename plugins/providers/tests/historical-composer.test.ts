import { afterEach, describe, expect, it, vi } from "vitest";
import { HistoricalComposer } from "../src/client/HistoricalComposer.tsx";
import {
  publishRouting,
  resetRoutingLive,
} from "../src/client/routing-live.ts";
import type { Rpc } from "../src/client/workspace-shared.ts";

// Safe component lifecycle fixture, not a DOM renderer or browser acceptance.
const fixture = vi.hoisted(() => {
  let cursor = 0;
  const cells: unknown[] = [];
  const effects: Array<() => void> = [];
  const cleanups = new Map<number, () => void>();
  const remove = vi.fn();
  const mount = vi.fn(() => remove);
  return {
    mount,
    remove,
    begin() {
      cursor = 0;
    },
    flush() {
      for (const run of effects.splice(0)) run();
    },
    dispose() {
      for (const cleanup of cleanups.values()) cleanup();
      cleanups.clear();
    },
    reset() {
      cells.length = 0;
      effects.length = 0;
      cursor = 0;
      mount.mockClear();
      remove.mockClear();
    },
    state(initial: unknown) {
      const index = cursor++;
      if (!(index in cells))
        cells[index] = typeof initial === "function" ? initial() : initial;
      return [
        cells[index],
        (next: unknown) => {
          cells[index] = typeof next === "function" ? next(cells[index]) : next;
        },
      ];
    },
    effect(effect: () => void | (() => void), deps: unknown[]) {
      const index = cursor++;
      const previous = cells[index] as unknown[] | undefined;
      if (
        previous &&
        previous.length === deps.length &&
        deps.every((value, i) => Object.is(value, previous[i]))
      )
        return;
      cells[index] = deps;
      effects.push(() => {
        cleanups.get(index)?.();
        cleanups.delete(index);
        const cleanup = effect();
        if (cleanup) cleanups.set(index, cleanup);
      });
    },
  };
});
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: fixture.state,
  useLayoutEffect: fixture.effect,
}));
vi.mock("../src/client/historical-composer.ts", () => ({
  mountHistoricalComposer: fixture.mount,
}));

afterEach(() => {
  fixture.dispose();
  fixture.reset();
  resetRoutingLive();
  vi.unstubAllGlobals();
});
const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const historical = {
  mode: "smart" as const,
  candidateCount: 2,
  attribution: "historical" as const,
  lastSelected: {
    provider: "fixture",
    model: "m",
    displayName: "Historical fixture",
  },
};
function render(rpc: Rpc, phase: string, current?: string) {
  fixture.begin();
  HistoricalComposer({
    rpc,
    useSessions: (select) => select({ phase, current }),
  });
  fixture.flush();
}

describe("HistoricalComposer root identity", () => {
  it.each([
    ["loading", undefined],
    ["ready", "A"],
    ["loading", "A"],
  ])("never treats %s/%s as historical absence", async (phase, current) => {
    publishRouting(historical);
    const call = vi.fn(async () => ({ ok: true, value: historical }));
    render({ call }, phase!, current);
    await settle();
    expect(call).not.toHaveBeenCalled();
    expect(fixture.mount).not.toHaveBeenCalled();
  });

  it("mounts only an attributed historical result and removes it synchronously on selection", async () => {
    vi.stubGlobal("document", {});
    publishRouting({ mode: "smart", candidateCount: 2 });
    const call = vi.fn(async () => ({ ok: true, value: historical }));
    const rpc = { call };
    render(rpc, "ready");
    await settle();
    render(rpc, "ready");
    expect(call).toHaveBeenCalledWith("/providers-auth", "routing", {});
    expect(fixture.mount).toHaveBeenLastCalledWith(
      document,
      "历史模型：Historical fixture",
    );
    render(rpc, "ready", "A");
    expect(fixture.remove).toHaveBeenCalledTimes(1);
    await settle();
    expect(fixture.mount).toHaveBeenCalledTimes(1);
  });

  it.each(["selection", "loading", "disposal", "manual"])(
    "rejects a delayed no-session result after %s",
    async (change) => {
      vi.stubGlobal("document", {});
      publishRouting({ mode: "smart", candidateCount: 2 });
      let resolve!: (result: { ok: true; value: typeof historical }) => void;
      const rpc = {
        call: vi.fn(
          () =>
            new Promise<{ ok: true; value: typeof historical }>((done) => {
              resolve = done;
            }),
        ),
      };
      render(rpc, "ready");
      if (change === "disposal") fixture.dispose();
      else if (change === "manual")
        publishRouting({ mode: "manual", candidateCount: 2 });
      else
        render(
          rpc,
          change === "loading" ? "loading" : "ready",
          change === "selection" ? "A" : undefined,
        );
      resolve({ ok: true, value: historical });
      await settle();
      if (change !== "disposal")
        render(
          rpc,
          change === "loading" ? "loading" : "ready",
          change === "selection" ? "A" : undefined,
        );
      expect(fixture.mount).not.toHaveBeenCalled();
    },
  );
});
