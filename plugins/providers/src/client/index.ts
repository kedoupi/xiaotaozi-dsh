import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type { HostApi } from "./host-api.ts";
import { hideOfficialModels } from "./hide-official.ts";
import { ModelsWorkspace } from "./ModelsWorkspace.tsx";
import type { ModelsWorkspaceInjected } from "./ModelsWorkspace.tsx";
import { ImageGenerateToolview, createImageLoader } from "./ImageGenerateToolview.tsx";
import type { ImageGenerateToolviewInjected } from "./ImageGenerateToolview.tsx";
import { VideoGenerateToolview, createVideoLoader } from "./VideoGenerateToolview.tsx";
import type { VideoGenerateToolviewInjected } from "./VideoGenerateToolview.tsx";
import { en, zh } from "./locales.ts";
import type { ProvidersKey } from "./locales.ts";
import { css } from "./styles.ts";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    "settings.providers": ProvidersKey;
  }
}

const NS = "settings.providers";

export const inject = ["slots", "connection", "locale"];

function ensureStyles(): () => void {
  const existing = document.querySelector('style[data-plugin-css="dsh-providers"]');
  if (existing !== null) return () => {};
  const node = document.createElement("style");
  node.dataset.pluginCss = "dsh-providers";
  node.textContent = css;
  document.head.append(node);
  return () => node.remove();
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ensureStyles(), "dsh-providers css");
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-providers copy");
  const connection = ctx.get("connection") as { rpc: ModelsWorkspaceInjected["rpc"]; api?: HostApi };
  const t = ctx.locale.bind(NS) as ModelsWorkspaceInjected["t"];
  ctx.effect(() => hideOfficialModels(t("nav")), "dsh-providers hide official Models");
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "models",
    order: 10,
    priority: -1,
    label: () => t("nav"),
    inject: (): ModelsWorkspaceInjected => ({ rpc: connection.rpc, api: connection.api, t }),
  }, ModelsWorkspace));
  const load = createImageLoader(connection.rpc);
  ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
    name: "tool.call.toolview",
    key: "image_generate",
    locale: NS,
    inject: (): ImageGenerateToolviewInjected => ({ load }),
  }, ImageGenerateToolview));
  const loadVideo = createVideoLoader(connection.rpc);
  ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
    name: "tool.call.toolview",
    key: "video_generate",
    locale: NS,
    inject: (): VideoGenerateToolviewInjected => ({ loadVideo }),
  }, VideoGenerateToolview));
}
