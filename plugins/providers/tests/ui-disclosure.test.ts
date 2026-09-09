import ts from "typescript";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { css } from "../src/client/styles.ts";

const readClient = (name: string): string =>
  readFileSync(new URL(`../src/client/${name}`, import.meta.url), "utf8");

describe("Providers UI disclosure", () => {
  it("uses a native closed details/summary advanced section with localized copy", () => {
    const panels = readClient("workspace-panels.tsx");
    const workspace = readClient("ModelsWorkspace.tsx");
    const locales = readClient("locales.ts");
    const detail = workspace.slice(
      workspace.indexOf('<div className="dshM-main">'),
      workspace.indexOf("{picker ? ("),
    );

    expect(locales).toContain("advancedSummary:");
    expect(locales).toContain("moreModels:");
    expect(css).toContain(".dshM-manual {");
    expect(css).toContain(".dshM-manual > summary");
    expect(css).toContain(".dshM-manual > summary:focus-visible");
    expect(panels).toContain('<details className="dshM-manual">');
    expect(panels).toContain('<summary>{props.t("advancedSummary")}</summary>');
    expect(panels).toContain('<summary>{props.t("moreModels")}</summary>');
    expect(panels).not.toMatch(/<details[^>]*\sopen(?:[\s>=]|$)/u);
    expect(workspace).not.toMatch(/<details[^>]*\sopen(?:[\s>=]|$)/u);
    expect(detail).toContain("<AdvancedDetails");
    expect(detail).toContain("currentApi.baseURL");
  });

  it("keeps core key/auth fields and selected-model controls outside disclosure", () => {
    const panels = readClient("workspace-panels.tsx");
    const workspace = readClient("ModelsWorkspace.tsx");
    const keyPanel = panels.slice(
      panels.indexOf("export function KeyPanel"),
      panels.indexOf("export function PickerGroup"),
    );
    const modelsList = panels.slice(
      panels.indexOf("export function ModelsList"),
      panels.indexOf("export function KeyPanel"),
    );
    const advanced = panels.slice(
      panels.indexOf("export function AdvancedDetails"),
      panels.indexOf("export function ModelsList"),
    );
    const detail = workspace.slice(
      workspace.indexOf('<div className="dshM-main">'),
      workspace.indexOf("{picker ? ("),
    );

    expect(keyPanel).toContain('type="password"');
    expect(keyPanel).toContain('className="dshM-input is-mono"');
    expect(keyPanel).not.toContain("<details");
    assertModelsListEmptyReturn(panels);
    expect(modelsList).toContain("extra.length > 0");
    const detailsAt = modelsList.indexOf("<details");
    const selectedAt = modelsList.indexOf("selected.map(renderModel)");
    const visibleAt = modelsList.indexOf("visibleRest.map(renderModel)");
    const extraAt = modelsList.indexOf("extra.map(renderModel)");
    expect(detailsAt).toBeGreaterThan(-1);
    expect(selectedAt).toBeGreaterThan(-1);
    expect(visibleAt).toBeGreaterThan(-1);
    expect(extraAt).toBeGreaterThan(-1);
    expect(selectedAt).toBeLessThan(detailsAt);
    expect(visibleAt).toBeLessThan(detailsAt);
    expect(extraAt).toBeGreaterThan(detailsAt);
    expect(advanced).toContain("props.baseURL");
    expect(advanced).not.toContain('type="password"');
    expect(advanced).not.toContain('type="checkbox"');
    expect(detail.indexOf("<KeyPanel")).toBeGreaterThan(-1);
    expect(detail.indexOf("<KeyPanel")).toBeLessThan(
      detail.indexOf("<AdvancedDetails"),
    );
    expect(detail.indexOf("<ModelsList")).toBeGreaterThan(
      detail.indexOf("<AdvancedDetails"),
    );
    expect(detail).toContain('t("customName")');
    expect(detail).toContain('t("customBase")');
    expect(detail).toContain('t("apiTitle")');
    expect(detail.indexOf('t("customName")')).toBeLessThan(
      detail.indexOf("<AdvancedDetails"),
    );
    expect(detail.indexOf('t("customBase")')).toBeLessThan(
      detail.indexOf("<AdvancedDetails"),
    );
    assertAdvancedDetails(workspace, "pairApi");
    assertAdvancedDetails(workspace, "currentApi");
  });
});

