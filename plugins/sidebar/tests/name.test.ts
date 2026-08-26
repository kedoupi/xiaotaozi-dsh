import { expect, it } from "vitest";
import { name } from "../src/index.ts";

it("exports the plugin name", () => {
  expect(name).toBe("sidebar");
});
