import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { deriveImBotIdentity, deriveOfficeBotIdentity } from "../src/identity.ts";
import { OfficeController, type CredentialStore } from "../src/office-controller.ts";
import { OFFICE_SETTINGS_DEFAULTS, type WecomOfficeSettings } from "../src/settings.ts";
import type { ImWecomBot } from "../src/im-bridge.ts";

function memoryCredentials(seed: Record<string, string> = {}): CredentialStore {
  const map = new Map(Object.entries(seed));
  return {
    async resolve(ref) {
      const value = map.get(ref);
      return value === undefined ? undefined : { value };
    },
    async set(ref, value) {
      map.set(ref, value);
    },
    async unset(ref) {
      map.delete(ref);
    },
  };
}

function fakeAuth(state: { authorized: boolean; inits: string[] }) {
  return {
    cliVersion: async () => "1.2.0",
    authStatus: async () => (state.authorized ? "authorized" as const : "unauthorized" as const),
    authInit: async (options: { remoteBotId: string }) => {
      state.inits.push(options.remoteBotId);
      state.authorized = true;
    },
    clearCliCredentials: async () => {
      state.authorized = false;
    },
  };
}

async function withDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "dsh-wo-"));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

it("treats missing CLI as cli-missing without bots", async () => {
  await withDir(async (dir) => {
    let settings: WecomOfficeSettings = { ...OFFICE_SETTINGS_DEFAULTS, cliPath: join(dir, "no-such-cli"), configDir: dir };
    const controller = new OfficeController({
      resolveSettings: () => settings,
      writeSettings: async (patch) => {
        settings = { ...settings, ...patch };
      },
    });
    const snap = await controller.snapshot(false);
    expect(snap.mainStatus).toBe("cli-missing");
    expect(snap.cliInstalled).toBe(false);
    expect(snap.bots).toEqual([]);
  });
});

it("does not auto-activate when selecting another bot", async () => {
  await withDir(async (dir) => {
    const remote = "bot-a";
    const identity = deriveOfficeBotIdentity(remote);
    let settings: WecomOfficeSettings = {
      ...OFFICE_SETTINGS_DEFAULTS,
      cliPath: join(dir, "no-such-cli"),
      configDir: dir,
      selectedBotId: identity.botId,
      activeBotId: identity.botId,
      standaloneBot: { botId: identity.botId, remoteBotId: remote, secretRef: identity.secretRef, name: "A" },
    };
    const controller = new OfficeController({
      resolveSettings: () => settings,
      writeSettings: async (patch) => {
        settings = { ...settings, ...patch };
      },
    });
    const other = deriveImBotIdentity("bot-b");
    await controller.select(other.botId, false);
    expect(settings.selectedBotId).toBe(other.botId);
    expect(settings.activeBotId).toBe(identity.botId);
  });
});

it("activates a standalone bot while IM is available", async () => {
  await withDir(async (dir) => {
    const remote = "office-bot";
    const identity = deriveOfficeBotIdentity(remote);
    const im = deriveImBotIdentity("im-bot");
    const imBot: ImWecomBot = {
      botId: im.botId,
      remoteBotId: "im-bot",
      secretRef: im.secretRef,
      name: "聊天",
      connectedAt: null,
    };
    let settings: WecomOfficeSettings = {
      ...OFFICE_SETTINGS_DEFAULTS,
      configDir: dir,
      standaloneBot: { botId: identity.botId, remoteBotId: remote, secretRef: identity.secretRef, name: "办公" },
    };
    const state = { authorized: false, inits: [] as string[] };
    const controller = new OfficeController({
      resolveSettings: () => settings,
      writeSettings: async (patch) => {
        settings = { ...settings, ...patch };
      },
      credentials: memoryCredentials({ [identity.secretRef]: "office-secret" }),
      loadImBots: async () => [imBot],
      auth: fakeAuth(state),
    });
    const snap = await controller.activate(identity.botId, true);
    expect(state.inits).toEqual([remote]);
    expect(snap.mainStatus).toBe("active");
    expect(snap.activeBotId).toBe(identity.botId);
    expect(settings.activeIdentity?.source).toBe("standalone");
    expect(snap.bots.some((bot) => bot.botId === identity.botId && bot.name.includes("仅办公"))).toBe(true);
  });
});

