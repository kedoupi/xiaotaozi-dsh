import { afterEach, expect, it, vi } from "vitest";
import { OAuthFlowManager, type FlowSpec } from "../src/auth/oauth-flow.ts";
import { DeviceFlowManager, type DeviceFlowSpec } from "../src/auth/device-flow.ts";

const SPEC: FlowSpec = {
  callbackPath: "/callback",
  listen: { host: "127.0.0.1", ports: [0] },
  buildAuthorizeUrl: ({ redirectUri, state }) =>
    `https://example.com/oauth2/authorize?response_type=code&client_id=test&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

it("cancelAll settles every pending OAuth attempt and closes its callback server", async () => {
  const flows = new OAuthFlowManager();
  const first = await flows.start("grok", SPEC);
  const second = await flows.start("codex", SPEC);
  expect(flows.isBusy("grok")).toBe(true);
  expect(flows.isBusy("codex")).toBe(true);

  const results = Promise.allSettled([first.waitCode(), second.waitCode()]);
  flows.cancelAll();

  for (const outcome of await results) {
    expect(outcome.status).toBe("rejected");
    expect((outcome as PromiseRejectedResult).reason).toBeInstanceOf(Error);
    expect(((outcome as PromiseRejectedResult).reason as Error).message).toBe("已取消登录");
  }
  expect(flows.isBusy("grok")).toBe(false);
  expect(flows.isBusy("codex")).toBe(false);
  // The loopback server must be gone: the redirect URI now refuses connections.
  await expect(fetch(first.redirectUri)).rejects.toThrow();
});

it("cancelAll settles every pending device attempt", async () => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({
      device_code: "dc",
      user_code: "UC-1234",
      verification_uri: "https://example.com/device",
      interval: 2,
      expires_in: 300,
    }), { status: 200, headers: { "content-type": "application/json" } })));

  const spec: DeviceFlowSpec = {
    clientId: "cid",
    deviceUrl: "https://example.com/device/code",
    tokenUrl: "https://example.com/token",
    defaultVerificationUri: "https://example.com",
    pkce: true,
  };
  const devices = new DeviceFlowManager();
  const attempt = await devices.start("qwen", spec);
  expect(devices.isBusy("qwen")).toBe(true);

  const settled = attempt.waitSession().catch((error: unknown) => error);
  devices.cancelAll();
  const reason = await settled;
  expect(reason).toBeInstanceOf(Error);
  expect((reason as Error).message).toBe("已取消登录");
  expect(devices.isBusy("qwen")).toBe(false);
});
