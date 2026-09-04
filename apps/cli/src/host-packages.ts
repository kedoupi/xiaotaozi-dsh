import { join } from "node:path";

/** In-box package whose module-local scheduler Symbol breaks when duplicated. */
export const HOST_TOOLS_PACKAGE = "@deepseek-ai/dsh-tools";

export type PathKind = "missing" | "symlink" | "directory" | "file" | "other";

export function hostToolsProfilePath(home: string): string {
  return join(home, "profiles", "web", "node_modules", "@deepseek-ai", "dsh-tools");
}

export function hostToolsFallbackPath(home: string): string {
  return join(home, "profiles", "node_modules", "@deepseek-ai", "dsh-tools");
}

/** From `profiles/web/node_modules/@deepseek-ai/dsh-tools` to the DSH heal fallback. */
export const HOST_TOOLS_RELATIVE_LINK = "../../../../node_modules/@deepseek-ai/dsh-tools";

export function packageVersionFromJson(text: string | null): string | null {
  if (text === null) return null;
  try {
    const parsed = JSON.parse(text) as { version?: unknown };
    return typeof parsed.version === "string" && parsed.version.length > 0 ? parsed.version : null;
  } catch {
    return null;
  }
}

export type HostToolsHealPlan =
  | { action: "none" }
  | { action: "link" }
  | { action: "skip-version-mismatch"; profileVersion: string; fallbackVersion: string };

export function planHostToolsHeal(input: {
  profileKind: PathKind;
  alreadySame: boolean;
  profileVersion: string | null;
  fallbackKind: PathKind;
  fallbackVersion: string | null;
}): HostToolsHealPlan {
  if (input.fallbackKind === "missing") return { action: "none" };
  if (input.profileKind === "missing") return { action: "none" };
  if (input.alreadySame) return { action: "none" };
  if (input.profileKind === "symlink") return { action: "link" };
  if (
    input.profileVersion !== null
    && input.fallbackVersion !== null
    && input.profileVersion !== input.fallbackVersion
  ) {
    return {
      action: "skip-version-mismatch",
      profileVersion: input.profileVersion,
      fallbackVersion: input.fallbackVersion,
    };
  }
  return { action: "link" };
}
