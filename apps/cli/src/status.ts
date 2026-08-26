import { request } from "node:http";
import { createConnection } from "node:net";

export const OFFICIAL_HOST = "127.0.0.1";
export const OFFICIAL_PORT = 3080;
export const OFFICIAL_URL = `http://${OFFICIAL_HOST}:${OFFICIAL_PORT}/`;

export type ServiceState = "http-occupied" | "port-conflict" | "stopped";

export interface ServiceStatus {
  state: ServiceState;
  healthy: false;
  host: string;
  port: number;
  url: string;
  owner: "none" | "unknown";
}

function httpResponds(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const req = request({ host, port, path: "/", method: "HEAD" }, (res) => {
      res.resume();
      finish(true);
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      finish(false);
    });
    req.once("error", () => finish(false));
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
  if (await httpResponds(host, port, timeoutMs)) {
    return { state: "http-occupied", healthy: false, host, port, url, owner: "unknown" };
  }
  if (await tcpListens(host, port, timeoutMs)) {
    return { state: "port-conflict", healthy: false, host, port, url, owner: "unknown" };
  }
  return { state: "stopped", healthy: false, host, port, url, owner: "none" };
}
