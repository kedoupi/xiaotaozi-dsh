import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

/** Uses only the disposable sandbox started by smoke-sandbox; no personal browser profile. */
export async function smokeBrowser(home, { channel = process.env.DSH_SMOKE_BROWSER_CHANNEL, output = process.env.DSH_SMOKE_SCREENSHOTS } = {}) {
  const browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
  let page;
  try {
    const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 1000 } });
    page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && /plugin.*(fail|error)|without inject|TypeError/i.test(message.text())) failures.push(message.text());
    });
    const auth = JSON.parse(await readFile(join(home, 'xiaotaozi-xtz-web.auth'), 'utf8'));
    const url = new URL(auth.url);
    assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '3081');
    // Never include the authenticated URL in logs or failure reports.
    await page.goto(url.href).catch(() => { throw new Error('Sandbox browser navigation failed'); });
    const confirm = page.locator('.dshH-confirm');
    await Promise.race([confirm.waitFor(), page.locator('[data-dsh-market-entry]').waitFor()]);
    if (await confirm.isVisible()) {
      await confirm.click();
      await confirm.waitFor({ state: 'hidden' });
    }
    const internalNotice = page.getByRole('dialog').filter({ hasText: /内测声明|Internal Testing Notice/ });
    await internalNotice.getByRole('button', { name: /^(继续|Continue)$/ }).click();
    const onboarding = page.getByRole('dialog').filter({ hasText: /添加一个 API Key|Add an API key/ });
    await onboarding.waitFor({ timeout: 3000 }).catch(error => { if (error.name !== 'TimeoutError') throw error; });
    if (await onboarding.isVisible()) await onboarding.getByRole('button', { name: /稍后配置|Configure later/ }).click();
    const center = page.locator('#dsh-plugin-center');
    const dismissCenter = async () => {
      if (!await center.isVisible()) return;
      // Heading close calls onClose. Escape is ignored while a <dialog> holds focus
      // (welcome uses showModal), so do not rely on the key.
      await center.locator('.dsh-market-center-close').click();
      await center.waitFor({ state: 'hidden' });
    };
    const waitModels = async () => {
      await center.locator('.dshM-wrap').waitFor();
      await center.locator('.dshM-empty[aria-busy="true"]').waitFor({ state: 'hidden' });
      assert.equal(await center.locator('.dshM-errorRow').count(), 0, 'Model settings failed to load');
      await center.locator('.dshM-item, .dshM-navNote').first().waitFor();
    };
    // Welcome confirm opens Plugin Center on 模型; start the inventory walk from a closed center.
    await dismissCenter();
    await page.locator('[data-dsh-market-entry]').click();
    await center.waitFor();
    for (const capability of ['xiaotaozi', 'side-workbench', 'models', 'im']) {
      await center.locator(`[data-capability="${capability}"]`).click();
      if (capability === 'models') await waitModels();
      assert.equal(await center.locator('.dsh-market-unavailable').count(), 0, `${capability} detail is unavailable`);
      await center.locator('.dsh-market-back').click();
    }
    await center.locator('[data-retry="inventory"]').click();
    await page.waitForFunction(() => !document.querySelector('[data-retry="inventory"]')?.disabled);
    assert.equal(await center.getByText('无法读取插件运行状态，请重试。', { exact: false }).count(), 0);
    for (const width of [1440, 1024, 768, 375]) {
      for (const colorScheme of ['light', 'dark']) {
        await page.setViewportSize({ width, height: 1000 }); await page.emulateMedia({ colorScheme });
        // Real hit testing: force is forbidden; controls must remain operable at narrow sizes.
        await center.locator('[data-capability="models"]').click();
        await waitModels();
        if (output) { await mkdir(output, { recursive: true }); await page.screenshot({ path: join(output, `models-${width}-${colorScheme}.png`) }); }
        await center.locator('.dsh-market-back').click();
        const box = await center.boundingBox();
        assert.ok(box && box.x >= -1 && box.x + box.width <= width + 1, `Plugin Center overflows at ${width}`);
        if (output) { await mkdir(output, { recursive: true }); await page.screenshot({ path: join(output, `center-${width}-${colorScheme}.png`) }); }
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await dismissCenter();
    await page.getByRole('button', { name: /^(设置|Settings)$/ }).click();
    const advanced = page.getByRole('button', { name: /^(高级|Advanced)$/ });
    // First Settings visit may close the dialog and open Plugin Center models.
    await Promise.race([advanced.waitFor(), center.locator('.dshM-wrap').waitFor()]);
    if (!await advanced.isVisible()) {
      await dismissCenter();
      await page.getByRole('button', { name: /^(设置|Settings)$/ }).click();
      await advanced.waitFor();
    }
    await advanced.click();
    await page.locator('.dshH-advanced').waitFor();
    await page.waitForFunction(() => {
      const input = document.querySelector('#web-search-deepseek-apiKey');
      const status = document.querySelector('#web-search-deepseek-apiKey-state');
      return input && (!input.disabled || status?.textContent?.includes('只读'));
    });
    assert.equal(await page.getByText('无法读取密钥状态', { exact: false }).count(), 0);
    assert.equal(await page.getByText('Plugin load failed', { exact: false }).count(), 0);
    assert.deepEqual(failures, [], 'Client runtime errors');
    if (process.env.DSH_SMOKE_MODEL === '1') {
      const { smokeModel } = await import('./smoke-model.mjs');
      await smokeModel(page, url.origin);
    }
    console.log('browser smoke: four built-in details, inventory refresh, Advanced credentials and 8 viewport/theme checks passed');
  } catch (error) {
    if (output && page) {
      await mkdir(output, { recursive: true });
      await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
    }
    throw error;
  } finally { await browser.close(); }
}