// Only the two AdvancedDetails condition/prop assertions use this structural check.
function assertAdvancedDetails(source: string, receiver: string) {
  const file = ts.createSourceFile(
    "ModelsWorkspace.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  expect(
    (file as ts.SourceFile & { parseDiagnostics: unknown[] }).parseDiagnostics,
  ).toEqual([]);
  const unwrap = (node: ts.Expression): ts.Expression =>
    ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node;
  const property = (node: ts.Expression) => {
    node = unwrap(node);
    return (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === receiver &&
      node.name.text === "baseURL"
    );
  };
  let matches = 0;
  function visit(node: ts.Node, inMain: boolean) {
    if (
      ts.isJsxElement(node) &&
      node.openingElement.attributes.properties.some(
        (attr) =>
          ts.isJsxAttribute(attr) &&
          attr.name.getText(file) === "className" &&
          attr.initializer &&
          ts.isStringLiteral(attr.initializer) &&
          attr.initializer.text === "dshM-main",
      )
    )
      inMain = true;
    if (inMain && ts.isConditionalExpression(node)) {
      const condition = unwrap(node.condition);
      const branch = unwrap(node.whenFalse);
      if (
        ts.isBinaryExpression(condition) &&
        property(condition.left) &&
        condition.operatorToken.kind ===
          ts.SyntaxKind.EqualsEqualsEqualsToken &&
        ts.isIdentifier(condition.right) &&
        condition.right.text === "undefined"
      ) {
        expect(unwrap(node.whenTrue).kind).toBe(ts.SyntaxKind.NullKeyword);
        expect(ts.isJsxSelfClosingElement(branch)).toBe(true);
        if (!ts.isJsxSelfClosingElement(branch))
          throw new Error("Missing AdvancedDetails branch");
        expect(branch.tagName.getText(file)).toBe("AdvancedDetails");
        const attrs = branch.attributes.properties;
        expect(attrs).toHaveLength(2);
        const expression = (name: string) => {
          const attr = attrs.find(
            (a) => ts.isJsxAttribute(a) && a.name.getText(file) === name,
          );
          if (
            !attr ||
            !ts.isJsxAttribute(attr) ||
            !attr.initializer ||
            !ts.isJsxExpression(attr.initializer) ||
            !attr.initializer.expression
          )
            throw new Error("Missing prop");
          return unwrap(attr.initializer.expression);
        };
        const t = expression("t");
        expect(ts.isIdentifier(t) && t.text === "t").toBe(true);
        expect(property(expression("baseURL"))).toBe(true);
        matches++;
      }
    }
    ts.forEachChild(node, (child) => visit(child, inMain));
  }
  visit(file, false);
  expect(matches).toBe(1);
}

