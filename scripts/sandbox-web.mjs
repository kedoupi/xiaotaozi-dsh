#!/usr/bin/env node
import { spawn } from "node:child_process";
import { repoRoot, SANDBOX_PORT, sandboxEnv, sandboxHome } from "./sandbox-home.mjs";

const extra = process.argv.slice(2);
const hasPort = extra.some((arg, index) => arg === "--port" || extra[index - 1] === "--port" || arg.startsWith("--port="));
const args = ["web", ...(hasPort ? [] : ["--port", SANDBOX_PORT]), ...extra];
const env = sandboxEnv();

process.stdout.write(`DSH_HOME=${sandboxHome()}\n`);
process.stdout.write(`dsh ${args.join(" ")}\n`);

const child = spawn("dsh", args, {
  cwd: repoRoot,
  env,
  stdio: "inherit",
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
