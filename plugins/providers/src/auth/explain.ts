/** Map any login/refresh failure to a short Chinese sentence for the Settings page. */

const CANCELLED = "已取消登录";
const BUSY = "正在登录中，请稍等或先点取消";
const TIMEOUT = "登录超时，请再点一次登录";
const UNAVAILABLE = "授权服务暂时不可用，请稍后再试";
const DENIED = "授权被拒绝，请重新登录";
const EXPIRED = "登录已失效，请重新点登录";
const PASTE = "没有识别到授权信息，请重新粘贴";
const MISMATCH = "这次登录已经失效，请重新点登录";
const GENERIC = "授权没有完成，请再试一次";
const SAVE = "没能保存，请再试一次。";
const REACH = "暂时连不上本机服务。";
const ENV_LOCKED = "这个密钥来自启动环境，没法在这里更换或清除。";

function errorText(error: unknown): string {
  return [error instanceof Error ? error.message : String(error), error instanceof Error && error.cause instanceof Error ? error.cause.message : ""]
    .filter((part) => part.length > 0)
    .join(" ");
}

export function isLoginCancelled(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return text === "login cancelled" || text.includes("已取消登录") || text.includes("已取消");
}

function chineseOnly(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text) && !/[A-Za-z]/.test(text);
}

export function explainAuthError(error: unknown): string {
  const text = errorText(error);
  const lower = text.toLowerCase();

  if (lower.includes("login cancelled") || text.includes("已取消")) return CANCELLED;
  if (lower.includes("already in progress") || lower.includes("already finished")) return BUSY;
  if (lower.includes("timed out") || lower.includes("timeout")) return TIMEOUT;
  if (lower.includes("no authorization code") || lower.includes("missing authorization")) return PASTE;
  if (lower.includes("state mismatch")) return MISMATCH;
  if (lower.includes("invalid_grant") || lower.includes("revoked") || lower.includes("expired")) return EXPIRED;

  if (/\b(401|403)\b/.test(text) || lower.includes("access denied") || lower.includes("unauthorized")) return DENIED;
  if (/\b(502|503|504|408|429)\b/.test(text) || lower.includes("gateway") || lower.includes("unavailable") || lower.includes("slow_down")) {
    return UNAVAILABLE;
  }
  if (/\b5\d\d\b/.test(text)) return UNAVAILABLE;

  if (chineseOnly(text)) return text;
  return GENERIC;
}

/** Settings / credential / host RPC failures. Never pass English or status codes through. */
export function explainHostError(error: unknown): string {
  const text = errorText(error);
  const lower = text.toLowerCase();
  if (
    lower.includes("login")
    || lower.includes("oauth")
    || lower.includes("authorize")
    || lower.includes("grant")
    || lower.includes("device")
  ) {
    return explainAuthError(error);
  }
  if (chineseOnly(text)) return text;
  if (lower.includes("launching environment") || lower.includes("shadowed") || lower.includes("read-only")) {
    return ENV_LOCKED;
  }
  if (lower.includes("econn") || lower.includes("network") || lower.includes("fetch failed") || lower.includes("unavailable")) {
    return REACH;
  }
  return SAVE;
}
