import {
  FEATURE_SHIPPED,
  pickFeaturePatch,
  surfacesFor,
  type FeatureShipped,
  type HelloConfig,
} from "./config.ts";
import { RouteError, readJsonBody, rejectUntrusted, sendJson, type WebServer } from "./http.ts";
import { HELLO_SETTINGS_ROUTE } from "./names.ts";

export type { WebServer };

export const HELLO_IDENTITY_ROUTE = "/.well-known/xiaotaozi-dsh/identity/v1";
export const HELLO_IDENTITY = Object.freeze({
  product: "xiaotaozi-dsh",
  protocol: "xiaotaozi-dsh.identity.v1",
  profile: "web",
  ready: true,
} as const);

const INSTANCE_TOKEN = /^[a-f0-9]{64}$/u;

function identityPayload(readInstanceToken: () => string | undefined): typeof HELLO_IDENTITY & { instanceToken?: string } {
  const token = readInstanceToken()?.trim();
  return token !== undefined && INSTANCE_TOKEN.test(token)
    ? { ...HELLO_IDENTITY, instanceToken: token }
    : HELLO_IDENTITY;
}

/** Fixed, side-effect-free identity/readiness route for local supervisors. */
export function registerHelloIdentityRoute(
  webServer: WebServer,
  readInstanceToken: () => string | undefined = () => process.env.XIAOTAOZI_DSH_INSTANCE_TOKEN,
): () => void {
  return webServer.register({
    kind: "exact",
    path: HELLO_IDENTITY_ROUTE,
    handler: (req, res) => {
      if (rejectUntrusted(req, res)) return;
      if (req.method !== "GET") {
        sendJson(res, 405, { ok: false, error: "method not allowed" });
        return;
      }
      sendJson(res, 200, identityPayload(readInstanceToken));
    },
  });
}

export function settingsPayload(
  config: HelloConfig,
  shipped: FeatureShipped = FEATURE_SHIPPED,
): { ok: true; config: HelloConfig; shipped: FeatureShipped; surfaces: ReturnType<typeof surfacesFor> } {
  return { ok: true, config, shipped, surfaces: surfacesFor(config, shipped) };
}

export function registerHelloSettingsRoute(
  webServer: WebServer,
  read: () => HelloConfig,
  write: (patch: Partial<HelloConfig>) => HelloConfig,
  shipped: FeatureShipped = FEATURE_SHIPPED,
): () => void {
  return webServer.register({
    kind: "exact",
    path: HELLO_SETTINGS_ROUTE,
    handler: async (req, res) => {
      if (rejectUntrusted(req, res)) return;
      try {
        if (req.method === "GET" || req.method === "HEAD") {
          sendJson(res, 200, settingsPayload(read(), shipped));
          return;
        }
        if (req.method === "POST") {
          const body = await readJsonBody(req);
          const patch = pickFeaturePatch(body);
          sendJson(res, 200, settingsPayload(write(patch), shipped));
          return;
        }
        sendJson(res, 405, { ok: false, error: "method not allowed" });
      } catch (error) {
        if (error instanceof RouteError) {
          sendJson(res, error.status, { ok: false, error: error.message });
          return;
        }
        sendJson(res, 500, { ok: false, error: "internal" });
      }
    },
  });
}
