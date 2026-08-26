import test from "node:test";
import assert from "node:assert/strict";
import { dshToolsValueImports } from "./check-manifest.mjs";

test("flags static value imports of dsh-tools", () => {
  assert.equal(dshToolsValueImports('import { defineTool } from "@deepseek-ai/dsh-tools";').length, 1);
  assert.equal(dshToolsValueImports('import tools from "@deepseek-ai/dsh-tools/lib/thing";').length, 1);
  assert.equal(dshToolsValueImports('export { defineTool } from "@deepseek-ai/dsh-tools";').length, 1);
});

test("flags dynamic and bare imports of dsh-tools", () => {
  assert.equal(dshToolsValueImports('const t = await import("@deepseek-ai/dsh-tools");').length, 1);
  assert.equal(dshToolsValueImports('const t = require("@deepseek-ai/dsh-tools");').length, 1);
  assert.equal(dshToolsValueImports('import "@deepseek-ai/dsh-tools";').length, 1);
});

test("allows type-only imports and unrelated packages", () => {
  assert.equal(dshToolsValueImports('import type { Tool } from "@deepseek-ai/dsh-tools";').length, 0);
  assert.equal(dshToolsValueImports('export type { Tool } from "@deepseek-ai/dsh-tools";').length, 0);
  assert.equal(dshToolsValueImports('import { z } from "@deepseek-ai/dsh-toolset";').length, 0);
  assert.equal(dshToolsValueImports('// mentions @deepseek-ai/dsh-tools in a comment').length, 0);
});
