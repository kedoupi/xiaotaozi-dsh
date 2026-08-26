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

it("reserves an OAuth provider before listening and rejects a concurrent start", async () => {
  const flows = new OAuthFlowManager();
  const starting = flows.start("grok", SPEC);

  expect(flows.pending("grok")).toBeDefined();
  await expect(flows.start("grok", SPEC)).rejects.toThrow("正在登录中");

  const attempt = await starting;
  expect(flows.pending("grok")).toBe(attempt);
  attempt.cancel();
  await expect(attempt.waitCode()).rejects.toThrow("已取消登录");
});

it("cancels OAuth setup in progress without letting its pasted callback clear a replacement", async () => {
  const flows = new OAuthFlowManager();
  const starting = flows.start("grok", SPEC);
  const first = flows.pending("grok");
  expect(first).toBeDefined();
  const firstCode = first!.waitCode().catch((error: unknown) => error);

  first!.cancel();
  await expect(starting).rejects.toThrow("已取消登录");
  expect((await firstCode as Error).message).toBe("已取消登录");

  const replacement = await flows.start("grok", SPEC);
  expect(() => first!.manual(`${first!.redirectUri}?code=stale&state=${first!.state}`)).toThrow("已经失效");
  expect(flows.pending("grok")).toBe(replacement);

  const replacementCode = replacement.waitCode();
  replacement.manual(`${replacement.redirectUri}?code=fresh&state=${replacement.state}`);
  await expect(replacementCode).resolves.toBe("fresh");
});

it("accepts the current OAuth callback and releases the provider slot", async () => {
  const flows = new OAuthFlowManager();
  const attempt = await flows.start("grok", SPEC);
  const code = attempt.waitCode();

  const response = await fetch(`${attempt.redirectUri}?code=from-browser&state=${attempt.state}`);
  expect(response.status).toBe(200);
  await expect(code).resolves.toBe("from-browser");
  expect(flows.isBusy("grok")).toBe(false);

  const replacement = await flows.start("grok", SPEC);
  expect(attempt.isLatest()).toBe(false);
  expect(replacement.isLatest()).toBe(true);
  replacement.cancel();
  await expect(replacement.waitCode()).rejects.toThrow("已取消登录");
});

it("reserves a device provider before async headers and ignores the cancelled generation", async () => {
  let releaseHeaders!: (headers: Record<string, string>) => void;
  const delayedHeaders = new Promise<Record<string, string>>((resolve) => {
    releaseHeaders = resolve;
  });
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({
      device_code: "dc-new",
      user_code: "NEW-1234",
      verification_uri: "https://example.com/device",
      interval: 2,
      expires_in: 300,
    }), { status: 200, headers: { "content-type": "application/json" } })));

  const delayedSpec: DeviceFlowSpec = {
    clientId: "cid",
    deviceUrl: "https://example.com/device/code",
    tokenUrl: "https://example.com/token",
    defaultVerificationUri: "https://example.com",
    pkce: false,
    headers: () => delayedHeaders,
  };
  const immediateSpec: DeviceFlowSpec = { ...delayedSpec, headers: undefined };
  const devices = new DeviceFlowManager();
  const starting = devices.start("qwen", delayedSpec);
  const first = devices.pending("qwen");
  expect(first).toBeDefined();
  const firstSession = first!.waitSession().catch((error: unknown) => error);

  await expect(devices.start("qwen", immediateSpec)).rejects.toThrow("正在登录中");
  first!.cancel();
  const replacement = await devices.start("qwen", immediateSpec);
  releaseHeaders({});

  await expect(starting).rejects.toThrow("已取消登录");
  expect((await firstSession as Error).message).toBe("已取消登录");
  expect(devices.pending("qwen")).toBe(replacement);
  expect(replacement.userCode).toBe("NEW-1234");
  expect(first!.isLatest()).toBe(false);
  expect(replacement.isLatest()).toBe(true);

  replacement.cancel();
  await expect(replacement.waitSession()).rejects.toThrow("已取消登录");
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
