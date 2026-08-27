import { expect, it } from "vitest";
import { deriveImBotIdentity, deriveOfficeBotIdentity, maskRemoteBotId } from "../src/identity.ts";

it("derives IM identity the same way dsh-im does", () => {
  const remote = "aibot_example_id_value";
  const im = deriveImBotIdentity(remote);
  expect(im.botId.startsWith("wecom_")).toBe(true);
  expect(im.secretRef.startsWith("DSH_WECOM_BOT_SECRET_")).toBe(true);
  expect(im.botId.slice(6)).toBe(im.secretRef.slice("DSH_WECOM_BOT_SECRET_".length).toLowerCase());
});

it("uses a separate office secretRef namespace", () => {
  const remote = "aibot_example_id_value";
  const office = deriveOfficeBotIdentity(remote);
  const im = deriveImBotIdentity(remote);
  expect(office.botId.startsWith("office_")).toBe(true);
  expect(office.secretRef).not.toBe(im.secretRef);
  expect(office.secretRef.startsWith("DSH_WECOM_OFFICE_BOT_SECRET_")).toBe(true);
});

it("masks remote bot ids", () => {
  expect(maskRemoteBotId("abcdefghijklmnop")).toBe("abcdef••••mnop");
});
