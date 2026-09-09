import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NoticeDialog } from "../src/client/NoticeDialog.tsx";
import { css } from "../src/client/styles.ts";
import {
  dismissNotice,
  DISMISSED_STORAGE_KEY,
  LEGACY_DISMISSED_STORAGE_KEY,
  nextNotice,
  NOTICES,
  readDismissed,
  type Notice,
} from "../src/notices.ts";

function memory(): Pick<Storage, "getItem" | "setItem"> {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

const extra: Notice = {
  id: "promo",
  kind: "notice",
  zh: { title: "通知", body: "内容", confirm: "确定" },
  en: { title: "Notice", body: "Body", confirm: "OK" },
};

describe("notice queue", () => {
  it("lets the heading carry the welcome without a kicker", () => {
    const notice = NOTICES[0];
    expect(notice).toBeDefined();
    expect(notice?.zh).not.toHaveProperty("kicker");
    expect(notice?.en).not.toHaveProperty("kicker");
    expect(css).not.toContain("dshH-kicker");
    const markup = renderToStaticMarkup(
      createElement(NoticeDialog, {
        notice: notice!,
        copy: notice!.zh,
        onConfirm: () => {},
      }),
    );
    expect(markup).toContain(notice!.zh.title);
    expect(markup).toContain(notice!.zh.confirm);
    expect(markup).not.toContain("dshH-kicker");
    expect(markup).not.toContain(">欢迎<");
  });

  it("keeps the welcome card a flat dialog with a capsule primary", () => {
    const card = css.slice(css.indexOf(".dshH-card {"), css.indexOf(".dshH-mark {"));
    const confirm = css.slice(css.indexOf(".dshH-confirm {"), css.indexOf(".dshH-confirm:hover"));
    expect(card).toContain("border-radius: 24px");
    expect(card).toContain("background: var(--dshH-surface)");
    expect(card).not.toContain("linear-gradient");
    expect(css.slice(css.indexOf(".dshH-mark {"), css.indexOf(".dshH-title {"))).not.toContain("box-shadow");
    expect(confirm).toContain("border-radius: var(--xtz-radius-pill");
    expect(confirm).toContain("min-height: 40px");
  });

  it("returns the first undismissed notice", () => {
    expect(nextNotice(NOTICES, [])?.id).toBe("xiaotaozi-welcome");
    expect(nextNotice(NOTICES, ["xiaotaozi-welcome"])).toBeUndefined();
  });

  it("advances after confirm", () => {
    const storage = memory();
    const queue = [...NOTICES, extra];
    expect(nextNotice(queue, readDismissed(storage))?.id).toBe("xiaotaozi-welcome");
    dismissNotice(storage, "xiaotaozi-welcome");
    expect(nextNotice(queue, readDismissed(storage))?.id).toBe("promo");
    dismissNotice(storage, "promo");
    expect(nextNotice(queue, readDismissed(storage))).toBeUndefined();
    expect(storage.getItem(DISMISSED_STORAGE_KEY)).toContain("promo");
  });

  it("reads dismissed ids from the hello storage key", () => {
    const storage = memory();
    storage.setItem(LEGACY_DISMISSED_STORAGE_KEY, JSON.stringify(["xiaotaozi-welcome"]));
    expect(readDismissed(storage)).toEqual(["xiaotaozi-welcome"]);
  });
});
