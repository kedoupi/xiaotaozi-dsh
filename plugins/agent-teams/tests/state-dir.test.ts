import { resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveStateRoot, stateDirError } from "../src/state.ts";

const WORKSPACE = resolve(sep, "home", "user", "project");

describe("stateDirError", () => {
  it("accepts the default and nested relative directory names", () => {
    expect(stateDirError(".agent-teams")).toBeUndefined();
    expect(stateDirError("state/teams")).toBeUndefined();
  });

  it("rejects empty, workspace-self, absolute, and escaping values", () => {
    expect(stateDirError("")).toContain("must not be empty");
    expect(stateDirError("   ")).toContain("must not be empty");
    expect(stateDirError(".")).toContain("not the workspace itself");
    expect(stateDirError(resolve(sep, "tmp", "evil"))).toContain("absolute path");
    expect(stateDirError("..")).toContain("must not escape");
    expect(stateDirError("../outside")).toContain("must not escape");
    expect(stateDirError("a/../../outside")).toContain("must not escape");
  });
});

describe("resolveStateRoot", () => {
  it("resolves a safe stateDir under the workspace", () => {
    expect(resolveStateRoot(WORKSPACE, ".agent-teams")).toBe(resolve(WORKSPACE, ".agent-teams"));
    expect(resolveStateRoot(WORKSPACE, "nested/dir")).toBe(resolve(WORKSPACE, "nested", "dir"));
  });

  it("throws a clear error for values that leave the workspace", () => {
    expect(() => resolveStateRoot(WORKSPACE, "../outside")).toThrow(/must not escape/);
    expect(() => resolveStateRoot(WORKSPACE, resolve(sep, "tmp", "evil"))).toThrow(/absolute path/);
    expect(() => resolveStateRoot(WORKSPACE, "x/../../../etc")).toThrow(/must not escape/);
    expect(() => resolveStateRoot(WORKSPACE, ".")).toThrow(/workspace itself/);
  });
});
