import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { name } from "../src/index";
import { fetchLatestVersion } from "../src/client/latestVersion";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

it("exports the plugin name", () => {
  expect(name).toBe("context");
});

it("exports the client name and inject list", () => {
  const src = readFileSync(join(root, "src/client/index.ts"), "utf8");
  expect(src).toContain('export const name = "context"');
  expect(src).toContain("export const inject = ['slots', 'locale']");
});

it("does not offer an npm upgrade off this fork", async () => {
  expect(await fetchLatestVersion()).toBeNull();
});

it("wraps the client bundle as dsh-context", () => {
  const config = readFileSync(join(root, "tsdown.config.ts"), "utf8");
  expect(config).toContain('const id = "dsh-context"');
  expect(config).toContain("window.__ModuleLoader__.load");
});
