import { describe, expect, it } from "vitest";
import {
  captureTail,
  classifyMutateError,
  explainMutateError,
  redactSecrets,
} from "../src/mutate-error.ts";

describe("explainMutateError", () => {
  it("maps allowBuilds / missing entry / timeout to Chinese and keeps the real reason", () => {
    const allow = explainMutateError(
      `[ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED] Failed to prepare git-hosted package fetched from "https://codeload.github.com/bowenliang123/dsh-context/tar.gz/abc"\nThe git-hosted package "dsh-context@0.44.0" needs to execute build scripts but is not in the "allowBuilds" allowlist.`,
    );
    expect(allow).toContain("allowBuilds");
    expect(allow).toContain("pnpm");
    expect(allow).not.toBe("mutation-failed");
    expect(classifyMutateError(allow)).toBe("allow-builds-blocked");

    const missing = explainMutateError("plugin has no loadable entry (missing lib/index.js); install rolled back");
    expect(missing).toContain("缺少 lib/index.js");
    expect(missing).toContain("当前不可装");
    expect(classifyMutateError(missing)).toBe("missing-entry");

    expect(explainMutateError("install timed out")).toBe("安装超时，请稍后重试。");
    expect(explainMutateError("dsh plugin install failed")).toBe("插件操作失败：dsh plugin 未返回具体原因。");
  });

  it("keeps a unique stderr tail on unknown failures and is idempotent", () => {
    const once = explainMutateError("pnpm failed in profile directory /tmp/web\nENOENT: no such file");
    expect(once).toContain("ENOENT: no such file");
    expect(once.startsWith("插件操作失败：")).toBe(true);
    expect(explainMutateError(once)).toBe(once);
    expect(redactSecrets("https://user:secret@github.com/x.git?token=abc")).not.toContain("secret");
    expect(captureTail("x".repeat(2000)).length).toBeLessThanOrEqual(800);
  });
});
