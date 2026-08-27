import { expect, it } from "vitest";
import { deriveImBotIdentity } from "../src/identity.ts";
import { parseImWecomConfig } from "../src/im-bridge.ts";

it("accepts a valid IM config document", () => {
  const remoteBotId = "bot-remote-1";
  const identity = deriveImBotIdentity(remoteBotId);
  const bots = parseImWecomConfig({
    version: 1,
    bots: [{
      botId: identity.botId,
      remoteBotId,
      secretRef: identity.secretRef,
      name: "测试",
      connectedAt: "2026-08-01T00:00:00.000Z",
    }],
  });
  expect(bots).toHaveLength(1);
  expect(bots[0]?.name).toBe("测试");
});

it("drops bots whose identity does not match", () => {
  const bots = parseImWecomConfig({
    version: 1,
    bots: [{
      botId: "wecom_aaaaaaaaaaaaaaaaaaaaaaaa",
      remoteBotId: "someone-else",
      secretRef: "DSH_WECOM_BOT_SECRET_AAAAAAAAAAAAAAAAAAAAAAAA",
    }],
  });
  expect(bots).toHaveLength(0);
});

it("returns empty for missing or invalid documents", () => {
  expect(parseImWecomConfig(null)).toEqual([]);
  expect(parseImWecomConfig({ version: 2, bots: [] })).toEqual([]);
});
