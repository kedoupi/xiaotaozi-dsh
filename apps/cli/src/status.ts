import { request } from "node:http";
import { createConnection } from "node:net";

export const OFFICIAL_HOST = "127.0.0.1";
export const OFFICIAL_PORT = 3080;
export const OFFICIAL_URL = `http://${OFFICIAL_HOST}:${OFFICIAL_PORT}/`;
export const IDENTITY_PATH = "/.well-known/xiaotaozi-dsh/identity/v1";

export type ServiceState = "running" | "http-occupied" | "port-conflict" | "stopped";

export interface ServiceStatus {
  state: ServiceState;
  healthy: boolean;
  host: string;
  port: number;
  url: string;
  owner: "xiaotaozi-dsh" | "none" | "unknown";
}

const EXPECTED_IDENTITY = {
  product: "xiaotaozi-dsh",
  protocol: "xiaotaozi-dsh.identity.v1",
  profile: "web",
  ready: true,
} as const;
const INSTANCE_TOKEN = /^[a-f0-9]{64}$/u;
const IDENTITY_FIELDS = new Set([...Object.keys(EXPECTED_IDENTITY), "instanceToken"]);

function validIdentity(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const identity = value as Record<string, unknown>;
  if (Object.keys(identity).some((key) => !IDENTITY_FIELDS.has(key))) return false;
  if (!Object.entries(EXPECTED_IDENTITY).every(([key, expected]) => identity[key] === expected)) return false;
  return identity.instanceToken === undefined
    || (typeof identity.instanceToken === "string" && INSTANCE_TOKEN.test(identity.instanceToken));
}

function probeHttpIdentity(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<"identity" | "http" | "none"> {
  return new Promise((resolve) => {
    let settled = false;
    let responded = false;
    const finish = (value: "identity" | "http" | "none") => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolve(value);
    };
    const deadline = setTimeout(() => {
      req.destroy();
      finish(responded ? "http" : "none");
    }, timeoutMs);
    const req = request({
      host,
      port,
      path: IDENTITY_PATH,
      method: "GET",
      headers: { Accept: "application/json" },
    }, (res) => {
      responded = true;
      const chunks: Buffer[] = [];
      let bytes = 0;
      res.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.byteLength;
        if (bytes > 4_096) {
          res.destroy();
          finish("http");
          return;
        }
        chunks.push(buffer);
      });
      res.once("error", () => finish("http"));
      res.once("end", () => {
        if (
          res.statusCode !== 200
          || res.headers["content-type"] !== "application/json; charset=utf-8"
          || res.headers["cache-control"] !== "no-store"
        ) {
          finish("http");
          return;
        }
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
          finish(validIdentity(body) ? "identity" : "http");
        } catch {
          finish("http");
        }
      });
    });
    req.once("error", () => finish(responded ? "http" : "none"));
    req.end();
  });
}

function tcpListens(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const socket = createConnection({ host, port });
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

export async function probeService(
  host = OFFICIAL_HOST,
  port = OFFICIAL_PORT,
  timeoutMs = 800,
): Promise<ServiceStatus> {
  const url = `http://${host}:${port}/`;
  const http = await probeHttpIdentity(host, port, timeoutMs);
  if (http === "identity") {
    return { state: "running", healthy: true, host, port, url, owner: "xiaotaozi-dsh" };
  }
  if (http === "http") {
    return { state: "http-occupied", healthy: false, host, port, url, owner: "unknown" };
  }
  if (await tcpListens(host, port, timeoutMs)) {
    return { state: "port-conflict", healthy: false, host, port, url, owner: "unknown" };
  }
  return { state: "stopped", healthy: false, host, port, url, owner: "none" };
}
