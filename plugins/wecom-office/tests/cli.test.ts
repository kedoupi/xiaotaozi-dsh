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

it("surfaces only a safe CLI code on failure", () => {
  const canary = "/private/workspace/sensitive.txt";
  let failure: unknown;
  try {
    formatCliOutput({
      argv: [],
      stdout: JSON.stringify({ errcode: 1, errmsg: `failed ${canary}` }),
      stderr: `request ${canary}`,
      exitCode: 1,
    });
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(OfficeError);
  expect(failure).toMatchObject({ code: "cli-failed", errcode: "1" });
  expect(String((failure as Error).message)).not.toContain(canary);
  expect((failure as OfficeError).errmsg).toBeUndefined();
});

it("waits for a timed-out CLI process group to close before rejecting", async () => {
  const signals: string[] = [];
  let detached: boolean | undefined;
  const spawnImpl = (_command: string, _args: readonly string[], options: { detached?: boolean }) => {
    detached = options.detached;
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: (signal: string) => boolean };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = (signal) => {
      signals.push(signal);
      queueMicrotask(() => child.emit("close", null));
      return true;
    };
    return child;
  };
  await expect(runWecomCli({
    cliPath: "wecom-cli",
    configDir: "/tmp",
    timeoutMs: 5,
    args: ["doc", "search"],
    spawnImpl: spawnImpl as never,
  })).rejects.toMatchObject({ code: "cli-failed", message: "企业微信办公调用超时。" });
  expect(signals).toEqual(["SIGKILL"]);
  expect(detached).toBe(process.platform !== "win32");
});

it("kills the CLI tree and waits for close when execution is aborted", async () => {
  const controller = new AbortController();
  const signals: string[] = [];
  const spawnImpl = () => {
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: (signal: string) => boolean };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = (signal) => {
      signals.push(signal);
      queueMicrotask(() => child.emit("close", null));
      return true;
    };
    return child;
  };
  const result = runWecomCli({
    cliPath: "wecom-cli",
    configDir: "/tmp",
    timeoutMs: 1000,
    args: ["doc", "search"],
    signal: controller.signal,
    spawnImpl: spawnImpl as never,
  });
  controller.abort();

  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  expect(signals).toEqual(["SIGKILL"]);
});

it("kills the CLI tree when combined output exceeds the configured cap", async () => {
  const signals: string[] = [];
  const spawnImpl = () => {
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: (signal: string) => boolean };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = (signal) => {
      signals.push(signal);
      queueMicrotask(() => child.emit("close", null));
      return true;
    };
    queueMicrotask(() => child.stdout.emit("data", Buffer.from("12345")));
    return child;
  };

  await expect(runWecomCli({
    cliPath: "wecom-cli",
    configDir: "/tmp",
    timeoutMs: 1000,
    maxOutputBytes: 4,
    args: ["doc", "search"],
    spawnImpl: spawnImpl as never,
  })).rejects.toMatchObject({ code: "cli-failed", message: "企业微信办公调用失败。" });
  expect(signals).toEqual(["SIGKILL"]);
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
