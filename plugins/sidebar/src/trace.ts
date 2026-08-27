const TRACE_OFF = new Set(["0", "false"]);
const TRACE_ON = new Set(["1", "true"]);
const SECRET = /secret|token|aeskey|password|credential|authorization|cookie/iu;

type Env = Record<string, string | undefined>;

export const TRACE_NS = "dsh-sidebar";

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

export function sanitizeTraceArg(value: unknown): string {
  if (value == null) return String(value);
  if (typeof value === "string") {
    if (SECRET.test(value)) return "<redacted>";
    return value.length > 200 ? `${value.slice(0, 200)}…` : value;
  }
  if (typeof value === "object") {
    try {
      const json = JSON.stringify(value, (key, inner) => (
        SECRET.test(String(key)) ? "<redacted>" : inner
      ));
      if (!json) return "[object]";
      return json.length > 200 ? `${json.slice(0, 200)}…` : json;
    } catch {
      return "[unserializable]";
    }
  }
  return String(value);
}
