import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});
afterEach(() => vi.mocked(readFile).mockReset());
import { deriveImBotIdentity } from "../src/identity.ts";
import { loadImWecomBots, parseImWecomConfig } from "../src/im-bridge.ts";

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

it.each(["EACCES", "EIO"])("rejects unavailable catalog read: %s", async (code) => {
  vi.mocked(readFile).mockRejectedValueOnce(Object.assign(new Error("private read detail"), { code }));
  await expect(loadImWecomBots("unused-fake-path")).rejects.toMatchObject({ code: "im-unavailable" });
  expect(readFile).toHaveBeenCalledWith("unused-fake-path", "utf8");
});

it("distinguishes unavailable catalogs from confirmed empty and complete catalogs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wo-catalog-"));
  const path = join(dir, "config.json");
  const remoteBotId = "valid-bot";
  const bot = { ...deriveImBotIdentity(remoteBotId), remoteBotId };
  try {
    await expect(loadImWecomBots(path)).rejects.toMatchObject({ code: "im-unavailable" });
    for (const text of ["{broken-json", "null", "[]", "{}", '{"version":2,"bots":[]}',
      '{"version":1,"bots":{}}', ...[null, [], {}, { ...bot, secretRef: "mismatch" },
        { ...bot, remoteBotId: "" }].map((row) => JSON.stringify({ version: 1, bots: [bot, row] }))]) {
      await writeFile(path, text);
      await expect(loadImWecomBots(path)).rejects.toMatchObject({ code: "im-unavailable" });
    }
    await writeFile(path, JSON.stringify({ version: 1, bots: [] }));
    await expect(loadImWecomBots(path)).resolves.toEqual([]);
    await writeFile(path, JSON.stringify({ version: 1, bots: [bot] }));
    await expect(loadImWecomBots(path)).resolves.toMatchObject([bot]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it.each([
  "{broken-json", "null", "[]", "{}", '{"version":2,"bots":[]}', '{"version":1,"bots":{}}',
  ...[null, [], {}, { remoteBotId: "bad", botId: "mismatch", secretRef: "mismatch" }]
    .map((row) => JSON.stringify({ version: 1, bots: [row] })),
])("rejects incomplete catalog %s", async (text) => {
  vi.mocked(readFile).mockResolvedValueOnce(text);
  await expect(loadImWecomBots("fake-path")).rejects.toMatchObject({ code: "im-unavailable" });
});
