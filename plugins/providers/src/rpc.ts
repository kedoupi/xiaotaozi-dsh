import type { Context } from "@deepseek-ai/cordis";
import type { ImageAttachmentRef } from "@deepseek-ai/dsh-attachment";
import { explainHostError } from "./auth/explain.ts";
import type { ProviderId } from "./auth/store.ts";
import { requireEnabledProvider } from "./catalog.ts";
import { readImageRef } from "./image-ref.ts";
import type { ProviderUsage } from "./providers/common.ts";
import { readVideoName } from "./video-ref.ts";
import type { VideoBytes } from "./video-ref.ts";

export interface ImageBytesResult {
  mediaType: string;
  dataBase64: string;
}

export type VideoBytesResult = VideoBytes;

export interface CatalogModel {
  id: string;
  name: string;
  selected: boolean;
}

export interface CatalogVendor {
  id: ProviderId;
  name: string;
  models: CatalogModel[];
}

export const PROVIDERS_CHANNEL = "/providers-auth";

export interface ProviderStatus {
  loggedIn: boolean;
  busy: boolean;
  expiresAt?: number;
  account?: string;
  detail?: string;
  deviceName?: string;
  deviceDetail?: string;
  authorizeUrl?: string;
  userCode?: string;
}

export interface AuthController {
  status(provider: ProviderId): Promise<ProviderStatus>;
  login(provider: ProviderId): Promise<{ authorizeUrl: string; userCode?: string }>;
  manual(provider: ProviderId, input: string): Promise<void>;
  cancel(provider: ProviderId): Promise<void>;
  logout(provider: ProviderId): Promise<void>;
  usage(provider: ProviderId, signal: AbortSignal): Promise<ProviderUsage>;
  catalog(): Promise<{ vendors: CatalogVendor[] }>;
  setModels(provider: ProviderId, ids: string[]): Promise<void>;
  readImage(ref: ImageAttachmentRef, signal: AbortSignal): Promise<ImageBytesResult>;
  readVideo(name: string, signal: AbortSignal): Promise<VideoBytesResult>;
}

type RpcResult = { ok: true; value: unknown } | { ok: false; error: { code: string; message: string; details: Record<string, unknown> } };

function ok(value: unknown): RpcResult {
  return { ok: true, value };
}

function fail(message: string, code = "internal"): RpcResult {
  return { ok: false, error: { code, message, details: {} } };
}

function readProvider(payload: unknown, enabled: readonly ProviderId[]): ProviderId {
  if (typeof payload !== "object" || payload === null) throw new Error("payload must be an object");
  return requireEnabledProvider(enabled, (payload as { provider?: unknown }).provider);
}

async function dispatch(
  controller: AuthController,
  endpoint: string,
  payload: unknown,
  signal: AbortSignal,
  enabled: readonly ProviderId[],
): Promise<RpcResult> {
  switch (endpoint) {
    case "status": {
      const entries = await Promise.all(enabled.map(async (provider) => [provider, await controller.status(provider)] as const));
      return ok({ providers: Object.fromEntries(entries), enabled: [...enabled] });
    }
    case "login":
      return ok(await controller.login(readProvider(payload, enabled)));
    case "manual":
      await controller.manual(readProvider(payload, enabled), String((payload as { input?: unknown }).input ?? ""));
      return ok({ ok: true });
    case "cancel":
      await controller.cancel(readProvider(payload, enabled));
      return ok({ ok: true });
    case "logout":
      await controller.logout(readProvider(payload, enabled));
      return ok({ ok: true });
    case "usage":
      return ok(await controller.usage(readProvider(payload, enabled), signal));
    case "catalog":
      return ok(await controller.catalog());
    case "setModels":
      await controller.setModels(
        readProvider(payload, enabled),
        Array.isArray((payload as { ids?: unknown }).ids)
          ? (payload as { ids: unknown[] }).ids.filter((id): id is string => typeof id === "string")
          : [],
      );
      return ok({ ok: true });
    case "image":
      return ok(await controller.readImage(readImageRef(payload), signal));
    case "video":
      return ok(await controller.readVideo(readVideoName(payload), signal));
    default:
      throw new Error(`unknown endpoint ${endpoint}`);
  }
}

export function registerProvidersRpc(ctx: Context, controller: AuthController, enabled: readonly ProviderId[]): void {
  ctx.inject(["connection"], (scoped) => {
    const connection = scoped.get("connection") as {
      rpc: {
        handle: (
          channel: string,
          handler: (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<RpcResult>,
          options: { authority: string },
        ) => () => Promise<void>;
      };
    };
    scoped.effect(
      () => connection.rpc.handle(
        PROVIDERS_CHANNEL,
        async (endpoint, payload, signal) => {
          try {
            return await dispatch(controller, endpoint, payload, signal, enabled);
          } catch (error) {
            return fail(explainHostError(error));
          }
        },
        { authority: "loopback" },
      ),
      "dsh-providers: /providers-auth",
    );
  });
}
