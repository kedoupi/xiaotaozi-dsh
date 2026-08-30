import { createHash, randomBytes } from "node:crypto";

export const QWEN_CLIENT_ID = "f0304373b74a44d2b584a3fb70ca9e56";
export const QWEN_DEVICE_URL = "https://chat.qwen.ai/api/v1/oauth2/device/code";
export const QWEN_TOKEN_URL = "https://chat.qwen.ai/api/v1/oauth2/token";
export const QWEN_SCOPE = "openid profile email model.completion";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

export interface DeviceSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  resourceUrl?: string;
  scope?: string;
}

export interface DeviceAttempt {
  readonly authorizeUrl: string;
  readonly userCode: string;
  waitSession(): Promise<DeviceSession>;
  cancel(): void;
  /** Whether no newer attempt has started for this provider. */
  isLatest(): boolean;
}

interface DeviceAttemptSlot {
  generation: symbol;
  attempt: DeviceAttempt;
}

/** RFC 8628 device-code grant against one provider. */
export interface DeviceFlowSpec {
  clientId: string;
  deviceUrl: string;
  tokenUrl: string;
  defaultVerificationUri: string;
  pkce: boolean;
  extraDeviceBody?: Record<string, string>;
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
}

export const QWEN_DEVICE: DeviceFlowSpec = {
  clientId: QWEN_CLIENT_ID,
  deviceUrl: QWEN_DEVICE_URL,
  tokenUrl: QWEN_TOKEN_URL,
  defaultVerificationUri: "https://chat.qwen.ai",
  pkce: true,
  extraDeviceBody: { scope: QWEN_SCOPE },
};

function form(data: Record<string, string>): string {
  return new URLSearchParams(data).toString();
}

async function requestHeaders(spec: DeviceFlowSpec): Promise<Record<string, string>> {
  const extra = spec.headers === undefined ? {} : await spec.headers();
  return {
    "content-type": "application/x-www-form-urlencoded",
    accept: "application/json",
    ...extra,
  };
}

export class DeviceFlowManager {
  private attempts = new Map<string, DeviceAttemptSlot>();
  private generations = new Map<string, symbol>();

  isBusy(provider: string): boolean {
    return this.attempts.has(provider);
  }

  pending(provider: string): DeviceAttempt | undefined {
    return this.attempts.get(provider)?.attempt;
  }

  cancel(provider: string): void {
    this.generations.set(provider, Symbol(provider));
    this.attempts.get(provider)?.attempt.cancel();
  }

  /**
   * Cancel every in-flight device attempt. Used when the plugin unloads
   * (hot reload) so no polling loop outlives the mount.
   */
  cancelAll(): void {
    for (const provider of this.generations.keys()) this.generations.set(provider, Symbol(provider));
    for (const { attempt } of [...this.attempts.values()]) attempt.cancel();
  }

