import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import {
  assertPrivateKeyMatchesPublicKey,
  assertLiveIndexMatches,
  fetchSignedIndex,
  mergePayload,
  nextPackVersion,
  planPackRelease,
  resolveSigningKey,
  selectPublishedPayload,
  signPayload,
  verifyEnvelope,
} from "./pack-signing.mjs";

test("release private key must match the embedded client public key", () => {
  const keys = generateKeyPairSync("ed25519");
  const wrong = generateKeyPairSync("ed25519");
  const publicDer = keys.publicKey.export({ type: "spki", format: "der" });
  assert.equal(
    assertPrivateKeyMatchesPublicKey(keys.privateKey, publicDer),
    signPayload({}, keys.privateKey).keyId,
  );
  assert.throws(
    () => assertPrivateKeyMatchesPublicKey(wrong.privateKey, publicDer),
    /does not match the public key embedded/,
  );
});

test("signed envelope roundtrips", () => {
  const keys = generateKeyPairSync("ed25519");
  const payload = { packVersion: "20260825T010203004Z", targets: {} };
  assert.deepEqual(verifyEnvelope(signPayload(payload, keys.privateKey), keys.publicKey), payload);
});

test("tampered envelope fails closed", () => {
  const keys = generateKeyPairSync("ed25519");
  const envelope = signPayload({ packVersion: "20260825T010203004Z", targets: {} }, keys.privateKey);
  const bytes = Buffer.from(envelope.signed, "base64");
  bytes[bytes.length - 2] ^= 1;
  envelope.signed = bytes.toString("base64");
  assert.throws(() => verifyEnvelope(envelope, keys.publicKey), /signature/);
});

test("two targets aggregate only with identical metadata", () => {
  const base = {
    packVersion: "20260825T010203004Z",
    minApp: "0.1.0",
    dsh: "0.1.1-rc.2",
    node: "22.19.0",
    plugins: { "dsh-hello": "0.1.0" },
  };
  const merged = mergePayload(
    { ...base, targets: { "darwin-arm64": { url: "a", sha256: "1", sizeBytes: 1 } } },
    { ...base, targets: { "win-x64": { url: "b", sha256: "2", sizeBytes: 2 } } },
  );
  assert.deepEqual(Object.keys(merged.targets).sort(), ["darwin-arm64", "win-x64"]);
  assert.throws(
    () => mergePayload(merged, { ...base, node: "other", targets: {} }),
    /metadata mismatch/,
  );
});

test("pack versions are compact and monotonic", () => {
  const now = new Date("2026-08-25T01:02:03.004Z");
  assert.equal(nextPackVersion(now), "20260825T010203004Z");
  assert.equal(
    nextPackVersion(now, "20260825T010203004Z"),
    "20260825T010203005Z",
  );
});

test("pack version at 999 milliseconds carries into the next second", () => {
  const now = new Date("2026-08-25T01:02:03.004Z");
  assert.equal(
    nextPackVersion(now, "20260825T010203999Z"),
    "20260825T010204000Z",
  );
  assert.equal(
    nextPackVersion(now, "20260825T235959999Z"),
    "20260826T000000000Z",
  );
  assert.throws(() => nextPackVersion(now, "not-a-version"), /invalid previous/);
});

test("second target joins the same release", () => {
  const existing = {
    packVersion: "20260825T010203004Z",
    minApp: "0.1.0",
    dsh: "dsh",
    node: "node",
    plugins: { a: "1" },
    targets: { "darwin-arm64": { url: "a" } },
  };
  const plan = planPackRelease(existing, existing, "win-x64", new Date(0));
  assert.equal(plan.packVersion, existing.packVersion);
  assert.deepEqual(Object.keys(plan.targets), ["darwin-arm64"]);
});

test("repeated target starts a fresh release", () => {
  const existing = {
    packVersion: "20260825T010203004Z",
    minApp: "0.1.0",
    targets: { "darwin-arm64": { url: "a" } },
  };
  const plan = planPackRelease(
    existing,
    existing,
    "darwin-arm64",
    new Date("2026-08-25T01:02:03.004Z"),
  );
  assert.equal(plan.packVersion, "20260825T010203005Z");
  assert.deepEqual(plan.targets, {});
});

