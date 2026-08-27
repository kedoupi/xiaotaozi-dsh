import { expect, it } from "vitest";
import { detectLoadedImPlugin } from "../src/im-available.ts";

it("treats a loaded im plugin as available", () => {
  expect(detectLoadedImPlugin({ values: () => [{ name: "im" }] })).toBe(true);
  expect(detectLoadedImPlugin({ values: () => [{ name: "dsh-im" }] })).toBe(true);
});

it("ignores other plugins and disk-like leftovers", () => {
  expect(detectLoadedImPlugin(undefined)).toBe(false);
  expect(detectLoadedImPlugin({ values: () => [{ name: "memory" }, { name: "wecom-office" }] })).toBe(false);
});
