import { readFile } from "node:fs/promises";

export interface CliMetadata {
  name: string;
  version: string;
  expectedDsh: string;
  expectedNode: string;
  expectedPnpm: string;
}

interface PackageJson {
  name?: unknown;
  version?: unknown;
  engines?: { node?: unknown };
  dependencies?: Record<string, unknown>;
}

export async function readCliMetadata(
  packageUrl = new URL("../package.json", import.meta.url),
): Promise<CliMetadata> {
  const pkg = JSON.parse(await readFile(packageUrl, "utf8")) as PackageJson;
  const name = typeof pkg.name === "string" ? pkg.name : "xiaotaozi-dsh-cli";
  const version = typeof pkg.version === "string" ? pkg.version : "unknown";
  const expectedDsh = pkg.dependencies?.["@deepseek-ai/dsh"];
  const expectedPnpm = pkg.dependencies?.pnpm;
  const expectedNode = pkg.engines?.node;
  if (typeof expectedDsh !== "string" || typeof expectedPnpm !== "string" || typeof expectedNode !== "string") {
    throw new Error("xtz package metadata is incomplete");
  }
  return { name, version, expectedDsh, expectedNode, expectedPnpm };
}
