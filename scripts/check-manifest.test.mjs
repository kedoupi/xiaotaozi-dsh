import test from "node:test";
import assert from "node:assert/strict";
import {
  dshToolsValueImports,
  IM_TS_NOCHECK_MAX,
  isTypeScriptSourceName,
  missingHarnessPeerCompanions,
  tsNoCheckDirectiveCount,
} from "./check-manifest.mjs";

test("IM ts-nocheck budget is explicit and counts only directives", () => {
  assert.equal(IM_TS_NOCHECK_MAX, 228);
  assert.equal(tsNoCheckDirectiveCount("// @ts-nocheck\nconst value = 1;\n"), 1);
  assert.equal(tsNoCheckDirectiveCount("/// @ts-nocheck\n// @TS-NoCheck\n"), 2);
  assert.equal(tsNoCheckDirectiveCount("/* banner */ // @TS-NoCheck\nconst value = 1;\n"), 1);
  assert.equal(tsNoCheckDirectiveCount("/* banner\n */ /// @ts-nocheck\nconst value = 1;\n"), 1);
  assert.equal(tsNoCheckDirectiveCount("/* @Ts-NoCheck */ const value = 1;\n// prose mentions @ts-nocheck\n"), 1);
  assert.equal(tsNoCheckDirectiveCount("// @ts-check\nconst label = '@ts-nocheck';\n"), 0);
  assert.equal(tsNoCheckDirectiveCount("//// @ts-nocheck\n// prose @ts-nocheck\n"), 0);
  for (const name of ["one.ts", "one.tsx", "one.mts", "one.mtsx", "one.cts", "one.ctsx"]) {
    assert.equal(isTypeScriptSourceName(name), true, name);
  }
  assert.equal(isTypeScriptSourceName("one.js"), false);
});

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

test("session value-import requires dsh-scope as a dependency companion", () => {
  assert.deepEqual(
    missingHarnessPeerCompanions(new Set(["@deepseek-ai/dsh-session"]), {
      "@deepseek-ai/dsh-session": "0.1.1-rc.2",
    }),
    ["@deepseek-ai/dsh-scope"],
  );
  assert.deepEqual(
    missingHarnessPeerCompanions(new Set(["@deepseek-ai/dsh-session"]), {
      "@deepseek-ai/dsh-session": "0.1.1-rc.2",
      "@deepseek-ai/dsh-scope": "0.1.1-rc.2",
    }),
    [],
  );
});

test("subagent value-import requires dsh-scope and dsh-tools companions", () => {
  assert.deepEqual(
    missingHarnessPeerCompanions(new Set(["@deepseek-ai/dsh-subagent"]), {
      "@deepseek-ai/dsh-subagent": "0.1.1-rc.2",
    }),
    ["@deepseek-ai/dsh-scope", "@deepseek-ai/dsh-tools"],
  );
  assert.deepEqual(
    missingHarnessPeerCompanions(new Set(["@deepseek-ai/dsh-subagent"]), {
      "@deepseek-ai/dsh-subagent": "0.1.1-rc.2",
      "@deepseek-ai/dsh-scope": "0.1.1-rc.2",
      "@deepseek-ai/dsh-tools": "0.1.1-rc.2",
    }),
    [],
  );
});
