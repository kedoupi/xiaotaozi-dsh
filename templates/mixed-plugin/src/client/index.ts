import type { Context } from "@deepseek-ai/cordis";

export const name = "__ID__";
export const inject = ["slots"];

export function apply(_ctx: Context) {
  // Register Web UI through ctx.slots.inject(...) after adding the
  // matching dsh.client.inject Client modules.
}
