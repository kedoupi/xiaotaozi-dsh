import { describe, expect, it } from "vitest";
import { takePendingGuide } from "../src/channels/shared/connection-test.ts";
import { bindWelcomeText, sendBindUsageGuide, usageGuideText } from "../src/usage-guide.ts";

describe("usage guide", () => {
  it("lists the core IM commands", () => {
    const text = usageGuideText({ channelLabel: "微信" });
    expect(text).toContain("微信已连接 DeepSeek Harness。");
    for (const command of ["/new", "/sessionlist", "/session", "/workspace", "/models", "/model", "/stop", "/steer", "/help"]) {
      expect(text).toContain(command);
    }
    expect(text).toContain("/model 2");
  });

  it("keeps channel extras before /help", () => {
    const text = usageGuideText({
      channelLabel: "飞书",
      extraCommands: [["/repair", "修复卡片按钮回调"]],
    });
    expect(text.indexOf("/repair")).toBeGreaterThan(-1);
    expect(text.indexOf("/repair")).toBeLessThan(text.indexOf("/help"));
  });

  it("adds a bind welcome footer", () => {
    const text = bindWelcomeText({ channelLabel: "微信" });
    expect(text).toContain("之后在这个聊天里发 /help");
  });

  it("queues the welcome when the runtime has no chat target yet", async () => {
    const state = {};
    const runtime = {
      state,
      async sendConnectionTest() {
        const error = new Error("no target");
        (error as { code?: string }).code = "test-target-unavailable";
        throw error;
      },
    };
    await expect(sendBindUsageGuide(runtime, { channelLabel: "Slack" })).resolves.toBe(false);
    expect(takePendingGuide(state)).toContain("/help");
  });
});
