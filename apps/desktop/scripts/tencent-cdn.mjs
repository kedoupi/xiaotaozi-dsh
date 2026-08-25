/**
 * Tencent Cloud CDN URL purge (PurgeUrlsCache).
 * Same API the xiaotaozi content-takedown plan named; that repo never
 * shipped a caller. Plugin packs need it because latest.json is overwritten
 * in place and CDN will otherwise keep a 2-minute (or cached-404) copy.
 */
import { createHash, createHmac } from "node:crypto";

const CDN_HOST = "cdn.tencentcloudapi.com";
const CDN_SERVICE = "cdn";
const PURGE_ACTION = "PurgeUrlsCache";
const PURGE_VERSION = "2018-06-06";

function sha256Hex(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmacRaw(key, value) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function tc3Authorization({ secretId, secretKey, action, payload, timestamp }) {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const hashedPayload = sha256Hex(payload);
  const canonicalHeaders =
    "content-type:application/json; charset=utf-8\n" +
    `host:${CDN_HOST}\n` +
    `x-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = "content-type;host;x-tc-action";
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    hashedPayload,
  ].join("\n");
  const credentialScope = `${date}/${CDN_SERVICE}/tc3_request`;
  const stringToSign = [
    "TC3-HMAC-SHA256",
    String(timestamp),
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const secretDate = hmacRaw(`TC3${secretKey}`, date);
  const secretService = hmacRaw(secretDate, CDN_SERVICE);
  const secretSigning = hmacRaw(secretService, "tc3_request");
  const signature = createHmac("sha256", secretSigning)
    .update(stringToSign, "utf8")
    .digest("hex");
  return `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

export async function tencentCdnRequest({ secretId, secretKey, action, version, payload }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify(payload);
  const authorization = tc3Authorization({
    secretId,
    secretKey,
    action,
    payload: body,
    timestamp,
  });
  const response = await fetch(`https://${CDN_HOST}/`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json; charset=utf-8",
      Host: CDN_HOST,
      "X-TC-Action": action,
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Version": version,
      "X-TC-Language": "zh-CN",
    },
    body,
  });
  const json = await response.json();
  const error = json?.Response?.Error;
  if (error) {
    throw new Error(`${error.Code}: ${error.Message}`);
  }
  return json.Response;
}

export async function purgeCdnUrls(urls, { secretId, secretKey } = {}) {
  const unique = [...new Set(urls.filter(Boolean))];
  if (unique.length === 0) {
    throw new Error("no CDN URLs to purge");
  }
  const id = secretId || process.env.TCB_SECRET_ID;
  const key = secretKey || process.env.TCB_SECRET_KEY;
  if (!id || !key) {
    throw new Error("TCB_SECRET_ID / TCB_SECRET_KEY required to purge CDN");
  }
  const result = await tencentCdnRequest({
    secretId: id,
    secretKey: key,
    action: PURGE_ACTION,
    version: PURGE_VERSION,
    payload: { Urls: unique, Area: "mainland" },
  });
  return { taskId: result.TaskId, requestId: result.RequestId, urls: unique };
}
