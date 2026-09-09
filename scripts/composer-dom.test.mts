import assert from "node:assert/strict";
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import ts from "typescript";

declare global {
  interface Window {
    fixtureModules: Record<string, object>;
    mountComposerFixture(): Promise<void>;
    checkComposerAdapters(): Promise<void>;
    stopComposerHint(): void;
    composerFixture: {
      select(current?: string, phase?: string, active?: boolean): void;
      hold(): void;
      release(): void;
      hmr(): Promise<void>;
      mode(mode: string): Promise<void>;
      disposeProvider(): Promise<void>;
      dispose(): Promise<void>;
    };
  }
}

const root = resolve(import.meta.dirname, "..");
function pinned(name: string, file: string): string {
  const graph = join(root, "apps/cli/node_modules/.pnpm");
  const matches = readdirSync(graph).filter((entry) =>
    entry.startsWith(`@deepseek-ai+${name}@0.1.2-rc.1`),
  );
  assert.equal(matches.length, 1, name);
  const path = realpathSync(
    join(graph, matches[0]!, "node_modules/@deepseek-ai", name, file),
  );
  assert.ok(path.startsWith(`${root}/`));
  return path;
}
const frontend = pinned("dsh-web-frontend", "dist/index.html");
const assets = resolve(frontend, "../assets");
const bundles = [
  "dsh-client-ui-renderer",
  "dsh-client-ui-session",
  "dsh-client-ui-conversation",
].map((name) => readFileSync(pinned(name, "lib/client.js"), "utf8"));
const provider = readFileSync(
  join(root, "plugins/providers/lib/client.js"),
  "utf8",
);
const fixture = readFileSync(
  join(root, "scripts/fixtures/composer-dom.js"),
  "utf8",
);
const adapters = readFileSync(
  join(root, "scripts/fixtures/composer-adapters.js"),
  "utf8",
);

