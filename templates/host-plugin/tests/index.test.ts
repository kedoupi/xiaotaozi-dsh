import { describe, expect, it } from "vitest";
import { greet } from "../src/greet.ts";

describe("__PACKAGE__", () => {
  it("formats a greeting", () => {
    expect(greet("Ada")).toBe("Hello, Ada!");
    expect(greet("Ada", "Hi")).toBe("Hi, Ada!");
  });
});