  async start(provider: string, spec: DeviceFlowSpec): Promise<DeviceAttempt> {
    if (this.attempts.has(provider)) {
      throw new Error("正在登录中，请稍等或先点取消");
    }
    const generation = Symbol(provider);
    this.generations.set(provider, generation);
    let cancelled = false;
    let settled = false;
    let terminalError: Error | undefined;
    let authorizeUrl = "";
    let userCode = "";
    const isLatest = (): boolean => this.generations.get(provider) === generation;
    const ownsSlot = (): boolean => this.attempts.get(provider)?.generation === generation;
    let settle!: (error?: Error, session?: DeviceSession) => void;
    const done = new Promise<DeviceSession>((resolve, reject) => {
      settle = (error, session) => {
        if (settled) return;
        settled = true;
        terminalError = error;
        if (ownsSlot()) this.attempts.delete(provider);
        if (error) reject(error);
        else if (session) resolve(session);
      };
    });
    // See OAuthFlowManager: cancellation is available while setup awaits, so
    // the completion promise may reject before start can return it.
    void done.catch(() => undefined);

    const attempt: DeviceAttempt = {
      get authorizeUrl() { return authorizeUrl; },
      get userCode() { return userCode; },
      waitSession: () => done,
      cancel() {
        cancelled = true;
        settle(new Error("已取消登录"));
      },
      isLatest,
    };
    // Atomically reserve the provider before headers(), fetch(), or json().
    this.attempts.set(provider, { generation, attempt });

    const ensureActive = (): void => {
      if (!cancelled && !settled && ownsSlot() && isLatest()) return;
      throw terminalError ?? new Error("这次登录已经失效，请重新点登录");
    };

    try {
      const headers = await requestHeaders(spec);
      ensureActive();
      const deviceBody: Record<string, string> = {
        client_id: spec.clientId,
        ...spec.extraDeviceBody,
      };
      let verifier: string | undefined;
      if (spec.pkce) {
        verifier = randomBytes(32).toString("base64url");
        deviceBody.code_challenge = createHash("sha256").update(verifier).digest("base64url");
        deviceBody.code_challenge_method = "S256";
      }
      const response = await fetch(spec.deviceUrl, {
        method: "POST",
        headers,
        body: form(deviceBody),
      });
      ensureActive();
      if (!response.ok) {
        throw new Error(response.status >= 500 ? "授权服务暂时不可用，请稍后再试" : "授权没有完成，请再试一次");
      }
      const body = await response.json() as {
        device_code?: string;
        user_code?: string;
        verification_uri_complete?: string;
        verification_uri?: string;
        interval?: number;
        expires_in?: number;
      };
      ensureActive();
      if (typeof body.device_code !== "string" || typeof body.user_code !== "string") {
        throw new Error("授权服务没有返回登录码，请再试一次");
      }
      const deviceCode = body.device_code;
      const intervalMs = Math.max(2, body.interval ?? 5) * 1000;
      const deadline = Date.now() + Math.max(60, body.expires_in ?? 300) * 1000;
      userCode = body.user_code;
      authorizeUrl = body.verification_uri_complete
        ?? `${body.verification_uri ?? spec.defaultVerificationUri}?user_code=${body.user_code}`;

      const active = (): boolean => !cancelled && !settled && ownsSlot() && isLatest();
      const poll = async (): Promise<void> => {
        try {
          while (active() && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, intervalMs));
            if (!active()) return;
            let tokenResponse: Response;
            try {
              tokenResponse = await fetch(spec.tokenUrl, {
                method: "POST",
                headers,
                body: form({
                  grant_type: DEVICE_GRANT,
                  client_id: spec.clientId,
                  device_code: deviceCode,
                  ...verifier === undefined ? {} : { code_verifier: verifier },
                }),
              });
            } catch {
              if (!active()) return;
              settle(new Error("授权服务暂时不可用，请稍后再试"));
              return;
            }
            if (!active()) return;
            const text = await tokenResponse.text();
            if (!active()) return;
            let parsed: Record<string, unknown> = {};
            try {
              parsed = JSON.parse(text) as Record<string, unknown>;
            } catch {
              parsed = {};
            }
            if (tokenResponse.ok && typeof parsed.access_token === "string") {
              const refresh = parsed.refresh_token;
              if (typeof refresh !== "string" || refresh.length === 0) {
                settle(new Error("授权没有完成，请再试一次"));
                return;
              }
              const expiresIn = typeof parsed.expires_in === "number" ? parsed.expires_in : 3600;
              settle(undefined, {
                accessToken: parsed.access_token,
                refreshToken: refresh,
                expiresAt: Date.now() + expiresIn * 1000,
                ...typeof parsed.resource_url === "string" ? { resourceUrl: parsed.resource_url } : {},
                ...typeof parsed.scope === "string" ? { scope: parsed.scope } : {},
              });
              return;
            }
            const oauthError = parsed.error;
            if (oauthError === "authorization_pending") continue;
            if (oauthError === "slow_down") {
              await new Promise((resolve) => setTimeout(resolve, intervalMs));
              continue;
            }
            if (oauthError === "expired_token") {
              settle(new Error("登录超时，请再点一次登录"));
              return;
            }
            if (oauthError === "access_denied") {
              settle(new Error("授权被拒绝，请重新登录"));
              return;
            }
            const status = tokenResponse.status;
            settle(new Error(status >= 500 || status === 429 || status === 408
              ? "授权服务暂时不可用，请稍后再试"
              : "授权没有完成，请再试一次"));
            return;
          }
          if (!settled) settle(new Error(cancelled ? "已取消登录" : "登录超时，请再点一次登录"));
        } catch (error) {
          if (!settled) {
            settle(error instanceof Error ? error : new Error("授权服务暂时不可用，请稍后再试"));
          }
        }
      };
      void poll();
      return attempt;
    } catch (error) {
      const failure = terminalError ?? (error instanceof Error ? error : new Error("授权服务暂时不可用，请稍后再试"));
      settle(failure);
      throw failure;
    }
  }
}

export async function refreshQwen(session: { refreshToken: string; resourceUrl?: string; account?: string }): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  resourceUrl?: string;
  account?: string;
}> {
  const response = await fetch(QWEN_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: form({
      grant_type: "refresh_token",
      refresh_token: session.refreshToken,
      client_id: QWEN_CLIENT_ID,
    }),
  });
  const parsed = await response.json() as Record<string, unknown>;
  if (!response.ok || typeof parsed.access_token !== "string") {
    if (response.status === 401 || response.status === 403) {
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
    ...session.resourceUrl === undefined && typeof parsed.resource_url !== "string"
      ? {}
      : { resourceUrl: typeof parsed.resource_url === "string" ? parsed.resource_url : session.resourceUrl },
    ...session.account === undefined ? {} : { account: session.account },
  };
}

export function isQwenPermanentRefreshError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("invalid_grant") || message.includes("revoked");
}
