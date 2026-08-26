#!/usr/bin/env node
/**
 * Upload plugin packs to the existing Xiaotaozi TCB COS bucket.
 * Public URL: https://s.xiaotaozi.cc/dsh/packs/
 *
 * Credentials: ~/.config/env/tencent/tcb.env (same as the xiaotaozi repo).
 * Never GitHub. Does not write ~/.dsh.
 *
 *   node scripts/publish-plugin-pack.mjs --init
 *   node scripts/publish-plugin-pack.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  CDN_HOST,
  DEFAULT_INDEX_URL,
  PACK_PREFIX,
  TCB_ENV_ID,
  packPublicUrl,
} from "./cdn.mjs";
import { purgeCdnUrls } from "./tencent-cdn.mjs";
import {
  assertLiveIndexMatches,
  resolveSigningKey,
  selectPublishedPayload,
  signPayload,
  verifyEnvelope,
} from "./pack-signing.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = join(here, "..");
const packsDir = join(desktopRoot, "plugin-packs");
const envFile = join(homedir(), ".config/env/tencent/tcb.env");

function usage() {
  return `Upload plugin packs to https://${CDN_HOST}/${PACK_PREFIX}/ (TCB COS).

Usage:
  node scripts/publish-plugin-pack.mjs --init   create the prefix (README)
  node scripts/publish-plugin-pack.mjs          upload plugin-packs/ + merge latest.json

Needs the CloudBase CLI (\`tcb\`) and ${envFile}.
After upload, purges https://${CDN_HOST}/${PACK_PREFIX}/ via Tencent CDN
PurgeUrlsCache (latest.json is overwritten in place; CDN caches 404s).
Does not write ~/.dsh. Does not use GitHub.
`;
}

function fail(message) {
  throw new Error(message);
}

function loadTcbEnv() {
  if (!existsSync(envFile)) {
    fail(`missing ${envFile}`);
  }
  const text = readFileSync(envFile, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[match[1]]) {
      process.env[match[1]] = value;
    }
  }
  if (!process.env.TCB_SECRET_ID || !process.env.TCB_SECRET_KEY) {
    fail("TCB_SECRET_ID / TCB_SECRET_KEY missing after reading tcb.env");
  }
  if (!process.env.TCB_ENV_ID) {
    process.env.TCB_ENV_ID = TCB_ENV_ID;
  }
}

function runTcb(args, opts = {}) {
  const envId = process.env.TCB_ENV_ID || TCB_ENV_ID;
  const result = spawnSync("tcb", ["-e", envId, ...args], {
    encoding: "utf8",
    env: process.env,
    stdio: opts.stdio ?? ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || "").trim();
    fail(`tcb ${args.join(" ")} failed${err ? `: ${err.split("\n").slice(-8).join("\n")}` : ""}`);
  }
  return result;
}

// tcb's credential layer (@cloudbase/toolbox getCredentialData, bundled in
// @cloudbase/cli >= 3.x) falls back to TENCENTCLOUD_SECRETID /
// TENCENTCLOUD_SECRETKEY when ~/.config/.cloudbase has no cached login, so
// every runTcb() call authenticates through the env we pass to spawnSync and
// the secrets never appear in argv (visible to `ps`). `tcb login` itself only
// accepts --apiKeyId/--apiKey argv, so we skip it entirely; a cached local
// login, if present, still takes priority over these variables. With bad
// credentials, `tcb storage upload` fails non-interactively.
function tcbAuth() {
  if (!process.env.TENCENTCLOUD_SECRETID) {
    process.env.TENCENTCLOUD_SECRETID = process.env.TCB_SECRET_ID;
  }
  if (!process.env.TENCENTCLOUD_SECRETKEY) {
    process.env.TENCENTCLOUD_SECRETKEY = process.env.TCB_SECRET_KEY;
  }
}

function uploadFile(localPath, cloudPath) {
  if (!existsSync(localPath)) {
    fail(`missing local file ${localPath}`);
  }
  runTcb(["storage", "upload", localPath, cloudPath]);
  process.stdout.write(`uploaded ${cloudPath}\n`);
}

function fetchJson(url) {
  const result = spawnSync(
    "curl",
    ["-fsS", "-H", "Cache-Control: no-cache", "-H", "Pragma: no-cache", url],
    { encoding: "utf8" },
  );
  if (result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function urlOnCdn(url) {
  const sink = process.platform === "win32" ? "NUL" : "/dev/null";
  const result = spawnSync(
    "curl",
    ["-sI", "-o", sink, "-w", "%{http_code}", "-H", "Cache-Control: no-cache", url],
    { encoding: "utf8" },
  );
  return result.status === 0 && (result.stdout || "").trim() === "200";
}

async function purgeAndWait(urls, check) {
  const purged = await purgeCdnUrls(urls);
  process.stdout.write(
    `purged ${purged.urls.length} URL(s) task=${purged.taskId || "?"}\n`,
  );
  const deadline = Date.now() + 90_000;
  let lastError = "CDN still stale";
  while (Date.now() < deadline) {
    try {
      if (check()) return purged;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(2000);
  }
  fail(`CDN did not catch up after purge: ${lastError}`);
}

function localFileForUrl(url) {
  const prefix = packPublicUrl("");
  if (!url.startsWith(prefix)) {
    fail(`pack url is not under ${prefix}: ${url}`);
  }
  const fileName = url.slice(prefix.length);
  if (!fileName || fileName.includes("/") || fileName.includes("..")) {
    fail(`unsafe pack file name in ${url}`);
  }
  return { fileName, localPath: join(packsDir, fileName) };
}

async function publishPacks() {
  const indexPath = join(packsDir, "latest.json");
  if (!existsSync(indexPath)) {
    fail(`missing ${indexPath}; run pnpm pack-plugins first`);
  }
  const privatePem = signingPrivateKey();
  const localEnvelope = JSON.parse(readFileSync(indexPath, "utf8"));
  const local = verifyEnvelope(localEnvelope, privatePem);
  if (!local?.packVersion || !local.targets || typeof local.targets !== "object") {
    fail("latest.json missing packVersion or targets");
  }
  const remoteEnvelope = fetchJson(DEFAULT_INDEX_URL);
  const remote = remoteEnvelope ? verifyEnvelope(remoteEnvelope, privatePem) : null;
  const merged = selectPublishedPayload(remote, local);
  const uploaded = [DEFAULT_INDEX_URL];
  for (const [target, spec] of Object.entries(local.targets)) {
    if (!spec?.url || !spec?.sha256) {
      fail(`target ${target} missing url/sha256`);
    }
    const { localPath, fileName } = localFileForUrl(spec.url);
    if (existsSync(localPath)) {
      uploadFile(localPath, `${PACK_PREFIX}/${fileName}`);
      uploaded.push(spec.url);
      continue;
    }
    // Targets carried over from the remote baseline (packed on another
    // machine) have no local file; require the pack to already be live.
    if (!urlOnCdn(spec.url)) {
      fail(
        `target ${target} has no local file at ${localPath} and ${spec.url} is not on the CDN`,
      );
    }
    process.stdout.write(`kept ${target} (already on CDN): ${spec.url}\n`);
  }
  writeFileSync(indexPath, `${JSON.stringify(signPayload(merged, privatePem), null, 2)}\n`);
  uploadFile(indexPath, `${PACK_PREFIX}/latest.json`);
  await purgeAndWait(uploaded, () => {
    const liveEnvelope = fetchJson(DEFAULT_INDEX_URL);
    const live = liveEnvelope ? verifyEnvelope(liveEnvelope, privatePem) : null;
    // Same packVersion is not enough: a stale CDN copy from another machine's
    // publish can share the version but miss targets. Compare target sets and
    // per-target sha256/url too.
    assertLiveIndexMatches(live, merged);
    process.stdout.write(
      `live ${DEFAULT_INDEX_URL} packVersion=${live.packVersion} targets=${Object.keys(live.targets).sort().join(",")}\n`,
    );
    return true;
  });
}

function signingPrivateKey() {
  return resolveSigningKey(join(desktopRoot, ".pack-signing", "pack-signing-key.pem"));
}

async function initPrefix() {
  const body = `Xiaotaozi DSH plugin packs
TCB COS public prefix on https://${CDN_HOST}/${PACK_PREFIX}/

  ${DEFAULT_INDEX_URL}
  ${packPublicUrl("xiaotaozi-plugins-<packVersion>-<target>.tar.gz")}

ACL is public-read. Silent desktop overlay only. Not GitHub.
Do not store wallpaper / handwriting / uploads here.
`;
  const local = join(tmpdir(), "xiaotaozi-dsh-packs-README.txt");
  writeFileSync(local, body);
  const publicUrl = packPublicUrl("README.txt");
  uploadFile(local, `${PACK_PREFIX}/README.txt`);
  await purgeAndWait([publicUrl], () => {
    const head = spawnSync(
      "curl",
      ["-sI", "-H", "Cache-Control: no-cache", publicUrl],
      { encoding: "utf8" },
    );
    if (head.status !== 0 || !/HTTP\/\d(?:\.\d)?\s+200/.test(head.stdout || "")) {
      throw new Error(`${publicUrl} is not HTTP 200`);
    }
    process.stdout.write(`live ${publicUrl}\n`);
    return true;
  });
}

function parseArgs(argv) {
  const out = { init: false };
  for (const arg of argv) {
    if (arg === "-h" || arg === "--help") return { help: true };
    if (arg === "--init") {
      out.init = true;
      continue;
    }
    fail(`unknown arg ${arg}\n${usage()}`);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  if (spawnSync("tcb", ["--version"], { encoding: "utf8" }).status !== 0) {
    fail("tcb CLI not on PATH; install @cloudbase/cli");
  }
  loadTcbEnv();
  tcbAuth();
  if (args.init) {
    await initPrefix();
    return;
  }
  await publishPacks();
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
