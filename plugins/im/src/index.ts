import type { Context } from "@deepseek-ai/cordis";
import Schema from "@deepseek-ai/schemastery";

import { setImHostLanguage } from "./channels/shared/i18n.ts";
import { installOutboundArtifactTool } from "./channels/shared/semantic/artifact.ts";
import { installSessionFollowRpc } from "./host/session-follow-rpc.ts";

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

const DEFERRED_CHANNELS = new Set<ChannelName>(["qq", "whatsapp", "office"]);

export interface Config {
  rpcAuthority: "loopback" | "trusted-host";
  isolateChannelFailures: boolean;
  replyTimeoutMs: number;
  connectTimeoutMs: number;
  officeEnabled: boolean;
  language?: string;
  agentPreset?: string;
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
  officeEnabled: Schema.boolean().default(false),
  language: Schema.string(),
  agentPreset: Schema.string(),
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

const DEFAULT_LOADERS: Record<ChannelName, () => Promise<ChannelApply>> = {
  feishu: async () => (await import("./host/channels/feishu/index.ts")).apply,
  weixin: async () => (await import("./host/channels/weixin/index.ts")).apply,
  dingtalk: async () => (await import("./host/channels/dingtalk/index.ts")).apply,
  wecom: async () => (await import("./host/channels/wecom/index.ts")).apply,
  qq: async () => (await import("./host/channels/qq/index.ts")).apply,
  slack: async () => (await import("./host/channels/slack/index.ts")).apply,
  telegram: async () => (await import("./host/channels/telegram/index.ts")).apply,
  discord: async () => (await import("./host/channels/discord/index.ts")).apply,
  whatsapp: async () => (await import("./host/channels/whatsapp/index.ts")).apply,
  office: async () => (await import("./host/channels/office/index.ts")).apply,
};

function channelEnabled(config: Partial<Config>, channel: ChannelName): boolean {
  if (channel !== "office") return true;
  if (config.officeEnabled === true) return true;
  const nested = config.office;
  return nested !== undefined && nested !== null && (nested as { enabled?: unknown }).enabled === true;
}

function channelConfig(config: Partial<Config>, channel: ChannelName): Record<string, unknown> {
  const nested = { ...((config[channel] ?? {}) as Record<string, unknown>) };
  return {
    ...(config.replyTimeoutMs === undefined ? {} : { replyTimeoutMs: config.replyTimeoutMs }),
    ...(config.connectTimeoutMs === undefined ? {} : { connectTimeoutMs: config.connectTimeoutMs }),
    ...(config.agentPreset == null ? {} : { agentPreset: config.agentPreset }),
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

function overrideOf(internals: ImHostInternals, channel: ChannelName): ChannelApply | undefined {
  switch (channel) {
    case "feishu": return internals.applyFeishu;
    case "weixin": return internals.applyWeixin;
    case "dingtalk": return internals.applyDingtalk;
    case "wecom": return internals.applyWecom;
    case "qq": return internals.applyQq;
    case "slack": return internals.applySlack;
    case "telegram": return internals.applyTelegram;
    case "discord": return internals.applyDiscord;
    case "whatsapp": return internals.applyWhatsapp;
    case "office": return internals.applyOffice;
  }
}

async function loadStarter(internals: ImHostInternals, channel: ChannelName): Promise<ChannelApply> {
  const override = overrideOf(internals, channel);
  if (override !== undefined) return override;
  return DEFAULT_LOADERS[channel]();
}

export function createImHostPlugin(internals: ImHostInternals = {}) {
  return Object.freeze({
    name,
    inject,
    async apply(ctx: Context | Record<string, unknown>, config: Partial<Config> = {}) {
      setImHostLanguage(
        (config as { language?: string }).language ?? process.env.DSH_IM_LANGUAGE,
      );
      const rpc = (ctx as { connection?: { rpc?: { handle?: unknown } } }).connection?.rpc;
      const effect = (ctx as { effect?: unknown }).effect;
      if (typeof rpc?.handle === "function") {
        const install = () => installSessionFollowRpc(ctx, config.rpcAuthority);
        if (typeof effect === "function") {
          (effect as (fn: () => unknown, label: string) => void)(install, "dsh-im: session follow rpc");
        } else {
          install();
        }
      }
      const inject = (ctx as { inject?: unknown }).inject;
      if (typeof inject === "function") {
        (inject as (deps: string[], fn: (scoped: unknown) => void) => void)(
          ["tools", "systemPrompt"],
          (artifactCtx) => {
            installOutboundArtifactTool(artifactCtx);
          },
        );
      } else {
        installOutboundArtifactTool(ctx);
      }
      const isolate = config.isolateChannelFailures !== false;
      const log = loggerOf(ctx);
      for (const channel of CHANNELS) {
        if (!channelEnabled(config, channel)) continue;
        try {
          const starter = await loadStarter(internals, channel);
          await starter(ctx, channelConfig(config, channel));
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

export { DEFERRED_CHANNELS };
