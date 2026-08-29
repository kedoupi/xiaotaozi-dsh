import { expect, it } from "vitest";
import { pluginTrace, pluginTraceEnabled, TRACE_NS } from "../src/trace.ts";

it("pluginTraceEnabled follows DSH_PLUGIN_TRACE then the sandbox marker", () => {
  expect(pluginTraceEnabled({})).toBe(false);
  expect(pluginTraceEnabled({ DSH_PLUGIN_TRACE: "1" })).toBe(true);
  expect(pluginTraceEnabled({ DSH_PLUGIN_TRACE: "0" })).toBe(false);
  expect(pluginTraceEnabled({ XIAOTAOZI_DSH_SANDBOX: "marker" })).toBe(true);
  expect(pluginTraceEnabled({ XIAOTAOZI_DSH_SANDBOX: "marker", DSH_PLUGIN_TRACE: "0" })).toBe(false);
});

it("pluginTrace is a no-op when disabled", () => {
  const chunks: string[] = [];
  pluginTrace("mounted", { DSH_PLUGIN_TRACE: "0" }, (chunk) => {
    chunks.push(chunk);
  });
  expect(chunks).toEqual([]);
});

it("pluginTrace writes one namespaced line when enabled", () => {
  const chunks: string[] = [];
  pluginTrace("intent action=install", { DSH_PLUGIN_TRACE: "1" }, (chunk) => {
    chunks.push(chunk);
  });
  expect(chunks).toEqual([`[${TRACE_NS}] intent action=install\n`]);
});
