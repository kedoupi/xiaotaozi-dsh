import type { Context } from "@deepseek-ai/cordis";
import { workbenchGuidanceText } from "./announce.ts";
import { archiveHostFromContext } from "./archive/live.ts";
import { registerArchiveRoutes } from "./archive/routes.ts";
import { resolveXtzUiConfig, surfacesFor, type XtzUiConfig } from "./config.ts";
import { dshHome } from "./dsh-home.ts";
import { registerIdentityRoute, registerXtzUiSettingsRoute, type WebServer } from "./host-routes.ts";
import { loadSettings, saveSettings } from "./settings-store.ts";
import { boardHostFromContext } from "./board/live.ts";
import { registerBoardRoutes } from "./board/routes.ts";
import { BoardService } from "./board/service.ts";
import { registerGitGraphRoutes } from "./git-graph/routes.ts";
import { workbenchHostFromContext } from "./workbench/live.ts";
import { pluginTrace } from "./trace.ts";

export const name = "xtz-ui";
export { Config } from "./schema.ts";
export type { XtzUiConfig };

type HostContext = Context & { webServer: WebServer };

/** Host entry. Settings live under `$DSH_HOME/plugins/xtz-ui/settings.json`. */
export function apply(ctx: Context, config?: Partial<XtzUiConfig>): void {
  const entry = config ?? {};
  let live = resolveXtzUiConfig(entry, loadSettings());
  ctx.inject(["webServer"], (host) => {
    const web = (host as HostContext).webServer;
    let disposeArchive: (() => void) | undefined;
    let disposeBoard: (() => void) | undefined;
    let disposeGraph: (() => void) | undefined;
    let boardService: BoardService | undefined;
    const remount = (): void => {
      disposeArchive?.();
      disposeArchive = undefined;
      disposeBoard?.();
      disposeBoard = undefined;
      disposeGraph?.();
      disposeGraph = undefined;
      boardService?.dispose();
      boardService = undefined;
      const surfaces = surfacesFor(live);
      pluginTrace(`remount surfaces=${surfaces.join(",") || "none"}`);
      if (surfaces.includes("archive")) {
        disposeArchive = registerArchiveRoutes(web, dshHome(), archiveHostFromContext(ctx));
      }
      if (surfaces.includes("board")) {
        boardService = new BoardService(boardHostFromContext(ctx));
        boardService.start();
        disposeBoard = registerBoardRoutes(web, boardService);
      }
      if (surfaces.includes("gitGraph")) {
        disposeGraph = registerGitGraphRoutes(web, dshHome(), workbenchHostFromContext(ctx));
      }
    };
    const write = (patch: Partial<XtzUiConfig>): XtzUiConfig => {
      pluginTrace(`settings write keys=${Object.keys(patch).join(",") || "none"}`);
      live = resolveXtzUiConfig(entry, { ...loadSettings(), ...patch });
      saveSettings(live);
      remount();
      return live;
    };
    ctx.effect(() => {
      const offIdentity = registerIdentityRoute(web);
      const offSettings = registerXtzUiSettingsRoute(web, () => live, write);
      remount();
      return () => {
        offIdentity();
        offSettings();
        disposeArchive?.();
        disposeArchive = undefined;
        disposeBoard?.();
        disposeBoard = undefined;
        disposeGraph?.();
        disposeGraph = undefined;
        boardService?.dispose();
        boardService = undefined;
      };
    }, "dsh-xtz-ui host routes");
  });
  ctx.inject(["systemPrompt"], (promptCtx) => {
    const systemPrompt = (promptCtx as Context & {
      systemPrompt: { section: (spec: { name: string; order: number; text: () => string }) => void };
    }).systemPrompt;
    systemPrompt.section({
      name: "xtz-ui:xiaotaozi",
      order: 80,
      text: () => workbenchGuidanceText(live),
    });
  });
  pluginTrace("mounted");
}
