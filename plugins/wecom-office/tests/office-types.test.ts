import { expect, it } from "vitest";
import { isOfficeStatusPayload } from "../src/office-types.ts";

it("accepts a snapshot and rejects a bare HTTP error body", () => {
  expect(isOfficeStatusPayload({
    ok: true,
    imAvailable: false,
    cliInstalled: true,
    mainStatus: "unbound",
    selectedBotId: "",
    activeBotId: "",
    authorized: false,
    bots: [],
    qr: null,
    configDir: "/tmp",
    cliPath: "wecom-cli",
    writable: true,
    guidance: true,
  })).toBe(true);
  expect(isOfficeStatusPayload({ ok: false, error: "select needs botId" })).toBe(false);
});