// Page-routed rendered topology fixture, not authenticated DSH or live QA.
// Requires separately authorized process-level browser containment. Page routing,
// a temporary profile and background-network flags do NOT supply that boundary.
// R6's required browser gate remains BLOCKED until that prerequisite exists.
test("RC1 composer owns session chips and historical-only absence without touching dock siblings", {
  timeout: 90_000,
}, async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: process.platform === "darwin" ? "chrome" : undefined,
  });
  try {
    const context = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width: 1440, height: 1000 },
    });
    const blocked: string[] = [];
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (
        url.origin === "https://composer.fixture.invalid" &&
        url.pathname === "/"
      ) {
        await route.fulfill({
          contentType: "text/html",
          body: readFileSync(frontend),
        });
        return;
      }
      if (
        url.origin === "https://composer.fixture.invalid" &&
        /^\/assets\/[a-zA-Z0-9_.-]+$/.test(url.pathname)
      ) {
        const file = join(assets, url.pathname.slice("/assets/".length));
        await route.fulfill({
          contentType: file.endsWith(".css") ? "text/css" : "text/javascript",
          body: readFileSync(file),
        });
        return;
      }
      if (
        url.origin === "https://composer.fixture.invalid" &&
        ["/manifest.webmanifest", "/favicon.svg"].includes(url.pathname)
      ) {
        await route.fulfill({
          status: 200,
          contentType: url.pathname.endsWith("svg")
            ? "image/svg+xml"
            : "application/manifest+json",
          body: url.pathname.endsWith("svg")
            ? '<svg xmlns="http://www.w3.org/2000/svg"/>'
            : "{}",
        });
        return;
      }
      const helperFiles = [
        "plugins/xtz-ui/src/client/composer-hint.ts",
        "plugins/xtz-ui/src/client/composer-hint-controller.ts",
        "plugins/xtz-ui/src/client/hide-official.ts",
        "plugins/providers/src/client/historical-composer.ts",
      ];
      if (
        url.origin === "https://composer.fixture.invalid" &&
        helperFiles.includes(url.pathname.slice(1))
      ) {
        const body = ts.transpileModule(
          readFileSync(join(root, url.pathname.slice(1)), "utf8"),
          {
            compilerOptions: {
              target: ts.ScriptTarget.ES2022,
              module: ts.ModuleKind.ESNext,
            },
          },
        ).outputText;
        await route.fulfill({ contentType: "text/javascript", body });
        return;
      }
      // Never fall through to network.
      blocked.push(url.pathname);
      await route.abort();
    });
    await context.addInitScript(() => {
      // Capture the real frontend's builtin React/store/slots modules. The empty
      // boot roster does not load any transport; fixture assembly owns its Context.
      Object.assign(window, {
        fixtureModules: {},
        __ModuleLoader__: {
          create({ staticModules }: { staticModules: Record<string, object> }) {
            Object.assign(window.fixtureModules, staticModules);
            return { manifest: { plugins: [] } };
          },
          load({
            id,
            factory,
          }: {
            id: string;
            factory: (require: (id: string) => object) => object;
          }) {
            window.fixtureModules[id] = factory((name) => {
              const module = window.fixtureModules[name];
              if (module === undefined)
                throw new Error(`Missing offline module ${name}`);
              return module;
            });
          },
        },
        WebSocket: class {
          constructor() {
            throw new Error("Offline fixture forbids WebSocket");
          }
        },
      });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto("https://composer.fixture.invalid/");
    await page.waitForFunction(() => window.fixtureModules.react !== undefined);
    for (const content of [...bundles, provider, fixture])
      await page.addScriptTag({ content });
    await page.evaluate(() => window.mountComposerFixture());
    await page.evaluate(() => window.composerFixture.select("A"));
    const chip = page.locator("[data-dsh-providers-turn-model]");
    await chip.waitFor();
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(
        await chip.evaluate((node) => !!node.closest("[data-composer-card]")),
        true,
      );
      const card = await page.locator("[data-composer-card]").boundingBox();
      const box = await chip.boundingBox();
      assert.ok(
        card &&
          box &&
          box.x >= card.x &&
          box.x + box.width <= card.x + card.width + 1,
      );
      assert.equal(await page.locator("[data-fixture-todo]").isVisible(), true);
      assert.equal(
        await page.locator("[data-fixture-queue]").isVisible(),
        true,
      );
    }
    await page.evaluate(() =>
      window.composerFixture.select("B", "ready", true),
    );
    await page.waitForFunction(() =>
      document
        .querySelector("[data-dsh-providers-turn-model]")
        ?.textContent?.includes("Session B"),
    );
    assert.equal(
      await page
        .locator(
          '[data-phase="active"] [data-composer-card] [data-dsh-providers-turn-model]',
        )
        .count(),
      1,
    );
    await page.evaluate(() =>
      window.composerFixture.select("B", "loading", true),
    );
    await chip.waitFor({ state: "detached" });
    await page.evaluate(() =>
      window.composerFixture.select(undefined, "loading"),
    );
    await chip.waitFor({ state: "detached" });
    await page.evaluate(() => window.composerFixture.select(undefined));
    await page.waitForFunction(() =>
      document
        .querySelector("[data-dsh-providers-historical-composer]")
        ?.textContent?.includes("历史模型"),
    );
    assert.equal(await chip.count(), 1);
    assert.equal(
      await chip.evaluate((node) => !!node.closest("[data-composer-card]")),
      true,
    );
    const inert = page.locator("[data-composer-card] [contenteditable]");
    assert.equal(await inert.getAttribute("contenteditable"), "false");
    await inert.click();
    assert.equal(await inert.getAttribute("aria-expanded"), "true");
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const card = await page.locator("[data-composer-card]").boundingBox();
      const box = await chip.boundingBox();
      assert.ok(
        card &&
          box &&
          box.x >= card.x &&
          box.x + box.width <= card.x + card.width + 1,
      );
    }
    await page.addScriptTag({ content: adapters });
    await page.evaluate(() => window.checkComposerAdapters());
    await page.evaluate(() => window.composerFixture.select("A"));
    const editor = page.locator(
      '[data-composer-card] [contenteditable="true"]',
    );
    await editor.waitFor();
    // Run the actual hint adapter on the actual Host/Lexical surface as well.
    await page.evaluate(async () => {
      const path = "/plugins/xtz-ui/src/client/composer-hint-controller.ts";
      const { installComposerHint } = await import(path);
      window.stopComposerHint = installComposerHint(document);
    });
    for (const value of ["text", " ", "one\ntwo\nthree", ""]) {
      await editor.fill(value);
      await page.waitForFunction(
        (empty) =>
          document.querySelectorAll("[data-composer-placeholder]").length ===
          (empty ? 1 : 0),
        value.trim() === "",
      );
      assert.equal(
        await page.locator("[data-dsh-xtz-ui-composer-hint]").count(),
        0,
      );
    }
    await page.evaluate(() => window.stopComposerHint());
    await page.evaluate(() => {
      window.composerFixture.hold();
      window.composerFixture.select(undefined);
    });
    await page.evaluate(() => window.composerFixture.select("B"));
    await page.evaluate(() => window.composerFixture.release());
    await page.waitForFunction(() =>
      document
        .querySelector("[data-dsh-providers-turn-model]")
        ?.textContent?.includes("Session B"),
    );
    assert.equal(
      await page.locator("[data-dsh-providers-historical-composer]").count(),
      0,
    );
    for (let i = 0; i < 20; i++) {
      await page.evaluate(() => window.composerFixture.hmr());
      await chip.waitFor();
      assert.equal(await chip.count(), 1);
      assert.equal(await page.locator("[data-fixture-todo]").isVisible(), true);
      assert.equal(
        await page.locator("[data-fixture-queue]").isVisible(),
        true,
      );
    }
    await page.evaluate(() => window.composerFixture.mode("manual"));
    await chip.waitFor({ state: "detached" });
    assert.equal(await page.locator("[data-fixture-model]").isVisible(), true);
    await page.evaluate(() => window.composerFixture.select(undefined));
    assert.equal(await chip.count(), 0);
    await page.evaluate(() => window.composerFixture.mode("smart"));
    await chip.waitFor();
    await page.evaluate(() => window.composerFixture.disposeProvider());
    await chip.waitFor({ state: "detached" });
    await page.evaluate(() => window.composerFixture.dispose());
    assert.equal(await chip.count(), 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(blocked, []);
  } finally {
    await browser.close();
  }
});
