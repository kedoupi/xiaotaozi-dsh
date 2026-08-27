import { expect, it } from "vitest";
import { OfficeQrAuth, safeVerificationUrl } from "../src/qr-auth.ts";

it("rejects non-wecom verification URLs", () => {
  expect(safeVerificationUrl("https://evil.test/q")).toBeNull();
  expect(safeVerificationUrl("https://work.weixin.qq.com/ai/qc/ok")).toContain("work.weixin.qq.com");
});

it("starts and polls with fake fetch", async () => {
  const calls: string[] = [];
  const fetchImpl = async (input: URL | RequestInfo) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/generate")) {
      return new Response(JSON.stringify({
        data: { scode: "sc-1", auth_url: "https://work.weixin.qq.com/ai/qc/auth" },
      }), { status: 200 });
    }
    return new Response(JSON.stringify({
      data: { status: "success", bot_info: { botid: "bot-1", secret: "sec-1", name: "办公" } },
    }), { status: 200 });
  };
  const qr = new OfficeQrAuth({ fetch: fetchImpl as typeof fetch, clock: () => 1_000 });
  const started = await qr.start();
  expect(started.scode).toBe("sc-1");
  const polled = await qr.poll({ scode: started.scode });
  expect(polled).toMatchObject({ status: "success", remoteBotId: "bot-1", secret: "sec-1", name: "办公" });
  expect(calls[0]).toContain("source=dsh-wecom-office");
});

it("maps expired poll status", async () => {
  const qr = new OfficeQrAuth({
    fetch: (async () => new Response(JSON.stringify({ data: { status: "expired" } }), { status: 200 })) as typeof fetch,
  });
  await expect(qr.poll({ scode: "x" })).resolves.toEqual({ status: "expired" });
});
