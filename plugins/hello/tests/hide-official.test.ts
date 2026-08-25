import { expect, it } from "vitest";
import { isModelsNavLabel } from "../src/client/hide-official.ts";

it("matches the host Models nav labels", () => {
  expect(isModelsNavLabel("模型")).toBe(true);
  expect(isModelsNavLabel("Models")).toBe(true);
  expect(isModelsNavLabel("设置模型")).toBe(true);
  expect(isModelsNavLabel("记忆")).toBe(false);
});
