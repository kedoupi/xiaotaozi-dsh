import { afterEach, expect, it, vi } from "vitest";
import { join } from "node:path";

import {
  isJourneyBreak,
  journeyFilePath,
  localDay,
  serializeJourney,
  writeJourney,
} from "../src/journey-trace.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

it("writes sandbox JSONL without message bodies and marks breaks", async () => {
  const lines: string[] = [];
  const traces: string[] = [];
  const now = new Date("2026-08-29T16:04:00.000Z");
  const env = { DSH_PLUGIN_TRACE: "1", DSH_HOME: "/tmp/dsh-home-test" };
  const record = await writeJourney(
    {
      channel: "wecom",
      event: "stream_fail",
      msgid: "CAIQz7-very-long-message-id-value",
      streamId: "stream-abcdefghijklmnopqrstuvwxyz",
      chat: "direct:ZhangSan",
      reason: "start-failed",
      ms: 12.4,
    },
    {
      env,
      now,
      append: async (file, line) => {
        expect(file).toBe(join("/tmp/dsh-home-test", "traces", `${localDay(now)}.jsonl`));
        lines.push(line);
      },
      trace: (ns, message) => {
        traces.push(`[${ns}] ${message}`);
      },
    },
  );
  expect(record?.break).toBe(true);
  expect(JSON.parse(lines[0])).toMatchObject({
    plugin: "dsh-im",
    channel: "wecom",
    event: "stream_fail",
    break: true,
    reason: "start-failed",
    chat: "direct",
    ms: 12,
  });
  expect(lines[0]).not.toContain("ZhangSan");
  expect(traces[0]).toMatch(/journey event=stream_fail break=1/);
});

it("is a no-op when trace is off and rejects unknown events", async () => {
  const append = vi.fn();
  expect(await writeJourney({ channel: "wecom", event: "inbound" }, {
    env: { DSH_PLUGIN_TRACE: "0" },
    append,
  })).toBeNull();
  expect(append).not.toHaveBeenCalled();
  expect(serializeJourney({ channel: "wecom", event: "not-a-real-event" })).toBeNull();
  expect(serializeJourney({ channel: "wecom", event: "abandon", reason: "drop table users" })?.reason).toBeUndefined();
});

it("classifies journey breaks and names daily files under DSH_HOME", () => {
  expect(isJourneyBreak("inbound")).toBe(false);
  expect(isJourneyBreak("finish", "ok")).toBe(false);
  expect(isJourneyBreak("finish", "fail")).toBe(true);
  expect(isJourneyBreak("ws_kick")).toBe(true);
  expect(journeyFilePath(new Date("2026-01-02T03:04:05"), {})).toBeNull();
  expect(journeyFilePath(new Date(2026, 0, 2), { DSH_HOME: "/home/.dsh-home" })).toBe(
    join("/home/.dsh-home", "traces", "2026-01-02.jsonl"),
  );
});
