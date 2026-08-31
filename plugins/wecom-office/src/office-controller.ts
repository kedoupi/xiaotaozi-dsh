import { mkdir } from "node:fs/promises";
import { authInit, authStatus, clearCliCredentials, cliVersion } from "./auth.ts";
import { OfficeError, publicErrorMessage, USER_MESSAGES } from "./errors.ts";
import { isImBotId, maskRemoteBotId } from "./identity.ts";
import { loadImWecomBots, maskImBots, type ImWecomBot } from "./im-bridge.ts";
import {
  resolveConfigDir,
  type OfficeIdentity,
  type StandaloneBot,
  type WecomOfficeSettings,
} from "./settings.ts";
import type { OfficeBotOption, OfficeMainStatus, OfficeStatusPayload } from "./office-types.ts";
import { pluginTrace, shortId } from "./trace.ts";

export interface CredentialStore {
  resolve(ref: string): Promise<{ value?: string } | undefined>;
  set(ref: string, value: string): Promise<unknown>;
  unset(ref: string): Promise<unknown>;
}

export function isCredentialStore(value: unknown): value is CredentialStore {
  if (typeof value !== "object" || value === null) return false;
  const record = value as CredentialStore;
  return typeof record.resolve === "function"
    && typeof record.set === "function"
    && typeof record.unset === "function";
}

export interface OfficeAuthPort {
  cliVersion: typeof cliVersion;
  authStatus: typeof authStatus;
  authInit: typeof authInit;
  clearCliCredentials: typeof clearCliCredentials;
}

function defaultSelect(bots: readonly OfficeBotOption[], preferred?: string): string {
  if (preferred && bots.some((bot) => bot.botId === preferred)) return preferred;
  return bots[0]?.botId ?? "";
}

function asStandalone(bot: StandaloneBot): StandaloneBot {
  return {
    botId: bot.botId,
    remoteBotId: bot.remoteBotId,
    secretRef: bot.secretRef,
    name: bot.name,
  };
}

export class OfficeController {
  #resolveSettings: () => WecomOfficeSettings;
  #writeSettings: ((patch: Partial<WecomOfficeSettings>) => Promise<void>) | undefined;
  #credentials: CredentialStore | undefined;
  #loadImBots: () => Promise<ImWecomBot[]>;
  #auth: OfficeAuthPort;
  #lastError: { code: string; message: string } | undefined;
  #boundFailed = false;
  #activationQueue: Promise<void> = Promise.resolve();

