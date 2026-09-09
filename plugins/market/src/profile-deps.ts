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

export interface ProfileState {
  dependencies: Record<string, string>;
  bundles: string[];
}

export function profilePackagePath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const profile = env.DSH_PROFILE?.trim();
  if (profile && profile !== "web") throw new ProfileDependenciesError();
  return join(dshHome(env), "profiles", "web", "package.json");
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ProfileDependenciesError();
  return value as Record<string, unknown>;
}

function packageName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 214 &&
    /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(value)
  );
}

/** Validate and detach the snapshot, including injectable stores. Unknown is never absent. */
export function validateProfileState(value: unknown): ProfileState {
  const state = record(value);
  const rows = Object.entries(record(state.dependencies));
  if (
    rows.some(
      ([name, spec]) =>
        !packageName(name) || typeof spec !== "string" || spec.trim() === "",
    )
  ) {
    throw new ProfileDependenciesError();
  }
  if (!Array.isArray(state.bundles) || !state.bundles.every(packageName))
    throw new ProfileDependenciesError();
  return {
    dependencies: Object.fromEntries(rows) as Record<string, string>,
    bundles: [...state.bundles],
  };
}

/** Read dependency specs and RC1 dsh.profile.bundles together; no filesystem mutation. */
export function readProfileState(
  env: NodeJS.ProcessEnv = process.env,
): ProfileState {
  try {
    const parsed = record(
      JSON.parse(readFileSync(profilePackagePath(env), "utf8")),
    );
    const dsh = parsed.dsh === undefined ? {} : record(parsed.dsh);
    const profile = dsh.profile === undefined ? {} : record(dsh.profile);
    return validateProfileState({
      dependencies:
        parsed.dependencies === undefined ? {} : parsed.dependencies,
      bundles: profile.bundles === undefined ? [] : profile.bundles,
    });
  } catch {
    throw new ProfileDependenciesError();
  }
}

/** Compatibility projection retains raw specs, not a certification of installation. */
export function readProfileDependencies(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  return readProfileState(env).dependencies;
}
