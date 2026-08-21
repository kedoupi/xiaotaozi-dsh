import { describe, expect, it } from "vitest";
import { isKimiPermanentRefreshError } from "../src/providers/kimi.ts";

describe("isKimiPermanentRefreshError", () => {
  it("treats expired grants as logout and rate limits as transient", () => {
    expect(isKimiPermanentRefreshError(new Error("登录已失效，请重新点登录"))).toBe(true);
    expect(isKimiPermanentRefreshError(new Error("invalid_grant"))).toBe(true);
    expect(isKimiPermanentRefreshError(new Error("授权服务暂时不可用，请稍后再试"))).toBe(false);
    expect(isKimiPermanentRefreshError(new Error("授权没有完成，请再试一次"))).toBe(false);
  });
});
