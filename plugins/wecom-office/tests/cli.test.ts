import { EventEmitter } from "node:events";
import { expect, it } from "vitest";
import { buildArgv, formatCliOutput, parseAuthStatus, runWecomCli, TOOL_ARGV } from "../src/cli.ts";
import { OfficeError } from "../src/errors.ts";

it("locks first-wave argv prefixes to appendix A", () => {
  expect(TOOL_ARGV.wecom_calendar_list).toEqual(["calendar", "schedules", "list"]);
  expect(TOOL_ARGV.wecom_calendar_search).toEqual(["calendar", "schedules", "search"]);
  expect(TOOL_ARGV.wecom_doc_search).toEqual(["doc", "search"]);
  expect(TOOL_ARGV.wecom_doc_get).toEqual(["doc", "contents", "get"]);
  expect(TOOL_ARGV.wecom_meeting_list).toEqual(["meeting", "list"]);
  expect(TOOL_ARGV.wecom_contact_search).toEqual(["contact", "users", "search"]);
});

it("appends --json for request bodies", () => {
  expect(buildArgv(["doc", "search"], { keywords: ["周报"] })).toEqual([
    "doc", "search", "--json", "{\"keywords\":[\"周报\"]}",
  ]);
});

it("parses auth show --status", () => {
  expect(parseAuthStatus("authorized\n")).toBe("authorized");
  expect(parseAuthStatus("unauthorized")).toBe("unauthorized");
});

it("pretty-prints successful JSON stdout", () => {
  expect(formatCliOutput({ argv: [], stdout: "{\"ok\":true}", stderr: "", exitCode: 0 })).toBe("{\n  \"ok\": true\n}");
});

it("surfaces CLI errcode on failure", () => {
  expect(() => formatCliOutput({
    argv: [],
    stdout: "{\"errcode\":1,\"errmsg\":\"no permission\"}",
    stderr: "",
    exitCode: 1,
  })).toThrowError(OfficeError);
});

it("maps ENOENT to cli-missing", async () => {
  const spawnImpl = () => {
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: () => void };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => undefined;
    queueMicrotask(() => child.emit("error", Object.assign(new Error("not found"), { code: "ENOENT" })));
    return child;
  };
  await expect(runWecomCli({
    cliPath: "wecom-cli-missing",
    configDir: "/tmp",
    timeoutMs: 1000,
    args: ["--version"],
    spawnImpl: spawnImpl as never,
  })).rejects.toMatchObject({ code: "cli-missing" });
});
