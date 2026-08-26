import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("client bundle", () => {
  it("inlines CodeMirror instead of requiring it from the web module table", async () => {
    const client = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
    expect(client).not.toMatch(/require\(["']@marijn\//u);
    expect(client).not.toMatch(/require\(["']@codemirror\//u);
    expect(client).toMatch(/require\(["']react["']\)/);
  });
});
