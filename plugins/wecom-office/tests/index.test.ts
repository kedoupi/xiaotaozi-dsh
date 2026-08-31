import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { inject, name, PLUGIN_ID, PLUGIN_NAME } from "../src/index.ts";
import { OFFICE_TOOL_NAMES } from "../src/names.ts";

it("exports the plugin identity used by the spec", () => {
  expect(name).toBe("wecom-office");
  expect(PLUGIN_ID).toBe("wecom-office");
  expect(PLUGIN_NAME).toBe("dsh-wecom-office");
  expect(inject).toEqual(["tools", "credentials"]);
  expect(OFFICE_TOOL_NAMES).toContain("wecom_calendar_list");
  expect(OFFICE_TOOL_NAMES).toContain("wecom_doc_create");
  expect(OFFICE_TOOL_NAMES).toContain("wecom_docs_run");
  expect(OFFICE_TOOL_NAMES).toContain("wecom_run");
  expect(OFFICE_TOOL_NAMES).toContain("wecom_todo_list");
  expect(OFFICE_TOOL_NAMES).toContain("wecom_mail_send");
});

it("ships no independent client settings surface", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
    exports?: Record<string, string>;
    dsh?: { client?: unknown };
  };
  expect(manifest.exports?.["./client"]).toBeUndefined();
  expect(manifest.dsh?.client).toBeUndefined();
});
