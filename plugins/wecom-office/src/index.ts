import type { Context } from "@deepseek-ai/cordis";
import type { IncomingMessage, ServerResponse } from "node:http";
import { OFFICE_GUIDANCE_SECTION, officeGuidanceText } from "./guidance.ts";
import { detectLoadedImPlugin } from "./im-available.ts";
import { PLUGIN_ID, PLUGIN_PACKAGE } from "./names.ts";
import { isCredentialStore, OfficeController, type CredentialStore } from "./office-controller.ts";
import { Config, installOfficeSettings, type WecomOfficeSettings } from "./settings.ts";
import { registerOfficeStatusRoute } from "./status-route.ts";
import { registerOfficeTools } from "./tools.ts";
import { pluginTrace } from "./trace.ts";

export const name = "wecom-office";
export const inject = ["tools", "credentials"];
export { Config };
export type { WecomOfficeSettings };
export { PLUGIN_ID, PLUGIN_PACKAGE as PLUGIN_NAME };

type Logger = { info(message: string): void; warn(message: string): void };

type HostContext = Context & {
  tools: { register(tool: unknown): void };
  logger?: Logger;
  credentials?: CredentialStore;
};

interface WebServerLike {
  register(route: {
    kind: "exact";
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
  }): () => void;
}

export async function apply(ctx: Context, config?: Partial<WecomOfficeSettings>): Promise<() => Promise<void>> {
  const host = ctx as HostContext;
  const credentials = (ctx.get("credentials") as CredentialStore | undefined) ?? host.credentials;
  if (!isCredentialStore(credentials)) {
    throw new TypeError("dsh-wecom-office requires the DSH credential provider");
  }

  const entry = config ?? {};
  let settingsSource = () => ({ ...entry }) as WecomOfficeSettings;
  let settingsWriter: ((patch: Partial<WecomOfficeSettings>) => Promise<void>) | undefined;
  await installOfficeSettings(entry, {
    setSource: (source) => {
      settingsSource = source;
    },
    setWriter: (writer) => {
      settingsWriter = writer;
    },
  });

  const controller = new OfficeController({
    resolveSettings: () => settingsSource(),
    writeSettings: settingsWriter,
    credentials,
  });

  registerOfficeTools(host, () => settingsSource());

  ctx.inject(["systemPrompt"], (promptCtx) => {
    const systemPrompt = (promptCtx as Context & {
      systemPrompt: { section: (spec: { name: string; order: number; text: () => string }) => void };
    }).systemPrompt;
    systemPrompt.section({
      name: OFFICE_GUIDANCE_SECTION.name,
      order: OFFICE_GUIDANCE_SECTION.order,
      text: () => officeGuidanceText(settingsSource(), Boolean(settingsSource().activeBotId)),
    });
  });

  let webRegistered = false;
  const registerWebSurface = (): void => {
    if (webRegistered) return;
    const webServer = ctx.get("webServer") as WebServerLike | undefined;
    if (webServer === undefined) return;
    webRegistered = true;
    pluginTrace("rpc route registered");
    ctx.effect(
      () => registerOfficeStatusRoute(webServer, controller, () => detectLoadedImPlugin(ctx.registry)),
      "wecom-office: status route",
    );
  };
  registerWebSurface();
  ctx.on("internal/service", (serviceName) => {
    if (serviceName === "webServer") registerWebSurface();
  });

  pluginTrace("mounted");
  host.logger?.info("dsh-wecom-office mounted");
  return async () => {};
}
