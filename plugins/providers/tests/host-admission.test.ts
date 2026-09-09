import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  advertiseImageForSmartAdmission,
  installSmartHostAdmission,
} from "../src/router/host-admission.ts";

/** Host `prompt` admission only looks at `type === "image"`, not file MIME. */
function hostPromptHasImage(content: ReadonlyArray<{ type: string }>): boolean {
  return content.some((part) => part.type === "image");
}

describe("advertiseImageForSmartAdmission", () => {
  it("advertises image on a text-only Host picker model only in smart mode", () => {
    const textOnly = {
      id: "deepseek-chat",
      inputModalities: ["text"] as const,
    };
    expect(
      advertiseImageForSmartAdmission(textOnly, "smart").inputModalities,
    ).toEqual(["text", "image"]);
    expect(advertiseImageForSmartAdmission(textOnly, "manual")).toEqual(
      textOnly,
    );
  });

  it("leaves vision models and unknown modalities unchanged", () => {
    const vision = { inputModalities: ["text", "image"] as const };
    const unknown = { inputModalities: undefined };
    expect(advertiseImageForSmartAdmission(vision, "smart")).toEqual(vision);
    expect(advertiseImageForSmartAdmission(unknown, "smart")).toEqual(unknown);
    expect(advertiseImageForSmartAdmission(unknown, "manual")).toEqual(unknown);
  });
});

describe("installSmartHostAdmission", () => {
  it("wraps Host resolveModelInfo in smart mode and restores on dispose", async () => {
    const llm = {
      resolveModelInfo: async (_provider: string, _model: string) => ({
        name: "DeepSeek",
        inputModalities: ["text"] as const,
      }),
    };
    const admission = installSmartHostAdmission(llm, () => "smart");
    await expect(
      llm.resolveModelInfo("deepseek", "deepseek-chat"),
    ).resolves.toEqual({
      name: "DeepSeek",
      inputModalities: ["text", "image"],
    });
    await expect(
      admission.resolveTruthful("deepseek", "deepseek-chat"),
    ).resolves.toEqual({
      name: "DeepSeek",
      inputModalities: ["text"],
    });
    admission.dispose();
    await expect(
      llm.resolveModelInfo("deepseek", "deepseek-chat"),
    ).resolves.toEqual({
      name: "DeepSeek",
      inputModalities: ["text"],
    });
  });

  it("does not wrap Host admission in manual mode", async () => {
    const llm = {
      resolveModelInfo: async (_provider: string, _model: string) => ({
        inputModalities: ["text"] as const,
      }),
    };
    const admission = installSmartHostAdmission(llm, () => "manual");
    await expect(
      llm.resolveModelInfo("deepseek", "deepseek-chat"),
    ).resolves.toEqual({
      inputModalities: ["text"],
    });
    admission.dispose();
  });

  it("fails closed to the original model info when mode lookup throws", async () => {
    const llm = {
      resolveModelInfo: async (_provider: string, _model: string) => ({
        inputModalities: ["text"] as const,
      }),
    };
    const admission = installSmartHostAdmission(llm, () => {
      throw new Error("routing.json unreadable");
    });
    await expect(
      llm.resolveModelInfo("deepseek", "deepseek-chat"),
    ).resolves.toEqual({
      inputModalities: ["text"],
    });
    admission.dispose();
  });
});

describe("Host image admission shape", () => {
  it("matches Host: only image parts trigger the picker-model gate", () => {
    expect(hostPromptHasImage([{ type: "image" }])).toBe(true);
    expect(hostPromptHasImage([{ type: "file" }])).toBe(false);
    expect(hostPromptHasImage([{ type: "text" }])).toBe(false);
  });

  it("does not invent Host image admission for PDF, SVG, or unknown files", () => {
    expect(hostPromptHasImage([{ type: "file" }])).toBe(false);
    expect(hostPromptHasImage([{ type: "text" }, { type: "file" }])).toBe(
      false,
    );
  });
});

