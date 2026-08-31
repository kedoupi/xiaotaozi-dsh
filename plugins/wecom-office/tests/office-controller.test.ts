import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { deriveImBotIdentity } from "../src/identity.ts";
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

function fakeAuth(state: {
  authorized: boolean;
  inits: string[];
  fail?: Set<string>;
}) {
  return {
    cliVersion: async () => "1.2.0",
    authStatus: async () => state.authorized ? "authorized" as const : "unauthorized" as const,
    authInit: async (options: { remoteBotId: string }) => {
      state.inits.push(options.remoteBotId);
      if (state.fail?.has(options.remoteBotId)) {
        state.authorized = false;
        throw new Error("target auth failed");
      }
      state.authorized = true;
    },
    clearCliCredentials: async () => { state.authorized = false; },
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

function imBot(remote: string, name: string): ImWecomBot {
  const identity = deriveImBotIdentity(remote);
  return {
    botId: identity.botId,
    remoteBotId: remote,
    secretRef: identity.secretRef,
    name,
    connectedAt: null,
  };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
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

it("activates an IM bot", async () => {
  await withDir(async (dir) => {
    const bot = imBot("im-bot", "聊天");
    let settings: WecomOfficeSettings = { ...OFFICE_SETTINGS_DEFAULTS, configDir: dir };
    const state = { authorized: false, inits: [] as string[] };
    const controller = new OfficeController({
      resolveSettings: () => settings,
      writeSettings: async (patch) => {
        settings = { ...settings, ...patch };
      },
      credentials: memoryCredentials({ [bot.secretRef]: "im-secret" }),
      loadImBots: async () => [bot],
      auth: fakeAuth(state),
    });
    const snap = await controller.activate(bot.botId, true);
    expect(state.inits).toEqual(["im-bot"]);
    expect(snap.mainStatus).toBe("active");
    expect(snap.activeBotId).toBe(bot.botId);
    expect(settings.activeIdentity?.source).toBe("im");
  });
});

it("rejects activation of a retained standalone identity that is absent from IM", async () => {
  await withDir(async (dir) => {
    const standalone = imBot("standalone-bot", "旧办公身份");
    let settings: WecomOfficeSettings = {
      ...OFFICE_SETTINGS_DEFAULTS,
      configDir: dir,
      standaloneBot: {
        botId: standalone.botId,
        remoteBotId: standalone.remoteBotId,
        secretRef: standalone.secretRef,
        name: standalone.name,
      },
    };
    const state = { authorized: false, inits: [] as string[] };
    const controller = new OfficeController({
      resolveSettings: () => settings,
      writeSettings: async (patch) => { settings = { ...settings, ...patch }; },
      credentials: memoryCredentials({ [standalone.secretRef]: "legacy-secret" }),
      loadImBots: async () => [],
      auth: fakeAuth(state),
    });

    const snapshot = await controller.activate(standalone.botId, true);

    expect(snapshot.lastError?.code).toBe("im-bot-missing");
    expect(state.inits).toEqual([]);
    expect(settings.activeBotId).toBe("");
  });
});

it("serializes concurrent activations through authentication and settings persistence", async () => {
  await withDir(async (dir) => {
    const firstBot = imBot("first-bot", "一");
    const secondBot = imBot("second-bot", "二");
    let settings: WecomOfficeSettings = { ...OFFICE_SETTINGS_DEFAULTS, configDir: dir };
    let cliBotId = "";
    const inits: string[] = [];
    const firstWriteStarted = deferred();
    const releaseFirstWrite = deferred();
    const controller = new OfficeController({
      resolveSettings: () => settings,
      writeSettings: async (patch) => {
        if (patch.activeBotId === firstBot.botId) {
          firstWriteStarted.resolve();
          await releaseFirstWrite.promise;
        }
        settings = { ...settings, ...patch };
      },
      credentials: memoryCredentials({
        [firstBot.secretRef]: "first-secret",
        [secondBot.secretRef]: "second-secret",
      }),
      loadImBots: async () => [firstBot, secondBot],
      auth: {
        cliVersion: async () => "1.2.0",
        authStatus: async () => cliBotId === "" ? "unauthorized" as const : "authorized" as const,
        authInit: async ({ remoteBotId }: { remoteBotId: string }) => {
          inits.push(remoteBotId);
          cliBotId = remoteBotId;
        },
        clearCliCredentials: async () => { cliBotId = ""; },
      },
    });

    const first = controller.activate(firstBot.botId, true);
    await firstWriteStarted.promise;
    const second = controller.activate(secondBot.botId, true);
    await Promise.resolve();
    expect(inits).toEqual([firstBot.remoteBotId]);

    releaseFirstWrite.resolve();
    await Promise.all([first, second]);

    expect(inits).toEqual([firstBot.remoteBotId, secondBot.remoteBotId]);
    expect(cliBotId).toBe(secondBot.remoteBotId);
    expect(settings.activeBotId).toBe(secondBot.botId);
    expect(settings.activeIdentity?.botId).toBe(secondBot.botId);
  });
});

it("re-authenticates the previous identity when a switch fails", async () => {
  await withDir(async (dir) => {
    const oldBot = imBot("old-bot", "旧");
    const newBot = imBot("new-bot", "新");
    let settings: WecomOfficeSettings = {
      ...OFFICE_SETTINGS_DEFAULTS,
      configDir: dir,
      selectedBotId: oldBot.botId,
      activeBotId: oldBot.botId,
      activeIdentity: {
        botId: oldBot.botId,
        remoteBotId: oldBot.remoteBotId,
        secretRef: oldBot.secretRef,
        name: oldBot.name,
        source: "im",
      },
    };
    const state = { authorized: true, inits: [] as string[], fail: new Set(["new-bot"]) };
    const controller = new OfficeController({
      resolveSettings: () => settings,
      writeSettings: async (patch) => {
        settings = { ...settings, ...patch };
      },
      credentials: memoryCredentials({
        [oldBot.secretRef]: "old-secret",
        [newBot.secretRef]: "new-secret",
      }),
      loadImBots: async () => [oldBot, newBot],
      auth: fakeAuth(state),
    });
    const snapshot = await controller.activate(newBot.botId, true);
    expect(state.inits).toEqual(["new-bot", "old-bot"]);
    expect(settings.activeBotId).toBe(oldBot.botId);
    expect(settings.activeIdentity?.botId).toBe(oldBot.botId);
    expect(snapshot.activeBotId).toBe(oldBot.botId);
    expect(snapshot.lastError?.code).toBeDefined();
    expect(state.authorized).toBe(true);
  });
});

it("reports an unhealthy state when rollback re-authentication also fails", async () => {
  await withDir(async (dir) => {
    const oldBot = imBot("old-bot", "旧");
    const newBot = imBot("new-bot", "新");
    let settings: WecomOfficeSettings = {
      ...OFFICE_SETTINGS_DEFAULTS,
      configDir: dir,
      selectedBotId: oldBot.botId,
      activeBotId: oldBot.botId,
      activeIdentity: {
        botId: oldBot.botId,
        remoteBotId: oldBot.remoteBotId,
        secretRef: oldBot.secretRef,
        name: oldBot.name,
        source: "im",
      },
    };
    const state = { authorized: true, inits: [] as string[], fail: new Set(["new-bot", "old-bot"]) };
    const controller = new OfficeController({
      resolveSettings: () => settings,
      writeSettings: async (patch) => {
        settings = { ...settings, ...patch };
      },
      credentials: memoryCredentials({
        [oldBot.secretRef]: "old-secret",
        [newBot.secretRef]: "new-secret",
      }),
      loadImBots: async () => [oldBot, newBot],
      auth: fakeAuth(state),
    });
    const snapshot = await controller.activate(newBot.botId, true);
    expect(state.inits).toEqual(["new-bot", "old-bot"]);
    expect(state.authorized).toBe(false);
    expect(snapshot.authorized).toBe(false);
    expect(snapshot.mainStatus).not.toBe("active");
    expect(snapshot.lastError?.code).toBeDefined();
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

it("stores allowWrite configuration", async () => {
  await withDir(async (dir) => {
    let settings: WecomOfficeSettings = { ...OFFICE_SETTINGS_DEFAULTS, cliPath: join(dir, "no-such-cli"), configDir: dir };
    const controller = new OfficeController({
      resolveSettings: () => settings,
      writeSettings: async (patch) => {
        settings = { ...settings, ...patch };
      },
    });
    expect(settings.allowWrite).toBe(true);
    const snap = await controller.setAllowWrite(false, false);
    expect(settings.allowWrite).toBe(false);
    expect(snap.allowWrite).toBe(false);
  });
});
