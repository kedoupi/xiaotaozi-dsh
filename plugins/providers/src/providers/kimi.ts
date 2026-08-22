import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { arch, hostname, release, type as osType } from "node:os";
import { LlmAdapter } from "@deepseek-ai/dsh-llm";
import type { GenerateOptions, StreamChunk } from "@deepseek-ai/dsh-llm";
import type { AttachmentStore } from "@deepseek-ai/dsh-attachment";
import type { DeviceFlowSpec } from "../auth/device-flow.ts";
import { advertisedModels } from "../auth/selection.ts";
import type { KimiSession } from "../auth/store.ts";
import { ensurePluginDir, migrateLegacyPluginData, pluginData } from "../paths.ts";
import { resolveImages } from "../translate/resolved.ts";
import { TokenManager } from "./common.ts";
import { streamChatCompletion, toChatMessages } from "./openai-chat.ts";

const ATTRIBUTION = {
  "user-agent": "deepseek-harness/0.1.1-rc.2 (+https://github.com/deepseek-ai/deepseek-harness)",
};

export const KIMI_CLIENT_ID = "17e5f671-d194-4dfb-9706-5516cb48c098";
export const KIMI_OAUTH_HOST = "https://auth.kimi.com";
export const KIMI_DEVICE_URL = `${KIMI_OAUTH_HOST}/api/oauth/device_authorization`;
export const KIMI_TOKEN_URL = `${KIMI_OAUTH_HOST}/api/oauth/token`;
export const KIMI_API_URL = "https://api.kimi.com/coding/v1";
export const KIMI_PREEMPT_MS = 5 * 60_000;

export const KIMI_MODELS = [
  { id: "k3", name: "Kimi K3" },
  { id: "k3-256k", name: "Kimi K3 256K" },
  { id: "kimi-for-coding", name: "Kimi K2.7 Code" },
  { id: "kimi-for-coding-highspeed", name: "Kimi K2.7 Code HighSpeed" },
];

const KIMI_MODALITIES: readonly ("text" | "image")[] = ["text", "image"];

function asciiHeader(value: string, fallback = "unknown"): string {
  const cleaned = value.replaceAll(/[^\u0020-\u007E]/g, "").trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

function deviceModel(): string {
  const system = osType();
  const machine = arch();
  if (system === "Darwin") return asciiHeader(`macOS ${release()} ${machine}`);
  if (system === "Windows_NT") return asciiHeader(`Windows ${release()} ${machine}`);
  return asciiHeader(`${system} ${release()} ${machine}`);
}

async function kimiDeviceId(): Promise<string> {
  await migrateLegacyPluginData();
  const path = pluginData("device-id");
  try {
    const existing = (await readFile(path, "utf8")).trim();
    if (existing.length > 0) return existing;
  } catch {
    // first launch on this machine
  }
  const id = randomUUID();
  await ensurePluginDir();
  await writeFile(path, id, { encoding: "utf8", mode: 0o600 });
  return id;
}

export async function kimiDeviceHeaders(): Promise<Record<string, string>> {
  return {
    "User-Agent": ATTRIBUTION["user-agent"],
    "X-Msh-Platform": "dsh",
    "X-Msh-Version": "0.2.0",
    "X-Msh-Device-Name": asciiHeader(hostname()),
    "X-Msh-Device-Model": deviceModel(),
    "X-Msh-Os-Version": asciiHeader(release()),
    "X-Msh-Device-Id": await kimiDeviceId(),
  };
}

export const KIMI_DEVICE: DeviceFlowSpec = {
  clientId: KIMI_CLIENT_ID,
  deviceUrl: KIMI_DEVICE_URL,
  tokenUrl: KIMI_TOKEN_URL,
  defaultVerificationUri: "https://www.kimi.com",
  pkce: false,
  headers: kimiDeviceHeaders,
};

export async function refreshKimi(session: KimiSession): Promise<KimiSession> {
  const response = await fetch(KIMI_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
      ...await kimiDeviceHeaders(),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: session.refreshToken,
      client_id: KIMI_CLIENT_ID,
    }).toString(),
  });
  const parsed = await response.json() as Record<string, unknown>;
  if (!response.ok || typeof parsed.access_token !== "string") {
    const oauthError = typeof parsed.error === "string" ? parsed.error : "";
    if (response.status === 401 || response.status === 403 || oauthError === "invalid_grant") {
      throw new Error("登录已失效，请重新点登录");
    }
    throw new Error(response.status >= 500 || response.status === 429 || response.status === 408
      ? "授权服务暂时不可用，请稍后再试"
      : "授权没有完成，请再试一次");
  }
  const refreshToken = typeof parsed.refresh_token === "string" ? parsed.refresh_token : session.refreshToken;
  const expiresIn = typeof parsed.expires_in === "number" ? parsed.expires_in : 3600;
  return {
    accessToken: parsed.access_token,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    ...typeof parsed.scope === "string" ? { scope: parsed.scope } : session.scope === undefined ? {} : { scope: session.scope },
    ...session.account === undefined ? {} : { account: session.account },
  };
}

