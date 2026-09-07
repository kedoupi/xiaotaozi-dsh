export type MutateErrorCode =
  | "allow-builds-blocked"
  | "missing-entry"
  | "timed-out"
  | "refused-spec"
  | "runtime-unavailable"
  | "process-failed"
  | "mutation-failed";

const CREDENTIAL = /(?:\/\/|@)[^/\s]*:[^@/\s]+@/gu;
const QUERY_SECRET = /([?&](?:token|access_token|auth|key|password|secret)=)[^&\s]+/giu;

export function redactSecrets(text: string): string {
  return text.replace(CREDENTIAL, (match) => match.endsWith("@") ? "//redacted@" : match).replace(QUERY_SECRET, "$1redacted");
}

export function captureTail(text: string, max = 800): string {
  const compact = redactSecrets(text).replace(/\r\n/g, "\n").trim();
  if (compact.length <= max) return compact;
  return compact.slice(-max).trim();
}

export function classifyMutateError(text: string): MutateErrorCode {
  if (/ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED|allowBuilds|git-hosted plugins build on install|未允许其构建脚本/i.test(text)) {
    return "allow-builds-blocked";
  }
  if (/no loadable entry|missing lib\/|install rolled back|没有可加载入口|当前不可装/i.test(text)) {
    return "missing-entry";
  }
  if (/\btimed out\b|安装超时/i.test(text)) return "timed-out";
  if (/refused (?:local spec|externals path)|拒绝(?:本地|externals)/i.test(text)) return "refused-spec";
  if (/pinned DSH runtime unavailable|运行时不可用/i.test(text)) return "runtime-unavailable";
  if (/dsh plugin process failed|无法启动 dsh plugin/i.test(text)) return "process-failed";
  return "mutation-failed";
}

function knownChinese(code: MutateErrorCode, text: string): string | undefined {
  if (code === "allow-builds-blocked") {
    return "上游 Git 插件需要在安装时编译，但 pnpm 未允许其构建脚本（allowBuilds）。已尝试写入当前 Web profile 后重试仍失败。请检查 profile 的 pnpm-workspace.yaml 后重试。";
  }
  if (code === "missing-entry") {
    const missing = /missing ([^);]+)/i.exec(text)?.[1]?.trim();
    const entry = missing === undefined || missing === "" ? "lib/index.js" : missing;
    return `上游插件没有可加载入口（缺少 ${entry}），已回滚安装。该规格未发布构建产物，当前不可装。`;
  }
  if (code === "timed-out") return "安装超时，请稍后重试。";
  if (code === "refused-spec") {
    return /externals/i.test(text) ? "拒绝 externals 安装规格。" : "拒绝本地安装规格。";
  }
  if (code === "runtime-unavailable") return "当前 Host 的 pinned DSH 运行时不可用，无法安装插件。";
  if (code === "process-failed") return "无法启动 dsh plugin 进程。";
  return undefined;
}

/** User-facing Chinese reason. Never returns a bare `mutation-failed`. Idempotent. */
export function explainMutateError(text: string): string {
  const raw = typeof text === "string" ? text : "";
  if (/^(?:上游|拒绝|无法启动|当前 Host|插件操作失败：|安装超时)/u.test(raw.trim())) return raw.trim();
  const code = classifyMutateError(raw);
  const known = knownChinese(code, raw);
  if (known !== undefined) return known;
  const tail = captureTail(raw);
  if (tail === "") return "插件操作失败：dsh plugin 未返回原因。";
  if (/^dsh plugin (?:install|remove|add) failed$/i.test(tail)) {
    return "插件操作失败：dsh plugin 未返回具体原因。";
  }
  return `插件操作失败：${tail}`;
}
