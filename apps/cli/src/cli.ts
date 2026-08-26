#!/usr/bin/env node
import { createDefaultDependencies, runCli } from "./app";

try {
  const dependencies = await createDefaultDependencies();
  process.exitCode = await runCli(process.argv.slice(2), dependencies);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`xtz 启动失败：${message}\n`);
  process.exitCode = 1;
}
