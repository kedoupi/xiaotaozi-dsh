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
    apiProxy: readService(ctx, "apiProxy"),
    workspaceRegistry: readService(ctx, "workspaceRegistry") ?? readService(ctx, "workspace"),
  };
}
