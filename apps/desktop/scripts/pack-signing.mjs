import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function defaultSigningKeyPath() {
  return join(homedir(), ".config", "xiaotaozi-dsh", "pack-signing-key.pem");
}

// Lookup order: XIAOTAOZI_PACK_SIGNING_KEY (path or PEM contents), then the
// per-user key (survives worktrees and fresh clones), then the legacy in-repo
// .pack-signing/ location with a migration warning.
export function resolveSigningKey(
  legacyPath,
  homePath = defaultSigningKeyPath(),
  configured = process.env.XIAOTAOZI_PACK_SIGNING_KEY,
) {
  if (configured) {
    return existsSync(configured) ? readFileSync(configured, "utf8") : configured;
  }
  if (existsSync(homePath)) return readFileSync(homePath, "utf8");
  if (legacyPath && existsSync(legacyPath)) {
    process.stderr.write(
      `[pack-signing] using legacy key ${legacyPath}; move it to ${homePath}\n`,
    );
    return readFileSync(legacyPath, "utf8");
  }
  throw new Error(`missing ${homePath}; run pnpm generate-pack-key`);
}

export function keyIdForPublicKey(publicKey) {
  const key = publicKey?.type === "public" ? publicKey : createPublicKey(publicKey);
  const der = key.export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex").slice(0, 16);
}

export function signPayload(payload, privateKey) {
  const signed = Buffer.from(JSON.stringify(payload), "utf8");
  const key = privateKey?.type === "private" ? privateKey : createPrivateKey(privateKey);
  return {
    keyId: keyIdForPublicKey(createPublicKey(key)),
    signed: signed.toString("base64"),
    signature: sign(null, signed, key).toString("base64"),
  };
}

export function verifyEnvelope(envelope, publicKey) {
  if (
    !envelope ||
    typeof envelope.keyId !== "string" ||
    typeof envelope.signed !== "string" ||
    typeof envelope.signature !== "string"
  ) {
    throw new Error("invalid signed pack envelope");
  }
  const expectedKeyId = keyIdForPublicKey(publicKey);
  if (envelope.keyId !== expectedKeyId) {
    throw new Error(`unknown pack signing key ${envelope.keyId}`);
  }
  const signed = Buffer.from(envelope.signed, "base64");
  const signature = Buffer.from(envelope.signature, "base64");
  const key = publicKey?.type === "public" ? publicKey : createPublicKey(publicKey);
  if (!verify(null, signed, key, signature)) {
    throw new Error("invalid pack signature");
  }
  return JSON.parse(signed.toString("utf8"));
}

/**
 * GET a signed pack index and verify it. Throws on network failure,
 * non-2xx status, or a bad envelope; callers decide the fallback.
 */
export async function fetchSignedIndex(url, key, { timeoutMs = 10_000 } = {}) {
  const response = await fetch(url, {
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`GET ${url} -> ${response.status}`);
  }
  return verifyEnvelope(await response.json(), key);
}

export function mergePayload(remote, local) {
  if (!local?.packVersion || !local?.targets || typeof local.targets !== "object") {
    throw new Error("local pack payload is incomplete");
  }
  if (!remote) return structuredClone(local);
  for (const field of ["packVersion", "minApp", "dsh", "node", "plugins"]) {
    if (JSON.stringify(remote[field] ?? null) !== JSON.stringify(local[field] ?? null)) {
      throw new Error(`pack metadata mismatch: ${field}`);
    }
  }
  return {
    ...remote,
    ...local,
    targets: { ...remote.targets, ...local.targets },
  };
}

function metadataMatches(left, right) {
  return ["minApp", "dsh", "node", "plugins"].every(
    (field) => JSON.stringify(left?.[field] ?? null) === JSON.stringify(right?.[field] ?? null),
  );
}

export function planPackRelease(existing, metadata, target, now = new Date()) {
  if (
    existing &&
    !Object.hasOwn(existing.targets ?? {}, target) &&
    metadataMatches(existing, metadata)
  ) {
    return {
      packVersion: existing.packVersion,
      targets: structuredClone(existing.targets),
    };
  }
  return {
    packVersion: nextPackVersion(now, existing?.packVersion),
    targets: {},
  };
}

export function selectPublishedPayload(remote, local) {
  if (!remote) return structuredClone(local);
  if (local.packVersion === remote.packVersion) {
    return mergePayload(remote, local);
  }
  if (local.packVersion > remote.packVersion) {
    return structuredClone(local);
  }
  throw new Error(
    `local packVersion ${local.packVersion} is older than remote ${remote.packVersion}`,
  );
}

export function nextPackVersion(now = new Date(), previous) {
  const compact = (date) =>
    date.toISOString().replace(/[-:]/g, "").replace(".", "").replace("Z", "Z");
  let candidate = compact(now);
  if (previous && candidate <= previous) {
    const match = /^(\d{8}T\d{6})(\d{3})Z$/.exec(previous);
    if (!match) throw new Error(`invalid previous packVersion ${previous}`);
    const nextMillis = Number(match[2]) + 1;
    if (nextMillis <= 999) {
      candidate = `${match[1]}${String(nextMillis).padStart(3, "0")}Z`;
    } else {
      const parsed = new Date(
        `${previous.slice(0, 4)}-${previous.slice(4, 6)}-${previous.slice(6, 8)}T` +
          `${previous.slice(9, 11)}:${previous.slice(11, 13)}:${previous.slice(13, 15)}.` +
          `${previous.slice(15, 18)}Z`,
      );
      candidate = compact(new Date(parsed.getTime() + 1));
    }
  }
  return candidate;
}
