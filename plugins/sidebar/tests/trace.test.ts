import { expect, it } from "vitest";
import { pluginTrace, pluginTraceEnabled, sanitizeTraceArg, TRACE_NS } from "../src/trace.ts";

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
  pluginTrace("tool terminal_create start", { DSH_PLUGIN_TRACE: "1" }, (chunk) => {
    chunks.push(chunk);
  });
  expect(chunks).toEqual([`[${TRACE_NS}] tool terminal_create start\n`]);
});

it("sanitizeTraceArg redacts secret-shaped keys", () => {
  expect(sanitizeTraceArg({ token: "private-secret" })).toContain("<redacted>");
  expect(sanitizeTraceArg({ token: "private-secret" })).not.toContain("private-secret");
});
