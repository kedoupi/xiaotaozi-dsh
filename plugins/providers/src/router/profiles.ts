import { NEUTRAL_PROFILE, type ModelProfile } from "./inventory.ts";

/** Bump when heuristic scores change. These are cold-start guesses, not model facts. */
export const PROFILE_VERSION = 2;

const KNOWN: Readonly<Record<string, ModelProfile>> = {
  k3: { quality: 5, speed: 3, cost: 2, vision: false },
  "k3-256k": { quality: 5, speed: 2, cost: 2, vision: false },
  "kimi-for-coding": { quality: 4, speed: 3, cost: 2, code: true, vision: false },
  "kimi-for-coding-highspeed": { quality: 3, speed: 5, cost: 2, code: true, vision: false },
  "coder-model": { quality: 4, speed: 3, cost: 2, code: true, vision: false },
  "vision-model": { quality: 3, speed: 3, cost: 2, vision: true },
  "claude-opus-4-5": { quality: 5, speed: 2, cost: 3, vision: true },
  "claude-sonnet-4-5": { quality: 4, speed: 3, cost: 3, vision: true },
  "claude-haiku-4-5": { quality: 2, speed: 5, cost: 1, vision: true },
  "gpt-5.1-codex": { quality: 5, speed: 2, cost: 3, code: true, vision: false },
  "grok-4": { quality: 5, speed: 3, cost: 3, vision: true },
};

function hasFastToken(id: string): boolean {
  const parts = new Set(
    id
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((part) => part.length > 0),
  );
  return ["highspeed", "haiku", "flash", "mini", "nano"].some((token) =>
    parts.has(token),
  );
}

function codeFlag(id: string): { code?: true } {
  return /(coder|coding|codex|\bcode\b)/.test(id) ? { code: true } : {};
}

function visionFlag(id: string): { vision?: boolean } {
  if (/vision/i.test(id)) return { vision: true };
  if (/(coder|coding|codex|\bcode\b)/.test(id)) return { vision: false };
  return {};
}

function familyProfile(model: string): ModelProfile | undefined {
  const id = model.toLowerCase();
  if (hasFastToken(id)) {
    return { quality: 2, speed: 5, cost: 1, ...codeFlag(id), ...visionFlag(id) };
  }
  if (/(opus|reasoner|(^|-)pro($|-)|o1|o3)/.test(id)) {
    return { quality: 5, speed: 2, cost: 4, ...codeFlag(id), ...visionFlag(id) };
  }
  if (/(coder|coding|codex|\bcode\b)/.test(id)) {
    return { quality: 4, speed: 3, cost: 2, code: true, vision: false };
  }
  if (/vision/i.test(id)) {
    return { quality: 3, speed: 3, cost: 2, vision: true };
  }
  return undefined;
}

/** Versioned cold-start heuristic. Unknown ids stay neutral. Not a benchmark. */
export function routeProfile(_provider: string, model: string): ModelProfile {
  return KNOWN[model] ?? familyProfile(model) ?? NEUTRAL_PROFILE;
}
