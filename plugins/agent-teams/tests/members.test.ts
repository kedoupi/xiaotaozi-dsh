import { expect, it } from "vitest";
import { memberPersona, memberWelcome } from "../src/persona.ts";
import type { TeamMember, TeamState } from "../src/types.ts";

const team: TeamState = {
  name: "落地页",
  id: "landing",
  captainSessionId: "sess-1",
  captainName: "张老板",
  createdAt: 1,
  members: [],
  tasks: [],
  taskSeq: 0,
};

const member: TeamMember = {
  id: "mem-1",
  name: "设计师",
  role: "视觉",
  joinedAt: 1,
  status: "idle",
};

it("tells the member to report to captain, not the display name, as the protocol key", () => {
  const persona = memberPersona(team, member, ".agent-teams");
  expect(persona).toContain("You are 设计师");
  expect(persona).toContain("张老板 is the captain (protocol name captain)");
  expect(persona).toContain("to=captain");
  expect(persona).toContain("do not create or delete teams");
  expect(persona).toContain(".agent-teams/landing/");
});

it("welcomes the member with the captain display name", () => {
  const welcome = memberWelcome(team);
  expect(welcome).toContain("落地页");
  expect(welcome).toContain("张老板");
});
