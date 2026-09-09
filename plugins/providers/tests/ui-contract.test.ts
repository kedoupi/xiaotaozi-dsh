import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { css } from "../src/client/styles.ts";

const readClient = (name: string): string =>
  readFileSync(new URL(`../src/client/${name}`, import.meta.url), "utf8");

// Compare parsed expressions, not layout. Literal contents and operator trees stay exact.
function parseWorkspace(source: string): ts.SourceFile {
  const file = ts.createSourceFile(
    "workspace.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  expect(
    (file as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] })
      .parseDiagnostics,
  ).toEqual([]);
  return file;
}

function nodes<T extends ts.Node>(
  root: ts.Node,
  guard: (node: ts.Node) => node is T,
): T[] {
  const found: T[] = [];
  const visit = (node: ts.Node) => {
    if (guard(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

function one<T>(items: readonly T[]): T {
  expect(items).toHaveLength(1);
  return items[0]!;
}

function unwrap(node: ts.Node): ts.Node {
  return ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node;
}

function expressionShape(input: ts.Node): unknown {
  const node = unwrap(input);
  const children: unknown[] = [];
  ts.forEachChild(node, (child) => {
    children.push(expressionShape(child));
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
}

function expression(source: string): ts.Expression {
  const statement = one(parseWorkspace(`(${source});`).statements);
  if (!ts.isExpressionStatement(statement))
    throw new Error("Expected expression");
  return statement.expression;
}

function matches(node: ts.Node | undefined, source: string): boolean {
  return (
    node !== undefined &&
    JSON.stringify(expressionShape(node)) ===
      JSON.stringify(expressionShape(expression(source)))
  );
}

type Element = ts.JsxElement | ts.JsxSelfClosingElement;
const isElement = (node: ts.Node): node is Element =>
  ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node);
const opening = (node: Element) =>
  ts.isJsxElement(node) ? node.openingElement : node;
const elements = (root: ts.Node, tag: string) =>
  nodes(root, isElement).filter(
    (node) => opening(node).tagName.getText() === tag,
  );
function attribute(node: Element, name: string): ts.Node | undefined {
  const attributes = opening(node).attributes.properties.filter(
    (attr) => ts.isJsxAttribute(attr) && attr.name.getText() === name,
  );
  expect(attributes.length).toBeLessThanOrEqual(1);
  const attr = attributes[0];
  if (!attr || !ts.isJsxAttribute(attr)) return undefined;
  return attr.initializer && ts.isJsxExpression(attr.initializer)
    ? attr.initializer.expression
    : attr.initializer;
}
const elementWith = (root: ts.Node, tag: string, name: string, value: string) =>
  one(
    elements(root, tag).filter((node) => matches(attribute(node, name), value)),
  );
const expectAttribute = (node: Element, name: string, value: string) =>
  expect(
    matches(attribute(node, name), value),
    `${opening(node).tagName.getText()} ${name}: ${value}`,
  ).toBe(true);
function expectExpression(root: ts.Node, source: string) {
  expect(
    nodes(root, ts.isExpression).some((node) => matches(node, source)),
    source,
  ).toBe(true);
}
function conditional(
  root: ts.Node,
  condition: string,
): ts.ConditionalExpression {
  return one(
    nodes(root, ts.isConditionalExpression).filter((node) =>
      matches(node.condition, condition),
    ),
  );
}
function trueElement(root: ts.Node, condition: string, tag: string): Element {
  const node = unwrap(conditional(root, condition).whenTrue);
  expect(isElement(node)).toBe(true);
  if (!isElement(node)) throw new Error("Expected JSX branch");
  expect(opening(node).tagName.getText()).toBe(tag);
  return node;
}

function assertKeyPanelSaveClass(source: string) {
  const keyPanel = one(
    parseWorkspace(source).statements.filter(
      (node): node is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(node) && node.name?.text === "KeyPanel",
    ),
  );
  const returned = one(keyPanel.body!.statements.filter(ts.isReturnStatement));
  if (!returned.expression) throw new Error("Expected KeyPanel return");
  const save = elementWith(
    returned.expression,
    "button",
    "onClick",
    "props.onPersist",
  );
  expectAttribute(
    save,
    "className",
    'props.savedOk ? "dshM-btn is-ok" : props.savePrimary === false ? "dshM-btn" : "dshM-btn is-primary"',
  );
}

function assertRailContract(workspace: string) {
  const rail = elementWith(
    parseWorkspace(workspace),
    "nav",
    "aria-label",
    't("nav")',
  );
  for (const [identity, badge, state] of [
    [
      "product",
      "loginBadge(product, t)",
      'entry?.loggedIn === true ? t("connected") : entry?.busy === true ? t("busy") : pairOn ? t("configured") : t("loggedOut")',
    ],
    [
      "vendor",
      "apiMethodBadge(vendor, t)",
      'vendor.configured ? t("configured") : t("loggedOut")',
    ],
  ]) {
    const button = elementWith(rail, "button", "key", `${identity}.id`);
    expectAttribute(
      one(elements(button, "ProviderLogo")),
      "id",
      `${identity}.id`,
    );
    expectAttribute(button, "aria-current", 'on ? "true" : undefined');
    expectExpression(button, badge!);
    expectExpression(button, state!);
  }
  expect(rail.getText()).not.toMatch(/enabledCount|hintZh|baseURL/);
}

function assertBusyContract(workspace: string, panels: string) {
  const file = parseWorkspace(workspace);
  const main = elementWith(file, "div", "className", '"dshM-main"');
  const loading = conditional(main, "!ready");
  const status = trueElement(main, "!ready", "div");
  expectAttribute(status, "role", '"status"');
  expectAttribute(status, "aria-busy", '"true"');
  expectExpression(status, 't("loading")');
  expect(
    nodes(loading.whenTrue, ts.isCallExpression).some((node) =>
      matches(node, 't("emptyTitle")'),
    ),
  ).toBe(false);
  expectExpression(loading.whenFalse, 't("emptyTitle")');
  expectExpression(loading.whenFalse, 't("emptyDetail")');
  for (const title of ['t("emptyTitle")', 't("emptyDetail")']) {
    expect(
      nodes(main, ts.isConditionalExpression).some(
        (node) =>
          matches(node.condition, "ready") && matches(node.whenTrue, title),
      ),
    ).toBe(false);
  }
  expectAttribute(
    elementWith(file, "div", "className", '"dshM-wrap"'),
    "aria-busy",
    "!ready || waiting || pendingId !== undefined || confirmBusy || undefined",
  );
  for (const [condition, busy] of [
    ["customOpen", "pendingId !== undefined || undefined"],
    ["currentSub !== undefined", "subWaiting || pendingId === currentSub.id"],
    [
      "currentApi !== undefined && api !== undefined",
      "pendingId === currentApi.id || undefined",
    ],
  ])
    expectAttribute(
      trueElement(loading.whenFalse, condition!, "article"),
      "aria-busy",
      busy!,
    );
  expectAttribute(
    elementWith(file, "div", "className", '"dshM-confirm"'),
    "aria-busy",
    "confirmBusy || undefined",
  );
  const live = elementWith(file, "div", "className", '"dshM-live"');
  for (const [name, value] of [
    ["role", '"status"'],
    ["aria-live", '"polite"'],
    ["aria-atomic", '"true"'],
  ])
    expectAttribute(live, name!, value!);
  expectExpression(live, "liveNote");
  const note = one(
    nodes(file, ts.isVariableDeclaration).filter(
      (node) => node.name.getText() === "liveNote",
    ),
  );
  expect(
    matches(
      note.initializer,
      'copied === "code" ? t("copied") : copied === "link" ? t("copiedLink") : savedOk || modelsSaved ? t("saved") : ""',
    ),
  ).toBe(true);
  const savedLabels = nodes(file, ts.isConditionalExpression).filter(
    (node) =>
      matches(node.condition, "modelsSaved") &&
      matches(node.whenTrue, 't("saved")'),
  );
  expect(savedLabels.length).toBeGreaterThan(0);
  const error = elementWith(main, "p", "ref", "errorRef");
  expectAttribute(error, "className", '"dshM-error"');
  expectAttribute(error, "role", '"alert"');
  const detail = conditional(main, "subStatus?.detail !== undefined");
  const detailError = trueElement(main, "subStatus?.detail !== undefined", "p");
  expectAttribute(detailError, "className", '"dshM-error"');
  expectAttribute(detailError, "role", '"alert"');
  expectExpression(detailError, "subStatus.detail");
  expect(matches(detail.whenFalse, "null")).toBe(true);

  const keyPanel = one(
    nodes(parseWorkspace(panels), ts.isFunctionDeclaration).filter(
      (node) => node.name?.text === "KeyPanel",
    ),
  );
  expectAttribute(
    one(elements(keyPanel, "section")),
    "aria-busy",
    "props.pending || undefined",
  );
  const save = elementWith(keyPanel, "button", "onClick", "props.onPersist");
  expectExpression(
    save,
    'props.savedOk ? t("saved") : props.pending ? t("saving") : t("save")',
  );
  expectExpression(keyPanel, "vendor.writable === false");
  expectExpression(
    conditional(keyPanel, "locked").whenTrue,
    't("envKeyLocked")',
  );

  const persist = one(
    nodes(file, ts.isVariableDeclaration).filter(
      (node) => node.name.getText() === "persistKey",
    ),
  );
  const failure = one(
    nodes(persist, ts.isIfStatement).filter((node) =>
      matches(node.expression, "failure !== undefined"),
    ),
  );
  expect(ts.isThrowStatement(failure.thenStatement)).toBe(true);
  if (!ts.isThrowStatement(failure.thenStatement))
    throw new Error("Expected failed-save throw");
  expect(matches(failure.thenStatement.expression, "new Error(failure)")).toBe(
    true,
  );
  const clear = one(
    nodes(persist, ts.isCallExpression).filter((node) =>
      matches(node, 'setKeyDraft("")'),
    ),
  );
  expect(failure.end).toBeLessThan(clear.getStart());
  expect(clear.parent.parent).toBe(failure.parent);
  const custom = one(
    nodes(file, ts.isVariableDeclaration).filter(
      (node) => node.name.getText() === "persistCustom",
    ),
  );
  const customClear = one(
    nodes(custom, ts.isCallExpression).filter((node) =>
      matches(node, 'setCustomKey("")'),
    ),
  );
  const throws = nodes(custom, ts.isThrowStatement);
  expect(throws.length).toBeGreaterThan(0);
  for (const thrown of throws)
    expect(thrown.end).toBeLessThan(customClear.getStart());
}

function assertManualContract(workspace: string) {
  const manual = elementWith(
    parseWorkspace(workspace),
    "details",
    "className",
    '"dshM-manual"',
  );
  const form = one(elements(manual, "form"));
  const button = elementWith(form, "button", "type", '"submit"');
  expectAttribute(button, "className", '"dshM-btn"');
  expectAttribute(button, "disabled", "manual.trim().length === 0");
  expect(ts.isJsxElement(button)).toBe(true);
  if (!ts.isJsxElement(button)) throw new Error("Expected submit content");
  const content = button.children.filter(
    (node) => !ts.isJsxText(node) || node.text.trim().length > 0,
  );
  const child = one(content);
  expect(
    ts.isJsxExpression(child) && matches(child.expression, 't("submit")'),
  ).toBe(true);
}

function assertRoutingContract(workspace: string) {
  const file = parseWorkspace(workspace);
  const route = elementWith(file, "label", "className", '"dshM-route"');
  const checkbox = elementWith(route, "input", "type", '"checkbox"');
  expectAttribute(checkbox, "checked", 'routeMode === "smart"');
  const change = attribute(checkbox, "onChange");
  expect(change && ts.isArrowFunction(change)).toBe(true);
  if (!change) throw new Error("Missing routing onChange");
  expectExpression(change, 'rpc.call(CHANNEL, "setRouting", { mode: next })');
  expectExpression(change, 'event.target.checked ? "smart" : "manual"');
  expectExpression(
    change,
    "intent.publish({ ...getRoutingSnapshot(), mode: next })",
  );
  expectExpression(file, 'rpc.call(CHANNEL, "routing", {})');
  expectExpression(file, "routingPublisher.current.dispose()");
  expectExpression(route, 't("routeEmpty")');
}

function replaceNode(
  source: string,
  node: ts.Node,
  replacement: string,
): string {
  const mutated =
    source.slice(0, node.getStart()) + replacement + source.slice(node.end);
  expect(mutated).not.toBe(source);
  parseWorkspace(mutated); // Regressions must fail a contract, not the TSX parser.
  return mutated;
}

function rejectContractMutation(
  source: string,
  node: ts.Node,
  replacement: string,
  check: (source: string) => void,
) {
  const mutated = replaceNode(source, node, replacement);
  expect(() => check(mutated)).toThrow();
}

function formattingVariant(source: string, newLine: ts.NewLineKind): string {
  const printed = ts
    .createPrinter({ newLine })
    .printFile(parseWorkspace(source));
  // Insert layout only BETWEEN JSX attributes; never rewrite literal/JSX text.
  const starts = nodes(parseWorkspace(printed), ts.isJsxAttribute)
    .map((node) => node.getStart())
    .sort((a, b) => b - a);
  const newline = newLine === ts.NewLineKind.LineFeed ? "\n" : "\r\n";
  const formatted = starts.reduce(
    (text, start) => text.slice(0, start) + newline + "  " + text.slice(start),
    printed,
  );
  expect(formatted).not.toBe(source);
  parseWorkspace(formatted);
  return formatted;
}

describe("ModelsWorkspace four-group structural controls", () => {
  for (const [name, check] of [
    ["rail identity and state", assertRailContract],
    [
      "busy and failed-save state",
      (source: string) =>
        assertBusyContract(
          source,
          formattingVariant(
            readClient("workspace-panels.tsx"),
            ts.NewLineKind.LineFeed,
          ),
        ),
    ],
    ["manual Continue", assertManualContract],
    ["routing checkbox", assertRoutingContract],
  ] as const) {
    it.each([ts.NewLineKind.LineFeed, ts.NewLineKind.CarriageReturnLineFeed])(
      `accepts formatting variants for ${name} (%s)`,
      (newline) => {
        check(formattingVariant(readClient("ModelsWorkspace.tsx"), newline));
      },
    );
  }

  it("rejects changed or removed rail logos even when a correct logo exists outside the rail", () => {
    const source = readClient("ModelsWorkspace.tsx");
    const rail = elementWith(
      parseWorkspace(source),
      "nav",
      "aria-label",
      't("nav")',
    );
    for (const identity of ["product", "vendor"]) {
      const button = elementWith(rail, "button", "key", `${identity}.id`);
      const logo = one(elements(button, "ProviderLogo"));
      const id = attribute(logo, "id")!;
      for (const mutated of [
        replaceNode(source, id, `${identity}.name`),
        replaceNode(source, logo, "") +
          `\nfunction OutsideRail() { return <ProviderLogo id={${identity}.id} />; }`,
      ]) {
        parseWorkspace(mutated);
        expect(() => assertRailContract(mutated)).toThrow();
      }
    }
  });

  it("rejects missing busy predicates, swapped loading, alert loss, and clearing a failed draft", () => {
    const source = readClient("ModelsWorkspace.tsx");
    const panels = readClient("workspace-panels.tsx");
    const file = parseWorkspace(source);
    const rootBusy = attribute(
      elementWith(file, "div", "className", '"dshM-wrap"'),
      "aria-busy",
    )!;
    const predicates = [
      "!ready",
      "waiting",
      "pendingId !== undefined",
      "confirmBusy",
      "undefined",
    ];
    for (let omitted = 0; omitted < 4; omitted++) {
      const mutated = replaceNode(
        source,
        rootBusy,
        predicates.filter((_, index) => index !== omitted).join(" || "),
      );
      expect(() => assertBusyContract(mutated, panels)).toThrow();
    }
    for (const [condition, wrongBusy] of [
      ["customOpen", "undefined"],
      ["currentSub !== undefined", "pendingId === currentSub.id"],
      [
        "currentApi !== undefined && api !== undefined",
        "pendingId !== undefined || undefined",
      ],
    ]) {
      const busy = attribute(
        trueElement(file, condition!, "article"),
        "aria-busy",
      )!;
      rejectContractMutation(source, busy, wrongBusy!, (mutated) =>
        assertBusyContract(mutated, panels),
      );
    }
    const loading = conditional(file, "!ready");
    rejectContractMutation(source, loading.condition, "ready", (mutated) =>
      assertBusyContract(mutated, panels),
    );
    const detail = trueElement(file, "subStatus?.detail !== undefined", "p");
    rejectContractMutation(
      source,
      attribute(detail, "role")!,
      '"status"',
      (mutated) => assertBusyContract(mutated, panels),
    );
    const persist = one(
      nodes(file, ts.isVariableDeclaration).filter(
        (node) => node.name.getText() === "persistKey",
      ),
    );
    const failure = one(
      nodes(persist, ts.isIfStatement).filter((node) =>
        matches(node.expression, "failure !== undefined"),
      ),
    );
    const clear = one(
      nodes(persist, ts.isExpressionStatement).filter((node) =>
        matches(node.expression, 'setKeyDraft("")'),
      ),
    );
    // Move the existing clear ahead of the guard, keeping valid syntax and one clear call.
    const moved = replaceNode(source, clear, "");
    const earlyClear = replaceNode(
      moved,
      failure,
      `setKeyDraft(""); ${failure.getText()}`,
    );
    expect(() => assertBusyContract(earlyClear, panels)).toThrow();
    const panel = parseWorkspace(panels);
    const pending = one(
      nodes(panel, ts.isJsxAttribute).filter(
        (node) => node.name.getText() === "aria-busy",
      ),
    );
    rejectContractMutation(
      panels,
      pending,
      "aria-busy={undefined}",
      (mutated) => assertBusyContract(source, mutated),
    );
  });

  it("rejects primary/manual disabled or content regressions on the actual submit button", () => {
    const source = readClient("ModelsWorkspace.tsx");
    const manual = elementWith(
      parseWorkspace(source),
      "details",
      "className",
      '"dshM-manual"',
    );
    const button = elementWith(manual, "button", "type", '"submit"');
    for (const [node, replacement] of [
      [attribute(button, "className")!, '"dshM-btn is-primary"'],
      [attribute(button, "disabled")!, "manual.trim().length > 0"],
      [
        one(
          opening(button).attributes.properties.filter(
            (node) =>
              ts.isJsxAttribute(node) && node.name.getText() === "disabled",
          ),
        ),
        "",
      ],
      [
        one(
          nodes(button, ts.isCallExpression).filter((node) =>
            matches(node, 't("submit")'),
          ),
        ),
        't("save")',
      ],
    ] as const) {
      const mutated = replaceNode(source, node, replacement);
      expect(() => assertManualContract(mutated)).toThrow();
    }
  });

  it("rejects changed or missing routing checked state and miswired RPC on the checkbox", () => {
    const source = readClient("ModelsWorkspace.tsx");
    const route = elementWith(
      parseWorkspace(source),
      "label",
      "className",
      '"dshM-route"',
    );
    const checkbox = elementWith(route, "input", "type", '"checkbox"');
    for (const [node, replacement] of [
      [attribute(checkbox, "checked")!, 'routeMode === "manual"'],
      [
        one(
          opening(checkbox).attributes.properties.filter(
            (node) =>
              ts.isJsxAttribute(node) && node.name.getText() === "checked",
          ),
        ),
        "",
      ],
      [
        one(
          nodes(attribute(checkbox, "onChange")!, ts.isCallExpression).filter(
            (node) =>
              matches(node, 'rpc.call(CHANNEL, "setRouting", { mode: next })'),
          ),
        ),
        'rpc.call(CHANNEL, "setRouting", { mode: "smart" })',
      ],
    ] as const) {
      const mutated = replaceNode(source, node, replacement);
      expect(() => assertRoutingContract(mutated)).toThrow();
    }
  });
});

describe("Providers UI contract", () => {
  it("contributes its original settings component under a keyed capability", () => {
    const index = readClient("index.ts");
    expect(index).toMatch(
      /ctx\.slots\.inject\(["']xiaotaozi\.plugin-center\.detail["']/,
    );
    expect(index).toMatch(/name:\s*["']xiaotaozi\.plugin-center\.detail["']/);
    expect(index).toMatch(/key:\s*["']models["']/);
    expect(index).toContain("rpc: connection.rpc, api, t");
    expect(index).toContain("hostApiFromRemote");
    expect(index).toContain("try {");
    expect(index).toContain('api = hostApiFromRemote(ctx.get("remote"))');
    expect(index).toContain('"remote.credentials"');
    expect(index).toContain('"remote.llm"');
    expect(index).toContain('"remote.settings"');
    expect(readClient("ModelsWorkspace.tsx")).toContain(
      "new Set(liveProviderIds())",
    );
    expect(readClient("ModelsWorkspace.tsx")).toContain('t("hostApiMissing")');
    expect(readClient("locales.ts")).toContain("hostApiMissing:");
    expect(index).toContain("}, ModelsWorkspace)");
    expect(index).not.toMatch(/name:\s*["']settings\.section["']/);
  });

  it("uses the Xiaotaozi action role and a generic content surface", () => {
    expect(css).toMatch(
      /--dshM-primary:\s*var\(--dsw-alias-button-info-fill,\s*#b94305\)/i,
    );
    expect(css).toMatch(
      /--dshM-primary-hover:\s*var\(--dsw-alias-button-info-hover,\s*#9f3703\)/i,
    );
    expect(css).toContain("--dshM-primary-pressed:");
    expect(css).not.toMatch(/#a84c2c|#8f3f27|#b5522a/i);
    expect(css).toContain(
      "--dshM-brand-ink: var(--dsw-alias-state-business-primary",
    );
    expect(css).toContain(
      "--dshM-brand-soft: var(--dsw-alias-state-business-tertiary",
    );
    expect(css).toContain("--dshM-panel: var(--dsw-alias-bg-layer-2");
    expect(css).not.toContain("--dsw-specific-sidebar-fill");
    expect(css).not.toContain("#4176e6");
  });

  it("pins page purpose, status summary, one primary action, and a11y contracts", () => {
    expect(css).toContain(".dshM-hint");
    expect(css).toContain(".dshM-status");
    expect(css).toContain(".dshM-btn.is-primary");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("@media (pointer: coarse)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("gives disclosure summaries a 44px target on narrow and coarse pointers", () => {
    const narrow = css.slice(
      css.indexOf("@media (max-width: 720px)"),
      css.indexOf("@media (max-width: 520px)"),
    );
    const coarse = css.slice(
      css.indexOf("@media (pointer: coarse)"),
      css.indexOf("@media (prefers-reduced-motion"),
    );
    expect(narrow).toMatch(
      /\.dshM-manual > summary[^{]*\{[^}]*min-height:\s*44px/,
    );
    expect(coarse).toMatch(
      /\.dshM-manual > summary[^{]*\{[^}]*min-height:\s*44px/,
    );
    expect(narrow).toMatch(
      /\.dshM-turnModelDetail > summary[^{]*\{[^}]*min-height:\s*44px/,
    );
    expect(coarse).toMatch(
      /\.dshM-turnModelDetail > summary[^{]*\{[^}]*min-height:\s*44px/,
    );
  });

  it("uses 24px desktop dialog geometry", () => {
    expect(css).toMatch(/\.dshM-confirm\s*\{[^}]*border-radius:\s*24px/u);
    expect(css).toMatch(/\.dshM-sheet\s*\{[^}]*border-radius:\s*24px/u);
  });

  it("stops confirm Escape from reaching host settings", () => {
    const workspace = readClient("ModelsWorkspace.tsx");
    const confirm = workspace.slice(
      workspace.indexOf("const box = confirmRef.current"),
      workspace.indexOf("}, [confirm]);"),
    );
    expect(confirm).toContain('if (event.key === "Escape")');
    expect(confirm).toContain("event.stopPropagation()");
    expect(confirm).toContain("event.preventDefault()");
    expect(confirm).toContain(
      'document.addEventListener("keydown", onKey, true)',
    );
    expect(confirm).toContain(
      'document.removeEventListener("keydown", onKey, true)',
    );
    expect(confirm).toContain("confirmTriggerRef.current?.focus()");
  });

  it("stops picker Escape from reaching host settings", () => {
    const workspace = readClient("ModelsWorkspace.tsx");
    const picker = workspace.slice(
      workspace.indexOf("if (!picker) return;"),
      workspace.indexOf("}, [picker]);"),
    );
    expect(picker).toContain('if (event.key === "Escape")');
    expect(picker).toContain("event.preventDefault()");
    expect(picker).toContain("event.stopPropagation()");
    expect(picker).toContain(
      'document.addEventListener("keydown", onKey, true)',
    );
    expect(picker).toContain(
      'document.removeEventListener("keydown", onKey, true)',
    );
    expect(picker).toContain("trapTab(sheet, event)");
    expect(picker).toContain("addRef.current?.focus()");
  });

  it("stops custom Escape from reaching host settings", () => {
    const workspace = readClient("ModelsWorkspace.tsx");
    const custom = workspace.slice(
      workspace.indexOf("if (!customOpen) return;"),
      workspace.indexOf("}, [customOpen]);"),
    );
    expect(custom).toContain('if (event.key === "Escape")');
    expect(custom).toContain("event.preventDefault()");
    expect(custom).toContain("event.stopPropagation()");
    expect(custom).toContain(
      'document.addEventListener("keydown", onKey, true)',
    );
    expect(custom).toContain(
      'document.removeEventListener("keydown", onKey, true)',
    );
    expect(custom).toContain("addRef.current?.focus()");
  });

  it("keeps small metadata and status copy readable in both color schemes", () => {
    const gallery = readClient("ImageGallery.tsx");
    const imageTool = readClient("ImageGenerateToolview.tsx");
    const videoTool = readClient("VideoGenerateToolview.tsx");
    expect(css).toContain("--dshM-dim: var(--dsw-alias-label-secondary");
    expect(css).toContain("--dshM-success-ink: color-mix");
    expect(css).toContain("--dshM-error-ink: color-mix");
    expect(css).toContain(
      ".dshM-error { margin: 0; color: var(--dshM-error-ink)",
    );
    expect(gallery).toContain(
      'loading: { fontSize: 12, color: "var(--dsw-alias-label-secondary)"',
    );
    expect(`${gallery}\n${imageTool}\n${videoTool}`).toContain(
      "64%, var(--dsw-alias-label-primary",
    );
    expect(`${imageTool}\n${videoTool}`).not.toMatch(
      /subtle:[^\n]+label-tertiary/u,
    );
  });

  it("uses semantic modal chrome instead of text close glyphs", () => {
    const workspace = readClient("ModelsWorkspace.tsx");
    const gallery = readClient("ImageGallery.tsx");
    expect(workspace).toContain('aria-modal="true"');
    expect(gallery).toContain('aria-modal="true"');
    expect(`${workspace}\n${gallery}`).not.toMatch(/>\s*(?:×|x|‹)\s*</u);
  });

  it("shows rail identity, loginBadge, and a text state with semantic selection", () => {
    const workspace = readClient("ModelsWorkspace.tsx");
    const shared = readClient("workspace-shared.ts");
    expect(shared).toContain("export function loginBadge(");
    expect(shared).toContain("export function apiMethodBadge(");
    assertRailContract(workspace);
  });

  it("gives the detail pane one heading, one-sentence purpose, and non-primary destructive actions", () => {
    const workspace = readClient("ModelsWorkspace.tsx");
    const locales = readClient("locales.ts");
    const detail = workspace.slice(
      workspace.indexOf('<div className="dshM-main">'),
      workspace.indexOf("{picker ? ("),
    );
    expect(locales).toContain("subPurpose:");
    expect(locales).toContain("apiPurpose:");
    expect(detail).toContain(
      '<h3 className="dshM-title">{currentSub.nameZh}</h3>',
    );
    expect(detail).toContain('<p className="dshM-hint">{t("subPurpose")}</p>');
    expect(detail).toContain(
      '<h3 className="dshM-title">{currentApi.name}</h3>',
    );
    expect(detail).toContain('<p className="dshM-hint">{t("apiPurpose")}</p>');
    expect(detail).toContain(
      '<h3 className="dshM-title">{t("customTitle")}</h3>',
    );
    expect(detail).toContain('<p className="dshM-hint">{t("customHint")}</p>');
    expect(detail).toContain('t("enabledCount")');
    expect(detail).not.toContain("currentSub.hintZh");
    expect(workspace).toMatch(
      /className="dshM-btn is-danger"[\s\S]*?\{t\("logout"\)\}/,
    );
    expect(workspace).not.toMatch(/is-primary[\s\S]{0,160}t\("logout"\)/);
    expect(workspace).not.toMatch(/is-primary[\s\S]{0,160}t\("clearKey"\)/);
    expect(workspace).not.toMatch(/is-primary[\s\S]{0,160}t\("removeVendor"\)/);
  });

  it("announces loading, busy, success, failure, locked credentials, and retained failed saves", () => {
    const workspace = readClient("ModelsWorkspace.tsx");
    const panels = readClient("workspace-panels.tsx");
    const locales = readClient("locales.ts");
    expect(locales).toContain("loading:");
    expect(locales).toContain("saving:");
    expect(locales).toContain("saved:");
    expect(locales).toContain("copied:");
    expect(locales).toContain("busy:");
    expect(locales).toContain("envKeyLocked:");
    assertBusyContract(workspace, panels);
  });

  it("uses a neutral paired-key Save while subscription auth is waiting", () => {
    const workspace = readClient("ModelsWorkspace.tsx");
    const panels = readClient("workspace-panels.tsx");
    const pair = workspace.slice(
      workspace.indexOf("{pairApi !== undefined ? ("),
      workspace.indexOf("{loggedIn || pairApi?.configured === true ? ("),
    );
    const apiPanel = workspace.slice(
      workspace.indexOf("currentApi !== undefined && api !== undefined"),
      workspace.indexOf("{picker ? ("),
    );
    expect(pair).toContain("savePrimary={!subWaiting}");
    expect(apiPanel).not.toContain("savePrimary={!subWaiting}");
    assertKeyPanelSaveClass(panels);
  });

  it("announces discoverFailed without clearing custom drafts", () => {
    const workspace = readClient("ModelsWorkspace.tsx");
    const custom = workspace.slice(
      workspace.indexOf("const persistCustom"),
      workspace.indexOf("const openCustom"),
    );
    expect(custom).toContain("if (probed.error !== undefined)");
    expect(custom).toContain('return t("discoverFailed")');
    expect(custom).not.toContain('setError(t("discoverFailed"))');
    expect(custom).not.toContain("throw new Error(probed.error)");
    expect(custom.indexOf('return t("discoverFailed")')).toBeLessThan(
      custom.indexOf('setCustomKey("")'),
    );
    expect(custom).toContain(
      'throw new Error(created.error?.message ?? t("unavailable"))',
    );
  });

  it("skips refresh after failed run work", () => {
    const workspace = readClient("ModelsWorkspace.tsx");
    const run = workspace.slice(
      workspace.indexOf("const run ="),
      workspace.indexOf("const markHostPicked"),
    );
    expect(run).toContain("const failure = await work()");
    expect(run).toMatch(
      /if \(failure !== undefined\) \{[\s\S]*?setError\(failure\);[\s\S]*?return;/,
    );
    expect(run).toMatch(
      /catch \(caught\) \{[\s\S]*?setError\(explainHostError\(caught\)\);[\s\S]*?return;/,
    );
    expect(run).toContain("void refresh()");
    expect(run.lastIndexOf("return;")).toBeLessThan(
      run.indexOf("void refresh()"),
    );
  });

  it("keeps manual recovery Continue off the primary action", () => {
    const workspace = readClient("ModelsWorkspace.tsx");
    assertManualContract(workspace);
  });

  it("exposes a global manual/smart routing toggle without extra exclusion or classifier controls", () => {
    const workspace = readClient("ModelsWorkspace.tsx");
    const locales = readClient("locales.ts");
    expect(locales).toContain("routeTitle:");
    expect(locales).toContain("routeHint:");
    expect(locales).toContain("routeEmpty:");
    expect(locales).toContain("对话里不再选手动模型");
    expect(locales).not.toMatch(/classifier/i);
    assertRoutingContract(workspace);
    expect(workspace).toContain("createRoutingPublisher");
    expect(workspace).not.toContain("objective");
    expect(workspace).not.toMatch(/classifier/i);
    expect(css).toContain(".dshM-route");
    expect(css).toMatch(
      /\.dshM-route input:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--dshM-focus\)/,
    );
    expect(css).toMatch(
      /\.dshM-check input:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--dshM-focus\)/,
    );
  });

  it("hides the conversation model picker in smart mode instead of disabling it", () => {
    const index = readClient("index.ts");
    const install = readClient("install-smart-ux.ts");
    const ux = readClient("smart-ux.ts");
    const seat = readClient("SmartUx.tsx");
    expect(index).toContain("installSmartUx");
    expect(ux).toContain("conversation.input.model");
    expect(install).toContain("MODEL_SEAT_SLOT");
    expect(install).toContain("HiddenModelSeat");
    expect(install).toContain("shouldHideModelPicker");
    expect(seat).toContain("export function HiddenModelSeat(): null");
    expect(seat).toContain("shouldBlockSmartSend");
    expect(seat).toContain("EMPTY_POOL_GUIDE");
    expect(`${install}\n${seat}`).not.toMatch(/disabled=\{true\}/);
    expect(css).toContain(".dshM-emptyPool");
    expect(css).toContain(".dshM-turnModel");
    expect(css).toContain(".dshM-turnModelName");
    expect(install).toContain("smartUxDockRegistration");
    expect(ux).toContain("SMART_DOCK_ORDER");
    expect(ux).toContain("formatTurnModelLabel");
    expect(css).not.toContain("*:has(> .dshM-smartUx)");
    expect(ux).toContain("conversation.input.left");
    expect(css).toContain("--dsh-chat-content-width");
    expect(css).toContain("margin-inline: auto");
    expect(seat).toContain("formatTurnModelLabel");
    expect(seat).toContain("dshM-turnModelName");
    expect(seat).toContain("dshM-turnModelKicker");
    expect(css).toMatch(/\.dshM-turnModel\s*\{[^}]*border-radius:\s*999px/);
    expect(css).toMatch(/\.dshM-smartUx\s*\{[^}]*--dshM-muted:/);
    expect(seat).not.toMatch(/<summary>本轮模型<\/summary>/);
    expect(seat).not.toMatch(/<details[^>]*\sopen(?:[\s>=]|$)/u);
  });
});

describe("Providers brand header", () => {
  it("opens the Models workspace with the dsh-providers 3D portrait and the section label", () => {
    const workspace = readClient("ModelsWorkspace.tsx");
    const portrait = readClient("portrait.ts");
    expect(portrait).toMatch(
      /import portrait from "\.\.\/\.\.\/docs\/ip-3d\.jpg"/,
    );
    expect(portrait).toMatch(/export const PORTRAIT/);
    expect(workspace).toContain('className="dshM-brand"');
    expect(workspace).toContain('className="dshM-brandMark"');
    expect(workspace).toContain('className="dshM-brandName"');
    expect(workspace).toContain("src={PORTRAIT}");
    expect(workspace).toMatch(/<img[^>]*alt=""/);
    expect(workspace.indexOf('className="dshM-brand"')).toBeLessThan(
      workspace.indexOf('className="dshM-route"'),
    );
    expect(css).toMatch(
      /\.dshM-brand \{[^}]*display: flex;[^}]*align-items: center;[^}]*\}/,
    );
    expect(css).toMatch(
      /\.dshM-brandMark \{[^}]*width: 28px;[^}]*height: 28px;[^}]*border-radius: 8px;[^}]*\}/,
    );
    expect(css).toMatch(
      /\.dshM-brandName \{[^}]*font-size: 14px;[^}]*font-weight: 600;[^}]*\}/,
    );
  });
});

const keyPanelSaveClassFixture = (className: string) =>
  `export function KeyPanel(props) { return <section><button onClick={props.onPersist} className={${className}} /></section>; }`;
const keyPanelSaveClass =
  'props.savedOk ? "dshM-btn is-ok" : props.savePrimary === false ? "dshM-btn" : "dshM-btn is-primary"';

it.each([
  'props.savedOk?"dshM-btn is-ok":props.savePrimary===false?"dshM-btn":"dshM-btn is-primary"',
  'props.savedOk\n ? "dshM-btn is-ok"\n : props.savePrimary === false\n ? "dshM-btn"\n : "dshM-btn is-primary"',
  '(props.savedOk) ? ("dshM-btn is-ok") : ((props.savePrimary === false) ? ("dshM-btn") : ("dshM-btn is-primary"))',
])("KeyPanel Save class accepts expression formatting: %s", (className) => {
  assertKeyPanelSaveClass(keyPanelSaveClassFixture(className));
});

it("KeyPanel Save class rejects priority, polarity, receiver and button-association regressions", () => {
  const source = keyPanelSaveClassFixture(keyPanelSaveClass);
  const mutants = [
    source.replace("props.savedOk", "other.savedOk"),
    source.replace(
      "props.savePrimary === false",
      "props.savePrimary !== false",
    ),
    source.replace('"dshM-btn is-ok"', '"dshM-btn is-primary"'),
    source.replace('? "dshM-btn" :', '? "dshM-btn is-primary" :'),
    source.replace(
      keyPanelSaveClass,
      'props.savePrimary === false ? "dshM-btn" : props.savedOk ? "dshM-btn is-ok" : "dshM-btn is-primary"',
    ),
    source.replace(': "dshM-btn is-primary"', ': "dshM-btn"'),
    source.replace("onClick={props.onPersist}", "onClick={other.onPersist}"),
    source.replace("className={", "title={"),
  ];
  for (const mutant of mutants) {
    expect(mutant).not.toBe(source);
    parseWorkspace(mutant);
    // A correct expression on an unrelated component must not satisfy KeyPanel.
    const decoy = `function Other(props) { return <button onClick={props.onPersist} className={${keyPanelSaveClass}} />; }`;
    expect(() => assertKeyPanelSaveClass(`${mutant}\n${decoy}`)).toThrow();
  }
});
