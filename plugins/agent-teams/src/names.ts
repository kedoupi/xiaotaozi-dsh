/** Display names for the captain and the optional preset roster. Protocol routing still uses `captain`. */

export interface RosterMember {
  name: string
  role?: string
}

export const DEFAULT_CAPTAIN_NAME = "张老板";

export function displayCaptainName(name: string | undefined): string {
  const trimmed = name?.trim() ?? "";
  return trimmed === "" ? DEFAULT_CAPTAIN_NAME : trimmed;
}

export function normalizeRoster(members: readonly RosterMember[] | undefined): RosterMember[] {
  if (members === undefined) return [];
  const seen = new Set<string>();
  const out: RosterMember[] = [];
  for (const member of members) {
    const name = member.name.trim();
    if (name === "") continue;
    const key = name.toLowerCase();
    if (key === "captain") continue;
    if (seen.has(key)) continue;
    seen.add(key);
    const role = member.role?.trim();
    out.push(role === undefined || role === "" ? { name } : { name, role });
  }
  return out;
}

export function usageIdentityText(captainName: string, members: readonly RosterMember[]): string {
  const captain = displayCaptainName(captainName);
  const protocol = `When you message the captain, set to=captain. The captain's display name is ${captain}.`;
  if (members.length === 0) {
    return `You are ${captain}, the team captain. Member names may be Chinese titles such as 设计师 when that fits the work. ${protocol}`;
  }
  const list = members.map((member) => (member.role === undefined ? member.name : `${member.name}（${member.role}）`)).join("、");
  return `You are ${captain}, the team captain. Creating a team already adds these members: ${list}. Do not invent English names or extra members unless the user asks. ${protocol}`;
}
