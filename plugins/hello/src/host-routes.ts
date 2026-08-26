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
