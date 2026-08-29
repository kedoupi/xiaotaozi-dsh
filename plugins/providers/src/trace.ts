const TRACE_OFF = new Set(["0", "false"]);
const TRACE_ON = new Set(["1", "true"]);

type Env = Record<string, string | undefined>;

export const TRACE_NS = "dsh-providers";

export function pluginTraceEnabled(env: Env = process.env as Env): boolean {
  const explicit = env.DSH_PLUGIN_TRACE;
  if (typeof explicit === "string" && TRACE_OFF.has(explicit.trim().toLowerCase())) return false;
  if (typeof explicit === "string" && TRACE_ON.has(explicit.trim().toLowerCase())) return true;
  return Boolean(env.XIAOTAOZI_DSH_SANDBOX);
}

export function shortId(value: unknown, keep = 12): string {
  if (typeof value !== "string" || !value) return "-";
  return value.length <= keep ? value : `${value.slice(0, keep)}…`;
}

export function pluginTrace(
  message: string,
  env: Env = process.env as Env,
  write: (chunk: string) => void = (chunk) => {
    process.stdout.write(chunk);
  },
): void {
  if (!pluginTraceEnabled(env) || typeof message !== "string" || !message) return;
  write(`[${TRACE_NS}] ${message}\n`);
}
