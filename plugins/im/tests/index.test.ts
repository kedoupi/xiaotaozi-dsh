import { expect, it } from "vitest";
import { createImHostPlugin, name } from "../src/index.ts";

it("exports the plugin name", () => {
  expect(name).toBe("im");
});

it("traces mounted channels", async () => {
  const chunks: string[] = [];
  const write = (chunk: string | Uint8Array) => {
    chunks.push(String(chunk));
    return true;
  };
  const stdout = process.stdout.write.bind(process.stdout);
  process.stdout.write = write as typeof process.stdout.write;
  const previous = process.env.DSH_PLUGIN_TRACE;
  process.env.DSH_PLUGIN_TRACE = "1";
  const noop = async () => {};
  try {
    await createImHostPlugin({
      applyFeishu: noop,
      applyWeixin: noop,
      applyDingtalk: noop,
      applyWecom: noop,
      applyQq: noop,
      applySlack: noop,
      applyTelegram: noop,
      applyDiscord: noop,
      applyWhatsapp: noop,
      applyOffice: noop,
    }).apply({} as never, { officeEnabled: true });
  } finally {
    process.stdout.write = stdout;
    if (previous === undefined) delete process.env.DSH_PLUGIN_TRACE;
    else process.env.DSH_PLUGIN_TRACE = previous;
  }
  expect(chunks.join("")).toMatch(/\[dsh-im\] mounted channels=feishu,weixin,dingtalk,wecom,qq,slack,telegram,discord,whatsapp,office/);
});
