import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const workflow = await readFile(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8");
const valid = { eventName: "push", ref: "refs/tags/v0.5.0", packageName: "xiaotaozi-dsh-cli",
  packageVersion: "0.5.0", productVersion: "0.5.0", containedInMain: true };

// Deliberately small YAML subset: read actual step scalars and literal run blocks.
function stepsFrom(source) {
  return source.split(/^      - /mu).slice(1).map(block => {
    const lines = block.split("\n");
    const step = {};
    for (let i = 0; i < lines.length; i++) {
      const line = i === 0 ? lines[i] : lines[i].replace(/^        /u, "");
      const match = /^(name|id|if|working-directory|run): (.*)$/u.exec(line);
      if (!match) continue;
      if (match[1] === "run" && match[2] === "|") {
        const body = [];
        while (lines[i + 1]?.startsWith("          ")) body.push(lines[++i].slice(10));
        step.run = body.join("\n");
      } else step[match[1]] = match[2];
    }
    return step;
  });
}

function condition(expression, context) {
  if (expression === undefined) return true;
  // Evaluate every operand, including short-circuited ones: unknown grammar fails closed.
  if (expression.includes(" || ")) return expression.split(" || ").map(part => condition(part, context)).some(Boolean);
  if (expression.includes(" && ")) return expression.split(" && ").map(part => condition(part, context)).every(Boolean);
  const equals = /^([a-zA-Z0-9_.]+) (==|!=) '([^']*)'$/u.exec(expression);
  if (equals) {
    assert.ok(Object.hasOwn(context, equals[1]), `unknown variable ${equals[1]}`);
    return equals[2] === "==" ? context[equals[1]] === equals[3] : context[equals[1]] !== equals[3];
  }
  const prefix = /^startsWith\(github.ref, '([^']*)'\)$/u.exec(expression);
  if (prefix) return context["github.ref"].startsWith(prefix[1]);
  throw new Error(`unsupported condition: ${expression}`);
}