function truthfulInventoryWiring(source: string): boolean {
  const file = ts.createSourceFile(
    "index.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const unwrap = (expression: ts.Expression): ts.Expression =>
    ts.isParenthesizedExpression(expression)
      ? unwrap(expression.expression)
      : expression;
  const named = (node: ts.Node | undefined, name: string) =>
    node !== undefined && ts.isIdentifier(node) && node.text === name;
  const apply = file.statements
    .filter(ts.isFunctionDeclaration)
    .find((fn) => named(fn.name, "apply"));
  const declarations =
    apply?.body?.statements
      .filter(ts.isVariableStatement)
      .flatMap((statement) => [...statement.declarationList.declarations]) ??
    [];
  const routers = declarations.filter((declaration) =>
    named(declaration.name, "disposeRouter"),
  );
  if (routers.length !== 1 || !routers[0]?.initializer) return false;
  const install = unwrap(routers[0].initializer);
  if (
    !ts.isCallExpression(install) ||
    !named(unwrap(install.expression), "installRouterRuntime") ||
    install.arguments.length !== 2 ||
    !named(unwrap(install.arguments[0]!), "ctx")
  )
    return false;
  const options = unwrap(install.arguments[1]!);
  if (!ts.isObjectLiteralExpression(options)) return false;
  const properties = options.properties.filter((property) =>
    named(property.name, "inventory"),
  );
  if (properties.length !== 1 || !ts.isPropertyAssignment(properties[0]!))
    return false;
  const inventory = unwrap(properties[0].initializer);
  if (
    !ts.isArrowFunction(inventory) ||
    inventory.parameters.length !== 1 ||
    !named(inventory.parameters[0]?.name, "signal") ||
    ts.isBlock(inventory.body)
  )
    return false;
  const call = unwrap(inventory.body);
  if (
    !ts.isCallExpression(call) ||
    !named(unwrap(call.expression), "collectLiveInventory") ||
    call.arguments.length !== 5
  )
    return false;
  const args = call.arguments.map(unwrap);
  const resolver = args[3]!;
  return (
    named(args[0], "ctx") &&
    named(args[1], "providers") &&
    named(args[2], "catalogs") &&
    ts.isPropertyAccessExpression(resolver) &&
    named(unwrap(resolver.expression), "hostAdmission") &&
    named(resolver.name, "resolveTruthful") &&
    named(args[4], "signal")
  );
}

const inventoryFixture = `function apply(ctx) {
  const decoy = collectLiveInventory(ctx, providers, catalogs, hostAdmission.resolveTruthful, signal);
  const disposeRouter = installRouterRuntime(ctx, {
    inventory: (signal) => collectLiveInventory(ctx, providers, catalogs, hostAdmission.resolveTruthful, signal),
  });
}`;

describe("host admission wiring", () => {
  it("accepts minified, multiline and parenthesized inventory call formatting", () => {
    for (const source of [
      inventoryFixture,
      inventoryFixture.replaceAll("\n", " "),
      inventoryFixture.replace(
        "inventory: (signal) => collectLiveInventory(ctx, providers, catalogs, hostAdmission.resolveTruthful, signal)",
        "inventory: (signal) => (collectLiveInventory(\n(ctx),\n providers,\n catalogs,\n (hostAdmission.resolveTruthful),\n signal,\n))",
      ),
    ])
      expect(truthfulInventoryWiring(source)).toBe(true);
  });

  it("rejects wrong call wiring even with a valid decoy elsewhere", () => {
    const original =
      "inventory: (signal) => collectLiveInventory(ctx, providers, catalogs, hostAdmission.resolveTruthful, signal)";
    for (const replacement of [
      original.replace("collectLiveInventory", "otherInventory"),
      original.replace(
        "hostAdmission.resolveTruthful",
        "otherAdmission.resolveTruthful",
      ),
      original.replace("resolveTruthful", "resolveModelInfo"),
      original.replace("ctx, providers", "providers, ctx"),
      original.replace("providers, catalogs", "catalogs, providers"),
      original.replace(", signal)", ")"),
      original.replace(", signal)", ", otherSignal)"),
      original.replace("inventory:", "otherInventory:"),
    ]) {
      const source = inventoryFixture.replace(original, replacement);
      expect(source).not.toBe(inventoryFixture);
      const parsed = ts.createSourceFile(
        "control.ts",
        source,
        ts.ScriptTarget.Latest,
        true,
      );
      expect(
        (
          parsed as ts.SourceFile & {
            parseDiagnostics: readonly ts.Diagnostic[];
          }
        ).parseDiagnostics,
      ).toHaveLength(0);
      expect(truthfulInventoryWiring(source)).toBe(false);
    }
  });
  it("keeps inventory and image_generate on the truthful resolver", () => {
    const index = readFileSync(
      new URL("../src/index.ts", import.meta.url),
      "utf8",
    );
    expect(index).toContain("installSmartHostAdmission");
    expect(index).toContain("hostAdmission.resolveTruthful");
    expect(truthfulInventoryWiring(index)).toBe(true);
    expect(index).toContain("resolveModelInfo: hostAdmission.resolveTruthful");
    expect(index).toContain("hostAdmission.dispose()");
  });
});