test("metadata change starts a fresh release", () => {
  const existing = {
    packVersion: "20260825T010203004Z",
    node: "old",
    targets: { "darwin-arm64": { url: "a" } },
  };
  const plan = planPackRelease(
    existing,
    { node: "new" },
    "win-x64",
    new Date("2026-08-25T01:02:03.004Z"),
  );
  assert.equal(plan.packVersion, "20260825T010203005Z");
  assert.deepEqual(plan.targets, {});
});

test("second machine keeps foreign targets when planning from the live index", () => {
  // Machine A (darwin-arm64) published packVersion V. Machine B (win-x64)
  // has an empty gitignored plugin-packs/ but plans against the live index:
  // it must join release V, carry the darwin target, and publishing the
  // merged payload must keep both targets.
  const live = {
    packVersion: "20260825T010203004Z",
    minApp: "0.1.0",
    dsh: "0.1.1-rc.2",
    node: "22.19.0",
    plugins: { "dsh-hello": "0.1.0" },
    targets: {
      "darwin-arm64": { url: "https://cdn/a.tar.gz", sha256: "aa", sizeBytes: 1 },
    },
  };
  const metadata = {
    minApp: live.minApp,
    dsh: live.dsh,
    node: live.node,
    plugins: live.plugins,
  };
  const plan = planPackRelease(live, metadata, "win-x64", new Date(0));
  assert.equal(plan.packVersion, live.packVersion);
  assert.deepEqual(Object.keys(plan.targets), ["darwin-arm64"]);

  const localIndex = {
    packVersion: plan.packVersion,
    ...metadata,
    targets: {
      ...plan.targets,
      "win-x64": { url: "https://cdn/b.tar.gz", sha256: "bb", sizeBytes: 2 },
    },
  };
  const published = selectPublishedPayload(live, localIndex);
  assert.equal(published.packVersion, live.packVersion);
  assert.deepEqual(Object.keys(published.targets).sort(), ["darwin-arm64", "win-x64"]);
  assert.deepEqual(published.targets["darwin-arm64"], live.targets["darwin-arm64"]);
});

test("publishing refuses conflicting target contents within one release", () => {
  const remote = {
    packVersion: "20260825T010203004Z",
    minApp: "0.1.0",
    dsh: "0.1.1-rc.2",
    node: "22.19.0",
    plugins: {},
    targets: { "darwin-arm64": { url: "https://cdn/a", sha256: "aa", sizeBytes: 1 } },
  };
  const local = {
    ...remote,
    targets: { "darwin-arm64": { url: "https://cdn/b", sha256: "bb", sizeBytes: 2 } },
  };
  assert.throws(() => selectPublishedPayload(remote, local), /target conflict: darwin-arm64/);
});

test("live index comparison covers metadata and target size", () => {
  const expected = {
    packVersion: "20260825T010203004Z",
    minApp: "0.1.0",
    dsh: "0.1.1-rc.2",
    node: "22.19.0",
    plugins: { "dsh-hello": "0.2.1" },
    targets: { "darwin-arm64": { url: "https://cdn/a", sha256: "aa", sizeBytes: 1 } },
  };
  assert.doesNotThrow(() => assertLiveIndexMatches(structuredClone(expected), expected));
  const wrongMetadata = structuredClone(expected);
  wrongMetadata.node = "other";
  assert.throws(() => assertLiveIndexMatches(wrongMetadata, expected), /metadata node/);
  const wrongSize = structuredClone(expected);
  wrongSize.targets["darwin-arm64"].sizeBytes = 2;
  assert.throws(() => assertLiveIndexMatches(wrongSize, expected), /sizeBytes/);
});

