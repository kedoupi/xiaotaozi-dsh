import { describe, expect, it } from "vitest";
import type { UserMessage } from "@deepseek-ai/dsh-llm";
import { AGENT_TEAMS_COMMAND, buildActivationDirective, invokedAgentTeamsGoal } from "../src/command.ts";

function userText(text: string): UserMessage {
  return {
    content: [{ type: "text", text }],
    source: { kind: "user" },
  } as UserMessage;
}

describe("slash gesture", () => {
  it("keeps the closed-namespace command name", () => {
    expect(AGENT_TEAMS_COMMAND).toBe("agent-teams");
  });

  it("names the captain in the activation directive", () => {
    const text = buildActivationDirective("写落地页", "张老板");
    expect(text).toContain("you are 张老板, the captain");
    expect(text).toContain("Goal: 写落地页");
    expect(text).toContain("/agent-teams");
  });

  it("asks for a goal when the gesture is bare", () => {
    expect(buildActivationDirective("", undefined)).toContain("ask the user what the team should accomplish");
    expect(buildActivationDirective("", undefined)).toContain("张老板");
  });

  it("reads the latest leading /agent-teams token and ignores mid-sentence mentions", () => {
    expect(invokedAgentTeamsGoal([
      userText("please use /agent-teams later"),
      userText("/agent-teams 写落地页"),
    ])).toBe("写落地页");
    expect(invokedAgentTeamsGoal([userText("/agent-teams")])).toBe("");
    expect(invokedAgentTeamsGoal([userText("see /agent-teams in the docs")])).toBeUndefined();
    expect(invokedAgentTeamsGoal([userText("path/agent-teams/foo")])).toBeUndefined();
  });
});