it("bindManual works as an IM escape hatch", async () => {
  await withDir(async (dir) => {
    let settings: WecomOfficeSettings = { ...OFFICE_SETTINGS_DEFAULTS, configDir: dir };
    const state = { authorized: false, inits: [] as string[] };
    const credentials = memoryCredentials();
    const controller = new OfficeController({
      resolveSettings: () => settings,
      writeSettings: async (patch) => {
        settings = { ...settings, ...patch };
      },
      credentials,
      loadImBots: async () => [],
      auth: fakeAuth(state),
    });
    const snap = await controller.bindManual("  remote-1  ", "  secret-1  ", true);
    const identity = deriveOfficeBotIdentity("remote-1");
    expect(state.inits).toEqual(["remote-1"]);
    expect(snap.mainStatus).toBe("active");
    expect(snap.activeBotId).toBe(identity.botId);
    expect((await credentials.resolve(identity.secretRef))?.value).toBe("secret-1");
  });
});

it("keeps the IM office identity after IM is unloaded", async () => {
  await withDir(async (dir) => {
    const remote = "im-bot";
    const im = deriveImBotIdentity(remote);
    let settings: WecomOfficeSettings = {
      ...OFFICE_SETTINGS_DEFAULTS,
      configDir: dir,
      selectedBotId: im.botId,
      activeBotId: im.botId,
      activeIdentity: {
        botId: im.botId,
        remoteBotId: remote,
        secretRef: im.secretRef,
        name: "工作",
        source: "im",
      },
    };
    const state = { authorized: true, inits: [] as string[] };
    const controller = new OfficeController({
      resolveSettings: () => settings,
      writeSettings: async (patch) => {
        settings = { ...settings, ...patch };
      },
      auth: fakeAuth(state),
      loadImBots: async () => {
        throw new Error("must not read IM bots when IM is gone");
      },
    });
    const snap = await controller.snapshot(false);
    expect(snap.mainStatus).toBe("active");
    expect(snap.bots).toHaveLength(1);
    expect(snap.bots[0]?.name).toContain("IM 已卸，仅办公");
    expect(snap.bots[0]?.botId).toBe(im.botId);
    expect(state.authorized).toBe(true);
  });
});

it("clears credentials when the active IM bot is removed while IM remains", async () => {
  await withDir(async (dir) => {
    const im = deriveImBotIdentity("gone");
    let settings: WecomOfficeSettings = {
      ...OFFICE_SETTINGS_DEFAULTS,
      configDir: dir,
      selectedBotId: im.botId,
      activeBotId: im.botId,
      activeIdentity: {
        botId: im.botId,
        remoteBotId: "gone",
        secretRef: im.secretRef,
        name: "旧",
        source: "im",
      },
    };
    const state = { authorized: true, inits: [] as string[] };
    const controller = new OfficeController({
      resolveSettings: () => settings,
      writeSettings: async (patch) => {
        settings = { ...settings, ...patch };
      },
      auth: fakeAuth(state),
      loadImBots: async () => [],
    });
    const snap = await controller.snapshot(true);
    expect(state.authorized).toBe(false);
    expect(settings.activeBotId).toBe("");
    expect(settings.activeIdentity).toBeNull();
    expect(snap.mainStatus).toBe("unbound");
  });
});

it("clears QR after a successful scan and activate", async () => {
  await withDir(async (dir) => {
    let settings: WecomOfficeSettings = { ...OFFICE_SETTINGS_DEFAULTS, configDir: dir };
    const state = { authorized: false, inits: [] as string[] };
    const controller = new OfficeController({
      resolveSettings: () => settings,
      writeSettings: async (patch) => {
        settings = { ...settings, ...patch };
      },
      credentials: memoryCredentials(),
      loadImBots: async () => [],
      auth: fakeAuth(state),
      encodeQr: async () => "data:image/png;base64,xx",
      qr: {
        start: async () => ({
          scode: "sc",
          verificationUrl: "https://work.weixin.qq.com/ai/qc/ok",
          expiresAt: Date.now() + 60_000,
          pollIntervalMs: 3000,
        }),
        poll: async () => ({
          status: "success" as const,
          remoteBotId: "qr-bot",
          secret: "qr-secret",
          name: "扫码",
        }),
      },
    });
    const started = await controller.qrStart(false);
    expect(started.qr?.status).toBe("pending");
    const polled = await controller.qrPoll(started.qr!.attemptId, false);
    expect(polled.qr).toBeNull();
    expect(polled.mainStatus).toBe("active");
    expect(state.inits).toEqual(["qr-bot"]);
  });
});

it("refuses QR start when IM is available", async () => {
  await withDir(async (dir) => {
    let settings: WecomOfficeSettings = { ...OFFICE_SETTINGS_DEFAULTS, configDir: dir };
    const controller = new OfficeController({
      resolveSettings: () => settings,
      writeSettings: async (patch) => {
        settings = { ...settings, ...patch };
      },
    });
    await expect(controller.qrStart(true)).rejects.toMatchObject({ code: "im-unavailable" });
  });
});
