import test from "node:test";
import assert from "node:assert/strict";
import {
  allRules,
  containsStructuralGlyph,
  contrastRatio,
  firstRule,
  hexToRgb,
  laneColors,
  mediaBlocks,
  mixWithBlack,
  normalizeDeclarations,
  pluginCenterContractErrors,
  uiSourcePolicyErrors,
} from "./check-ui-design.mjs";

test("Xiaotaozi action colors pass normal-text contrast on white", () => {
  assert.deepEqual(hexToRgb("#B94305"), [185, 67, 5]);
  assert.ok(contrastRatio("#B94305", "#ffffff") >= 4.5);
  assert.ok(contrastRatio("#9F3703", "#ffffff") >= 4.5);
  assert.ok(contrastRatio("#FC8940", "#ffffff") < 4.5);
});

test("Xiaotaozi dark foreground passes non-text contrast on every DSH dark surface", () => {
  for (const surface of ["#151517", "#232324", "#353638", "#61666b"]) {
    assert.ok(contrastRatio("#f3d0ba", surface) >= 3, surface);
  }
});

test("status inks and derived danger fills retain text contrast", () => {
  for (const color of ["#4F7410", "#7a4a00", "#b42318"]) {
    assert.ok(contrastRatio(color, "#ffffff") >= 4.5, color);
  }
  for (const color of ["#bbf7d0", "#fde68a", "#ffe0dc"]) {
    for (const surface of ["#151517", "#232324", "#353638", "#61666b"]) {
      assert.ok(contrastRatio(color, surface) >= 4.5, `${color}/${surface}`);
    }
  }
  assert.ok(contrastRatio(mixWithBlack("#ec1313", 0.72), "#ffffff") >= 4.5);
  assert.ok(contrastRatio(mixWithBlack("#f25a5a", 0.72), "#ffffff") >= 4.5);
});

test("shared CSS recipes compare independent of formatting", () => {
  const compact = "[data-row]{display:flex; gap:8px;}";
  const expanded = "[data-row] { display: flex;\n  gap: 8px; }";
  assert.equal(
    normalizeDeclarations(firstRule(compact, "[data-row]")),
    normalizeDeclarations(firstRule(expanded, "[data-row]")),
  );
});

test("shared CSS recipe discovery rejects hidden duplicate declarations", () => {
  assert.equal(allRules("[data-row]{display:flex}[data-row]{gap:8px}", "[data-row]").length, 2);
});

test("responsive media parsing stops at the matching brace and keeps exact conditions", () => {
  const blocks = mediaBlocks("@media (max-width: 768px), (pointer: coarse) {.a{min-height:44px}} @media (max-width: 790px){.b{height:20px}}");
  assert.equal(blocks.length, 2);
  assert.match(blocks[0].condition, /768px/u);
  assert.match(blocks[0].body, /44px/u);
  assert.doesNotMatch(blocks[0].body, /height:20px/u);
});

test("structural glyph detection catches direct and indirect text icons", () => {
  assert.equal(containsStructuralGlyph("<button>+</button>"), true);
  assert.equal(containsStructuralGlyph("{ id: 'close', glyph: '✕' }"), true);
  assert.equal(containsStructuralGlyph("{ id: 'reset', iconText: '⟳' }"), true);
  assert.equal(containsStructuralGlyph("<button><IconCloseOutline16 /></button>"), false);
  assert.equal(containsStructuralGlyph("const label = 'Zoom in (+)'"), false);
});

test("Git graph lane discovery is selector-scoped and preserves lane indexes", () => {
  const source = ".dialog{--dshH-gg-lane-0:#5B8EC9;--dshH-gg-lane-1:#5AA37A}.dark .dialog{--dshH-gg-lane-0:#7EABD9}";
  assert.deepEqual([...laneColors(source, ".dialog")], [[0, "#5B8EC9"], [1, "#5AA37A"]]);
  assert.deepEqual([...laneColors(source, ".dark .dialog")], [[0, "#7EABD9"]]);
});

test("client source policy rejects legacy theme colors in any plugin client", () => {
  const errors = uiSourcePolicyErrors([{
    path: "plugins/providers/src/client/fixture.ts",
    text: "const legacy = '#B5522A'; const legacySuccess = '#13713b'; const approved = '#FC8940';",
  }]);

  assert.deepEqual(errors, [
    "plugins/providers/src/client/fixture.ts: banned legacy UI color #B5522A",
    "plugins/providers/src/client/fixture.ts: banned legacy UI color #13713b",
  ]);
});

