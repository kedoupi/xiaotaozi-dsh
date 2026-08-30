import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import QRCode from "qrcode";
import { authInit, authStatus, clearCliCredentials, cliVersion } from "./auth.ts";
import { OfficeError, publicErrorMessage, USER_MESSAGES } from "./errors.ts";
import { deriveOfficeBotIdentity, isImBotId, maskRemoteBotId } from "./identity.ts";
import { loadImWecomBots, maskImBots, type ImWecomBot } from "./im-bridge.ts";
import { OfficeQrAuth } from "./qr-auth.ts";
import {
  resolveConfigDir,
  type OfficeIdentity,
  type StandaloneBot,
  type WecomOfficeSettings,
} from "./settings.ts";
import type { OfficeBotOption, OfficeMainStatus, OfficeQrView, OfficeStatusPayload } from "./office-types.ts";
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

interface QrAttempt {
  attemptId: string;
  scode: string;
  verificationUrl: string;
  expiresAt: number;
  pollIntervalMs: number;
  qrRevision: number;
  status: OfficeQrView["status"];
  qrCodeDataUrl?: string;
  error?: { code: string; message: string };
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
  #qr: Pick<OfficeQrAuth, "start" | "poll">;
  #encodeQr: (url: string) => Promise<string>;
  #attempt: QrAttempt | null = null;
  #lastError: { code: string; message: string } | undefined;
  #boundFailed = false;