async function exercise(input, legacyDryRun) {
  const root = await mkdtemp(join(tmpdir(), "xtz-publish-policy-"));
  for (const dir of ["apps/cli", "scripts", "bin"]) await mkdir(join(root, dir), { recursive: true });
  await writeFile(join(root, "apps/cli/package.json"), JSON.stringify({ name: input.packageName, version: input.packageVersion }));
  await writeFile(join(root, "versions.json"), JSON.stringify({ cliApp: input.productVersion }));
  try { await copyFile(new URL("./publish-policy.mjs", import.meta.url), join(root, "scripts/publish-policy.mjs")); }
  catch (error) { if (error.code !== "ENOENT") throw error; } // baseline workflow has no policy script
  const npmLog = join(root, "npm.log"); const gitLog = join(root, "git.log"); const output = join(root, "output");
  await writeFile(npmLog, ""); await writeFile(gitLog, ""); await writeFile(output, "");
  await writeFile(join(root, "bin/npm"), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$NPM_RECORD"\n', { mode: 0o700 });
  await writeFile(join(root, "bin/git"), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$GIT_RECORD"\n[ "$*" = "merge-base --is-ancestor HEAD origin/main" ] || exit 42\nexit "$MAIN_RESULT"\n', { mode: 0o700 });
  const context = { "github.event_name": input.eventName, "github.ref": input.ref,
    "github.event.inputs.dry_run": legacyDryRun, "steps.policy.outputs.publish": "" };
  const env = { ...process.env, PATH: `${join(root, "bin")}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`,
    GITHUB_EVENT_NAME: input.eventName, GITHUB_REF: input.ref, GITHUB_REF_NAME: input.ref.split("/").at(-1),
    GITHUB_OUTPUT: output, NPM_RECORD: npmLog, GIT_RECORD: gitLog, MAIN_RESULT: input.containedInMain ? "0" : "1" };
  let oidc = false; let rejected = false;
  for (const step of stepsFrom(workflow)) {
    if (!["Validate release policy", "Match git tag to package.json version", "Prove GitHub OIDC for npm", "Publish", "Dry-run publish"].includes(step.name)) continue;
    if (!condition(step.if, context)) continue;
    if (step.name === "Prove GitHub OIDC for npm") { oidc = true; continue; } // NEVER execute live exchange
    assert.equal(typeof step.run, "string");
    const result = spawnSync("bash", ["-e", "-c", step.run], {
      cwd: step["working-directory"] === "." ? root : join(root, "apps/cli"), env, encoding: "utf8",
    });
    if (result.status !== 0) { rejected = true; break; }
    for (const line of (await readFile(output, "utf8")).trim().split("\n")) {
      if (line.startsWith("publish=")) context["steps.policy.outputs.publish"] = line.slice(8);
    }
  }
  return { npm: (await readFile(npmLog, "utf8")).trim(), git: (await readFile(gitLog, "utf8")).trim(), oidc, rejected };
}

test("release decision accepts only validated tag pushes; manual always dry-runs", async () => {
  const { releaseDecision } = await import("./publish-policy.mjs");
  assert.equal(releaseDecision(valid), "publish");
  for (const ref of ["refs/heads/topic", valid.ref]) {
    assert.equal(releaseDecision({ ...valid, eventName: "workflow_dispatch", ref, containedInMain: false }), "dry-run");
  }
  for (const change of [{ containedInMain: false }, { ref: "refs/tags/v0.5.1" }, { productVersion: "0.4.0" },
    { packageName: "other" }, { ref: "refs/heads/main" }, { ref: "refs/tags/v00.5.0" }, { ref: "refs/tags/v0.5.0-rc.1" }, { eventName: "pull_request" }]) {
    assert.throws(() => releaseDecision({ ...valid, ...change }), JSON.stringify(change));
  }
});

for (const legacyDryRun of [undefined, "true", "false"]) {
  for (const ref of ["refs/heads/topic", valid.ref]) {
    test(`workflow manual ${legacyDryRun} on ${ref} only packs without OIDC`, async () => {
      const result = await exercise({ ...valid, eventName: "workflow_dispatch", ref }, legacyDryRun);
      assert.equal(result.rejected, false);
      assert.match(result.npm, /^publish --dry-run /u);
      assert.equal(result.npm.split("\n").length, 1);
      assert.equal(result.oidc, false);
    });
  }
}

test("workflow valid tag consumes policy and main ancestry before real publication", async () => {
  const result = await exercise(valid);
  assert.equal(result.rejected, false);
  assert.equal(result.git, "merge-base --is-ancestor HEAD origin/main");
  assert.match(result.npm, /^publish --access public /u);
  assert.equal(result.oidc, true);
});

for (const change of [{ containedInMain: false }, { ref: "refs/tags/v0.5.1" }, { productVersion: "0.4.0" },
  { packageName: "other" }, { ref: "refs/heads/main" }, { ref: "refs/tags/v0.5.0-extra" }]) {
  test(`workflow invalid push never reaches npm or OIDC: ${JSON.stringify(change)}`, async () => {
    const result = await exercise({ ...valid, ...change });
    assert.equal(result.rejected, true);
    assert.equal(result.npm, "");
    assert.equal(result.oidc, false);
  });
}

test("condition evaluator rejects unknown grammar", () => {
  assert.throws(() => condition("success()", {}), /unsupported/u);
  assert.throws(() => condition("github.missing == 'yes'", {}), /unknown/u);
});

test("workflow publish and OIDC consume validated output as well as push/tag context", () => {
  const steps = stepsFrom(workflow);
  for (const name of ["Publish", "Prove GitHub OIDC for npm"]) {
    const step = steps.find(item => item.name === name);
    assert.ok(step, name);
    for (const event of ["push", "workflow_dispatch"]) {
      for (const ref of [valid.ref, "refs/heads/main"]) {
        for (const output of ["", "false", "true"]) {
          const context = { "github.event_name": event, "github.ref": ref,
            "github.event.inputs.dry_run": "false", "steps.policy.outputs.publish": output };
          assert.equal(condition(step.if, context), event === "push" && ref === valid.ref && output === "true",
            `${name}: ${JSON.stringify(context)}`);
        }
      }
    }
  }
  const checkout = workflow.split(/^      - /mu).find(block => block.startsWith("uses: actions/checkout@"));
  assert.ok(checkout);
  assert.match(checkout, /^          fetch-depth: 0(?:\s|$)/mu, "main containment needs full history");
});
