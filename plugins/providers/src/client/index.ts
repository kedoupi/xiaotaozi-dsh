import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type { HostApi } from "./host-api.ts";
import { hideOfficialModels } from "./hide-official.ts";
import { ModelsWorkspace } from "./ModelsWorkspace.tsx";
import type { ModelsWorkspaceInjected } from "./ModelsWorkspace.tsx";
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
}
