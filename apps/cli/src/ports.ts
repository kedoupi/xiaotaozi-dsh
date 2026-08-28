import { OFFICIAL_HOST, OFFICIAL_PORT } from "./status";

/** Sandbox `pnpm dev` only. Official xtz never listens here. */
export const SANDBOX_PORT = 3081;
export const ALTERNATE_PORT_START = 3082;
export const ALTERNATE_PORT_END = 3099;

export function serviceUrl(port: number, host = OFFICIAL_HOST): string {
  return `http://${host}:${port}/`;
}

export function isListenPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1024 && port <= 65535 && port !== SANDBOX_PORT;
}

export function isStampPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1024 && port <= 65535;
}

export function webLaunchArgs(port: number): string[] {
  return ["web", "--host", OFFICIAL_HOST, "--port", String(port), "--no-open"];
}

export function* alternatePorts(): Generator<number> {
  for (let port = ALTERNATE_PORT_START; port <= ALTERNATE_PORT_END; port += 1) {
    yield port;
  }
}

export { OFFICIAL_PORT };
