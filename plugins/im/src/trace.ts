const TRACE_OFF = new Set(["0", "false"]);
const TRACE_ON = new Set(["1", "true"]);
const SECRET = /secret|token|aeskey|password|credential/iu;

type Env = Record<string, string | undefined>;

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

export function shortKey(key: unknown): string {
  if (typeof key !== "string" || !key) return "unknown";
  const split = key.indexOf(":");
  return split === -1 ? key.slice(0, 12) : key.slice(0, split);
}

export function slashCommand(text: unknown): string {
  const raw = typeof text === "string" ? text.trim() : "";
  if (!raw.startsWith("/")) return "";
  return raw.split(/\s+/u, 1)[0].toLowerCase();
}

export function inboundSummary({
  chat,
  msgid,
  msgtype,
  text,
  images = false,
  files = false,
}: {
  chat?: string;
  msgid?: unknown;
  msgtype?: unknown;
  text?: unknown;
  images?: boolean;
  files?: boolean;
}): string {
  const cmd = slashCommand(text);
  const kind = cmd || (images ? "image" : files ? "file" : (typeof text === "string" && text.trim() ? "text" : "empty"));
  const chars = typeof text === "string" ? text.trim().length : 0;
  return `inbound chat=${chat ?? "unknown"} msgid=${shortId(msgid)} msgtype=${typeof msgtype === "string" && msgtype ? msgtype : "none"} kind=${kind} chars=${chars}`;
}

export function pluginTrace(
  ns: string,
  message: string,
  env: Env = process.env as Env,
  write: (chunk: string) => void = (chunk) => {
    process.stdout.write(chunk);
  },
): void {
  if (!pluginTraceEnabled(env) || typeof ns !== "string" || !ns || typeof message !== "string") return;
  write(`[${ns}] ${message}\n`);
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

export function pluginSdkLogger(ns: string, env: Env = process.env as Env) {
  const silent = {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
  if (!pluginTraceEnabled(env)) return silent;
  const write = (level: string, args: unknown[]) => {
    pluginTrace(
      `${ns}:sdk`,
      `${level} ${args.map(sanitizeTraceArg).join(" ")}`,
      env,
    );
  };
  return {
    debug: (...args: unknown[]) => write("debug", args),
    info: (...args: unknown[]) => write("info", args),
    warn: (...args: unknown[]) => write("warn", args),
    error: (...args: unknown[]) => write("error", args),
  };
}
