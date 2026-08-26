import type { Context } from "@deepseek-ai/cordis";
import { workbenchGuidanceText } from "./announce.ts";
import { archiveHostFromContext } from "./archive/live.ts";
import { registerArchiveRoutes } from "./archive/routes.ts";
import { resolveHelloConfig, surfacesFor, type HelloConfig } from "./config.ts";
import { dshHome } from "./dsh-home.ts";
import { registerHelloSettingsRoute, type WebServer } from "./host-routes.ts";
import { loadSettings, saveSettings } from "./settings-store.ts";
import { boardHostFromContext } from "./board/live.ts";
import { registerBoardRoutes } from "./board/routes.ts";
import { BoardService } from "./board/service.ts";
import { registerGitGraphRoutes } from "./git-graph/routes.ts";
import { workbenchHostFromContext } from "./workbench/live.ts";
import { apply as applyBetterSidebar } from "./sidebar/index.ts";
import type { Context as SidebarContext } from "./sidebar/context-types.ts";

export const name = "hello";
export { Config } from "./schema.ts";
export type { HelloConfig };

type HostContext = Context & { webServer: WebServer };

/** Host entry. Settings live under `$DSH_HOME/plugins/hello/settings.json`. */
export function apply(ctx: Context, config?: Partial<HelloConfig>): void {
  const entry = config ?? {};
  let live = resolveHelloConfig(entry, loadSettings());
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
    const write = (patch: Partial<HelloConfig>): HelloConfig => {
      live = resolveHelloConfig(entry, { ...loadSettings(), ...patch });
      saveSettings(live);
      remount();
      return live;
    };
    ctx.effect(() => {
      const offSettings = registerHelloSettingsRoute(web, () => live, write);
      remount();
      return () => {
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
    }, "dsh-hello host routes");
  });
  ctx.inject(["webServer", "sessions", "webRuntime", "tools"], (full) => {
    applyBetterSidebar(full as unknown as SidebarContext);
  });
  ctx.inject(["systemPrompt"], (promptCtx) => {
    const systemPrompt = (promptCtx as Context & {
      systemPrompt: { section: (spec: { name: string; order: number; text: () => string }) => void };
    }).systemPrompt;
    systemPrompt.section({
      name: "hello:workbench",
      order: 80,
      text: () => workbenchGuidanceText(live),
    });
  });
}
