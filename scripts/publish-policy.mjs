#!/usr/bin/env node
import { appendFile, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Manual runs only pack; invalid push metadata must fail, never silently dry-run. */
export function releaseDecision(input) {
  if (input.eventName === "workflow_dispatch") return "dry-run";
  if (input.eventName !== "push") throw new Error("Release requires a product-tag push");
  const tag = /^refs\/tags\/v((?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))$/u.exec(input.ref);
  if (!tag || input.packageName !== "xiaotaozi-dsh-cli"
    || tag[1] !== input.packageVersion || tag[1] !== input.productVersion) {
    throw new Error("Product tag, CLI package name/version and versions.json must agree");
  }
  if (input.containedInMain !== true) throw new Error("Release commit must be contained in origin/main");
  return "publish";
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = new URL("../", import.meta.url);
  const pkg = JSON.parse(await readFile(new URL("apps/cli/package.json", root), "utf8"));
  const versions = JSON.parse(await readFile(new URL("versions.json", root), "utf8"));
  let containedInMain = false;
  if (process.env.GITHUB_EVENT_NAME === "push") {
    const result = spawnSync("git", ["merge-base", "--is-ancestor", "HEAD", "origin/main"], {
      cwd: fileURLToPath(root), encoding: "utf8",
    });
    if (result.error || (result.status !== 0 && result.status !== 1)) throw new Error("Cannot verify origin/main ancestry");
    containedInMain = result.status === 0;
  }
  const decision = releaseDecision({ eventName: process.env.GITHUB_EVENT_NAME, ref: process.env.GITHUB_REF,
    packageName: pkg.name, packageVersion: pkg.version, productVersion: versions.cliApp, containedInMain });
  if (!process.env.GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT is required");
  await appendFile(process.env.GITHUB_OUTPUT, `publish=${decision === "publish"}\n`);
}
