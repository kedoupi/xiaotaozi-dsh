import { describe, expect, it } from "vitest";
import { coalesce, isModelsNavLabel } from "../src/client/hide-official.ts";

it("matches the host Models nav labels", () => {
  expect(isModelsNavLabel("模型")).toBe(true);
  expect(isModelsNavLabel("Models")).toBe(true);
  expect(isModelsNavLabel("设置模型")).toBe(true);
  expect(isModelsNavLabel("记忆")).toBe(false);
});

describe("coalesce", () => {
  it("folds a burst of triggers into one deferred run", () => {
    const pending: Array<() => void> = [];
    let runs = 0;
    const trigger = coalesce(() => {
      runs += 1;
    }, (callback) => pending.push(callback));

    trigger();
    trigger();
    trigger();
    expect(runs).toBe(0);
    expect(pending).toHaveLength(1);

    pending.shift()?.();
    expect(runs).toBe(1);
  });

  it("accepts new triggers after a run completes", () => {
    const pending: Array<() => void> = [];
    let runs = 0;
    const trigger = coalesce(() => {
      runs += 1;
    }, (callback) => pending.push(callback));

    trigger();
    pending.shift()?.();
    trigger();
    trigger();
    pending.shift()?.();
    expect(runs).toBe(2);
    expect(pending).toHaveLength(0);
  });

  it("defers through queueMicrotask by default", async () => {
    let runs = 0;
    const trigger = coalesce(() => {
      runs += 1;
    });
    trigger();
    trigger();
    expect(runs).toBe(0);
    await Promise.resolve();
    expect(runs).toBe(1);
  });
});