it.each(["pairApi", "currentApi"])(
  "AdvancedDetails %s structural assertion retains polarity and receiver across formatting",
  (receiver) => {
    const valid = `<div className="dshM-main">{${receiver}.baseURL === undefined ? null : <AdvancedDetails t={t} baseURL={${receiver}.baseURL} />}</div>`;
    for (const source of [valid, valid.replaceAll(" ", "\n  ")])
      assertAdvancedDetails(source, receiver);
    for (const mutant of [
      valid.replace("===", "!=="),
      valid.replace(`baseURL={${receiver}.baseURL}`, "baseURL={other.baseURL}"),
      valid.replace("? null :", "? <span /> :"),
      valid.replace("t={t}", "t={other}"),
    ]) {
      expect(mutant).not.toBe(valid);
      const parsed = ts.createSourceFile(
        "mutant.tsx",
        mutant,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      expect(
        (parsed as ts.SourceFile & { parseDiagnostics: unknown[] })
          .parseDiagnostics,
      ).toEqual([]);
      expect(() => assertAdvancedDetails(mutant, receiver)).toThrow();
    }
  },
);

function assertModelsListEmptyReturn(source: string) {
  const file = ts.createSourceFile(
    "workspace-panels.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  expect(
    (file as ts.SourceFile & { parseDiagnostics: readonly unknown[] })
      .parseDiagnostics,
  ).toEqual([]);
  const functions = file.statements.filter(
    (node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === "ModelsList",
  );
  expect(functions).toHaveLength(1);
  const unwrap = (node: ts.Node): ts.Node =>
    ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node;
  const shape = (node: ts.Node): unknown => {
    node = unwrap(node);
    const children: unknown[] = [];
    ts.forEachChild(node, (child) => {
      children.push(shape(child));
    });
    return [
      node.kind,
      ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)
        ? node.operator
        : undefined,
      ts.isIdentifier(node) || ts.isLiteralExpression(node)
        ? node.text
        : undefined,
      children,
    ];
  };
  const guards = functions[0]!.body!.statements.filter(ts.isIfStatement);
  const expected = ts.createSourceFile(
    "condition.ts",
    "props.models.length === 0",
    ts.ScriptTarget.Latest,
    true,
  );
  const condition = (expected.statements[0] as ts.ExpressionStatement)
    .expression;
  const empty = guards.filter(
    (node) =>
      JSON.stringify(shape(node.expression)) ===
      JSON.stringify(shape(condition)),
  );
  expect(empty).toHaveLength(1);
  expect(empty[0]!.elseStatement).toBeUndefined();
  const branch = empty[0]!.thenStatement;
  const statements = ts.isBlock(branch) ? branch.statements : [branch];
  expect(statements).toHaveLength(1);
  const statement = statements[0]!;
  expect(ts.isReturnStatement(statement)).toBe(true);
  if (!ts.isReturnStatement(statement) || !statement.expression)
    throw new Error("Expected empty-model return");
  const expression = unwrap(statement.expression);
  expect(ts.isJsxElement(expression)).toBe(true);
  if (!ts.isJsxElement(expression))
    throw new Error("Expected empty-model hint");
  const hint = ts.createSourceFile(
    "hint.tsx",
    '<p className="dshM-hint">{props.t("modelsNone")}</p>',
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const expectedHint = (hint.statements[0] as ts.ExpressionStatement)
    .expression as ts.JsxElement;
  expect(shape(expression.openingElement)).toEqual(
    shape(expectedHint.openingElement),
  );
  expect(shape(expression.closingElement)).toEqual(
    shape(expectedHint.closingElement),
  );
  const children = expression.children.filter(
    (node) => !ts.isJsxText(node) || node.text.trim() !== "",
  );
  expect(children).toHaveLength(1);
  expect(shape(children[0]!)).toEqual(shape(expectedHint.children[0]!));
}

const modelsListEmptyGuard =
  'if(props.models.length===0)return <p className="dshM-hint">{props.t("modelsNone")}</p>;';
const modelsListEmptyFixture = (guard: string) =>
  `export function ModelsList(props) { ${guard} return <ul />; }`;

it.each([
  modelsListEmptyGuard,
  'if (props.models.length === 0)\n return (\n <p className="dshM-hint">\n {props.t("modelsNone")}\n </p>\n );',
  'if (((props.models.length) === (0))) { return (<p className="dshM-hint">{(props.t("modelsNone"))}</p>); }',
])("ModelsList empty return accepts formatting: %s", (guard) => {
  assertModelsListEmptyReturn(modelsListEmptyFixture(guard));
});

it("ModelsList empty return rejects polarity, receiver, return and hint-branch regressions", () => {
  const valid = modelsListEmptyFixture(modelsListEmptyGuard);
  const mutants = [
    valid.replace("===0", "!==0"),
    valid.replace("props.models", "other.models"),
    valid.replace("props.t(", "other.t("),
    valid.replace("return <p", "<p"),
    valid.replace("return <p", "return; <p"),
    valid.replace('"modelsNone"', '"moreModels"'),
    valid.replace('"dshM-hint"', '"dshM-error"'),
    valid.replace(
      modelsListEmptyGuard,
      'if(props.models.length===0)return null; else return <p className="dshM-hint">{props.t("modelsNone")}</p>;',
    ),
    valid.replace(
      modelsListEmptyGuard,
      `const nested = () => { ${modelsListEmptyGuard} };`,
    ),
  ];
  for (const mutant of mutants) {
    expect(mutant).not.toBe(valid);
    const parsed = ts.createSourceFile(
      "mutant.tsx",
      mutant,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    expect(
      (parsed as ts.SourceFile & { parseDiagnostics: readonly unknown[] })
        .parseDiagnostics,
    ).toEqual([]);
    // A guard in an unrelated function cannot satisfy the actual ModelsList branch.
    const decoy = `function Other(props) { ${modelsListEmptyGuard} }`;
    expect(() => assertModelsListEmptyReturn(`${mutant}\n${decoy}`)).toThrow();
  }
});
