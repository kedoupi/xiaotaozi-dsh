import { describe, expect, it } from "vitest";
import {
  captureTail,
  classifyMutateError,
  explainMutateError,
  redactSecrets,
} from "../src/mutate-error.ts";

describe("explainMutateError", () => {
  it("never converts rollback failure into rollback success", () => {
    for (const reason of [
      "Client waits for uiConversation",
      "missing lib/index.js",
      "上游插件没有可加载入口",
    ]) {
      const text = explainMutateError(`${reason}; rollback failed (EACCES)`);
      expect(text).toMatch(/回滚失败/);
      expect(text).not.toContain("已回滚安装");
      expect(text).toContain("EACCES");
    }
  });
  it.each(["rollback failed (EACCES)", "rollback not attempted"])(
    "keeps %s redacted, bounded and idempotent",
    (fact) => {
      for (const padding of ["", "x".repeat(2000)]) {
        const once = explainMutateError(
          `已回滚安装; ${padding}; https://user:secret@example.test/?token=secret; ${fact}`,
        );
        expect(once).not.toContain("已回滚安装");
        expect(once).not.toContain("secret");
        expect(once.length).toBeLessThan(850);
        expect(explainMutateError(once)).toBe(once);
      }
    },
  );
  it("recognizes unresolved native build authorization without claiming a retry", () => {
    const raw =
      "Ignored build scripts: better-sqlite3. set this to true or false";
    expect(classifyMutateError(raw)).toBe("allow-builds-blocked");
    expect(explainMutateError(raw)).not.toContain("已尝试写入");
    expect(explainMutateError(raw)).toContain("未更改");
  });
  it("does not claim rollback from a loadability reason alone", () => {
    expect(explainMutateError("Client waits for uiConversation")).not.toContain(
      "已回滚安装",
    );
    expect(explainMutateError("missing lib/index.js")).not.toContain(
      "已回滚安装",
    );
  });
  it("maps allowBuilds / missing entry / timeout to Chinese and keeps the real reason", () => {
    const allow = explainMutateError(
      `[ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED] Failed to prepare git-hosted package fetched from "https://codeload.github.com/bowenliang123/dsh-context/tar.gz/abc"\nThe git-hosted package "dsh-context@0.44.0" needs to execute build scripts but is not in the "allowBuilds" allowlist.`,
    );
    expect(allow).toContain("allowBuilds");
    expect(allow).toContain("pnpm");
    expect(allow).not.toBe("mutation-failed");
    expect(classifyMutateError(allow)).toBe("allow-builds-blocked");

    const missing = explainMutateError(
      "plugin has no loadable entry (missing lib/index.js); install rolled back",
    );
    expect(missing).toContain("缺少 lib/index.js");
    expect(missing).toContain("当前不可装");
    expect(classifyMutateError(missing)).toBe("missing-entry");

    const clientBoot = explainMutateError(
      "Client waits for uiConversation (would hang Web boot); install rolled back",
    );
    expect(clientBoot).toContain("uiConversation");
    expect(clientBoot).toContain("已回滚安装");
    expect(classifyMutateError(clientBoot)).toBe("client-boot-blocked");

    expect(explainMutateError("install timed out")).toBe(
      "安装超时，请稍后重试。",
    );
    expect(explainMutateError("dsh plugin install failed")).toBe(
      "插件操作失败：dsh plugin 未返回具体原因。",
    );
  });

  it("keeps a unique stderr tail on unknown failures and is idempotent", () => {
    const once = explainMutateError(
      "pnpm failed in profile directory /tmp/web\nENOENT: no such file",
    );
    expect(once).toContain("ENOENT: no such file");
    expect(once.startsWith("插件操作失败：")).toBe(true);
    expect(explainMutateError(once)).toBe(once);
    expect(
      redactSecrets("https://user:secret@github.com/x.git?token=abc"),
    ).not.toContain("secret");
    expect(captureTail("x".repeat(2000)).length).toBeLessThanOrEqual(800);
  });
});
