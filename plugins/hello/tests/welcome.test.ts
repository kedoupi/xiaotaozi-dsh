import { describe, expect, it } from "vitest";
import { dismissNotice, DISMISSED_STORAGE_KEY, nextNotice, NOTICES, readDismissed, type Notice } from "../src/notices.ts";

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
});
