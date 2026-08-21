import type { Context } from "@deepseek-ai/cordis";
import Schema from "@deepseek-ai/schemastery";
import { apply as applyDingtalk } from "./host/channels/dingtalk/index.ts";
import { apply as applyDiscord } from "./host/channels/discord/index.ts";
import { apply as applyFeishu } from "./host/channels/feishu/index.ts";
import { apply as applyOffice } from "./host/channels/office/index.ts";
import { apply as applyQq } from "./host/channels/qq/index.ts";
import { apply as applySlack } from "./host/channels/slack/index.ts";
import { apply as applyTelegram } from "./host/channels/telegram/index.ts";
import { apply as applyWecom } from "./host/channels/wecom/index.ts";
import { apply as applyWeixin } from "./host/channels/weixin/index.ts";
import { apply as applyWhatsapp } from "./host/channels/whatsapp/index.ts";

export const name = "im";
export const inject = ["connection", "credentials", "webServer", "typertGateway"];

const CHANNELS = [
  "feishu",
  "weixin",
  "dingtalk",
  "wecom",
  "qq",
  "slack",
  "telegram",
  "discord",
  "whatsapp",
  "office",
] as const;

type ChannelName = (typeof CHANNELS)[number];

export interface Config {
  rpcAuthority: "loopback" | "trusted-host";
  isolateChannelFailures: boolean;
  replyTimeoutMs: number;
  connectTimeoutMs: number;
  feishu?: Record<string, unknown>;
  weixin?: Record<string, unknown>;
  dingtalk?: Record<string, unknown>;
  wecom?: Record<string, unknown>;
  qq?: Record<string, unknown>;
  slack?: Record<string, unknown>;
  telegram?: Record<string, unknown>;
  discord?: Record<string, unknown>;
  whatsapp?: Record<string, unknown>;
  office?: Record<string, unknown>;
}

export const Config: Schema<Config> = Schema.object({
  rpcAuthority: Schema.union([
    Schema.const("loopback"),
    Schema.const("trusted-host"),
  ]).default("loopback"),
  isolateChannelFailures: Schema.boolean().default(true),
  replyTimeoutMs: Schema.number().min(1).default(600_000),
  connectTimeoutMs: Schema.number().min(1).default(20_000),
  feishu: Schema.any(),
  weixin: Schema.any(),
  dingtalk: Schema.any(),
  wecom: Schema.any(),
  qq: Schema.any(),
  slack: Schema.any(),
  telegram: Schema.any(),
  discord: Schema.any(),
  whatsapp: Schema.any(),
  office: Schema.any(),
});

type ChannelApply = (ctx: unknown, config: Record<string, unknown>) => Promise<unknown> | unknown;

export interface ImHostInternals {
  applyFeishu?: ChannelApply;
  applyWeixin?: ChannelApply;
  applyDingtalk?: ChannelApply;
  applyWecom?: ChannelApply;
  applyQq?: ChannelApply;
  applySlack?: ChannelApply;
  applyTelegram?: ChannelApply;
  applyDiscord?: ChannelApply;
  applyWhatsapp?: ChannelApply;
  applyOffice?: ChannelApply;
}

function channelConfig(config: Partial<Config>, channel: ChannelName): Record<string, unknown> {
  const nested = { ...((config[channel] ?? {}) as Record<string, unknown>) };
  return {
    ...(config.replyTimeoutMs === undefined ? {} : { replyTimeoutMs: config.replyTimeoutMs }),
    ...(config.connectTimeoutMs === undefined ? {} : { connectTimeoutMs: config.connectTimeoutMs }),
    ...nested,
    ...(config.rpcAuthority === undefined ? {} : { rpcAuthority: config.rpcAuthority }),
  };
}

function loggerOf(ctx: unknown): { warn: (message: string, error?: unknown) => void } {
  const logger = (ctx as { logger?: unknown } | undefined)?.logger;
  if (typeof logger === "function") {
    const scoped = (logger as (ns: string) => { warn?: (message: string, error?: unknown) => void })("dsh-im");
    return {
      warn(message, error) {
        scoped.warn?.(message, error);
      },
    };
  }
  if (logger && typeof logger === "object" && typeof (logger as { warn?: unknown }).warn === "function") {
    return logger as { warn: (message: string, error?: unknown) => void };
  }
  return {
    warn(message, error) {
      console.warn(message, error);
    },
  };
}

export function createImHostPlugin(internals: ImHostInternals = {}) {
  const starters: Record<ChannelName, ChannelApply> = {
    feishu: internals.applyFeishu ?? applyFeishu,
    weixin: internals.applyWeixin ?? applyWeixin,
    dingtalk: internals.applyDingtalk ?? applyDingtalk,
    wecom: internals.applyWecom ?? applyWecom,
    qq: internals.applyQq ?? applyQq,
    slack: internals.applySlack ?? applySlack,
    telegram: internals.applyTelegram ?? applyTelegram,
    discord: internals.applyDiscord ?? applyDiscord,
    whatsapp: internals.applyWhatsapp ?? applyWhatsapp,
    office: internals.applyOffice ?? applyOffice,
  };
  return Object.freeze({
    name,
    inject,
    async apply(ctx: Context | Record<string, unknown>, config: Partial<Config> = {}) {
      const isolate = config.isolateChannelFailures !== false;
      const log = loggerOf(ctx);
      for (const channel of CHANNELS) {
        try {
          await starters[channel](ctx, channelConfig(config, channel));
        } catch (error) {
          if (!isolate) throw error;
          log.warn(`[dsh-im] ${channel} failed to start; other channels continue`, error);
        }
      }
    },
  });
}

export async function apply(ctx: Context, config: Partial<Config> = {}): Promise<void> {
  await createImHostPlugin().apply(ctx, config);
}
