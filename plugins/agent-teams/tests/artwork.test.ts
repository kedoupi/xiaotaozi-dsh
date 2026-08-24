import { expect, it } from "vitest";
import { ACTION_ART, ART_BASE, LEAD_ART, memberArtUrl } from "../src/client/artwork.ts";

it("serves captain art from the plugin asset route", () => {
  expect(ART_BASE).toBe("/plugins/dsh-agent-teams/assets/");
  expect(LEAD_ART).toBe("/plugins/dsh-agent-teams/assets/team-lead-v2.png");
  expect(ACTION_ART.working).toContain("action-working-v2.png");
});

it("maps role keywords, including CJK and QA-before-engineer", () => {
  expect(memberArtUrl("小王", "设计师")).toContain("member-designer-v2.png");
  expect(memberArtUrl("QA Engineer", "quality")).toContain("member-qa-v2.png");
  expect(memberArtUrl("后端", "工程")).toContain("member-engineer-v2.png");
  expect(memberArtUrl("无名", "")).toBeNull();
});
