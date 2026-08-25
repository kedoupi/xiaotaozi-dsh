import { expect, it } from "vitest";
import { estimateMessage, estimateSystem, estimateToolSchema, firstText } from "../src/host/pricing";
import { isNewerVersion } from "../src/client/latestVersion";
import { fmt } from "../src/client/format";
import { headerAt } from "../src/client/assemble";

it("prices text like the token-meter heuristic", () => {
  expect(estimateSystem("You are a harness agent.")).toBeGreaterThan(0);
  expect(estimateMessage({ content: [{ type: "text", text: "Hi!" }] })).toBe(9);
  expect(estimateMessage({ content: [] }, true)).toBe(0);
  expect(firstText([{ type: "text", text: "  hello world  " }])).toBe("hello world");
  expect(estimateToolSchema({ name: "bash" })).toBeGreaterThan(0);
});

it("formats compact token counts", () => {
  expect(fmt(12)).toBe("12");
  expect(fmt(1500)).toBe("1.5k");
  expect(fmt(undefined)).toBe("—");
});

it("compares semver without hitting npm", () => {
  expect(isNewerVersion("0.21.1", "0.1.0")).toBe(true);
  expect(isNewerVersion("0.1.0", "0.21.1")).toBe(false);
});

it("picks the header epoch in force at a seq", () => {
  const headers = {
    headers: [
      { seq: 1, time: 1, system: "a", systemTokens: 1, tools: [], toolsTokens: 0 },
      { seq: 10, time: 2, system: "b", systemTokens: 1, tools: [], toolsTokens: 0 },
    ],
  };
  expect(headerAt(headers, 5)?.seq).toBe(1);
  expect(headerAt(headers, 11)?.seq).toBe(10);
  expect(headerAt(headers, null)?.seq).toBe(10);
  expect(headerAt(null, 1)).toBeNull();
});
