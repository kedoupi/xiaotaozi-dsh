import { expect, it } from "vitest";
import {
  DEFAULT_CAPTAIN_NAME,
  displayCaptainName,
  normalizeRoster,
  usageIdentityText,
} from "../src/names.ts";

it("defaults an empty captain name to 张老板", () => {
  expect(displayCaptainName(undefined)).toBe(DEFAULT_CAPTAIN_NAME);
  expect(displayCaptainName("  ")).toBe("张老板");
  expect(displayCaptainName("阿江")).toBe("阿江");
});

it("drops blank, duplicate, and reserved roster names", () => {
  expect(normalizeRoster([
    { name: " 设计师 ", role: " 视觉 " },
    { name: "设计师", role: "重复" },
    { name: "captain" },
    { name: "  " },
    { name: "工程师" },
  ])).toEqual([
    { name: "设计师", role: "视觉" },
    { name: "工程师" },
  ]);
});

it("tells the captain to use the preset roster when one exists", () => {
  const text = usageIdentityText("张老板", [{ name: "设计师", role: "视觉" }]);
  expect(text).toContain("张老板");
  expect(text).toContain("设计师（视觉）");
  expect(text).toContain("to=captain");
  expect(text).toContain("Do not invent English names");
});