export function isKimiPermanentRefreshError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("invalid_grant") || message.includes("revoked") || message.includes("登录已失效");
}

export interface KimiAdapterOptions {
  tokens: TokenManager<KimiSession>;
  streamIdleTimeoutMs: number;
  resolveAttachments?: () => AttachmentStore | undefined;
}

function kimiHeaders(session: KimiSession): Record<string, string> {
  return {
    authorization: `Bearer ${session.accessToken}`,
    ...ATTRIBUTION,
  };
}

function modelsFrom(payload: unknown): Array<{ id: string; name: string }> {
  if (typeof payload !== "object" || payload === null) return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const models: Array<{ id: string; name: string }> = [];
  for (const item of data) {
    if (typeof item !== "object" || item === null) continue;
    const id = (item as { id?: unknown }).id;
    if (typeof id !== "string" || id.length === 0) continue;
    const display = (item as { display_name?: unknown }).display_name;
    models.push({ id, name: typeof display === "string" && display.length > 0 ? display : id });
  }
  return models;
}

export async function loadKimiModels(tokens: TokenManager<KimiSession>): Promise<Array<{ id: string; name: string }>> {
  if (!(await tokens.hasSession())) return [];
  try {
    const session = await tokens.session();
    const response = await fetch(`${KIMI_API_URL}/models`, {
      headers: { authorization: `Bearer ${session.accessToken}`, ...ATTRIBUTION },
    });
    if (response.ok) {
      const discovered = modelsFrom(await response.json());
      if (discovered.length > 0) return discovered;
    }
  } catch {
    // fall back to the documented catalog
  }
  return [...KIMI_MODELS];
}

export class KimiAdapter extends LlmAdapter {
  constructor(private readonly options: KimiAdapterOptions) {
    super();
  }

  providerInfo(provider: string) {
    return { id: provider, name: "Kimi Code" };
  }

  providerRetryPolicy() {
    return undefined;
  }

  async listModels() {
    const models = await loadKimiModels(this.options.tokens);
    return advertisedModels("kimi", models.map((model) => ({
      provider: "kimi",
      id: model.id,
      name: model.name,
      inputModalities: KIMI_MODALITIES,
    })));
  }

  async resolveModel(_provider: string, model: string) {
    const named = KIMI_MODELS.find((entry) => entry.id === model);
    return {
      provider: "kimi",
      id: model,
      name: named?.name ?? model,
      inputModalities: KIMI_MODALITIES,
    };
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const session = await this.options.tokens.session();
    const messages = await resolveImages(options.messages, this.options.resolveAttachments?.(), options.signal);
    yield* streamChatCompletion({
      label: "Kimi Code",
      url: `${KIMI_API_URL}/chat/completions`,
      headers: kimiHeaders(session),
      body: {
        model: options.model,
        stream: true,
        messages: toChatMessages(options.system, messages),
      },
      signal: options.signal,
      idleTimeoutMs: this.options.streamIdleTimeoutMs,
      onUnauthorized: async () => kimiHeaders(await this.options.tokens.session(true)),
    });
  }
}
