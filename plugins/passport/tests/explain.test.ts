import { describe, expect, it } from "vitest";
import { explainAuthError, explainHostError } from "../src/auth/explain.ts";

describe("explainAuthError", () => {
  it("hides english and status codes", () => {
    expect(explainAuthError(new Error("qwen login failed: 504"))).toBe("授权服务暂时不可用，请稍后再试");
    expect(explainAuthError(new Error("HTTP 502 Bad Gateway"))).toBe("授权服务暂时不可用，请稍后再试");
    expect(explainAuthError("login cancelled")).toBe("已取消登录");
    expect(explainAuthError("login timed out")).toBe("登录超时，请再点一次登录");
    expect(explainAuthError("invalid_grant")).toBe("登录已失效，请重新点登录");
  });

  it("does not pass through provider english", () => {
    expect(explainAuthError("internal server error")).toBe("授权没有完成，请再试一次");
  });
});

describe("explainHostError", () => {
  it("hides host english from the settings page", () => {
    expect(explainHostError(new Error("settings mutate failed: revision conflict"))).toBe("没能保存，请再试一次。");
    expect(explainHostError("ECONNREFUSED 127.0.0.1:3080")).toBe("暂时连不上本机服务。");
    expect(explainHostError("login timed out")).toBe("登录超时，请再点一次登录");
    expect(explainHostError(
      'credentials-local: "TZAI_API_KEY" is supplied read-only by the launching environment, so unset would be shadowed',
    )).toBe("这个密钥来自启动环境，没法在这里更换或清除。");
  });
});
