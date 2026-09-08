import type { Context } from "@deepseek-ai/cordis";
import { boardSessionApi } from "./host-session.ts";
import type { BoardHost } from "./service.ts";

function readService(ctx: Context, name: string): unknown {
  try {
    return ctx.get(name);
  } catch {
    return undefined;
  }
}

export function boardHostFromContext(ctx: Context): BoardHost {
  return {
    // Resolve optional Host services lazily: xtz-ui may mount when webServer is ready
    // before sessionController/workspaceRegistry are composed later in the same profile boot.
    get apiProxy() { return boardSessionApi(readService(ctx, "sessionController")); },
    get workspaceRegistry() { return readService(ctx, "workspaceRegistry") ?? readService(ctx, "workspace"); },
  };
}
