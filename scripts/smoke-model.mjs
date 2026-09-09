import assert from 'node:assert/strict';

/** Opt-in real-model check; uses the open sandbox SPA and never sends an IM message. */
export async function smokeModel(page, _origin) {
  const composer = page.locator("[data-composer-card] [contenteditable='true'], [data-composer-card] textarea").first();
  await composer.waitFor({ state: "visible" });
  await composer.click();
  const prompt = "Do not use tools or write files. Reply with exactly CR_SMOKE_OK.";
  await composer.fill(prompt);
  const send = page.getByRole("button", { name: /^(发送|Send)$/ }).or(page.locator("[data-composer-card] button[type=submit]")).first();
  if (await send.isVisible().catch(() => false)) await send.click();
  else await page.keyboard.press("Enter");
  await page.getByText("CR_SMOKE_OK", { exact: false }).waitFor({ timeout: 90_000 });
  assert.ok(true);
  console.log("live model smoke: composer prompt received CR_SMOKE_OK");
}
