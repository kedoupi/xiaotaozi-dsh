import { describe, expect, it } from "vitest";
import { createPluginCenterOpen, type CenterLocation, type CenterSnapshot } from "../src/client/plugin-center-open.ts";

const list: CenterLocation = { tab: "discover", query: "memory", tag: "记忆", scrollTop: 220 };

describe("plugin center navigation", () => {
  it("opens installed by default and preserves a caller-owned list return location", () => {
    const center = createPluginCenterOpen();
    expect(center.getSnapshot()).toEqual({
      open: false, location: { tab: "installed", query: "", tag: "", scrollTop: 0 },
    });
    center.open();
    expect(center.getSnapshot().open).toBe(true);
    center.navigate(list);
    center.navigate({ ...list, detail: { kind: "catalog", id: "opencontext" } });
    expect(center.getSnapshot().location.detail).toEqual({ kind: "catalog", id: "opencontext" });
    center.navigate(list);
    expect(center.getSnapshot().location).toEqual(list);
    center.close();
    expect(center.getSnapshot()).toEqual({ open: false, location: list });
  });

  it("keeps the current visit on repeated open but resets a fresh visit", () => {
    const center = createPluginCenterOpen();
    center.open();
    center.navigate({ ...list, detail: { kind: "installed", id: "external-extra" } });
    const detail = center.getSnapshot();
    center.open();
    expect(center.getSnapshot()).toBe(detail);
    center.close();
    center.open();
    expect(center.getSnapshot()).toEqual({
      open: true, location: { tab: "installed", query: "", tag: "", scrollTop: 0 },
    });
  });

  it("caches snapshots until mutation and notifies subscribers after publishing", () => {
    const center = createPluginCenterOpen();
    const initial = center.getSnapshot();
    expect(center.getSnapshot()).toBe(initial);
    const seen: CenterSnapshot[] = [];
    center.subscribe(() => seen.push(center.getSnapshot()));
    center.close();
    expect(center.getSnapshot()).toBe(initial);
    expect(seen).toEqual([]);
    center.open();
    const opened = center.getSnapshot();
    expect(opened).not.toBe(initial);
    expect(seen).toEqual([opened]);
    center.open();
    expect(center.getSnapshot()).toBe(opened);
    expect(seen).toHaveLength(1);
    center.navigate(list);
    const navigated = center.getSnapshot();
    expect(navigated).not.toBe(opened);
    expect(center.getSnapshot()).toBe(navigated);
    expect(seen).toEqual([opened, navigated]);
    center.close();
    const closed = center.getSnapshot();
    expect(closed).not.toBe(navigated);
    expect(seen).toEqual([opened, navigated, closed]);
    center.close();
    expect(center.getSnapshot()).toBe(closed);
    expect(seen).toHaveLength(3);
  });

  it("stops only the unsubscribed listener without preventing navigation", () => {
    const center = createPluginCenterOpen();
    let removedCalls = 0;
    let retainedCalls = 0;
    const unsubscribe = center.subscribe(() => removedCalls++);
    center.subscribe(() => retainedCalls++);
    center.open();
    unsubscribe();
    unsubscribe();
    center.navigate(list);
    center.close();
    expect(removedCalls).toBe(1);
    expect(retainedCalls).toBe(3);
    expect(center.getSnapshot()).toEqual({ open: false, location: list });
  });

  it("keeps navigation and subscribers isolated between store instances", () => {
    const first = createPluginCenterOpen();
    const second = createPluginCenterOpen();
    const initial = second.getSnapshot();
    let calls = 0;
    second.subscribe(() => calls++);
    first.open();
    first.navigate({ ...list, detail: { kind: "capability", id: "models" } });
    expect(first.getSnapshot().location.detail).toEqual({ kind: "capability", id: "models" });
    expect(second.getSnapshot()).toBe(initial);
    expect(calls).toBe(0);
  });
});
