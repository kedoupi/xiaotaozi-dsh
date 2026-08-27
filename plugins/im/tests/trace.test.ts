import { afterEach, expect, it, vi } from "vitest";
import {
  pluginSdkLogger,
  pluginTrace,
  pluginTraceEnabled,
  sanitizeTraceArg,
  shortId,
  shortKey,
  slashCommand,
} from "../src/trace.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

it("pluginTraceEnabled follows DSH_PLUGIN_TRACE then the sandbox marker", () => {
  expect(pluginTraceEnabled({})).toBe(false);
  expect(pluginTraceEnabled({ DSH_PLUGIN_TRACE: "1" })).toBe(true);
  expect(pluginTraceEnabled({ DSH_PLUGIN_TRACE: "0" })).toBe(false);
  expect(pluginTraceEnabled({ XIAOTAOZI_DSH_SANDBOX: "marker" })).toBe(true);
  expect(pluginTraceEnabled({ XIAOTAOZI_DSH_SANDBOX: "marker", DSH_PLUGIN_TRACE: "0" })).toBe(false);
});

it("pluginTrace is a no-op when disabled", () => {
  const chunks: string[] = [];
  pluginTrace("dsh-im:wecom", "inbound", { DSH_PLUGIN_TRACE: "0" }, (chunk) => {
    chunks.push(chunk);
  });
  expect(chunks).toEqual([]);
});

it("pluginTrace writes one namespaced line when enabled", () => {
  const chunks: string[] = [];
  pluginTrace(
    "dsh-im:wecom",
    "cmd=/new bound=session-ab → unbound",
    { DSH_PLUGIN_TRACE: "1" },
    (chunk) => {
      chunks.push(chunk);
    },
  );
  expect(chunks).toEqual(["[dsh-im:wecom] cmd=/new bound=session-ab → unbound\n"]);
});

it("short helpers never emit full ids or message bodies", () => {
  expect(shortId("session-ec3e804f-24d7-4555-87cc-8e49f674676c")).toBe("session-ec3e…");
  expect(shortKey("direct:ZhangSan")).toBe("direct");
  expect(shortKey("group:wrXXXXXXXX")).toBe("group");
  expect(slashCommand("/new")).toBe("/new");
  expect(slashCommand("  /Help please")).toBe("/help");
  expect(slashCommand("hello")).toBe("");
});

it("SDK logger stays silent unless trace is on and redacts secrets", () => {
  pluginSdkLogger("dsh-im:wecom", { DSH_PLUGIN_TRACE: "0" }).debug("raw payload", {
    secret: "private-secret",
  });
  expect(sanitizeTraceArg({ secret: "private-secret", msgid: "abc" })).toContain("<redacted>");
  expect(sanitizeTraceArg({ secret: "private-secret" })).not.toContain("private-secret");
  const chunks: string[] = [];
  const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    chunks.push(String(chunk));
    return true;
  });
  try {
    pluginSdkLogger("dsh-im:wecom", { DSH_PLUGIN_TRACE: "1" }).debug({
      secret: "private-secret",
      msgid: "abc",
    });
  } finally {
    write.mockRestore();
  }
  const joined = chunks.join("");
  expect(joined).toMatch(/\[dsh-im:wecom:sdk\]/);
  expect(joined).toMatch(/redacted/);
  expect(joined).not.toMatch(/private-secret/);
});
