import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { takePendingGuide } from "../src/channels/shared/connection-test.ts";
import { bindWelcomeText, sendBindUsageGuide, usageGuideText } from "../src/usage-guide.ts";

const readPluginDoc = (name: string) =>
  readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

describe("usage guide", () => {
  it("lists the core IM commands", () => {
    const text = usageGuideText({ channelLabel: "微信" });
    expect(text).toContain("微信已连接小桃子。");
    for (const command of [
      "/new", "/sessionlist", "/session", "/workspace", "/models", "/model",
      "/reasoninglist", "/reasoning", "/batch", "/send", "/cancel", "/version",
      "/stop", "/steer", "/help",
    ]) {
      expect(text).toContain(command);
    }
    expect(text).toContain("/model 2");
    expect(text).toContain("/workspacelist  列出 Web 中已创建的项目");
    expect(text).toContain("/workspace  按列表序号或唯一项目名切换项目");
    expect(text).toContain("/sessionlist  列出当前项目的会话；可带项目序号");
    expect(text).not.toMatch(/<path>|绝对路径|仓库根目录|选择目录/);
  });

  it("documents existing Web projects without changing command names", () => {
    const english = readPluginDoc("README.md");
    const chinese = readPluginDoc("README.zh.md");
    const docs = `${english}\n${chinese}`;

    expect(english).toMatch(/select an existing Web project/i);
    expect(chinese).toContain("选择 Web 中已创建的项目");
    for (const command of [
      "/workspace",
      "/workspacelist",
      "/sessionlist",
      "/session",
    ]) {
      expect(english).toContain(command);
      expect(chinese).toContain(command);
    }
    expect(docs).not.toMatch(/\/workspace\s+(?:\/Users\/|\/tmp\/|[A-Za-z]:\\)/);
    expect(docs).not.toMatch(/(?:pick|select|browse) (?:an? )?(?:arbitrary )?(?:directory|folder)/i);
    expect(docs).not.toMatch(/(?:选择|浏览|指定)(?:任意)?(?:目录|文件夹)/);
    expect(docs).not.toMatch(/cancel (?:confirms|means confirming)|取消(?:等于|就是)确认/i);
    expect(docs).not.toMatch(/(?:from|inside) IM.{0,24}create (?:a )?(?:Host |Web )?project|在 IM (?:中|里).{0,12}创建项目/is);
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
