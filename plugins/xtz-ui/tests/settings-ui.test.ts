import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import { XiaotaoziSettings } from "../src/client/XiaotaoziSettings.tsx";
import { en, zh } from "../src/client/locales.ts";
import { css } from "../src/client/styles.ts";

const source = readFileSync(new URL("../src/client/XiaotaoziSettings.tsx", import.meta.url), "utf8");

function context(): ClientContext {
  return {
    locale: {
      bind: () => (key: keyof typeof zh) => zh[key],
    },
  } as unknown as ClientContext;
}

describe("Xiaotaozi settings UI", () => {
  it("renders a stable loading state without calling shipped features unavailable", () => {
    const markup = renderToStaticMarkup(createElement(XiaotaoziSettings, { ctx: context() }));

    expect(markup).toContain("小桃子工作台");
    expect(markup).toContain(zh.lede);
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain(zh.loading);
    expect(markup).not.toContain(zh.unavailable);
    expect(markup.match(/class="dshH-row"/gu)).toHaveLength(4);
    expect(markup.match(/role="switch"/gu)).toHaveLength(4);
    expect(markup.match(/class="dshH-rowState"/gu)).toHaveLength(4);
    expect(markup.match(/class="dshH-rowReason"/gu)).toHaveLength(4);
    expect(markup).toContain(zh.enabled);
    expect(markup).toContain(zh.disabled);
  });

  it("keeps state, unavailable reasons, save completion, and failures explicit", () => {
    const saveFlow = source.slice(source.indexOf("const setFlag"), source.indexOf("const config"));

    expect(zh.enabled).not.toBe(zh.disabled);
    expect(en.enabled).not.toBe(en.disabled);
    expect(zh.unavailable.length).toBeGreaterThan(0);
    expect(en.unavailable.length).toBeGreaterThan(0);
    expect(source).toContain('disabledReason={');
    expect(source).toContain('t("unavailable")');
    expect(saveFlow).toContain('setStatus(t("saved"))');
    expect(saveFlow).toContain('setError(t("saveFailed"))');
    expect(saveFlow).not.toContain("loadSettingsLive");
    expect(source).toContain('role="status"');
    expect(source).toContain('role="alert"');
  });

  it("keeps archive management secondary to its feature switch", () => {
    const markup = renderToStaticMarkup(createElement(XiaotaoziSettings, { ctx: context() }));
    const archiveRow = markup.slice(markup.indexOf(zh.archive), markup.indexOf(zh.board));

    expect(archiveRow).toContain(zh.manageArchive);
    expect(archiveRow.indexOf('role="switch"')).toBeLessThan(archiveRow.indexOf(zh.manageArchive));
    expect(archiveRow.match(/dshH-rowAction/gu)).toHaveLength(1);
  });

  it("gives narrow and coarse pointer controls 44px targets", () => {
    const responsive = css.slice(css.indexOf("@media (max-width: 768px), (pointer: coarse)"));
    expect(responsive).toContain("min-height: 44px");
    expect(responsive).toContain("min-width: 44px");
  });
});
