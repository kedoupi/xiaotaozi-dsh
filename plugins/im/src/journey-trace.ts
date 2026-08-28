import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { pluginTrace, pluginTraceEnabled, shortId, shortKey } from "./trace.ts";

const CHANNELS = new Set(["wecom", "weixin"]);
const EVENTS = new Set([
  "inbound",
  "stream_start",
  "stream_fail",
  "first_visible",
  "tool",
  "finish",
  "abandon",
  "ws_kick",
]);
const REASONS = new Set([
  "expired",
  "duration",
  "progress-failed",
  "keepalive-failed",
  "start-failed",
  "disconnected",
  "reconnecting",
  "delivery-failed",
]);
const RESULTS = new Set(["ok", "fail", "stream", "active", "expired"]);
const BREAK_EVENTS = new Set(["stream_fail", "ws_kick", "abandon"]);

type Env = Record<string, string | undefined>;

export function isJourneyBreak(event: string, result?: string): boolean {
  return BREAK_EVENTS.has(event) || (event === "finish" && result === "fail");
}

export function localDay(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function journeyFilePath(now = new Date(), env: Env = process.env as Env): string | null {
  const home = typeof env.DSH_HOME === "string" ? env.DSH_HOME.trim() : "";
  if (!home) return null;
  return join(home, "traces", `${localDay(now)}.jsonl`);
}

export function serializeJourney(input: Record<string, unknown>, now = new Date()) {
  const channel = String(input.channel ?? "");
  const event = String(input.event ?? "");
  if (!CHANNELS.has(channel) || !EVENTS.has(event)) return null;
  const result = typeof input.result === "string" && RESULTS.has(input.result) ? input.result : undefined;
  const reason = typeof input.reason === "string" && REASONS.has(input.reason) ? input.reason : undefined;
  const ms = Number(input.ms);
  const record: Record<string, unknown> = {
    ts: now.toISOString(),
    plugin: "dsh-im",
    channel,
    event,
  };
  if (typeof input.msgid === "string" && input.msgid) record.msgid = shortId(input.msgid);
  if (typeof input.streamId === "string" && input.streamId) record.stream = shortId(input.streamId);
  if (typeof input.session === "string" && input.session) record.session = shortId(input.session);
  if (typeof input.bot === "string" && input.bot) record.bot = shortId(input.bot);
  if (typeof input.chat === "string" && input.chat) record.chat = shortKey(input.chat);
  if (Number.isFinite(ms) && ms >= 0) record.ms = Math.round(ms);
  if (result) record.result = result;
  if (reason) record.reason = reason;
  if (isJourneyBreak(event, result)) record.break = true;
  return record;
}

export async function writeJourney(
  input: Record<string, unknown>,
  {
    env = process.env as Env,
    now = new Date(),
    append = defaultAppend,
    trace = pluginTrace,
  }: {
    env?: Env;
    now?: Date;
    append?: (file: string, line: string) => Promise<void>;
    trace?: typeof pluginTrace;
  } = {},
) {
  if (!pluginTraceEnabled(env)) return null;
  const record = serializeJourney(input, now);
  if (!record) return null;
  const file = journeyFilePath(now, env);
  if (file) {
    try {
      await append(file, `${JSON.stringify(record)}\n`);
    } catch {
      // Journey must never block or fail a user-visible reply.
    }
  }
  const parts = [`journey event=${record.event}`];
  if (record.break) parts.push("break=1");
  if (record.msgid) parts.push(`msgid=${record.msgid}`);
  if (record.stream) parts.push(`stream=${record.stream}`);
  if (record.chat) parts.push(`chat=${record.chat}`);
  if (record.reason) parts.push(`reason=${record.reason}`);
  if (record.result) parts.push(`result=${record.result}`);
  if (record.ms != null) parts.push(`ms=${record.ms}`);
  trace(`dsh-im:${record.channel}`, parts.join(" "), env);
  return record;
}

function note(channel: string, event: string, fields: Record<string, unknown> = {}) {
  void writeJourney({ channel, event, ...fields }).catch(() => undefined);
}

export const wecomJourney = {
  inbound: (fields: Record<string, unknown>) => note("wecom", "inbound", fields),
  streamStart: (fields: Record<string, unknown>) => note("wecom", "stream_start", fields),
  streamFail: (fields: Record<string, unknown>) => note("wecom", "stream_fail", { reason: "start-failed", ...fields }),
  firstVisible: (fields: Record<string, unknown>) => note("wecom", "first_visible", fields),
  tool: (fields: Record<string, unknown>) => note("wecom", "tool", fields),
  finish: (fields: Record<string, unknown>) => note("wecom", "finish", fields),
  abandon: (fields: Record<string, unknown>) => note("wecom", "abandon", fields),
  wsKick: (fields: Record<string, unknown>) => note("wecom", "ws_kick", fields),
};

export const weixinJourney = {
  inbound: (fields: Record<string, unknown>) => note("weixin", "inbound", fields),
  firstVisible: (fields: Record<string, unknown>) => note("weixin", "first_visible", fields),
  finish: (fields: Record<string, unknown>) => note("weixin", "finish", fields),
};

async function defaultAppend(file: string, line: string) {
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, line);
}
