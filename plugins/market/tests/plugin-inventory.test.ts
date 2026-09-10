import { describe, expect, it } from "vitest";
import { loadPluginInventory, runtimeChip, runtimeStateFor, type InventoryEntry } from "../src/client/plugin-inventory.ts";

const packageName = "@example/extra";
const row = (fiberPhase: InventoryEntry["fiberPhase"], enabled = true): InventoryEntry => ({
  moduleName: packageName, enabled, fiberPhase,
});

describe("loadPluginInventory", () => {
  it("returns unknown when the Remote is unavailable", async () => {
    expect(await loadPluginInventory(undefined)).toBeUndefined();
  });

  it("returns unknown on a rejected inventory call", async () => {
    expect(await loadPluginInventory({
      pluginInventory: { list: async () => { throw Error("offline"); } },
    })).toBeUndefined();
  });

  it("returns unknown for a failed Remote result", async () => {
    expect(await loadPluginInventory({
      pluginInventory: { list: async () => ({ ok: false, error: { code: "UNAVAILABLE", message: "offline" } }) },
    })).toBeUndefined();
  });

  it("reads successful entries without changing the read-only snapshot", async () => {
    const entries = Object.freeze([Object.freeze(row("active"))]);
    expect(await loadPluginInventory({
      pluginInventory: { list: async () => ({ ok: true, value: { entries } }) },
    })).toBe(entries);
  });

  it("distinguishes a successful empty inventory from an unknown inventory", async () => {
    expect(await loadPluginInventory({
      pluginInventory: { list: async () => ({ ok: true, value: { entries: [] } }) },
    })).toEqual([]);
  });
});

describe("runtimeChip", () => {
  it("hides unknown and keeps named states", () => {
    expect(runtimeChip("unknown")).toBeUndefined();
    expect(runtimeChip("running")).toBe("running");
    expect(runtimeChip("error")).toBe("error");
  });
});

describe("runtimeStateFor", () => {
  it.each([
    { name: "unavailable", inventory: undefined },
    { name: "empty", inventory: [] },
  ])("keeps $name inventory rows unknown", ({ inventory }) => {
    expect(runtimeStateFor(packageName, inventory)).toBe("unknown");
  });

  it.each([
    ["pending", "loading"],
    ["loading", "loading"],
    ["active", "running"],
    ["failed", "error"],
    ["unloading", "loading"],
    [null, "unknown"],
  ] as const)("projects enabled phase %s as %s", (phase, expected) => {
    expect(runtimeStateFor(packageName, [row(phase)])).toBe(expected);
  });

  it.each(["pending", "loading", "active", "failed", "unloading", null] as const)(
    "projects disabled phase %s as disabled even if it failed", (phase) => {
      expect(runtimeStateFor(packageName, [row(phase, false)])).toBe("disabled");
    },
  );

  it.each([
    ["extra", "extra"],
    ["extra", "extra/client"],
    [packageName, packageName],
    [packageName, "@example/extra/client"],
    [packageName, "@example/extra/client/nested"],
  ])("matches only the exact package or its submodule (%s, %s)", (name, moduleName) => {
    expect(runtimeStateFor(name, [{ moduleName, enabled: true, fiberPhase: "active" }])).toBe("running");
  });

  it.each([
    ["extra", "extra-other"],
    ["extra", "@example/extra"],
    ["extra", "parent/extra"],
    [packageName, "@example/extra-other/client"],
    [packageName, "@other/extra"],
    [packageName, "Extra Plugin"],
    [packageName, "github:example/extra#path:plugins/extra"],
    [packageName, "link:/temporary/@example/extra"],
  ])("does not guess a package match (%s, %s)", (name, moduleName) => {
    expect(runtimeStateFor(name, [{ moduleName, enabled: true, fiberPhase: "active" }])).toBe("unknown");
  });

  it.each([
    [[row("active"), row("active")], "running"],
    [[row("active"), row(null)], "unknown"],
    [[row("active"), row("pending")], "loading"],
    [[row("loading"), row("failed")], "error"],
    [[row("failed"), row("unloading")], "error"],
    [[row(null), row("pending")], "loading"],
    [[row("failed", false), row("active")], "running"],
    [[row("loading", false), row("active")], "running"],
    [[row("active", false), row(null)], "unknown"],
    [[row("failed", false), row("loading", false)], "disabled"],
  ] as const)("combines matching rows %j as %s", (entries, expected) => {
    const inventory = entries.map((entry, index) => ({
      ...entry, moduleName: index === 0 ? packageName : `${packageName}/client`,
    }));
    expect(runtimeStateFor(packageName, inventory)).toBe(expected);
    expect(runtimeStateFor(packageName, [...inventory].reverse())).toBe(expected);
  });

  it("ignores unrelated failures without mutating inventory", () => {
    const inventory = Object.freeze([
      Object.freeze(row("active")),
      Object.freeze({ moduleName: "@example/extra-other", enabled: true, fiberPhase: "failed" as const }),
    ]);
    expect(runtimeStateFor(packageName, inventory)).toBe("running");
    expect(inventory).toEqual([row("active"), {
      moduleName: "@example/extra-other", enabled: true, fiberPhase: "failed",
    }]);
  });
});
