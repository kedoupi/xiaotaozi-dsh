import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readProfileDependencies,
  readProfileState,
  profilePackagePath,
} from "../src/profile-deps.ts";

describe("readProfileDependencies", () => {
  let home: string;
  let env: NodeJS.ProcessEnv;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "market-profile-"));
    env = { DSH_HOME: home, DSH_PROFILE: "web" };
    mkdirSync(join(home, "profiles", "web"), { recursive: true });
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  it("reads dependency and bundle membership from the same validated manifest", () => {
    const dependencies = { "dsh-context": "^1" };
    const bundles = ["@deepseek-ai/dsh-web", "dsh-context"];
    writeFileSync(
      profilePackagePath(env),
      JSON.stringify({ dependencies, dsh: { profile: { bundles } } }),
    );
    expect(readProfileState(env)).toEqual({ dependencies, bundles });
    writeFileSync(profilePackagePath(env), "{}");
    expect(readProfileState(env)).toEqual({ dependencies: {}, bundles: [] });
  });

  it.each([
    null,
    [],
    "bad",
    { profile: null },
    { profile: [] },
    { profile: { bundles: "bad" } },
    { profile: { bundles: [null] } },
    { profile: { bundles: ["../bad"] } },
  ])("fails closed on invalid dsh profile state %j", (dsh) => {
    writeFileSync(
      profilePackagePath(env),
      JSON.stringify({ dependencies: {}, dsh }),
    );
    expect(() => readProfileState(env)).toThrow("Web profile");
  });

  it("does not disguise missing, malformed or inaccessible web profiles as empty", () => {
    expect(() => readProfileDependencies(env)).toThrow("Web profile");
    writeFileSync(profilePackagePath(env), "{");
    expect(() => readProfileDependencies(env)).toThrow("Web profile");
    rmSync(profilePackagePath(env));
    mkdirSync(profilePackagePath(env));
    expect(() => readProfileDependencies(env)).toThrow("Web profile");
  });

  it.each([
    null,
    [],
    1,
    { dependencies: [] },
    { dependencies: null },
    { dependencies: "bad" },
    { dependencies: { extra: 1 } },
    { dependencies: { extra: "" } },
    { dependencies: { extra: " \t" } },
  ])("rejects invalid profile schema %j", (value) => {
    writeFileSync(profilePackagePath(env), JSON.stringify(value));
    expect(() => readProfileDependencies(env)).toThrow("Web profile");
  });

  it.each([
    "--help",
    "../other",
    "@scope/../other",
    "bad\nname",
    "bad name",
    "a".repeat(215),
  ])("rejects unsafe dependency key %j", (name) => {
    writeFileSync(
      profilePackagePath(env),
      JSON.stringify({ dependencies: { [name]: "^1" } }),
    );
    expect(() => readProfileDependencies(env)).toThrow("Web profile");
  });

  it("accepts missing/empty dependencies and retains valid raw specs and legacy names", () => {
    for (const value of [{ name: "web" }, { dependencies: {} }]) {
      writeFileSync(profilePackagePath(env), JSON.stringify(value));
      expect(readProfileDependencies(env)).toEqual({});
    }
    const dependencies = {
      "@Example/Extra":
        " git+https://user:secret@example.test/repo?token=secret#v1\n",
      alias: "github:bowenliang123/dsh-context",
      ["a".repeat(214)]: "^1",
    };
    writeFileSync(profilePackagePath(env), JSON.stringify({ dependencies }));
    expect(readProfileDependencies(env)).toEqual(dependencies);
  });

  it("only resolves the web profile, including default and trimmed web identity", () => {
    expect(profilePackagePath({ DSH_HOME: home })).toBe(
      join(home, "profiles", "web", "package.json"),
    );
    expect(profilePackagePath({ ...env, DSH_PROFILE: " web " })).toBe(
      profilePackagePath(env),
    );
    for (const profile of ["../other", "other", "WEB"]) {
      expect(() =>
        profilePackagePath({ ...env, DSH_PROFILE: profile }),
      ).toThrow("Web profile");
      expect(() =>
        readProfileDependencies({ ...env, DSH_PROFILE: profile }),
      ).toThrow("Web profile");
    }
  });
});
