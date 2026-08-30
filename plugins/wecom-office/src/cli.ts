import { spawn } from "node:child_process";
import { OfficeError } from "./errors.ts";
import { isCliProbe, pluginTrace, redactArgv } from "./trace.ts";

export interface CliRunOptions {
  cliPath: string;
  configDir: string;
  timeoutMs: number;
  maxOutputBytes?: number;
  args: readonly string[];
  json?: Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  spawnImpl?: typeof spawn;
}

export interface CliRunResult {
  argv: string[];
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export function buildArgv(args: readonly string[], json?: Record<string, unknown>): string[] {
  const argv = [...args];
  if (json !== undefined) argv.push("--json", JSON.stringify(json));
  return argv;
}

export const TOOL_ARGV = {
  wecom_calendar_list: ["calendar", "schedules", "list"],
  wecom_calendar_search: ["calendar", "schedules", "search"],
  wecom_calendar_get: ["calendar", "schedules", "get"],
  wecom_calendar_create: ["calendar", "schedules", "create"],
  wecom_calendar_update: ["calendar", "schedules", "update"],
  wecom_calendar_cancel: ["calendar", "schedules", "cancel"],
  wecom_calendar_freebusy: ["calendar", "schedules", "free", "list"],
  wecom_doc_search: ["doc", "search"],
  wecom_doc_get: ["doc", "contents", "get"],
  wecom_doc_create: ["doc", "create"],
  wecom_doc_append: ["doc", "contents", "append"],
  wecom_doc_overwrite: ["doc", "contents", "overwrite"],
  wecom_doc_rename: ["doc", "names", "update"],
  wecom_sheet_get: ["sheet", "get"],
  wecom_sheet_read: ["sheet", "ranges", "get"],
  wecom_sheet_write: ["sheet", "contents", "update"],
  wecom_sheet_append_row: ["sheet", "rows", "append"],
  wecom_smartsheet_get: ["smartsheet", "get"],
  wecom_smartsheet_records_list: ["smartsheet", "records", "list"],
  wecom_smartsheet_records_add: ["smartsheet", "records", "add"],
  wecom_smartsheet_records_update: ["smartsheet", "records", "update"],
  wecom_meeting_list: ["meeting", "list"],
  wecom_meeting_search: ["meeting", "search"],
  wecom_meeting_get: ["meeting", "get"],
  wecom_meeting_create: ["meeting", "create"],
  wecom_meeting_update: ["meeting", "update"],
  wecom_meeting_cancel: ["meeting", "cancel"],
  wecom_meeting_transcript: ["meeting", "original", "get"],
  wecom_meeting_rooms_search: ["meeting", "rooms", "search"],
  wecom_contact_search: ["contact", "users", "search"],
  wecom_todo_list: ["todo", "list"],
  wecom_todo_get: ["todo", "get"],
  wecom_todo_create: ["todo", "create"],
  wecom_todo_update: ["todo", "update"],
  wecom_todo_finish: ["todo", "finish"],
  wecom_todo_delete: ["todo", "delete"],
  wecom_disk_list: ["disk", "files", "list"],
  wecom_disk_search: ["disk", "files", "search"],
  wecom_disk_get: ["disk", "files", "get"],
  wecom_disk_download: ["disk", "files", "download"],
  wecom_disk_upload: ["disk", "files", "upload"],
  wecom_disk_rename: ["disk", "files", "rename"],
  wecom_disk_mkdir: ["disk", "folders", "create"],
  wecom_mail_search: ["mail", "search"],
  wecom_mail_get: ["mail", "get"],
  wecom_mail_send: ["mail", "send"],
  wecom_media_upload: ["media", "upload"],
  wecom_media_download: ["media", "download"],
  wecom_chat_list: ["chat", "groups", "list"],
  wecom_chat_messages: ["chat", "messages", "list"],
  wecom_message_send: ["message", "send"],
} as const;

export async function runWecomCli(options: CliRunOptions): Promise<CliRunResult> {
  options.signal?.throwIfAborted();
  const argv = buildArgv(options.args, options.json);
  const spawnImpl = options.spawnImpl ?? spawn;
  const started = Date.now();
  const probe = isCliProbe(options.args);
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawnImpl(options.cliPath, argv, {
      env: {
        ...process.env,
        ...options.env,
        WECOM_CLI_CONFIG_DIR: options.configDir,
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let killStarted = false;
    const killChildTree = () => {
      if (killStarted) return;
      killStarted = true;
      if (typeof child.pid === "number") {
        if (process.platform === "win32") {
          const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
            stdio: "ignore",
            windowsHide: true,
          });
          killer.once("error", () => { child.kill("SIGKILL"); });
          killer.once("close", (code) => { if (code !== 0) child.kill("SIGKILL"); });
          return;
        }
        try {
          process.kill(-child.pid, "SIGKILL");
          return;
        } catch {
          // fall back to the wrapper process
        }
      }
      child.kill("SIGKILL");
    };
    let aborted = false;
    const abort = () => {
      aborted = true;
      killChildTree();
    };
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const maxOutputBytes = options.maxOutputBytes ?? 1024 * 1024;
    let outputBytes = 0;
    let outputExceeded = false;
    const capture = (chunks: Buffer[], chunk: Buffer) => {
      if (outputExceeded) return;
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        outputExceeded = true;
        killChildTree();
        return;
      }
      chunks.push(chunk);
    };
    child.stdout?.on("data", (chunk: Buffer) => capture(stdoutChunks, chunk));
    child.stderr?.on("data", (chunk: Buffer) => capture(stderrChunks, chunk));
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killChildTree();
    }, options.timeoutMs);
    const finish = (error?: Error, result?: CliRunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      const ms = Date.now() - started;
      if (!probe) {
        if (error instanceof OfficeError) {
          pluginTrace(`cli argv=${redactArgv(argv)} error=${error.code} ms=${String(ms)}`);
        } else if (result) {
          pluginTrace(`cli argv=${redactArgv(argv)} exit=${String(result.exitCode)} ms=${String(ms)} stdout=${String(result.stdout.length)} stderr=${String(result.stderr.length)}`);
        }
      }
      if (error) reject(error);
      else resolve(result!);
    };
    child.on("error", (error) => {
      if (timedOut || aborted) return;
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        finish(new OfficeError("cli-missing", "未安装 wecom-cli。请先执行 npm install -g @wecom/cli，然后点检查。"));
        return;
      }
      finish(new OfficeError("cli-failed", "企业微信办公调用失败。"));
    });
    child.on("close", (exitCode) => {
      if (aborted) {
        finish(new DOMException("This operation was aborted", "AbortError"));
        return;
      }
      if (timedOut) {
        finish(new OfficeError("cli-failed", "企业微信办公调用超时。"));
        return;
      }
      if (outputExceeded) {
        finish(new OfficeError("cli-failed", "企业微信办公调用失败。"));
        return;
      }
      finish(undefined, {
        argv,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        exitCode,
      });
    });
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
  });
}

export function parseAuthStatus(stdout: string): "authorized" | "unauthorized" {
  const line = stdout.trim().split(/\r?\n/).at(-1)?.trim() ?? "";
  return line === "authorized" ? "authorized" : "unauthorized";
}

export function formatCliOutput(result: CliRunResult): string {
  const text = result.stdout.trim();
  if (result.exitCode === 0) {
    if (text === "") return "{}";
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }
  let errcode: unknown;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null && "errcode" in parsed) {
      errcode = (parsed as Record<string, unknown>).errcode;
    }
  } catch {
    // keep the fixed public failure
  }
  const safeErrcode = (typeof errcode === "number" || typeof errcode === "string")
    ? String(errcode).slice(0, 32)
    : undefined;
  throw new OfficeError("cli-failed", "企业微信办公调用失败。", { errcode: safeErrcode });
}