  constructor(options: {
    resolveSettings: () => WecomOfficeSettings;
    writeSettings?: (patch: Partial<WecomOfficeSettings>) => Promise<void>;
    credentials?: CredentialStore;
    loadImBots?: () => Promise<ImWecomBot[]>;
    auth?: Partial<OfficeAuthPort>;
    qr?: Pick<OfficeQrAuth, "start" | "poll">;
    encodeQr?: (url: string) => Promise<string>;
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
    this.#qr = options.qr ?? new OfficeQrAuth();
    this.#encodeQr = options.encodeQr ?? ((url) => QRCode.toDataURL(url, {
      type: "image/png",
      errorCorrectionLevel: "M",
      margin: 2,
      width: 320,
    }));
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
      qr: this.#publicQr(),
      ...(this.#lastError ? { lastError: this.#lastError } : {}),
      configDir,
      cliPath: settings.cliPath,
      writable: this.#writeSettings !== undefined,
      allowWrite: settings.allowWrite,
      guidance: settings.guidance,
    };
  }

  async select(botId: string, imAvailable: boolean): Promise<OfficeStatusPayload> {
    await this.#writeSettings?.({ selectedBotId: botId });
    return this.snapshot(imAvailable);
  }

  async activate(botId: string, imAvailable: boolean): Promise<OfficeStatusPayload> {
    const settings = this.#resolveSettings();
    const configDir = resolveConfigDir(settings);
    await mkdir(configDir, { recursive: true, mode: 0o700 });
    this.#lastError = undefined;
    this.#boundFailed = false;
    try {
      const target = await this.#resolveBot(botId, settings);
      pluginTrace(`activate bot=${shortId(target.botId)} source=${target.source} im=${String(imAvailable)}`);
      const secret = await this.#store().resolve(target.secretRef);
      if (!secret?.value) throw new OfficeError("secret-missing", USER_MESSAGES["secret-missing"]);
      await this.#auth.authInit({
        cliPath: settings.cliPath,
        configDir,
        timeoutMs: settings.callTimeoutMs,
        maxOutputBytes: settings.maxCliOutputBytes,
        remoteBotId: target.remoteBotId,
        secret: secret.value,
      });
      await this.#writeSettings?.({
        selectedBotId: target.botId,
        activeBotId: target.botId,
        activeIdentity: target,
      });
      pluginTrace(`activate bot=${shortId(target.botId)} ok`);
    } catch (error) {
      this.#lastError = publicErrorMessage(error);
      if (!imAvailable) this.#boundFailed = true;
      pluginTrace(`activate bot=${shortId(botId)} error=${this.#lastError.code}`);
    }
    return this.snapshot(imAvailable);
  }

  async bindManual(remoteBotId: string, secret: string, imAvailable: boolean): Promise<OfficeStatusPayload> {
    const remote = remoteBotId.trim();
    const secretValue = secret.trim();
    if (!remote || !secretValue) throw new OfficeError("invalid-args", USER_MESSAGES["invalid-args"]);
    const settings = this.#resolveSettings();
    const configDir = resolveConfigDir(settings);
    await mkdir(configDir, { recursive: true, mode: 0o700 });
    const identity = deriveOfficeBotIdentity(remote);
    pluginTrace(`bindManual bot=${shortId(identity.botId)} im=${String(imAvailable)}`);
    await this.#store().set(identity.secretRef, secretValue);
    const standalone: StandaloneBot = {
      botId: identity.botId,
      remoteBotId: remote,
      secretRef: identity.secretRef,
      name: "企业微信机器人",
    };
    await this.#writeSettings?.({ standaloneBot: standalone, selectedBotId: identity.botId });
    return this.activate(identity.botId, imAvailable);
  }

  async qrStart(imAvailable: boolean): Promise<OfficeStatusPayload> {
    if (imAvailable) throw new OfficeError("im-unavailable", USER_MESSAGES["im-unavailable"]);
    pluginTrace("qr start");
    const started = await this.#qr.start();
    this.#attempt = {
      attemptId: randomUUID(),
      scode: started.scode,
      verificationUrl: started.verificationUrl,
      expiresAt: started.expiresAt,
      pollIntervalMs: started.pollIntervalMs,
      qrRevision: (this.#attempt?.qrRevision ?? 0) + 1,
      status: "pending",
      qrCodeDataUrl: await this.#encodeQr(started.verificationUrl),
    };
    return this.snapshot(imAvailable);
  }

  async qrPoll(attemptId: string, imAvailable: boolean): Promise<OfficeStatusPayload> {
    const attempt = this.#attempt;
    if (!attempt || attempt.attemptId !== attemptId) {
      throw new OfficeError("qr-failed", "扫码任务已经不存在。");
    }
    if (Date.now() > attempt.expiresAt) {
      attempt.status = "failed";
      attempt.error = { code: "qr-expired", message: USER_MESSAGES["qr-expired"] };
      pluginTrace("qr poll status=expired");
      return this.snapshot(imAvailable);
    }
    const polled = await this.#qr.poll({ scode: attempt.scode });
    if (polled.status === "waiting") return this.snapshot(imAvailable);
    if (polled.status === "expired") {
      attempt.status = "failed";
      attempt.error = { code: "qr-expired", message: USER_MESSAGES["qr-expired"] };
      pluginTrace("qr poll status=expired");
      return this.snapshot(imAvailable);
    }
    if (polled.status === "failed") {
      attempt.status = "failed";
      attempt.error = { code: "qr-failed", message: USER_MESSAGES["qr-failed"] };
      pluginTrace("qr poll status=failed");
      return this.snapshot(imAvailable);
    }
    const identity = deriveOfficeBotIdentity(polled.remoteBotId);
    pluginTrace(`qr poll success bot=${shortId(identity.botId)}`);
    await this.#store().set(identity.secretRef, polled.secret);
    await this.#writeSettings?.({
      standaloneBot: {
        botId: identity.botId,
        remoteBotId: polled.remoteBotId,
        secretRef: identity.secretRef,
        name: polled.name ?? "企业微信机器人",
      },
      selectedBotId: identity.botId,
    });
    this.#attempt = null;
    return this.activate(identity.botId, imAvailable);
  }

  async qrCancel(imAvailable: boolean): Promise<OfficeStatusPayload> {
    pluginTrace("qr cancel");
    this.#attempt = this.#attempt ? { ...this.#attempt, status: "cancelled" } : null;
    return this.snapshot(imAvailable);
  }

  async clearStandalone(imAvailable: boolean): Promise<OfficeStatusPayload> {
    pluginTrace("clear identity");
    const settings = this.#resolveSettings();
    const configDir = resolveConfigDir(settings);
    const store = this.#credentials;
    if (settings.standaloneBot?.secretRef) {
      await store?.unset(settings.standaloneBot.secretRef).catch(() => undefined);
    }
    if (settings.activeIdentity?.source === "standalone" && settings.activeIdentity.secretRef
      && settings.activeIdentity.secretRef !== settings.standaloneBot?.secretRef) {
      await store?.unset(settings.activeIdentity.secretRef).catch(() => undefined);
    }
    await this.#auth.clearCliCredentials(configDir);
    this.#boundFailed = false;
    this.#lastError = undefined;
    this.#attempt = null;
    await this.#writeSettings?.({
      standaloneBot: null,
      selectedBotId: "",
      activeBotId: "",
      activeIdentity: null,
    });
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

  async #resolveBot(botId: string, settings: WecomOfficeSettings): Promise<OfficeIdentity> {
    const imBots = await this.#loadImBots();
    const im = imBots.find((item) => item.botId === botId);
    if (im) {
      return {
        botId: im.botId,
        remoteBotId: im.remoteBotId,
        secretRef: im.secretRef,
        name: im.name,
        source: "im",
      };
    }
    if (settings.standaloneBot?.botId === botId) {
      return { ...asStandalone(settings.standaloneBot), source: "standalone" };
    }
    if (settings.activeIdentity?.botId === botId) return settings.activeIdentity;
    throw new OfficeError("im-bot-missing", USER_MESSAGES["im-bot-missing"]);
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

  #publicQr(): OfficeQrView | null {
    if (!this.#attempt || this.#attempt.status === "connected") return null;
    return {
      attemptId: this.#attempt.attemptId,
      status: this.#attempt.status,
      expiresAt: this.#attempt.expiresAt,
      pollIntervalMs: this.#attempt.pollIntervalMs,
      qrRevision: this.#attempt.qrRevision,
      ...(this.#attempt.qrCodeDataUrl ? { qrCodeDataUrl: this.#attempt.qrCodeDataUrl } : {}),
      ...(this.#attempt.error ? { error: this.#attempt.error } : {}),
    };
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
