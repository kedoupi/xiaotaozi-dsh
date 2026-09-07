import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { installOfficeSettings, sanitizeOverlay, settingsPath, type WecomOfficeSettings } from "../src/settings.ts";
import { deriveImBotIdentity } from "../src/identity.ts";
import { OfficeController } from "../src/office-controller.ts";
import { executeOfficeTool } from "../src/tools.ts";

const faults = vi.hoisted(() => ({
  rename: undefined as Error | undefined,
  writeFile: undefined as Error | undefined,
  beforeRename: undefined as (() => Promise<void>) | undefined,
}));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    rename: vi.fn(async (...args: Parameters<typeof actual.rename>) => {
      if (faults.rename) throw faults.rename;
      await faults.beforeRename?.();
      return actual.rename(...args);
    }),
    writeFile: vi.fn(async (...args: Parameters<typeof actual.writeFile>) => {
      if (faults.writeFile) {
        await actual.writeFile(args[0], "partial write", args[2]);
        throw faults.writeFile;
      }
      return actual.writeFile(...args);
    }),
  };
});
afterEach(() => { faults.rename = undefined; faults.writeFile = undefined; faults.beforeRename = undefined; });

async function withSettings(run: (fixture: {
  dir: string; source: () => WecomOfficeSettings;
  write: (patch: Partial<WecomOfficeSettings>) => Promise<void>;
}) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "wo-settings-"));
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = dir;
  try {
    let source!: () => WecomOfficeSettings;
    let write!: (patch: Partial<WecomOfficeSettings>) => Promise<void>;
    await installOfficeSettings({ configDir: join(dir, "cli") }, {
      setSource: (value) => { source = value; },
      setWriter: (value) => { if (value) write = value; },
    });
    await run({ dir, source, write });
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
    await rm(dir, { recursive: true, force: true });
  }
}

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

it.each([["rename", "ENOSPC"], ["writeFile", "ENOSPC"], ["rename", "EEXIST"]] as const)("publishes only durable settings and recovers after %s %s failure", async (operation, code) => {
  await withSettings(async ({ source, write }) => {
    await write({ activeBotId: "old", guidance: true });
    const path = settingsPath();
    const before = await readFile(path, "utf8");
    faults[operation] = Object.assign(new Error("synthetic disk failure"), { code });
    await expect(write({ activeBotId: "new" })).rejects.toMatchObject({ code });
    expect(source().activeBotId).toBe("old");
    expect(await readFile(path, "utf8")).toBe(before);
    expect(await readdir(dirname(path))).toEqual([path.split("/").at(-1)]);
    faults[operation] = undefined;
    await Promise.all([write({ guidance: false }), write({ allowWrite: false })]);
    expect(source()).toMatchObject({ activeBotId: "old", guidance: false, allowWrite: false });
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ activeBotId: "old", guidance: false, allowWrite: false });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });
});

it.each(["rename", "writeFile"] as const)("keeps real settings, CLI and tool identity A on activation persistence %s failure, then retries B", async (operation) => {
  await withSettings(async ({ source, write }) => {
    const bot = (remoteBotId: string) => ({ ...deriveImBotIdentity(remoteBotId), remoteBotId,
      name: remoteBotId, connectedAt: null });
    const a = bot("A"); const b = bot("B");
    const identityA = { ...a, source: "im" as const };
    await write({ activeBotId: a.botId, activeIdentity: identityA });
    const before = await readFile(settingsPath(), "utf8");
    let cliBot = a.remoteBotId;
    const inits: string[] = [];
    const controller = new OfficeController({
      resolveSettings: source, writeSettings: write,
      credentials: { resolve: async () => ({ value: "fake-secret" }), set: async () => {}, unset: async () => {} },
      loadImBots: async () => [a, b],
      auth: {
        cliVersion: async () => "1.2.0",
        authStatus: async () => cliBot ? "authorized" : "unauthorized",
        authInit: async ({ remoteBotId, configDir }) => {
          expect(configDir).toBe(source().configDir);
          inits.push(remoteBotId); cliBot = remoteBotId;
        },
        clearCliCredentials: async () => { throw new Error("must not clear existing bot"); },
      },
    });
    faults[operation] = Object.assign(new Error("synthetic disk failure"), { code: "ENOSPC" });
    const failed = await controller.activate(b.botId, true);
    expect(inits).toEqual(["B", "A"]); // Authentication and rollback actually entered.
    expect(cliBot).toBe("A");
    expect(source().activeBotId).toBe(a.botId);
    expect(source().activeIdentity?.botId).toBe(a.botId);
    expect(await readFile(settingsPath(), "utf8")).toBe(before);
    expect(failed.activeBotId).toBe(a.botId);
    expect(failed.lastError).toBeDefined();
    const calls: { configDir: string; cliBot: string; args: readonly string[] }[] = [];
    await executeOfficeTool("wecom_doc_search", { keywords: ["fixture"] }, source(), async (options) => {
      calls.push({ configDir: options.configDir, cliBot, args: options.args });
      return { argv: [...options.args], stdout: options.args[0] === "auth" ? "authorized\n" : "{}", stderr: "", exitCode: 0 };
    });
    expect(calls).toEqual([
      { configDir: source().configDir, cliBot: "A", args: ["auth", "show", "--status"] },
      { configDir: source().configDir, cliBot: "A", args: ["doc", "search"] },
    ]);
    faults[operation] = undefined;
    const retried = await controller.activate(b.botId, true);
    expect(inits).toEqual(["B", "A", "B"]);
    expect(cliBot).toBe("B");
    expect(retried.activeBotId).toBe(b.botId);
    expect(retried.lastError).toBeUndefined();
    expect(source().activeIdentity?.botId).toBe(b.botId);
    expect(JSON.parse(await readFile(settingsPath(), "utf8")).activeBotId).toBe(b.botId);
  });
});

it("keeps pending replacement private and merges queued patches from the last durable overlay", async () => {
  await withSettings(async ({ source, write }) => {
    await write({ activeBotId: "old" });
    const before = await readFile(settingsPath(), "utf8");
    let entered!: () => void; let release!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const pending = new Promise<void>((resolve) => { release = resolve; });
    faults.beforeRename = async () => { entered(); await pending; };
    const first = write({ activeBotId: "new", guidance: false });
    await started;
    const second = write({ allowWrite: false });
    try {
      expect(source()).toMatchObject({ activeBotId: "old", guidance: true, allowWrite: true });
      expect(await readFile(settingsPath(), "utf8")).toBe(before);
    } finally {
      release();
      await Promise.all([first, second]);
    }
    expect(source()).toMatchObject({ activeBotId: "new", guidance: false, allowWrite: false });
    expect(JSON.parse(await readFile(settingsPath(), "utf8"))).toMatchObject({ activeBotId: "new", guidance: false, allowWrite: false });
  });
});
