import { describe, expect, it } from "vitest";
import { createImHostPlugin, inject, name } from "../src/index.ts";
import { installOwnedProduction } from "../src/host/channels/shared/install-production.ts";

describe("im host", () => {
  it("exports the plugin identity", () => {
    expect(name).toBe("im");
    expect(inject).toEqual(["connection", "credentials", "webServer", "typertGateway"]);
  });

  it("composes nine IM channels and the AI Office connector", async () => {
    const calls: unknown[] = [];
    const plugin = createImHostPlugin({
      applyFeishu: async (ctx, config) => calls.push(["feishu", ctx, config]),
      applyWeixin: async (ctx, config) => calls.push(["weixin", ctx, config]),
      applyDingtalk: async (ctx, config) => calls.push(["dingtalk", ctx, config]),
      applyWecom: async (ctx, config) => calls.push(["wecom", ctx, config]),
      applyQq: async (ctx, config) => calls.push(["qq", ctx, config]),
      applySlack: async (ctx, config) => calls.push(["slack", ctx, config]),
      applyTelegram: async (ctx, config) => calls.push(["telegram", ctx, config]),
      applyDiscord: async (ctx, config) => calls.push(["discord", ctx, config]),
      applyWhatsapp: async (ctx, config) => calls.push(["whatsapp", ctx, config]),
      applyOffice: async (ctx, config) => calls.push(["office", ctx, config]),
    });
    const ctx = { marker: "shared-context" };
    const config = {
      rpcAuthority: "trusted-host" as const,
      feishu: { domain: "feishu" },
      weixin: { timeout: 30 },
      dingtalk: { replyTimeoutMs: 60_000 },
      wecom: { replyTimeoutMs: 60_000 },
      qq: { replyTimeoutMs: 60_000 },
      slack: { replyTimeoutMs: 60_000 },
      telegram: { replyTimeoutMs: 60_000 },
      discord: { replyTimeoutMs: 60_000 },
      whatsapp: { replyTimeoutMs: 60_000 },
      office: { heartbeatSeconds: 30 },
    };

    await plugin.apply(ctx, config);

    expect(calls).toEqual([
      ["feishu", ctx, { ...config.feishu, rpcAuthority: "trusted-host" }],
      ["weixin", ctx, { ...config.weixin, rpcAuthority: "trusted-host" }],
      ["dingtalk", ctx, { ...config.dingtalk, rpcAuthority: "trusted-host" }],
      ["wecom", ctx, { ...config.wecom, rpcAuthority: "trusted-host" }],
      ["qq", ctx, { ...config.qq, rpcAuthority: "trusted-host" }],
      ["slack", ctx, { ...config.slack, rpcAuthority: "trusted-host" }],
      ["telegram", ctx, { ...config.telegram, rpcAuthority: "trusted-host" }],
      ["discord", ctx, { ...config.discord, rpcAuthority: "trusted-host" }],
      ["whatsapp", ctx, { ...config.whatsapp, rpcAuthority: "trusted-host" }],
      ["office", ctx, { ...config.office, rpcAuthority: "trusted-host" }],
    ]);
  });

  it("still starts later channels when an earlier channel fails", async () => {
    const started: string[] = [];
    const plugin = createImHostPlugin({
      applyFeishu: async () => {
        throw new Error("feishu unavailable");
      },
      applyWeixin: async () => {
        started.push("weixin");
      },
      applyDingtalk: async () => {
        started.push("dingtalk");
      },
      applyWecom: async () => {
        started.push("wecom");
      },
      applyQq: async () => {
        started.push("qq");
      },
      applySlack: async () => {
        started.push("slack");
      },
      applyTelegram: async () => {
        started.push("telegram");
      },
      applyDiscord: async () => {
        started.push("discord");
      },
      applyWhatsapp: async () => {
        started.push("whatsapp");
      },
      applyOffice: async () => {
        started.push("office");
      },
    });

    await plugin.apply({ logger: { warn() {} } }, {});
    expect(started).toEqual([
      "weixin",
      "dingtalk",
      "wecom",
      "qq",
      "slack",
      "telegram",
      "discord",
      "whatsapp",
      "office",
    ]);
  });

  it("can restore fail-stop startup", async () => {
    let weixinStarted = false;
    const plugin = createImHostPlugin({
      applyFeishu: async () => {
        throw new Error("feishu unavailable");
      },
      applyWeixin: async () => {
        weixinStarted = true;
      },
    });

    await expect(plugin.apply({}, { isolateChannelFailures: false })).rejects.toThrow(/feishu unavailable/);
    expect(weixinStarted).toBe(false);
  });
});

describe("installOwnedProduction", () => {
  it("closes production when RPC install throws", async () => {
    const closed: unknown[] = [];
    const production = { close: async () => { closed.push(true); } };
    await expect(installOwnedProduction(
      { effect() {} },
      production,
      () => { throw new Error("rpc failed"); },
      "label",
    )).rejects.toThrow(/rpc failed/);
    expect(closed).toEqual([true]);
  });

  it("closes production when effect registration throws", async () => {
    const closed: unknown[] = [];
    const production = { close: async () => { closed.push(true); } };
    await expect(installOwnedProduction(
      { effect() { throw new Error("effect failed"); } },
      production,
      () => "dispose-rpc",
      "label",
    )).rejects.toThrow(/effect failed/);
    expect(closed).toEqual([true]);
  });

  it("leaves close to the registered effect on success", async () => {
    const closed: unknown[] = [];
    const production = { close: async () => { closed.push(true); } };
    const effects: Array<() => unknown> = [];
    const dispose = await installOwnedProduction(
      { effect(fn: () => unknown) { effects.push(fn); } },
      production,
      () => "dispose-rpc",
      "label",
    );
    expect(dispose).toBe("dispose-rpc");
    expect(closed).toEqual([]);
    await (effects[0]!() as () => Promise<void>)();
    expect(closed).toEqual([true]);
  });
});

