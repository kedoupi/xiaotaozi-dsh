import type { Context } from "@deepseek-ai/cordis";
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
    // before apiProxy/workspaceRegistry are composed later in the same profile boot.
    get apiProxy() { return readService(ctx, "apiProxy"); },
    get workspaceRegistry() { return readService(ctx, "workspaceRegistry") ?? readService(ctx, "workspace"); },
  };
}