test("client source policy caps routine transitions but ignores animations", () => {
  const errors = uiSourcePolicyErrors([{
    path: "plugins/xtz-ui/src/client/motion.css",
    text: `
      .fast { transition: color 120ms ease; }
      .ordinary { transition: opacity 160ms ease; }
      .dialog { transition: transform 200ms ease; }
      .too-slow-ms { transition: box-shadow 201ms ease; }
      .too-slow-seconds { transition-duration: 0.21s; }
      .spinner { animation: spin 1.2s linear infinite; }
    `,
  }]);

  assert.deepEqual(errors, [
    "plugins/xtz-ui/src/client/motion.css: routine transition duration 201ms exceeds 200ms",
    "plugins/xtz-ui/src/client/motion.css: routine transition duration 0.21s exceeds 200ms",
  ]);
});

// Complete literal owner fixture: omission must never look like a valid product.
function pluginCenterFiles() {
  return new Map([
    ["plugins/market/src/client/PluginCenterHost.tsx", `
      ctx.slots.inject("shell.overlay", () => ctx.slots.register({
        name: "shell.overlay", id: "plugin-center",
        children: { [DETAIL_SLOT]: { kind: "keyed", scope: "root" } },
        inject: () => ({ ctx, ...face }),
      }, PluginCenterHost));`],
    ["plugins/market/src/client/index.ts", `registerPluginCenter(ctx, { center, t, renderPage: props => createElement(PluginCenter, props) });`],
    ["plugins/market/src/client/plugin-center-contract.ts", `export const DETAIL_SLOT = "xiaotaozi.plugin-center.detail";`],
    ["plugins/xtz-ui/src/client/index.ts", `ctx.slots.register({ name: "xiaotaozi.plugin-center.detail", key: "xiaotaozi" }, XiaotaoziSettings)`],
    ["plugins/sidebar/src/client/index.tsx", `ctx.slots.register({ name: "xiaotaozi.plugin-center.detail", key: "side-workbench" }, SideCardSection)`],
    ["plugins/providers/src/client/index.ts", `ctx.slots.register({ name: "xiaotaozi.plugin-center.detail", key: "models" }, ModelsWorkspace)`],
    ["plugins/im/src/client/index.ts", `ctx.slots.register({ name: "xiaotaozi.plugin-center.detail", key: "im" }, IMSettingsTab)`],
    ["plugins/market/src/client/market-css.ts", RAIL_TOOLS_RECIPE],
  ]);
}

const RAIL_TOOLS_RECIPE = `
[data-dsh-sidebar-tools] { display: flex; flex-wrap: wrap; align-items: stretch; gap: 8px; margin: 0 2px 8px; min-width: 0; container-type: inline-size; }
[data-dsh-sidebar-tools] > .dsh-rail-tool { box-sizing: border-box; flex: 1 1 100%; min-width: 0; min-height: 36px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; margin: 0; padding: 0 8px; border: 1px solid var(--dsw-alias-border-l2, rgba(15, 23, 42, .12)); border-radius: var(--xtz-radius-s, 8px); background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #111827); font: inherit; font-size: 13px; font-weight: 500; line-height: 1; cursor: pointer; touch-action: manipulation; }
[data-dsh-sidebar-tools] > .dsh-rail-tool span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 768px), (pointer: coarse) { [data-dsh-sidebar-tools] > .dsh-rail-tool { min-height: 44px; } }
`;

test("plugin center gate accepts all owners and the unrelated IM follow dialog", () => {
  const files = pluginCenterFiles();
  files.set("plugins/im/src/client/follow-dialog.ts", `ctx.slots.register({ name: 'shell.overlay', id: 'im-follow-dialog' }, FollowDialog)`);
  assert.deepEqual(pluginCenterContractErrors(files), []);
});

test("plugin center gate rejects missing owners, including incomplete maps", () => {
  for (const path of pluginCenterFiles().keys()) {
    const files = pluginCenterFiles(); files.delete(path);
    assert.ok(pluginCenterContractErrors(files).some(error => error.includes(path)), path);
  }
  assert.ok(pluginCenterContractErrors(new Map()).length >= 8);
});

