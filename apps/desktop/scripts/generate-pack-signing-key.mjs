#!/usr/bin/env node
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { keyIdForPublicKey } from "./pack-signing.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const privateDir = join(root, ".pack-signing");
const publicDir = join(root, "src-tauri", "keys");
const privatePath = join(privateDir, "pack-signing-key.pem");
const publicPath = join(publicDir, "pack-signing-key.der");
if (existsSync(privatePath) || existsSync(publicPath)) {
  throw new Error("pack signing key already exists; refusing to rotate it implicitly");
}
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privatePem = privateKey.export({ type: "pkcs8", format: "pem" });
const publicDer = publicKey.export({ type: "spki", format: "der" });

mkdirSync(privateDir, { recursive: true, mode: 0o700 });
mkdirSync(publicDir, { recursive: true });
writeFileSync(privatePath, privatePem, { mode: 0o600 });
writeFileSync(publicPath, publicDer);
process.stdout.write(`generated Ed25519 key ${keyIdForPublicKey(publicKey)}\n`);
