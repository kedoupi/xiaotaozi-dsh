import { expect, it } from "vitest";
import { sanitizeOverlay } from "../src/settings.ts";

it("drops process-launch fields from disk overlay", () => {
  const overlay = sanitizeOverlay({
    cliPath: "/evil/wecom-cli",
    configDir: "/tmp/x",
    selectedBotId: "wecom_abc",
    activeBotId: "wecom_abc",
    guidance: false,
    activeIdentity: {
      botId: "wecom_abc",
      remoteBotId: "bot-1",
      secretRef: "DSH_WECOM_BOT_SECRET_ABC",
      name: "工作",
      source: "im",
      secret: "nope",
    },
  });
  expect(overlay.cliPath).toBeUndefined();
  expect(overlay.configDir).toBeUndefined();
  expect(overlay.selectedBotId).toBe("wecom_abc");
  expect(overlay.guidance).toBe(false);
  expect(overlay.activeIdentity).toEqual({
    botId: "wecom_abc",
    remoteBotId: "bot-1",
    secretRef: "DSH_WECOM_BOT_SECRET_ABC",
    name: "工作",
    source: "im",
  });
});
