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

test("client source policy rejects only explicit legacy theme colors", () => {
  const errors = uiSourcePolicyErrors([{
    path: "plugins/xtz-ui/src/client/fixture.ts",
    text: "const legacy = '#B5522A'; const approved = '#FC8940';",
  }]);

  assert.deepEqual(errors, [
    "plugins/xtz-ui/src/client/fixture.ts: banned legacy UI color #B5522A",
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