test("fetchSignedIndex verifies the live envelope and fails closed", async (t) => {
  const keys = generateKeyPairSync("ed25519");
  const wrongKeys = generateKeyPairSync("ed25519");
  const payload = { packVersion: "20260825T010203004Z", targets: {} };
  const routes = {
    "/good.json": JSON.stringify(signPayload(payload, keys.privateKey)),
    "/tampered.json": JSON.stringify(signPayload(payload, wrongKeys.privateKey)),
  };
  const server = createServer((request, response) => {
    const body = routes[request.url];
    if (!body) {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" }).end(body);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  assert.deepEqual(await fetchSignedIndex(`${base}/good.json`, keys.publicKey), payload);
  await assert.rejects(fetchSignedIndex(`${base}/missing.json`, keys.publicKey), /404/);
  await assert.rejects(
    fetchSignedIndex(`${base}/tampered.json`, keys.publicKey),
    /unknown pack signing key/,
  );
});

test("publishing merges equal versions, replaces older remote, and rejects stale local", () => {
  const remote = {
    packVersion: "20260825T010203004Z",
    minApp: "0.1.0",
    targets: { a: { url: "a" } },
  };
  const same = {
    ...remote,
    targets: { b: { url: "b" } },
  };
  assert.deepEqual(Object.keys(selectPublishedPayload(remote, same).targets).sort(), ["a", "b"]);
  const newer = {
    ...remote,
    packVersion: "20260825T010203005Z",
    targets: { c: { url: "c" } },
  };
  assert.deepEqual(selectPublishedPayload(remote, newer), newer);
  assert.throws(() => selectPublishedPayload(newer, remote), /older than remote/);
});

test("live index with same packVersion but stale targets is not a successful publish", () => {
  // Machine A published darwin under packVersion V; machine B merged win-x64
  // into the same V. A CDN copy that still shows only darwin must fail.
  const merged = {
    packVersion: "20260825T010203004Z",
    targets: {
      "darwin-arm64": { url: "https://cdn/a.tar.gz", sha256: "aa", sizeBytes: 1 },
      "win-x64": { url: "https://cdn/b.tar.gz", sha256: "bb", sizeBytes: 2 },
    },
  };
  const staleCdn = {
    packVersion: merged.packVersion,
    targets: { "darwin-arm64": merged.targets["darwin-arm64"] },
  };
  assert.throws(() => assertLiveIndexMatches(staleCdn, merged), /targets want \[darwin-arm64, win-x64\]/);
  assert.throws(() => assertLiveIndexMatches(null, merged), /packVersion want/);
  assert.throws(
    () => assertLiveIndexMatches({ packVersion: "20260825T010203003Z", targets: merged.targets }, merged),
    /packVersion want/,
  );
});

test("live index target content must match sha256 and url per target", () => {
  const merged = {
    packVersion: "20260825T010203004Z",
    targets: {
      "darwin-arm64": { url: "https://cdn/a.tar.gz", sha256: "aa" },
      "win-x64": { url: "https://cdn/b.tar.gz", sha256: "bb" },
    },
  };
  const sameKeysOldSha = structuredClone(merged);
  sameKeysOldSha.targets["win-x64"].sha256 = "stale";
  assert.throws(() => assertLiveIndexMatches(sameKeysOldSha, merged), /win-x64 sha256 want bb/);

  const sameKeysOldUrl = structuredClone(merged);
  sameKeysOldUrl.targets["win-x64"].url = "https://cdn/old.tar.gz";
  assert.throws(() => assertLiveIndexMatches(sameKeysOldUrl, merged), /win-x64 url want/);

  const extraTarget = structuredClone(merged);
  extraTarget.targets["linux-x64"] = { url: "https://cdn/c.tar.gz", sha256: "cc" };
  assert.throws(() => assertLiveIndexMatches(extraTarget, merged), /targets want/);

  assert.equal(assertLiveIndexMatches(structuredClone(merged), merged), undefined);
});

test("signing key resolves env, then per-user path, then legacy with warning", async (t) => {
  const { mkdtempSync, rmSync, writeFileSync: write } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join: joinPath } = await import("node:path");
  const dir = mkdtempSync(joinPath(tmpdir(), "pack-key-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = joinPath(dir, "home.pem");
  const legacy = joinPath(dir, "legacy.pem");
  const envFile = joinPath(dir, "env.pem");

  assert.equal(resolveSigningKey(legacy, home, "PEM CONTENTS"), "PEM CONTENTS");
  write(envFile, "env-key");
  assert.equal(resolveSigningKey(legacy, home, envFile), "env-key");
  assert.throws(() => resolveSigningKey(legacy, home, undefined), /generate-pack-key/);
  write(legacy, "legacy-key");
  assert.equal(resolveSigningKey(legacy, home, undefined), "legacy-key");
  write(home, "home-key");
  assert.equal(resolveSigningKey(legacy, home, undefined), "home-key");
});
