import { expect, it } from "vitest";
import {
  isCliProbe,
  pluginTrace,
  pluginTraceEnabled,
  redactArgv,
  sanitizeTraceArg,
  shortId,
  TRACE_NS,
} from "../src/trace.ts";

it("pluginTraceEnabled follows DSH_PLUGIN_TRACE then the sandbox marker", () => {
  expect(pluginTraceEnabled({})).toBe(false);
  expect(pluginTraceEnabled({ DSH_PLUGIN_TRACE: "1" })).toBe(true);
  expect(pluginTraceEnabled({ DSH_PLUGIN_TRACE: "0" })).toBe(false);
  expect(pluginTraceEnabled({ XIAOTAOZI_DSH_SANDBOX: "marker" })).toBe(true);
  expect(pluginTraceEnabled({ XIAOTAOZI_DSH_SANDBOX: "marker", DSH_PLUGIN_TRACE: "0" })).toBe(false);
});

it("pluginTrace is a no-op when disabled", () => {
  const chunks: string[] = [];
  pluginTrace("rpc action=status", { DSH_PLUGIN_TRACE: "0" }, (chunk) => {
    chunks.push(chunk);
  });
  expect(chunks).toEqual([]);
});

it("pluginTrace writes one namespaced line when enabled", () => {
  const chunks: string[] = [];
  pluginTrace("activate source=im ok", { DSH_PLUGIN_TRACE: "1" }, (chunk) => {
    chunks.push(chunk);
  });
  expect(chunks).toEqual([`[${TRACE_NS}] activate source=im ok\n`]);
});

it("redacts secrets and shortens bot ids in argv", () => {
  expect(shortId("wecom_aaaaaaaaaaaaaaaaaaaaaaaa")).toBe("wecom_aaaaaa…");
  expect(redactArgv(["auth", "init", "--bot-id", "aibot_long_id_value", "--secret", "super-secret"])).toBe(
    "auth init --bot-id aibot_lo… --secret <redacted>",
  );
  expect(sanitizeTraceArg({ secret: "private-secret", keywords: ["周报"] })).toContain("<redacted>");
  expect(sanitizeTraceArg({ secret: "private-secret" })).not.toContain("private-secret");
  expect(isCliProbe(["--version"])).toBe(true);
  expect(isCliProbe(["auth", "show", "--status"])).toBe(true);
  expect(isCliProbe(["doc", "search"])).toBe(false);
});
