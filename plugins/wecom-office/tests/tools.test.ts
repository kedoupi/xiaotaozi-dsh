import { expect, it } from "vitest";
import { executeOfficeTool } from "../src/tools.ts";
import { OFFICE_SETTINGS_DEFAULTS } from "../src/settings.ts";
import { TOOL_ARGV } from "../src/cli.ts";
import { OfficeError } from "../src/errors.ts";

it("refuses calendar search without keywords", async () => {
  await expect(executeOfficeTool("wecom_calendar_search", {}, OFFICE_SETTINGS_DEFAULTS)).rejects.toMatchObject({
    code: "invalid-args",
  });
});

it("accepts keywords as a single string", async () => {
  const spawn = async (options: { args: readonly string[]; json?: Record<string, unknown> }) => {
    if (options.args[0] === "auth") {
      return { argv: [...options.args], stdout: "authorized\n", stderr: "", exitCode: 0 };
    }
    return { argv: [...options.args], stdout: JSON.stringify(options.json ?? {}), stderr: "", exitCode: 0 };
  };
  const text = await executeOfficeTool(
    "wecom_doc_search",
    { keywords: "周报", limit: "10" },
    OFFICE_SETTINGS_DEFAULTS,
    spawn as never,
  );
  expect(JSON.parse(text)).toEqual({ keywords: ["周报"], limit: 10 });
});

it("calls appendix argv after authorized status", async () => {
  const calls: string[][] = [];
  const spawn = async (options: { args: readonly string[]; json?: Record<string, unknown> }) => {
    calls.push([...options.args]);
    if (options.args[0] === "auth") {
      return { argv: [...options.args], stdout: "authorized\n", stderr: "", exitCode: 0 };
    }
    return { argv: [...options.args], stdout: "{\"docs\":[]}", stderr: "", exitCode: 0 };
  };
  const text = await executeOfficeTool(
    "wecom_doc_search",
    { keywords: ["周报"] },
    OFFICE_SETTINGS_DEFAULTS,
    spawn as never,
  );
  expect(JSON.parse(text)).toEqual({ docs: [] });
  expect(calls[0]).toEqual(["auth", "show", "--status"]);
  expect(calls[1]).toEqual([...TOOL_ARGV.wecom_doc_search]);
});

it("refuses a disabled service after auth", async () => {
  const spawn = async (options: { args: readonly string[] }) => {
    if (options.args[0] === "auth") {
      return { argv: [...options.args], stdout: "authorized\n", stderr: "", exitCode: 0 };
    }
    throw new Error("should not run");
  };
  await expect(executeOfficeTool(
    "wecom_doc_search",
    { keywords: ["周报"] },
    { ...OFFICE_SETTINGS_DEFAULTS, enabledServices: ["calendar"] },
    spawn as never,
  )).rejects.toMatchObject({ code: "service-disabled" });
});

it("creates a document through doc create argv", async () => {
  const spawn = async (options: { args: readonly string[]; json?: Record<string, unknown> }) => {
    if (options.args[0] === "auth") {
      return { argv: [...options.args], stdout: "authorized\n", stderr: "", exitCode: 0 };
    }
    return { argv: [...options.args], stdout: JSON.stringify({ docid: "d1", json: options.json }), stderr: "", exitCode: 0 };
  };
  const text = await executeOfficeTool(
    "wecom_doc_create",
    { doc_name: "周报", doc_type: "doc", content: "hello" },
    OFFICE_SETTINGS_DEFAULTS,
    spawn as never,
  );
  expect(JSON.parse(text)).toMatchObject({
    json: { doc_name: "周报", doc_type: "doc", content: "hello" },
  });
});

it("refuses writes when allowWrite is false", async () => {
  const spawn = async (options: { args: readonly string[] }) => {
    if (options.args[0] === "auth") {
      return { argv: [...options.args], stdout: "authorized\n", stderr: "", exitCode: 0 };
    }
    throw new Error("should not run");
  };
  await expect(executeOfficeTool(
    "wecom_doc_create",
    { doc_name: "周报" },
    { ...OFFICE_SETTINGS_DEFAULTS, allowWrite: false },
    spawn as never,
  )).rejects.toMatchObject({ code: "write-disabled" });
});

it("creates a calendar event", async () => {
  const spawn = async (options: { args: readonly string[]; json?: Record<string, unknown> }) => {
    if (options.args[0] === "auth") {
      return { argv: [...options.args], stdout: "authorized\n", stderr: "", exitCode: 0 };
    }
    return { argv: [...options.args], stdout: JSON.stringify({ json: options.json, argv: options.args }), stderr: "", exitCode: 0 };
  };
  const text = await executeOfficeTool(
    "wecom_calendar_create",
    { subject: "周会", begin_time: "2026-08-28 10:00:00", end_time: "2026-08-28 11:00:00" },
    OFFICE_SETTINGS_DEFAULTS,
    spawn as never,
  );
  expect(JSON.parse(text).argv).toEqual(["calendar", "schedules", "create"]);
  expect(JSON.parse(text).json).toMatchObject({ subject: "周会" });
});

it("routes wecom_run across services", async () => {
  const calls: string[][] = [];
  const spawn = async (options: { args: readonly string[] }) => {
    calls.push([...options.args]);
    if (options.args[0] === "auth") {
      return { argv: [...options.args], stdout: "authorized\n", stderr: "", exitCode: 0 };
    }
    return { argv: [...options.args], stdout: "{}", stderr: "", exitCode: 0 };
  };
  await executeOfficeTool(
    "wecom_run",
    { service: "todo", method: "list", json: { limit: 5 } },
    OFFICE_SETTINGS_DEFAULTS,
    spawn as never,
  );
  expect(calls[1]).toEqual(["todo", "list"]);
});

it("routes wecom_docs_run through the method catalog", async () => {
  const calls: string[][] = [];
  const spawn = async (options: { args: readonly string[]; json?: Record<string, unknown> }) => {
    calls.push([...options.args]);
    if (options.args[0] === "auth") {
      return { argv: [...options.args], stdout: "authorized\n", stderr: "", exitCode: 0 };
    }
    return { argv: [...options.args], stdout: "{}", stderr: "", exitCode: 0 };
  };
  await executeOfficeTool(
    "wecom_docs_run",
    { service: "smartsheet", method: "fields.list", json: { docid: "d1" } },
    OFFICE_SETTINGS_DEFAULTS,
    spawn as never,
  );
  expect(calls[1]).toEqual(["smartsheet", "fields", "list"]);
});

it("does not spawn the tool when unauthorized", async () => {
  const spawn = async (options: { args: readonly string[] }) => {
    if (options.args[0] === "auth") {
      return { argv: [...options.args], stdout: "unauthorized\n", stderr: "", exitCode: 0 };
    }
    throw new Error("should not run");
  };
  await expect(executeOfficeTool("wecom_calendar_list", {}, OFFICE_SETTINGS_DEFAULTS, spawn as never))
    .rejects.toBeInstanceOf(OfficeError);
});
