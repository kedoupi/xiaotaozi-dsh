#!/usr/bin/env node
import { createDefaultDependencies, runCli } from "./app";
import { extractGlobalFlags } from "./flags";
import { findXiaotaoziRepo, sandboxHomeFromRepo } from "./repo";

try {
  const { sandbox, rest } = extractGlobalFlags(process.argv.slice(2));
  let repoRoot: string | null = null;
  if (sandbox) {
    repoRoot = await findXiaotaoziRepo();
    if (repoRoot === null) {
      process.stderr.write("xtz --sandbox 只能在 xiaotaozi-dsh 仓库里运行。插件开发请用 pnpm dev。\n");
      process.exitCode = 2;
    }
  }
  if (process.exitCode !== 2) {
    const dependencies = await createDefaultDependencies({
      sandbox,
      repoRoot,
      home: sandbox && repoRoot !== null ? sandboxHomeFromRepo(repoRoot) : undefined,
    });
    process.exitCode = await runCli(rest, dependencies);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`xtz 启动失败：${message}\n`);
  process.exitCode = 1;
}
