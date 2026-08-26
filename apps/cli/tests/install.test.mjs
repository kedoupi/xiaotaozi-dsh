import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "install.sh");

function run(args, env, { stdin = "" } = {}) {
  return new Promise((resolve) => {
    const child = spawn("sh", [SCRIPT, ...args], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    if (stdin) child.stdin.end(stdin);
    else child.stdin.end();
  });
}

async function fakePath({ nodeVersion = "22.19.0", tools = ["npm"] } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "xtz-install-"));
  await writeFile(join(dir, "node"), `#!/bin/sh
if [ "$1" = "-p" ]; then
  printf '%s\\n' "${nodeVersion}"
  exit 0
fi
exit 0
`);
  await chmod(join(dir, "node"), 0o755);
  for (const name of tools) {
    await writeFile(join(dir, name), `#!/bin/sh
printf '%s %s\\n' "${name}" "$*"
exit 0
`);
    await chmod(join(dir, name), 0o755);
  }
  return `${dir}:/usr/bin:/bin`;
}

test("install.sh --help explains npm and bun", async () => {
  const result = await run(["--help"], process.env);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /--npm/);
  assert.match(result.stdout, /--bun/);
  assert.match(result.stdout, /22\.19\.0/);
});

test("install.sh refuses a non-pinned Node version", async () => {
  const path = await fakePath({ nodeVersion: "24.18.0", tools: ["npm"] });
  const result = await run(["--dry-run", "--npm"], { ...process.env, PATH: path });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /24\.18\.0/);
  assert.match(result.stderr, /22\.19\.0/);
});

test("install.sh --dry-run --npm prints a global npm install", async () => {
  const path = await fakePath({ tools: ["npm"] });
  const result = await run(["--dry-run", "--npm"], { ...process.env, PATH: path });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /npm install --global xiaotaozi-dsh-cli/);
});

test("install.sh --dry-run --bun prints a global bun install", async () => {
  const path = await fakePath({ tools: ["bun"] });
  const result = await run(["--dry-run", "--bun"], { ...process.env, PATH: path });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /bun add --global xiaotaozi-dsh-cli/);
});

test("install.sh picks npm before bun when both exist", async () => {
  const path = await fakePath({ tools: ["npm", "bun"] });
  const result = await run(["--dry-run"], { ...process.env, PATH: path });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /使用 npm 安装/);
  assert.match(result.stdout, /npm install --global xiaotaozi-dsh-cli/);
});
