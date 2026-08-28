import { OFFICIAL_PORT, SANDBOX_PORT, isListenPort } from "./ports";

export interface GlobalFlags {
  sandbox: boolean;
  rest: string[];
}

export interface StartOptions {
  port?: number;
  foreground: boolean;
  noOpen: boolean;
  passthrough: string[];
}

export function extractGlobalFlags(argv: string[]): GlobalFlags {
  const rest: string[] = [];
  let sandbox = false;
  for (const arg of argv) {
    if (arg === "--sandbox") {
      sandbox = true;
      continue;
    }
    rest.push(arg);
  }
  return { sandbox, rest };
}

export function parseStartArgs(args: string[]): { ok: true; options: StartOptions } | { ok: false; error: string } {
  let port: number | undefined;
  let foreground = false;
  let noOpen = false;
  const passthrough: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--") {
      passthrough.push(...args.slice(i + 1));
      break;
    }
    if (arg === "--foreground") {
      foreground = true;
      continue;
    }
    if (arg === "--no-open") {
      noOpen = true;
      continue;
    }
    if (arg.startsWith("--port=")) {
      const parsed = parsePortToken(arg.slice("--port=".length));
      if (!parsed.ok) return parsed;
      port = parsed.port;
      continue;
    }
    if (arg === "--port") {
      const value = args[i + 1];
      if (value === undefined || value.startsWith("-")) return { ok: false, error: "--port 需要一个端口号" };
      const parsed = parsePortToken(value);
      if (!parsed.ok) return parsed;
      port = parsed.port;
      i += 1;
      continue;
    }
    return { ok: false, error: "start 只接受 --port、--foreground、--no-open" };
  }
  return { ok: true, options: { port, foreground, noOpen, passthrough } };
}

function parsePortToken(raw: string): { ok: true; port: number } | { ok: false; error: string } {
  if (!/^[0-9]+$/u.test(raw)) return { ok: false, error: "端口必须是数字" };
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return { ok: false, error: "端口无效" };
  return { ok: true, port };
}

export function resolveStartPort(options: StartOptions, sandbox: boolean): { ok: true; port: number } | { ok: false; error: string } {
  if (sandbox) {
    if (options.port !== undefined && options.port !== SANDBOX_PORT) {
      return { ok: false, error: "沙箱固定使用 3081" };
    }
    return { ok: true, port: SANDBOX_PORT };
  }
  if (options.port === SANDBOX_PORT) return { ok: false, error: "3081 是开发沙箱端口，正式 xtz 不会使用" };
  if (options.port !== undefined && !isListenPort(options.port)) return { ok: false, error: "端口无效" };
  return { ok: true, port: options.port ?? OFFICIAL_PORT };
}
