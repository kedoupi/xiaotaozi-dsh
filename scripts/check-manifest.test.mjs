import test from "node:test";
import assert from "node:assert/strict";
import {
  dshToolsValueImports,
  IM_TS_NOCHECK_MAX,
  pluginCenterDocErrors,
  isTypeScriptSourceName,
  missingHarnessPeerCompanions,
  tsNoCheckDirectiveCount,
} from "./check-manifest.mjs";

test("IM ts-nocheck budget is explicit and counts only directives", () => {
  assert.equal(IM_TS_NOCHECK_MAX, 54);
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
      "@deepseek-ai/dsh-session": "0.1.2-rc.1",
    }),
    ["@deepseek-ai/dsh-scope"],
  );
  assert.deepEqual(
    missingHarnessPeerCompanions(new Set(["@deepseek-ai/dsh-session"]), {
      "@deepseek-ai/dsh-session": "0.1.2-rc.1",
      "@deepseek-ai/dsh-scope": "0.1.2-rc.1",
    }),
    [],
  );
});

test("subagent value-import requires dsh-scope and dsh-tools companions", () => {
  assert.deepEqual(
    missingHarnessPeerCompanions(new Set(["@deepseek-ai/dsh-subagent"]), {
      "@deepseek-ai/dsh-subagent": "0.1.2-rc.1",
    }),
    ["@deepseek-ai/dsh-scope", "@deepseek-ai/dsh-tools"],
  );
  assert.deepEqual(
    missingHarnessPeerCompanions(new Set(["@deepseek-ai/dsh-subagent"]), {
      "@deepseek-ai/dsh-subagent": "0.1.2-rc.1",
      "@deepseek-ai/dsh-scope": "0.1.2-rc.1",
      "@deepseek-ai/dsh-tools": "0.1.2-rc.1",
    }),
    [],
  );
});

const centerEnglish = "Plugin Center → Installed → Models/IM bots/Xiaotaozi/Side workbench. Discover plugins. Settings → Advanced.";
const centerChinese = "插件中心 → 已安装 → 模型/IM 机器人/小桃子功能/侧边工作台。发现插件。设置 → 高级。";

test("plugin center docs gate requires current bilingual navigation in each current README", () => {
  for (const base of ["", "docs/", ...["market", "xtz-ui", "sidebar", "providers", "im", "wecom-office"].map(slug => `plugins/${slug}/`)]) {
    for (const [suffix, text] of [["md", centerEnglish], ["zh.md", centerChinese]]) {
      const path = `${base}README.${suffix}`;
      assert.deepEqual(pluginCenterDocErrors(path, text + " github:kedoupi/xiaotaozi-dsh#path:plugins/im dsh-im"), []);
      assert.ok(pluginCenterDocErrors(path, "").length > 0, path);
    }
  }
});

test("plugin center docs gate requires the capability owned by each README", () => {
  for (const [slug, label] of [["providers", "Models"], ["im", "IM bots"], ["wecom-office", "IM bots"], ["xtz-ui", "Xiaotaozi"], ["sidebar", "Side workbench"]]) {
    const path = `plugins/${slug}/README.md`;
    assert.ok(pluginCenterDocErrors(path, centerEnglish.replace(label, "Other")).length > 0, slug);
  }
  assert.ok(pluginCenterDocErrors("plugins/market/README.md", centerEnglish.replace("Discover plugins", "Other")).length > 0);
  assert.ok(pluginCenterDocErrors("plugins/xtz-ui/README.md", centerEnglish.replace("Settings → Advanced", "Other")).length > 0);
});

test("plugin center docs gate rejects obsolete market versus Settings and sidebar instructions", () => {
  for (const [path, text, legacy] of [
    ["plugins/market/README.md", centerEnglish, "Market vs. Settings → Plugins"],
    ["plugins/market/README.zh.md", centerChinese, "市场不能替代 **设置 → 插件**"],
    ["plugins/providers/README.md", centerEnglish, "Open **Settings → Models**"],
    ["plugins/sidebar/README.zh.md", centerChinese, "打开 **设置 → Side card**"],
    ["plugins/im/README.md", centerEnglish, "Sidebar → IM bots"],
    ["plugins/im/README.zh.md", centerChinese, "侧栏 → IM机器人"],
    ["plugins/market/README.md", centerEnglish, "opens the market overlay"],
    ["plugins/market/README.md", centerEnglish, "market left, IM right"],
    ["plugins/market/README.zh.md", centerChinese, "来源记录可从面板移除"],
    ["plugins/market/README.md", centerEnglish, "Existing source records can be removed in the panel."],
  ]) {
    assert.ok(pluginCenterDocErrors(path, text + "\n" + legacy).some(error => error.includes("obsolete")), legacy);
  }
});

test("plugin center docs gate ignores historical specs, plans, changelog and developer-only docs", () => {
  for (const path of ["docs/superpowers/specs/2026-09-04-plugin-center-design.md", "docs/superpowers/plans/2026-09-05-plugin-center-plan.md", "CHANGELOG.md", "plugins/providers/PRODUCT.md", "apps/cli/README.md"]) {
    assert.deepEqual(pluginCenterDocErrors(path, "Settings → Plugins; Settings → Models"), []);
  }
});

test("plugin center docs gate requires a capability on the Installed path, not a stray name", () => {
  assert.ok(pluginCenterDocErrors("plugins/providers/README.md", "Plugin Center → Installed. Models are useful.").length > 0);
  assert.ok(pluginCenterDocErrors("plugins/im/README.zh.md", "插件中心 → 已安装。IM 机器人").length > 0);
  assert.deepEqual(pluginCenterDocErrors("plugins/providers/README.md", "Open **Plugin Center → Installed → Models**."), []);
  assert.deepEqual(pluginCenterDocErrors("plugins/im/README.zh.md", "打开 **插件中心 → 已安装 → IM 机器人**。"), []);
});

test("plugin center docs gate rejects the old source-removal instruction even with sources.json", () => {
  assert.ok(pluginCenterDocErrors("plugins/market/README.md", centerEnglish +
    " Existing source records remain in `$DSH_HOME/plugins/market/sources.json` and can be removed in the panel.")
    .some(error => error.includes("obsolete")));
});