test("plugin center gate rejects a parent without authorized root-keyed children or apply wiring", () => {
  for (const [path, before, after] of [
    ["plugins/market/src/client/PluginCenterHost.tsx", 'children:', 'undeclared:'],
    ["plugins/market/src/client/PluginCenterHost.tsx", 'kind: "keyed"', 'kind: "list"'],
    ["plugins/market/src/client/PluginCenterHost.tsx", 'scope: "root"', 'scope: "local"'],
    ["plugins/market/src/client/PluginCenterHost.tsx", 'name: "shell.overlay"', 'name: "conversation"'],
    ["plugins/market/src/client/index.ts", 'registerPluginCenter(ctx,', 'unused(ctx,'],
    ["plugins/market/src/client/plugin-center-contract.ts", 'xiaotaozi.plugin-center.detail', 'wrong.detail'],
  ]) {
    const files = pluginCenterFiles(); files.set(path, files.get(path).replace(before, after));
    assert.ok(pluginCenterContractErrors(files).some(error => error.includes(path)), after);
  }
});

test("plugin center gate requires keyed capability registrations rather than list ids", () => {
  for (const slug of ["xtz-ui", "sidebar", "providers", "im"]) {
    const files = pluginCenterFiles();
    const path = `plugins/${slug}/src/client/index.${slug === "sidebar" ? "tsx" : "ts"}`;
    files.set(path, files.get(path).replace('key:', 'id:'));
    assert.ok(pluginCenterContractErrors(files).some(error => error.includes(path)), slug);
  }
});

test("plugin center gate rejects legacy Models navigation", () => {
  const files = new Map([["plugins/providers/src/client/index.ts",
    'ctx.slots.register({ name: "settings.section", id: "models" }, ModelsWorkspace)']]);
  assert.ok(pluginCenterContractErrors(files).some(error => error.includes("providers") && error.includes("legacy")));
});

test("plugin center gate rejects duplicate first-party Settings and the IM manager entry", () => {
  for (const [path, legacy] of [
    ["plugins/sidebar/src/client/index.tsx", `ctx.slots.register({ name: 'settings.section', id: 'better-sidebar' }, SideCardSection)`],
    ["plugins/xtz-ui/src/client/index.ts", `ctx.slots.register({ name: 'settings.section', id: 'xiaotaozi' }, XiaotaoziSettings)`],
    ["plugins/im/src/client/index.ts", `ctx.slots.register({ name: 'shell.overlay', id: 'im-manager' }, IMHub)`],
    ["plugins/im/src/client/index.ts", `mountImEntry(document)`],
    ["plugins/im/src/client/sidebar-entry.ts", `export function mountEntry() {}`],
    ["plugins/im/src/client/channels/feishu/index.ts", `ctx.slots.register({ name: 'settings.plugins.tab', key: 'feishu' }, SettingsTab)`],
  ]) {
    const files = pluginCenterFiles(); files.set(path, (files.get(path) ?? "") + legacy);
    assert.ok(pluginCenterContractErrors(files).some(error => error.includes(path) && error.includes("legacy")), path);
  }
});

test("plugin center gate keeps exactly one market-owned normalized tools recipe", () => {
  const path = "plugins/market/src/client/market-css.ts";
  const recipe = pluginCenterFiles().get(path);
  for (const [target, text] of [
    [path, recipe + '[data-dsh-sidebar-tools] { display: flex; }'],
    [path, recipe.replace("min-height: 36px", "min-height: 38px")],
    ["plugins/im/src/client/styles.ts", recipe],
    ["plugins/providers/src/client/styles.ts", recipe],
  ]) {
    const files = pluginCenterFiles(); files.set(target, text);
    assert.ok(pluginCenterContractErrors(files).some(error => error.includes("tools recipe")), target);
  }
});

test("plugin center tools recipe permits only its one scoped compact 44px override", () => {
  const path = "plugins/market/src/client/market-css.ts";
  const original = pluginCenterFiles().get(path);
  const compact = "@media (max-width: 768px), (pointer: coarse) { [data-dsh-sidebar-tools] > .dsh-rail-tool { min-height: 44px; } }";
  for (const replacement of [
    "", compact + compact,
    "[data-dsh-sidebar-tools] > .dsh-rail-tool { min-height: 44px; }",
    compact.replace("768px", "900px"), compact.replace("44px", "38px"),
    compact.replace("min-height: 44px;", "min-height: 44px; padding: 0;"),
  ]) {
    const files = pluginCenterFiles(); files.set(path, original.replace(compact, replacement));
    assert.ok(pluginCenterContractErrors(files).some(error => error.includes("tools recipe")), replacement);
  }
});
