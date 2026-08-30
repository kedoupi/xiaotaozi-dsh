import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { executeOfficeTool, registerOfficeTools } from "../src/tools.ts";
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
  const content = "第一段说明。\n\n## 范围\n\n- 仅文档";
  const text = await executeOfficeTool(
    "wecom_doc_create",
    { doc_name: "周报", doc_type: "doc", content },
    OFFICE_SETTINGS_DEFAULTS,
    spawn as never,
  );
  expect(JSON.parse(text)).toMatchObject({
    json: { doc_name: "周报", doc_type: "doc", content, content_type: "markdown" },
  });
});

it("refuses text content_type for word docs", async () => {
  const calls: string[][] = [];
  const spawn = async (options: { args: readonly string[] }) => {
    calls.push([...options.args]);
    if (options.args[0] === "auth") {
      return { argv: [...options.args], stdout: "authorized\n", stderr: "", exitCode: 0 };
    }
    throw new Error("should not run doc create");
  };
  await expect(executeOfficeTool(
    "wecom_doc_create",
    { doc_name: "周报", content: "一段正文", content_type: "text" },
    OFFICE_SETTINGS_DEFAULTS,
    spawn as never,
  )).rejects.toMatchObject({ code: "layout-rejected" });
  expect(calls.some((args) => args[0] === "doc" && args[1] === "create")).toBe(false);
});

it("refuses chat opening before spawn", async () => {
  const calls: string[][] = [];
  const spawn = async (options: { args: readonly string[] }) => {
    calls.push([...options.args]);
    if (options.args[0] === "auth") {
      return { argv: [...options.args], stdout: "authorized\n", stderr: "", exitCode: 0 };
    }
    throw new Error("should not run doc create");
  };
  await expect(executeOfficeTool(
    "wecom_doc_create",
    { doc_name: "周报", content: "好的，我来整理\n\n## 范围\n" },
    OFFICE_SETTINGS_DEFAULTS,
    spawn as never,
  )).rejects.toMatchObject({ code: "layout-rejected" });
  expect(calls.some((args) => args[0] === "doc" && args[1] === "create")).toBe(false);
});

it("sheet create still allows content without markdown lock", async () => {
  const spawn = async (options: { args: readonly string[]; json?: Record<string, unknown> }) => {
    if (options.args[0] === "auth") {
      return { argv: [...options.args], stdout: "authorized\n", stderr: "", exitCode: 0 };
    }
    return { argv: [...options.args], stdout: JSON.stringify({ json: options.json }), stderr: "", exitCode: 0 };
  };
  const text = await executeOfficeTool(
    "wecom_doc_create",
    {
      doc_type: "sheet",
      doc_name: "表",
      grid_data: { start_row: 0, start_column: 0, rows: [] },
    },
    OFFICE_SETTINGS_DEFAULTS,
    spawn as never,
  );
  expect(JSON.parse(text).json).toMatchObject({
    doc_name: "表",
    doc_type: "sheet",
    grid_data: { start_row: 0, start_column: 0, rows: [] },
  });
  expect(JSON.parse(text).json.content_type).toBeUndefined();
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

it("rejects outside local files for named and generic tools before CLI invocation", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "dsh-wecom-tools-workspace-"));
  const outside = await mkdtemp(join(tmpdir(), "dsh-wecom-tools-outside-"));
  const outsideFile = join(outside, "canary.txt");
  await writeFile(outsideFile, "canary", "utf8");
  const spawn = vi.fn(async (options: { args: readonly string[] }) => ({
    argv: [...options.args],
    stdout: options.args[0] === "auth" ? "authorized\n" : "{}",
    stderr: "",
    exitCode: 0,
  }));
  const cases = [
    ["wecom_disk_upload", { file_path: outsideFile }],
    ["wecom_media_upload", { file_path: outsideFile }],
    ["wecom_mail_send", { attachments: [{ file_path: outsideFile }] }],
    ["wecom_run", { service: "disk", method: "files.upload", json: { file_path: outsideFile } }],
    ["wecom_docs_run", { service: "doc", method: "import", json: { source_path: outsideFile } }],
  ] as const;

  try {
    for (const [name, args] of cases) {
      await expect(executeOfficeTool(name, args, OFFICE_SETTINGS_DEFAULTS, spawn as never, workspace))
        .rejects.toMatchObject({ code: "local-file-denied" });
    }
    expect(spawn).toHaveBeenCalledTimes(cases.length);
    expect(spawn.mock.calls.every(([options]) => options.args[0] === "auth")).toBe(true);
  } finally {
    await Promise.all([rm(workspace, { recursive: true, force: true }), rm(outside, { recursive: true, force: true })]);
  }
});

it("passes an accepted local file to the CLI only by canonical workspace path", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "dsh-wecom-tools-accepted-"));
  const file = join(workspace, "note.txt");
  await writeFile(file, "inside", "utf8");
  const calls: Array<{ args: readonly string[]; json?: Record<string, unknown> }> = [];
  let stagedPath = "";
  let stagedContent = "";
  let stagedJson: Record<string, unknown> = {};
  const spawn = async (options: { args: readonly string[]; json?: Record<string, unknown> }) => {
    calls.push(options);
    if (options.args[0] === "auth") {
      return { argv: [...options.args], stdout: "authorized\n", stderr: "", exitCode: 0 };
    }
    stagedJson = options.json ?? {};
    stagedPath = String(stagedJson.file_path ?? "");
    stagedContent = await readFile(stagedPath, "utf8");
    return { argv: [...options.args], stdout: "{}", stderr: "", exitCode: 0 };
  };

  try {
    await executeOfficeTool(
      "wecom_disk_upload",
      { file_path: "note.txt" },
      OFFICE_SETTINGS_DEFAULTS,
      spawn as never,
      workspace,
    );
    expect(stagedContent).toBe("inside");
    expect(stagedJson.file_name).toBe("note.txt");
    expect(stagedPath).not.toBe(await realpath(file));
    await expect(readFile(stagedPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

it("uses the registered DSH execution workspace for local files", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "dsh-wecom-tools-context-"));
  const file = join(workspace, "note.txt");
  await writeFile(file, "inside", "utf8");
  let registered: { execute(args: Record<string, unknown>, exec: unknown): Promise<string> } | undefined;
  let observed = "";
  const run = async (options: { args: readonly string[]; json?: Record<string, unknown> }) => {
    if (options.args[0] === "auth") {
      return { argv: [...options.args], stdout: "authorized\n", stderr: "", exitCode: 0 };
    }
    observed = await readFile(String(options.json?.file_path), "utf8");
    return { argv: [...options.args], stdout: "{}", stderr: "", exitCode: 0 };
  };
  registerOfficeTools({
    tools: {
      register(tool: unknown) {
        const candidate = tool as { name?: string; execute(args: Record<string, unknown>, exec: unknown): Promise<string> };
        if (candidate.name === "wecom_media_upload") registered = candidate;
      },
    },
  }, () => OFFICE_SETTINGS_DEFAULTS, run as never);

  try {
    await registered?.execute(
      { file_path: "note.txt" },
      { agent: { session: { header: { cwd: workspace } } } },
    );
    expect(observed).toBe("inside");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
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
