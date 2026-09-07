import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dshHome } from "./dsh-home.ts";

export class ProfileDependenciesError extends Error {
  constructor() {
    super(
      "Web profile could not be read. Check it with xtz doctor, then retry.",
    );
  }
}

export function profilePackagePath(env: NodeJS.ProcessEnv = process.env): string {
  const profile = env.DSH_PROFILE?.trim();
  if (profile && profile !== "web") throw new ProfileDependenciesError();
  return join(dshHome(env), "profiles", "web", "package.json");
}

/** Dependency name → raw spec from the web profile; unreadable/unsafe data fails closed. */
export function readProfileDependencies(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(profilePackagePath(env), "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new ProfileDependenciesError();
    const deps = (parsed as Record<string, unknown>).dependencies;
    if (deps === undefined) return {};
    if (!deps || typeof deps !== "object" || Array.isArray(deps))
      throw new ProfileDependenciesError();
    const rows = Object.entries(deps);
    for (const [name, spec] of rows) {
      if (
        name.length > 214 ||
        !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(name) ||
        typeof spec !== "string" ||
        spec.trim() === ""
      )
        throw new ProfileDependenciesError();
    }
    return Object.fromEntries(rows) as Record<string, string>;
  } catch {
    throw new ProfileDependenciesError();
  }
}
