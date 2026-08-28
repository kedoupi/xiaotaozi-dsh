import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dshHome } from "./dsh-home.ts";

export function profilePackagePath(env: NodeJS.ProcessEnv = process.env): string {
  const profile = env.DSH_PROFILE?.trim() || "web";
  return join(dshHome(env), "profiles", profile, "package.json");
}

/** Dependency name → spec from the current DSH profile. Missing file → {}. */
export function readProfileDependencies(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(profilePackagePath(env), "utf8"));
    if (typeof parsed !== "object" || parsed === null) return {};
    const deps = (parsed as { dependencies?: unknown }).dependencies;
    if (typeof deps !== "object" || deps === null || Array.isArray(deps)) return {};
    const out: Record<string, string> = {};
    for (const [name, spec] of Object.entries(deps)) {
      if (typeof spec === "string" && spec !== "") out[name] = spec;
    }
    return out;
  } catch {
    return {};
  }
}
