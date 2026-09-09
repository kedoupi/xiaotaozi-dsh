export type MutateErrorCode =
  | "allow-builds-blocked"
  | "missing-entry"
  | "client-boot-blocked"
  | "timed-out"
  | "refused-spec"
  | "runtime-unavailable"
  | "process-failed"
  | "mutation-failed";

const CREDENTIAL = /(?:\/\/|@)[^/\s]*:[^@/\s]+@/gu;
const QUERY_SECRET =
  /([?&](?:token|access_token|auth|key|password|secret)=)[^&\s]+/giu;

export function redactSecrets(text: string): string {
  return text
    .replace(CREDENTIAL, (match) =>
      match.endsWith("@") ? "//redacted@" : match,
    )
    .replace(QUERY_SECRET, "$1redacted");
}

export function captureTail(text: string, max = 800): string {
  const compact = redactSecrets(text).replace(/\r\n/g, "\n").trim();
  if (compact.length <= max) return compact;
  return compact.slice(-max).trim();
}

export function classifyMutateError(text: string): MutateErrorCode {
  if (
    /ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED|allowBuilds|Ignored build scripts|set this to true or false|git-hosted plugins build on install|未允许其构建脚本/i.test(
      text,
    )
  ) {
    return "allow-builds-blocked";
  }
  if (
    /uiConversation|会卡住(?:当前 )?Web 启动|would hang Web boot/i.test(text)
  ) {
    return "client-boot-blocked";
  }
  if (
    /no loadable entry|missing lib\/|install rolled back|没有可加载入口|当前不可装/i.test(
      text,
    )
  ) {
    return "missing-entry";
  }
  if (/\btimed out\b|安装超时/i.test(text)) return "timed-out";
  if (
    /refused (?:local spec|externals path)|拒绝(?:本地|externals)/i.test(text)
  )
    return "refused-spec";
  if (/pinned DSH runtime unavailable|运行时不可用/i.test(text))
    return "runtime-unavailable";
  if (/dsh plugin process failed|无法启动 dsh plugin/i.test(text))
    return "process-failed";
  return "mutation-failed";
}

function knownChinese(code: MutateErrorCode, text: string): string | undefined {
  if (code === "allow-builds-blocked") {
    return "上游插件或原生依赖的构建脚本被 pnpm 阻止，或授权尚未决定（allowBuilds）。未更改现有授权，也未自动重试；请先审查上游脚本及 profile 的 pnpm-workspace.yaml，保留明确拒绝。";
  }
  const rollback = /install rolled back|已回滚安装/i.test(text)
    ? "已回滚安装。"
    : "未确认回滚，请检查安装状态后修复。";
  if (code === "client-boot-blocked") {
    return `该插件的 Client 依赖 uiConversation，会卡住当前 Web 启动。${rollback}`;
  }
  if (code === "missing-entry") {
    const missing = /missing ([^);]+)/i.exec(text)?.[1]?.trim();
    const entry =
      missing === undefined || missing === "" ? "lib/index.js" : missing;
    return `上游插件没有可加载入口（缺少 ${entry}）。${rollback}当前不可装。`;
  }
  if (code === "timed-out") return "安装超时，请稍后重试。";
  if (code === "refused-spec") {
    return /externals/i.test(text)
      ? "拒绝 externals 安装规格。"
      : "拒绝本地安装规格。";
  }
  if (code === "runtime-unavailable")
    return "当前 Host 的 pinned DSH 运行时不可用，无法安装插件。";
  if (code === "process-failed") return "无法启动 dsh plugin 进程。";
  return undefined;
}

/** User-facing Chinese reason. Never returns a bare `mutation-failed`. Idempotent. */
export function explainMutateError(text: string): string {
  const raw = redactSecrets(typeof text === "string" ? text : "");
  // Lifecycle facts take precedence over reason classification and pretranslated copy.
  if (/rollback failed|回滚失败|rollback not attempted|未自动回滚/i.test(raw)) {
    const prefix = /rollback failed|回滚失败/i.test(raw)
      ? "插件操作失败：回滚失败；"
      : "插件操作失败：未自动回滚，保留当前状态供检查和修复；";
    const detail = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
    return (
      prefix +
      captureTail(
        detail
          .replaceAll("已回滚安装", "未确认回滚")
          .replace(/install rolled back/gi, "rollback unconfirmed"),
      )
    );
  }
  if (
    /^(?:上游|拒绝|无法启动|当前 Host|该插件|插件操作失败：|安装超时)/u.test(
      raw.trim(),
    )
  )
    return captureTail(raw);
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