  constructor(options: {
    resolveSettings: () => WecomOfficeSettings;
    writeSettings?: (patch: Partial<WecomOfficeSettings>) => Promise<void>;
    credentials?: CredentialStore;
    loadImBots?: () => Promise<ImWecomBot[]>;
    auth?: Partial<OfficeAuthPort>;
  }) {
    this.#resolveSettings = options.resolveSettings;
    this.#writeSettings = options.writeSettings;
    this.#credentials = options.credentials;
    this.#loadImBots = options.loadImBots ?? loadImWecomBots;
    this.#auth = {
      cliVersion: options.auth?.cliVersion ?? cliVersion,
      authStatus: options.auth?.authStatus ?? authStatus,
      authInit: options.auth?.authInit ?? authInit,
      clearCliCredentials: options.auth?.clearCliCredentials ?? clearCliCredentials,
    };
  }

  async snapshot(imAvailable: boolean): Promise<OfficeStatusPayload> {
    let settings = this.#resolveSettings();
    const configDir = resolveConfigDir(settings);
    const version = await this.#auth.cliVersion({
      cliPath: settings.cliPath,
      configDir,
      timeoutMs: settings.callTimeoutMs,
      maxOutputBytes: settings.maxCliOutputBytes,
    }).catch((error) => {
      if (error instanceof OfficeError && error.code === "cli-missing") return undefined;
      throw error;
    });
    const cliInstalled = version !== undefined;
    const authorized = cliInstalled
      ? (await this.#auth.authStatus({
          cliPath: settings.cliPath,
          configDir,
          timeoutMs: settings.callTimeoutMs,
          maxOutputBytes: settings.maxCliOutputBytes,
        })) === "authorized"
      : false;
    const imBots = imAvailable ? await this.#loadImBots() : [];
    if (imAvailable && settings.activeBotId && isImBotId(settings.activeBotId)
      && !imBots.some((bot) => bot.botId === settings.activeBotId)) {
      pluginTrace(`forget-active bot=${shortId(settings.activeBotId)} reason=im-bot-gone`);
      await this.#forgetActive(configDir);
      const cleared: WecomOfficeSettings = { ...settings, activeBotId: "", activeIdentity: null };
      const selectedBotId = defaultSelect(this.#botOptions(imAvailable, imBots, cleared));
      await this.#writeSettings?.({ activeBotId: "", activeIdentity: null, selectedBotId });
      settings = this.#resolveSettings();
    }
    const bots = this.#botOptions(imAvailable, imBots, settings);
    let selectedBotId = settings.selectedBotId;
    const activeBotId = settings.activeBotId;
    if (!selectedBotId || !bots.some((bot) => bot.botId === selectedBotId)) {
      selectedBotId = defaultSelect(bots, activeBotId);
    }
    return {
      ok: true,
      imAvailable,
      cliInstalled,
      ...(version ? { cliVersion: version } : {}),
      mainStatus: this.#mainStatus({
        cliInstalled,
        authorized,
        bots,
        activeBotId,
        imAvailable,
      }),
      selectedBotId,
      activeBotId,
      authorized,
      bots,
      qr: null,
      ...(this.#lastError ? { lastError: this.#lastError } : {}),
      configDir,
      cliPath: settings.cliPath,
      writable: this.#writeSettings !== undefined,
      allowWrite: settings.allowWrite,
      guidance: settings.guidance,
    };
  }

  activate(botId: string, imAvailable: boolean): Promise<OfficeStatusPayload> {
    const activation = this.#activationQueue.then(() => this.#activate(botId, imAvailable));
    this.#activationQueue = activation.then(() => undefined, () => undefined);
    return activation;
  }

  async #activate(botId: string, imAvailable: boolean): Promise<OfficeStatusPayload> {
    const settings = this.#resolveSettings();
    const configDir = resolveConfigDir(settings);
    await mkdir(configDir, { recursive: true, mode: 0o700 });
    this.#lastError = undefined;
    this.#boundFailed = false;
    const previous = settings.activeIdentity;
    try {
      const target = await this.#resolveBot(botId);
      pluginTrace(`activate bot=${shortId(target.botId)} source=${target.source} im=${String(imAvailable)}`);
      await this.#authenticate(target, settings);
      await this.#writeSettings?.({ activeBotId: target.botId, activeIdentity: target });
      pluginTrace(`activate bot=${shortId(target.botId)} ok`);
    } catch (error) {
      this.#lastError = publicErrorMessage(error);
      if (!imAvailable) this.#boundFailed = true;
      if (previous && previous.botId !== botId) {
        await this.#authenticate(previous, settings).catch((rollbackError) => {
          this.#lastError = publicErrorMessage(rollbackError);
        });
      }
      pluginTrace(`activate bot=${shortId(botId)} error=${this.#lastError.code}`);
    }
    return this.snapshot(imAvailable);
  }

  async setGuidance(guidance: boolean, imAvailable: boolean): Promise<OfficeStatusPayload> {
    await this.#writeSettings?.({ guidance });
    return this.snapshot(imAvailable);
  }

  async setAllowWrite(allowWrite: boolean, imAvailable: boolean): Promise<OfficeStatusPayload> {
    await this.#writeSettings?.({ allowWrite });
    return this.snapshot(imAvailable);
  }

  async #resolveBot(botId: string): Promise<OfficeIdentity> {
    const im = (await this.#loadImBots()).find((item) => item.botId === botId);
    if (!im) throw new OfficeError("im-bot-missing", USER_MESSAGES["im-bot-missing"]);
    return {
      botId: im.botId,
      remoteBotId: im.remoteBotId,
      secretRef: im.secretRef,
      name: im.name,
      source: "im",
    };
  }

  #displayIdentity(settings: WecomOfficeSettings): OfficeIdentity | null {
    if (settings.activeIdentity) return settings.activeIdentity;
    if (settings.standaloneBot) return { ...asStandalone(settings.standaloneBot), source: "standalone" };
    return null;
  }

  #botOptions(imAvailable: boolean, imBots: readonly ImWecomBot[], settings: WecomOfficeSettings): OfficeBotOption[] {
    const extra = this.#displayIdentity(settings);
    if (imAvailable) {
      const listed: OfficeBotOption[] = maskImBots(imBots);
      if (extra && !listed.some((bot) => bot.botId === extra.botId)) {
        listed.push({
          botId: extra.botId,
          remoteBotIdMasked: maskRemoteBotId(extra.remoteBotId),
          name: `${extra.name}（仅办公，未用于聊天）`,
          source: extra.source,
          listed: true,
        });
      }
      return listed;
    }
    if (!extra) return [];
    return [{
      botId: extra.botId,
      remoteBotIdMasked: maskRemoteBotId(extra.remoteBotId),
      name: extra.source === "im" ? `${extra.name}（IM 已卸，仅办公）` : extra.name,
      source: extra.source,
      listed: true,
    }];
  }

  #mainStatus(input: {
    cliInstalled: boolean;
    authorized: boolean;
    bots: OfficeBotOption[];
    activeBotId: string;
    imAvailable: boolean;
  }): OfficeMainStatus {
    if (!input.cliInstalled) return "cli-missing";
    if (input.authorized && input.activeBotId) return "active";
    if (this.#boundFailed && !input.imAvailable) return "bound-activate-failed";
    if (this.#lastError && input.bots.length > 0) return "activate-failed";
    if (input.bots.length === 0) return "unbound";
    return "inactive";
  }

  async #authenticate(identity: OfficeIdentity, settings: WecomOfficeSettings): Promise<void> {
    const secret = await this.#store().resolve(identity.secretRef);
    if (!secret?.value) throw new OfficeError("secret-missing", USER_MESSAGES["secret-missing"]);
    await this.#auth.authInit({
      cliPath: settings.cliPath,
      configDir: resolveConfigDir(settings),
      timeoutMs: settings.callTimeoutMs,
      maxOutputBytes: settings.maxCliOutputBytes,
      remoteBotId: identity.remoteBotId,
      secret: secret.value,
    });
  }

  #store(): CredentialStore {
    if (!isCredentialStore(this.#credentials)) {
      throw new OfficeError("secret-missing", USER_MESSAGES["secret-missing"]);
    }
    return this.#credentials;
  }

  async #forgetActive(configDir: string): Promise<void> {
    await this.#auth.clearCliCredentials(configDir);
    this.#lastError = undefined;
  }
}
